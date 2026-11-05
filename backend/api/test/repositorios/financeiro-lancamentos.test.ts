import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { lancamentos } from '../../src/infraestrutura/db/repositorios/financeiro/lancamentos.ts';
import type { Db } from '../../src/infraestrutura/db/repositorios/tipos.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from './apoio.ts';

/**
 * Lançamentos: criar, ler e editar (T20; FIN-25, FIN-27, FIN-28, FIN-31, FIN-32), contra o cenário de grupos. O
 * lançamento do cenário (`Mensalidade`, entrada de 5.000 em 2026-01-05) é a entrada vinculada ao pagamento de janeiro
 * do Bira; os avulsos de cada caso levam "T20" na descrição. O `afterEach` apaga os avulsos e a auditoria, restaura a
 * entrada vinculada e a conta O, e derruba o gatilho de falha forçada.
 */

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  const { db, cenario } = aberto;
  await db.query('DROP TRIGGER IF EXISTS falha_forcada_lancamento ON auditoria');
  await db.query('DROP FUNCTION IF EXISTS falha_forcada_lancamento()');
  await db.query(`DELETE FROM lancamentos WHERE descricao LIKE 'T20%'`);
  await db.query(`DELETE FROM auditoria WHERE acao IN ('lancamento_criado', 'lancamento_editado')`);
  await db.query(
    `UPDATE lancamentos SET tipo = 'entrada', data = '2026-01-05', descricao = 'Mensalidade', valor_centavos = 5000,
            alterado_por = $2, alterado_em = now() WHERE id = $1`,
    [cenario.idsG.lancamento, cenario.contaC],
  );
  await db.query(`UPDATE contas SET nome = 'Outra Admin', excluida_em = NULL WHERE id = $1`, [cenario.contaO]);
});

const NOVO = { tipo: 'saida', data: '2026-02-10', descricao: 'T20 Bolas novas', valorCentavos: 12_345 } as const;

function comoC<T>(fn: (db: Db) => Promise<T>, confirmar = true): Promise<T> {
  return comDb(aberto.url, aberto.cenario.contaC, fn, { confirmar });
}

async function nomeDe(conta: string): Promise<string> {
  const r = await aberto.db.query<{ nome: string }>('SELECT nome FROM contas WHERE id = $1', [conta]);
  return r.rows[0]!.nome;
}

async function autoral(descricao: string, conta: string): Promise<string> {
  const { db, cenario } = aberto;
  const r = await db.query<{ id: string }>(
    `INSERT INTO lancamentos (grupo_id, tipo, data, descricao, valor_centavos, criado_por, criado_em, alterado_por, alterado_em)
     VALUES ($1, 'saida', '2026-01-12', $2, 2000, $3, now(), $3, now()) RETURNING id`,
    [cenario.grupoG, descricao, conta],
  );
  return r.rows[0]!.id;
}

async function auditorias(acao: string) {
  const r = await aberto.db.query(`SELECT autor_conta_id, entidade_id, resumo FROM auditoria WHERE acao = $1 ORDER BY momento, id`, [acao]);
  return r.rows;
}

