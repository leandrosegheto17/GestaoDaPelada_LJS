import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { financeiroPagamentos } from '../../src/infraestrutura/db/repositorios/financeiro/pagamentos.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from './apoio.ts';

/**
 * Marcar o pagamento (T18; FIN-16, FIN-17, FIN-19, FIN-20, FIN-21), contra o cenário de grupos. Toninho (período aberto
 * desde 2026-01-01) paga fevereiro de 2026; Zé Inativo saiu em 2025-12-31. "Hoje" é 2026-03-02. Os casos confirmam a
 * transação; o `afterEach` apaga o que o caso gravou (pagamentos e lançamentos de fevereiro, auditoria, jogadores
 * "T18"), derruba o gatilho de falha forçada e restaura a configuração do cenário.
 */

const HOJE = '2026-03-02';
const MES = '2026-02';

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  const { db, cenario } = aberto;
  await db.query('DROP TRIGGER IF EXISTS falha_forcada_marcar ON auditoria');
  await db.query('DROP FUNCTION IF EXISTS falha_forcada_marcar()');
  await db.query(`DELETE FROM pagamentos_mes WHERE mes = $1`, [MES]);
  await db.query(`DELETE FROM lancamentos WHERE descricao LIKE 'Mensalidade % 02/2026'`);
  await db.query(`DELETE FROM auditoria WHERE acao = 'pagamento_marcado'`);
  await db.query(`DELETE FROM jogadores WHERE apelido LIKE 'T18%'`);
  await db.query('DELETE FROM config_financeira WHERE grupo_id = $1', [cenario.grupoG]);
  await db.query(
    `INSERT INTO config_financeira (grupo_id, mensalidade_centavos, saldo_inicial_centavos, data_saldo_inicial)
     VALUES ($1, 5000, 0, '2026-01-01')`,
    [cenario.grupoG],
  );
});

function marcar(
  jogadorId: string,
  mes = MES,
  conta = aberto.cenario.contaC,
  grupo = aberto.cenario.grupoG,
) {
  return comDb(
    aberto.url,
    conta,
    (db) => financeiroPagamentos.marcar(db, grupo, jogadorId, mes, HOJE),
    { confirmar: true },
  );
}

