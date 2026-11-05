import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { financeiroMes } from '../../src/infraestrutura/db/repositorios/financeiro/mes.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from './apoio.ts';

/**
 * Leitura do mês do caixa (T17; FIN-07, FIN-08, FIN-10 a FIN-14), contra o cenário de grupos. O cenário de G tem a
 * configuração (mensalidade 5.000, saldo 0 em 2026-01-01), três jogadores (Toninho e Bira ativos desde 2026-01-01, Zé
 * Inativo até 2025-12-31) e a entrada de 5.000 em 2026-01-05, vinculada ao pagamento de janeiro do Bira. Cada caso
 * acrescenta o que precisa como superusuário, com a marca "T17" na descrição ou no apelido, e tudo sai no `afterEach`.
 * "Hoje" é 2026-03-20.
 */

const HOJE = '2026-03-20';
const JANEIRO = '2026-01';

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  const { db, cenario } = aberto;
  await db.query(`DELETE FROM lancamentos WHERE descricao LIKE 'T17%'`);
  await db.query(`DELETE FROM jogadores WHERE apelido LIKE 'T17%'`);
  await db.query('DELETE FROM config_financeira WHERE grupo_id = $1', [cenario.grupoG]);
  await db.query(
    `INSERT INTO config_financeira (grupo_id, mensalidade_centavos, saldo_inicial_centavos, data_saldo_inicial)
     VALUES ($1, 5000, 0, '2026-01-01')`,
    [cenario.grupoG],
  );
});

const ler = (mes = JANEIRO, hoje = HOJE) => {
  const { url, cenario } = aberto;
  return comDb(url, cenario.contaC, (db) => financeiroMes.lerMes(db, cenario.grupoG, mes, hoje));
};

async function lancar(
  tipo: 'entrada' | 'saida',
  data: string,
  descricao: string,
  valor: number,
  criadoEm = 'now()',
): Promise<string> {
  const { db, cenario } = aberto;
  const r = await db.query<{ id: string }>(
    `INSERT INTO lancamentos (grupo_id, tipo, data, descricao, valor_centavos, criado_por, criado_em, alterado_por, alterado_em)
     VALUES ($1, $2, $3, $4, $5, $6, ${criadoEm}, $6, ${criadoEm}) RETURNING id`,
    [cenario.grupoG, tipo, data, descricao, valor, cenario.contaC],
  );
  return r.rows[0]!.id;
}