describe('lancamentos.criar', () => {
  it('FIN-25: cria o avulso com mensalidade falso, autora, momento e vínculo nulo', async () => {
    const { db, cenario } = aberto;
    const antes = Date.now();
    const l = await comoC((d) => lancamentos.criar(d, cenario.grupoG, NOVO));
    expect(l).toMatchObject({ ...NOVO, mensalidade: false, vinculo: null, alteradoPor: await nomeDe(cenario.contaC) });
    expect(Date.parse(l.alteradoEm)).toBeGreaterThanOrEqual(antes - 5_000);
    const linha = await db.query(`SELECT criado_por, alterado_por, data::text AS data FROM lancamentos WHERE id = $1`, [l.id]);
    expect(linha.rows[0]).toEqual({ criado_por: cenario.contaC, alterado_por: cenario.contaC, data: '2026-02-10' });
  });

  it('FIN-25: audita lancamento_criado com tipo, data e valor, sem a descrição (FIN-44)', async () => {
    const { cenario } = aberto;
    const l = await comoC((d) => lancamentos.criar(d, cenario.grupoG, NOVO));
    const a = await auditorias('lancamento_criado');
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({
      autor_conta_id: cenario.contaC,
      entidade_id: l.id,
      resumo: { tipo: 'saida', data: '2026-02-10', valorCentavos: 12_345 },
    });
    expect(JSON.stringify(a[0]?.resumo)).not.toContain('Bolas');
  });

  it('FIN-25: falha forçada na auditoria desfaz o lançamento', async () => {
    const { db, cenario } = aberto;
    await db.query(
      `CREATE FUNCTION falha_forcada_lancamento() RETURNS trigger LANGUAGE plpgsql AS $$
         BEGIN RAISE EXCEPTION 'falha forçada na auditoria'; END $$`,
    );
    await db.query(
      `CREATE TRIGGER falha_forcada_lancamento BEFORE INSERT ON auditoria
         FOR EACH ROW WHEN (NEW.acao = 'lancamento_criado') EXECUTE FUNCTION falha_forcada_lancamento()`,
    );
    await expect(comoC((d) => lancamentos.criar(d, cenario.grupoG, NOVO))).rejects.toThrow(/falha forçada na auditoria/);
    const n = await db.query(`SELECT 1 FROM lancamentos WHERE descricao LIKE 'T20%'`);
    expect(n.rowCount).toBe(0);
  });

  it('FIN-39: admin sem acesso ao financeiro não cria (a RLS recusa)', async () => {
    const { url, cenario } = aberto;
    await expect(
      comDb(url, cenario.contaO, (d) => lancamentos.criar(d, cenario.grupoG, NOVO), { confirmar: true }),
    ).rejects.toMatchObject({ code: '42501' });
  });
});