async function contar(sql: string, valores: unknown[] = []): Promise<number> {
  const r = await aberto.db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM (${sql}) q`,
    valores,
  );
  return r.rows[0]?.n ?? -1;
}

const pagamentosDeFevereiro = () => contar(`SELECT 1 FROM pagamentos_mes WHERE mes = '${MES}'`);
const lancamentosDeFevereiro = () =>
  contar(`SELECT 1 FROM lancamentos WHERE descricao LIKE 'Mensalidade % 02/2026'`);

async function novoJogador(
  grupo: string,
  apelido: string,
  inicio: string,
  fim: string | null,
): Promise<string> {
  const { db, cenario } = aberto;
  const r = await db.query<{ id: string }>(
    `INSERT INTO jogadores (grupo_id, apelido, posicao, criado_por, criado_em, alterado_por, alterado_em)
     VALUES ($1, $2, 'meia', $3, now(), $3, now()) RETURNING id`,
    [grupo, apelido, cenario.contaC],
  );
  const id = r.rows[0]!.id;
  await db.query(
    `INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio, fim) VALUES ($1, $2, $3, $4)`,
    [id, grupo, inicio, fim],
  );
  return id;
}

describe('financeiroPagamentos.marcar', () => {
  it('FIN-16: cria o pagamento e a entrada vinculada com o valor da configuração e a data de hoje', async () => {
    const { db, cenario } = aberto;
    const r = await marcar(cenario.idsG.jogadorAtivo);
    expect(r).toMatchObject({ resultado: 'ok', valorCentavos: 5000 });
    const p = await db.query(
      `SELECT lancamento_id, marcado_por FROM pagamentos_mes WHERE jogador_id = $1 AND mes = $2`,
      [cenario.idsG.jogadorAtivo, MES],
    );
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0]?.marcado_por).toBe(cenario.contaC);
    const l = await db.query(
      `SELECT tipo, data::text AS data, descricao, valor_centavos, criado_por, alterado_por FROM lancamentos WHERE id = $1`,
      [p.rows[0]?.lancamento_id],
    );
    expect(l.rows[0]).toEqual({
      tipo: 'entrada',
      data: HOJE,
      descricao: 'Mensalidade Toninho 02/2026',
      valor_centavos: 5000,
      criado_por: cenario.contaC,
      alterado_por: cenario.contaC,
    });
    expect((r as { lancamentoId: string | null }).lancamentoId).toBe(p.rows[0]?.lancamento_id);
  });

  it('FIN-16: audita pagamento_marcado com o mês e o valor, sem apelido nem descrição (FIN-44)', async () => {
    const { db, cenario } = aberto;
    await marcar(cenario.idsG.jogadorAtivo);
    const a = await db.query(
      `SELECT autor_conta_id, entidade_id, resumo FROM auditoria WHERE acao = 'pagamento_marcado'`,
    );
    expect(a.rows).toHaveLength(1);
    expect(a.rows[0]).toMatchObject({
      autor_conta_id: cenario.contaC,
      entidade_id: cenario.idsG.jogadorAtivo,
      resumo: { mes: MES, valorCentavos: 5000 },
    });
    expect(JSON.stringify(a.rows[0]?.resumo)).not.toMatch(/Toninho|Mensalidade/);
  });

  it('FIN-17: sem mensalidade, só o pagamento com lancamento_id nulo e nenhum lançamento novo', async () => {
    const { db, cenario } = aberto;
    await db.query('UPDATE config_financeira SET mensalidade_centavos = NULL WHERE grupo_id = $1', [
      cenario.grupoG,
    ]);
    const r = await marcar(cenario.idsG.jogadorAtivo);
    expect(r).toEqual({ resultado: 'ok', lancamentoId: null, valorCentavos: null });
    const p = await db.query(
      `SELECT lancamento_id FROM pagamentos_mes WHERE jogador_id = $1 AND mes = $2`,
      [cenario.idsG.jogadorAtivo, MES],
    );
    expect(p.rows).toEqual([{ lancamento_id: null }]);
    expect(await lancamentosDeFevereiro()).toBe(0);
  });

  it('FIN-17: sem configuração do caixa, só o pagamento', async () => {
    const { db, cenario } = aberto;
    await db.query('DELETE FROM config_financeira WHERE grupo_id = $1', [cenario.grupoG]);
    expect(await marcar(cenario.idsG.jogadorAtivo)).toEqual({
      resultado: 'ok',
      lancamentoId: null,
      valorCentavos: null,
    });
    expect(await lancamentosDeFevereiro()).toBe(0);
  });

  it('FIN-20: marcar de novo o mesmo jogador e mês dá ja_marcado e não cria segundo lançamento', async () => {
    const { cenario } = aberto;
    expect((await marcar(cenario.idsG.jogadorAtivo)).resultado).toBe('ok');
    expect(await marcar(cenario.idsG.jogadorAtivo)).toEqual({ resultado: 'ja_marcado' });
    expect(await pagamentosDeFevereiro()).toBe(1);
    expect(await lancamentosDeFevereiro()).toBe(1);
  });

  it('FIN-20: duas conexões marcando o mesmo jogador e mês: uma grava, a outra dá ja_marcado, um lançamento só', async () => {
    const { cenario } = aberto;
    const resultados = await Promise.all([
      marcar(cenario.idsG.jogadorAtivo),
      marcar(cenario.idsG.jogadorAtivo),
    ]);
    expect(resultados.map((r) => r.resultado).sort()).toEqual(['ja_marcado', 'ok']);
    expect(await pagamentosDeFevereiro()).toBe(1);
    expect(await lancamentosDeFevereiro()).toBe(1);
  });

  it('FIN-21: falha forçada na auditoria desfaz o pagamento e o lançamento', async () => {
    const { db, cenario } = aberto;
    await db.query(
      `CREATE FUNCTION falha_forcada_marcar() RETURNS trigger LANGUAGE plpgsql AS $$
         BEGIN RAISE EXCEPTION 'falha forçada na auditoria'; END $$`,
    );
    await db.query(
      `CREATE TRIGGER falha_forcada_marcar BEFORE INSERT ON auditoria
         FOR EACH ROW WHEN (NEW.acao = 'pagamento_marcado') EXECUTE FUNCTION falha_forcada_marcar()`,
    );
    await expect(marcar(cenario.idsG.jogadorAtivo)).rejects.toThrow(/falha forçada na auditoria/);
    expect(await pagamentosDeFevereiro()).toBe(0);
    expect(await lancamentosDeFevereiro()).toBe(0);
  });

  it('FIN-19: jogador inativo no mês é recusado sem gravar nada', async () => {
    const { cenario } = aberto;
    expect(await marcar(cenario.idsG.jogadorInativo)).toEqual({ resultado: 'jogador_fora_do_mes' });
    expect(await pagamentosDeFevereiro()).toBe(0);
    expect(await lancamentosDeFevereiro()).toBe(0);
  });

  it('FIN-19: jogador de outro grupo e id inexistente dão o mesmo resultado, sem gravar', async () => {
    const { cenario } = aberto;
    const deH = await novoJogador(cenario.grupoH, 'T18 Estranho', '2026-01-01', null);
    expect(await marcar(deH)).toEqual({ resultado: 'jogador_fora_do_mes' });
    expect(await marcar('00000000-0000-4000-8000-000000000000')).toEqual({
      resultado: 'jogador_fora_do_mes',
    });
    expect(await pagamentosDeFevereiro()).toBe(0);
  });

  it('FIN-19: ativo só no último dia do mês pode ser marcado; quem entra no dia 1 do mês seguinte, não', async () => {
    const { cenario } = aberto;
    const noFim = await novoJogador(cenario.grupoG, 'T18 Fim', '2026-02-28', null);
    const proximo = await novoJogador(cenario.grupoG, 'T18 Proximo', '2026-03-01', null);
    expect((await marcar(noFim)).resultado).toBe('ok');
    expect((await marcar(proximo)).resultado).toBe('jogador_fora_do_mes');
  });

  it('FIN-39: admin sem acesso ao financeiro não grava (a RLS recusa) e nada fica gravado', async () => {
    const { cenario } = aberto;
    await expect(marcar(cenario.idsG.jogadorAtivo, MES, cenario.contaO)).rejects.toMatchObject({
      code: '42501',
    });
    expect(await pagamentosDeFevereiro()).toBe(0);
    expect(await lancamentosDeFevereiro()).toBe(0);
  });
});