async function jogador(
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

describe('financeiroMes.lerMes', () => {
  it('FIN-08: sem configuração, config, saldo e resumo nulos, listas vazias e navegação nula', async () => {
    const { db, cenario } = aberto;
    await db.query('DELETE FROM config_financeira WHERE grupo_id = $1', [cenario.grupoG]);
    expect(await ler(JANEIRO)).toEqual({
      mes: JANEIRO,
      hoje: HOJE,
      navegacao: { mesAnterior: null, mesSeguinte: null },
      config: null,
      saldoAtualCentavos: null,
      resumoMes: null,
      pagamentos: [],
      lancamentos: [],
    });
  });

  it('FIN-07: devolve mês, hoje, navegação, configuração, saldo, resumo, pagamentos e lançamentos', async () => {
    const { cenario } = aberto;
    const m = await ler();
    expect(m.mes).toBe(JANEIRO);
    expect(m.hoje).toBe(HOJE);
    expect(m.navegacao).toEqual({ mesAnterior: null, mesSeguinte: '2026-02' });
    expect(m.config).toEqual({
      mensalidadeCentavos: 5000,
      saldoInicialCentavos: 0,
      dataSaldoInicial: '2026-01-01',
    });
    expect(m.saldoAtualCentavos).toBe(5000);
    expect(m.resumoMes).toEqual({
      entradasCentavos: 5000,
      saidasCentavos: 0,
      resultadoCentavos: 5000,
      naoPagaram: 1,
    });
    expect(m.pagamentos.map((p) => [p.apelido, p.pagou])).toEqual([
      ['Bira', true],
      ['Toninho', false],
    ]);
    expect(m.pagamentos[0]?.jogadorId).toBe(cenario.idsG.jogadorHistorico);
    expect(m.lancamentos).toHaveLength(1);
  });

  it('FIN-07: no mês de hoje a navegação seguinte é nula e a anterior existe', async () => {
    expect((await ler('2026-03')).navegacao).toEqual({ mesAnterior: '2026-02', mesSeguinte: null });
  });

  it('FIN-14: lançamentos do mais recente ao mais antigo, com mensalidade verdadeiro só no vinculado', async () => {
    const { cenario } = aberto;
    await lancar('saida', '2026-01-20', 'T17 coletes', 1500, `now() - interval '2 hours'`);
    await lancar('entrada', '2026-01-20', 'T17 rifa', 800, `now() - interval '1 hour'`);
    await lancar('entrada', '2026-02-03', 'T17 fevereiro', 100);
    const m = await ler();
    expect(m.lancamentos.map((l) => [l.descricao, l.data, l.mensalidade])).toEqual([
      ['T17 rifa', '2026-01-20', false],
      ['T17 coletes', '2026-01-20', false],
      ['Mensalidade', '2026-01-05', true],
    ]);
    expect(m.lancamentos[2]?.id).toBe(cenario.idsG.lancamento);
    expect(m.lancamentos.every((l) => typeof l.valorCentavos === 'number')).toBe(true);
  });

  it('FIN-11: o resumo conta só os lançamentos do mês e o saldo vai até hoje', async () => {
    await lancar('saida', '2026-01-20', 'T17 coletes', 1500);
    await lancar('entrada', '2026-02-03', 'T17 fevereiro', 100);
    const m = await ler();
    expect(m.resumoMes).toEqual({
      entradasCentavos: 5000,
      saidasCentavos: 1500,
      resultadoCentavos: 3500,
      naoPagaram: 1,
    });
    expect(m.saldoAtualCentavos).toBe(5000 - 1500 + 100);
  });

  it('FIN-10: lançamento anterior à data inicial e o posterior a hoje não entram no saldo', async () => {
    await lancar('entrada', '2025-12-31', 'T17 antes', 70_000);
    await lancar('entrada', '2026-03-21', 'T17 depois', 80_000);
    await lancar('saida', '2026-03-20', 'T17 hoje', 1_000);
    const m = await ler('2026-03');
    expect(m.saldoAtualCentavos).toBe(5000 - 1000);
    expect(m.lancamentos.map((l) => l.descricao)).toEqual(['T17 depois', 'T17 hoje']);
    expect(m.resumoMes).toMatchObject({ entradasCentavos: 80_000, saidasCentavos: 1_000 });
  });

  it('FIN-12: jogador de outro grupo nunca aparece e quem fica ativo só no fim do mês aparece', async () => {
    const { cenario } = aberto;
    await jogador(cenario.grupoH, 'T17 Estranho', '2026-01-01', null);
    await jogador(cenario.grupoG, 'T17 Fim do mês', '2026-01-31', null);
    await jogador(cenario.grupoG, 'T17 Só fevereiro', '2026-02-01', null);
    const apelidos = (await ler()).pagamentos.map((p) => p.apelido);
    expect(apelidos).toContain('T17 Fim do mês');
    expect(apelidos).not.toContain('T17 Estranho');
    expect(apelidos).not.toContain('T17 Só fevereiro');
    expect(apelidos).not.toContain('Zé Inativo');
  });

  it('FIN-12: lista por apelido sem acento e sem caixa, com quem saiu e voltou no mês uma vez só', async () => {
    const { cenario, db } = aberto;
    const id = await jogador(cenario.grupoG, 'T17 álvaro', '2026-01-02', '2026-01-10');
    await db.query(
      `INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio, fim) VALUES ($1, $2, '2026-01-20', NULL)`,
      [id, cenario.grupoG],
    );
    const apelidos = (await ler()).pagamentos.map((p) => p.apelido);
    expect(apelidos.filter((a) => a === 'T17 álvaro')).toHaveLength(1);
    expect(apelidos).toEqual(['Bira', 'T17 álvaro', 'Toninho']);
  });

  it('FIN-11: pagamento de quem não era ativo no mês não desconta de "não pagaram" nem entra na lista', async () => {
    const { db, cenario } = aberto;
    await db.query(
      `INSERT INTO pagamentos_mes (grupo_id, jogador_id, mes, lancamento_id, marcado_por, marcado_em)
       VALUES ($1, $2, '2026-01', NULL, $3, now())`,
      [cenario.grupoG, cenario.idsG.jogadorInativo, cenario.contaC],
    );
    try {
      const m = await ler();
      expect(m.resumoMes?.naoPagaram).toBe(1);
      expect(m.pagamentos.map((p) => p.apelido)).not.toContain('Zé Inativo');
    } finally {
      await db.query(`DELETE FROM pagamentos_mes WHERE jogador_id = $1`, [
        cenario.idsG.jogadorInativo,
      ]);
    }
  });

  it('FIN-13: soma de 200 entradas de 99.999.999 que passa do teto do cliente sai exata', async () => {
    const { db, cenario } = aberto;
    await db.query(
      `INSERT INTO lancamentos (grupo_id, tipo, data, descricao, valor_centavos, criado_por, criado_em, alterado_por, alterado_em)
       SELECT $1, 'entrada', '2026-01-15', 'T17 grande ' || n, 99999999, $2, now(), $2, now() FROM generate_series(1, 200) n`,
      [cenario.grupoG, cenario.contaC],
    );
    const m = await ler();
    const esperado = 200 * 99_999_999 + 5000;
    expect(m.resumoMes?.entradasCentavos).toBe(esperado);
    expect(m.resumoMes?.resultadoCentavos).toBe(esperado);
    expect(m.saldoAtualCentavos).toBe(esperado);
    expect(esperado).toBeGreaterThan(99_999_999);
  });

  it('FIN-39: a leitura de uma conta sem acesso ao financeiro vê o caixa como não configurado (a RLS esconde tudo)', async () => {
    const { url, cenario } = aberto;
    const m = await comDb(url, cenario.contaO, (db) =>
      financeiroMes.lerMes(db, cenario.grupoG, JANEIRO, HOJE),
    );
    expect(m.config).toBeNull();
    expect(m.lancamentos).toEqual([]);
    expect(m.pagamentos).toEqual([]);
  });
});