describe('lancamentos.editar', () => {
  it('FIN-27: grava tipo, data, descrição e valor, atualiza quem alterou e audita antes e depois', async () => {
    const { cenario } = aberto;
    const criado = await comoC((d) => lancamentos.criar(d, cenario.grupoG, NOVO));
    const r = await comoC((d) =>
      lancamentos.editar(d, cenario.grupoG, criado.id, { tipo: 'entrada', data: '2026-02-11', descricao: 'T20 Doação', valorCentavos: 999 }),
    );
    expect(r.resultado).toBe('ok');
    if (r.resultado !== 'ok') return;
    expect(r.lancamento).toMatchObject({ tipo: 'entrada', data: '2026-02-11', descricao: 'T20 Doação', valorCentavos: 999, mensalidade: false });
    const a = await auditorias('lancamento_editado');
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({
      entidade_id: criado.id,
      resumo: { antes: { valorCentavos: 12_345 }, depois: { valorCentavos: 999 } },
    });
    expect(JSON.stringify(a[0]?.resumo)).not.toContain('Doação');
  });

  it('FIN-27: editar a entrada de mensalidade mantém o vínculo com o pagamento e a marca de mensalidade', async () => {
    const { db, cenario } = aberto;
    const r = await comoC((d) =>
      lancamentos.editar(d, cenario.grupoG, cenario.idsG.lancamento, { tipo: 'entrada', data: '2026-01-06', descricao: 'T20 Mensalidade do Bira', valorCentavos: 6_000 }),
    );
    expect(r.resultado).toBe('ok');
    if (r.resultado !== 'ok') return;
    expect(r.lancamento.mensalidade).toBe(true);
    expect(r.lancamento.vinculo).toEqual({ jogadorId: cenario.idsG.jogadorHistorico, apelido: 'Bira', mes: '2026-01' });
    const p = await db.query(`SELECT lancamento_id FROM pagamentos_mes WHERE jogador_id = $1 AND mes = '2026-01'`, [cenario.idsG.jogadorHistorico]);
    expect(p.rows).toEqual([{ lancamento_id: cenario.idsG.lancamento }]);
  });

  it('FIN-28: mensalidade para saída é recusada sem gravar nem auditar', async () => {
    const { db, cenario } = aberto;
    const r = await comoC((d) =>
      lancamentos.editar(d, cenario.grupoG, cenario.idsG.lancamento, { tipo: 'saida', data: '2026-01-05', descricao: 'T20 virou saída', valorCentavos: 5_000 }),
    );
    expect(r).toEqual({ resultado: 'mensalidade_nao_e_saida' });
    const linha = await db.query(`SELECT tipo, descricao FROM lancamentos WHERE id = $1`, [cenario.idsG.lancamento]);
    expect(linha.rows[0]).toEqual({ tipo: 'entrada', descricao: 'Mensalidade' });
    expect(await auditorias('lancamento_editado')).toEqual([]);
  });

  it('FIN-28: o lançamento avulso pode virar entrada e voltar a ser saída', async () => {
    const { cenario } = aberto;
    const criado = await comoC((d) => lancamentos.criar(d, cenario.grupoG, NOVO));
    const entrada = await comoC((d) => lancamentos.editar(d, cenario.grupoG, criado.id, { ...NOVO, tipo: 'entrada' }));
    const saida = await comoC((d) => lancamentos.editar(d, cenario.grupoG, criado.id, { ...NOVO, tipo: 'saida' }));
    expect(entrada.resultado).toBe('ok');
    expect(saida.resultado).toBe('ok');
  });

  it('FIN-31: id de outro grupo e id inexistente dão o mesmo "não encontrado", sem alterar nada', async () => {
    const { db, cenario } = aberto;
    const deH = await db.query<{ id: string }>(
      `INSERT INTO lancamentos (grupo_id, tipo, data, descricao, valor_centavos, criado_por, criado_em, alterado_por, alterado_em)
       VALUES ($1, 'saida', '2026-01-12', 'T20 de H', 700, $2, now(), $2, now()) RETURNING id`,
      [cenario.grupoH, cenario.contaB],
    );
    const idH = deH.rows[0]!.id;
    const inexistente = '00000000-0000-4000-8000-000000000000';
    expect(await comoC((d) => lancamentos.editar(d, cenario.grupoG, idH, NOVO))).toEqual({ resultado: 'nao_encontrado' });
    expect(await comoC((d) => lancamentos.editar(d, cenario.grupoG, inexistente, NOVO))).toEqual({ resultado: 'nao_encontrado' });
    expect(await comoC((d) => lancamentos.ler(d, cenario.grupoG, idH))).toBeNull();
    expect(await comoC((d) => lancamentos.ler(d, cenario.grupoG, inexistente))).toBeNull();
    const intacto = await db.query(`SELECT descricao, valor_centavos FROM lancamentos WHERE id = $1`, [idH]);
    expect(intacto.rows[0]).toEqual({ descricao: 'T20 de H', valor_centavos: 700 });
  });
});

describe('lancamentos.ler', () => {
  it('FIN-32: o nome de quem alterou vem das contas do grupo; conta excluída sai como "Conta excluída"', async () => {
    const { db, cenario } = aberto;
    const id = await autoral('T20 da O', cenario.contaO);
    const antes = await comoC((d) => lancamentos.ler(d, cenario.grupoG, id), false);
    expect(antes?.alteradoPor).toBe('Outra Admin');
    await db.query(`UPDATE contas SET nome = 'Conta excluída', excluida_em = now() WHERE id = $1`, [cenario.contaO]);
    const depois = await comoC((d) => lancamentos.ler(d, cenario.grupoG, id), false);
    expect(depois?.alteradoPor).toBe('Conta excluída');
  });

  it('FIN-32: a entrada vinculada traz o apelido e o mês do pagamento', async () => {
    const { cenario } = aberto;
    const l = await comoC((d) => lancamentos.ler(d, cenario.grupoG, cenario.idsG.lancamento), false);
    expect(l).toMatchObject({ mensalidade: true, vinculo: { apelido: 'Bira', mes: '2026-01' }, tipo: 'entrada', valorCentavos: 5000 });
  });

  it('FIN-39: admin sem acesso não lê o lançamento (a RLS o esconde)', async () => {
    const { url, cenario } = aberto;
    expect(await comDb(url, cenario.contaO, (d) => lancamentos.ler(d, cenario.grupoG, cenario.idsG.lancamento))).toBeNull();
  });
});
