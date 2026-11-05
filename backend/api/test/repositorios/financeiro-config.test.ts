import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configFinanceira } from '../../src/infraestrutura/db/repositorios/financeiro/config.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from './apoio.ts';

/**
 * Repositório da configuração do caixa (T16; FIN-01, FIN-04, FIN-05, FIN-06), contra o cenário de grupos. Cada caso
 * começa com G sem configuração (a do cenário sai como superusuário) e a restaura no `afterEach`. Os casos que
 * conferem gravação ou auditoria confirmam a transação; a auditoria do caso sai no `afterEach`.
 */

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

beforeEach(async () => {
  await aberto.db.query('DELETE FROM config_financeira WHERE grupo_id = $1', [aberto.cenario.grupoG]);
});

afterEach(async () => {
  const { db, cenario } = aberto;
  await db.query(`DROP TRIGGER IF EXISTS falha_forcada_config ON auditoria`);
  await db.query(`DROP FUNCTION IF EXISTS falha_forcada_config()`);
  await db.query(`DELETE FROM auditoria WHERE acao = 'financeiro_config_alterada'`);
  await db.query('DELETE FROM config_financeira WHERE grupo_id = $1', [cenario.grupoG]);
  await db.query(
    `INSERT INTO config_financeira (grupo_id, mensalidade_centavos, saldo_inicial_centavos, data_saldo_inicial)
     VALUES ($1, 5000, 0, '2026-01-01')`,
    [cenario.grupoG],
  );
});

const PRIMEIRA = { mensalidadeCentavos: 7_500, saldoInicialCentavos: 100_000, dataSaldoInicial: '2026-03-01' } as const;
const SEGUNDA = { mensalidadeCentavos: null, saldoInicialCentavos: -2_500, dataSaldoInicial: '2026-04-15' } as const;

interface Auditoria {
  autor: string;
  entidade_id: string;
  resumo: { antes: unknown; depois: unknown };
}

async function auditorias(): Promise<Auditoria[]> {
  const r = await aberto.db.query<Auditoria>(
    `SELECT autor_conta_id AS autor, entidade_id, resumo FROM auditoria
      WHERE acao = 'financeiro_config_alterada' AND grupo_id = $1 ORDER BY momento, id`,
    [aberto.cenario.grupoG],
  );
  return r.rows;
}

async function linhas() {
  const r = await aberto.db.query(
    `SELECT mensalidade_centavos, saldo_inicial_centavos, data_saldo_inicial::text AS data_saldo_inicial
       FROM config_financeira WHERE grupo_id = $1`,
    [aberto.cenario.grupoG],
  );
  return r.rows;
}

describe('configFinanceira.lerConfig', () => {
  it('FIN-08: sem configuração devolve nulo', async () => {
    const { url, cenario } = aberto;
    expect(await comDb(url, cenario.contaC, (db) => configFinanceira.lerConfig(db, cenario.grupoG))).toBeNull();
  });

  it('FIN-01: devolve os três campos, com a data como texto e centavos como número', async () => {
    const { url, cenario } = aberto;
    await comDb(url, cenario.contaC, (db) => configFinanceira.salvarConfig(db, cenario.grupoG, PRIMEIRA), { confirmar: true });
    expect(await comDb(url, cenario.contaC, (db) => configFinanceira.lerConfig(db, cenario.grupoG))).toEqual(PRIMEIRA);
  });

  it('FIN-39: admin sem acesso ao financeiro lê nulo (a RLS esconde a linha)', async () => {
    const { url, cenario } = aberto;
    await comDb(url, cenario.contaC, (db) => configFinanceira.salvarConfig(db, cenario.grupoG, PRIMEIRA), { confirmar: true });
    expect(await comDb(url, cenario.contaO, (db) => configFinanceira.lerConfig(db, cenario.grupoG))).toBeNull();
  });

  it('FIN-31: id de outro grupo não devolve a configuração de G', async () => {
    const { url, cenario } = aberto;
    await comDb(url, cenario.contaC, (db) => configFinanceira.salvarConfig(db, cenario.grupoG, PRIMEIRA), { confirmar: true });
    expect(await comDb(url, cenario.contaC, (db) => configFinanceira.lerConfig(db, cenario.grupoH))).toBeNull();
  });
});

describe('configFinanceira.salvarConfig', () => {
  it('FIN-01: a primeira gravação cria e a segunda substitui, sempre uma linha por grupo', async () => {
    const { url, cenario } = aberto;
    await comDb(url, cenario.contaC, (db) => configFinanceira.salvarConfig(db, cenario.grupoG, PRIMEIRA), { confirmar: true });
    expect(await linhas()).toEqual([{ mensalidade_centavos: 7_500, saldo_inicial_centavos: 100_000, data_saldo_inicial: '2026-03-01' }]);
    await comDb(url, cenario.contaC, (db) => configFinanceira.salvarConfig(db, cenario.grupoG, SEGUNDA), { confirmar: true });
    expect(await linhas()).toEqual([{ mensalidade_centavos: null, saldo_inicial_centavos: -2_500, data_saldo_inicial: '2026-04-15' }]);
  });

  it('FIN-01: devolve o antes (nulo na primeira) e o depois', async () => {
    const { url, cenario } = aberto;
    const primeira = await comDb(url, cenario.contaC, (db) => configFinanceira.salvarConfig(db, cenario.grupoG, PRIMEIRA), { confirmar: true });
    expect(primeira).toEqual({ antes: null, depois: PRIMEIRA });
    const segunda = await comDb(url, cenario.contaC, (db) => configFinanceira.salvarConfig(db, cenario.grupoG, SEGUNDA), { confirmar: true });
    expect(segunda).toEqual({ antes: PRIMEIRA, depois: SEGUNDA });
  });

  it('FIN-04: a auditoria tem antes nulo na primeira e o depois da primeira como antes da segunda', async () => {
    const { url, cenario } = aberto;
    await comDb(url, cenario.contaC, (db) => configFinanceira.salvarConfig(db, cenario.grupoG, PRIMEIRA), { confirmar: true });
    await comDb(url, cenario.contaC, (db) => configFinanceira.salvarConfig(db, cenario.grupoG, SEGUNDA), { confirmar: true });
    const a = await auditorias();
    expect(a).toHaveLength(2);
    expect(a.map((l) => l.autor)).toEqual([cenario.contaC, cenario.contaC]);
    expect(a.map((l) => l.entidade_id)).toEqual([cenario.grupoG, cenario.grupoG]);
    expect(a[0]?.resumo).toEqual({ antes: null, depois: PRIMEIRA });
    expect(a[1]?.resumo).toEqual({ antes: PRIMEIRA, depois: SEGUNDA });
  });

  it('FIN-04: gravar a mesma configuração de novo também audita, com antes igual ao depois', async () => {
    const { url, cenario } = aberto;
    await comDb(url, cenario.contaC, (db) => configFinanceira.salvarConfig(db, cenario.grupoG, PRIMEIRA), { confirmar: true });
    await comDb(url, cenario.contaC, (db) => configFinanceira.salvarConfig(db, cenario.grupoG, PRIMEIRA), { confirmar: true });
    const a = await auditorias();
    expect(a).toHaveLength(2);
    expect(a[1]?.resumo).toEqual({ antes: PRIMEIRA, depois: PRIMEIRA });
  });

  it('FIN-04: falha forçada na auditoria desfaz a gravação (a configuração anterior fica)', async () => {
    const { db, url, cenario } = aberto;
    await comDb(url, cenario.contaC, (d) => configFinanceira.salvarConfig(d, cenario.grupoG, PRIMEIRA), { confirmar: true });
    await db.query(
      `CREATE FUNCTION falha_forcada_config() RETURNS trigger LANGUAGE plpgsql AS $$
         BEGIN RAISE EXCEPTION 'falha forçada na auditoria'; END $$`,
    );
    await db.query(
      `CREATE TRIGGER falha_forcada_config BEFORE INSERT ON auditoria
         FOR EACH ROW WHEN (NEW.acao = 'financeiro_config_alterada') EXECUTE FUNCTION falha_forcada_config()`,
    );
    await expect(
      comDb(url, cenario.contaC, (d) => configFinanceira.salvarConfig(d, cenario.grupoG, SEGUNDA), { confirmar: true }),
    ).rejects.toThrow(/falha forçada na auditoria/);
    expect(await linhas()).toEqual([{ mensalidade_centavos: 7_500, saldo_inicial_centavos: 100_000, data_saldo_inicial: '2026-03-01' }]);
  });

  it('FIN-04: a auditoria não traz descrição de lançamento, apelido nem telefone (só os três campos)', async () => {
    const { url, cenario } = aberto;
    await comDb(url, cenario.contaC, (db) => configFinanceira.salvarConfig(db, cenario.grupoG, PRIMEIRA), { confirmar: true });
    const [a] = await auditorias();
    expect(Object.keys(a?.resumo.depois as object).sort()).toEqual(['dataSaldoInicial', 'mensalidadeCentavos', 'saldoInicialCentavos']);
  });

  it('FIN-39: admin sem acesso não grava a configuração (a RLS recusa) e nada é auditado', async () => {
    const { url, cenario } = aberto;
    await expect(
      comDb(url, cenario.contaO, (db) => configFinanceira.salvarConfig(db, cenario.grupoG, PRIMEIRA), { confirmar: true }),
    ).rejects.toMatchObject({ code: '42501' });
    expect(await linhas()).toEqual([]);
    expect(await auditorias()).toEqual([]);
  });

  it('FIN-05: mudar a mensalidade não muda o valor de um lançamento de mensalidade existente', async () => {
    const { db, url, cenario } = aberto;
    await comDb(url, cenario.contaC, (d) => configFinanceira.salvarConfig(d, cenario.grupoG, { ...PRIMEIRA, mensalidadeCentavos: 5_000 }), { confirmar: true });
    const antes = await db.query(`SELECT valor_centavos FROM lancamentos WHERE id = $1`, [cenario.idsG.lancamento]);
    await comDb(url, cenario.contaC, (d) => configFinanceira.salvarConfig(d, cenario.grupoG, { ...PRIMEIRA, mensalidadeCentavos: 9_000 }), { confirmar: true });
    const depois = await db.query(`SELECT valor_centavos FROM lancamentos WHERE id = $1`, [cenario.idsG.lancamento]);
    expect(antes.rows[0]?.valor_centavos).toBe(5_000);
    expect(depois.rows[0]?.valor_centavos).toBe(5_000);
  });

  it('FIN-06: duas gravações simultâneas, ainda sem linha, ficam em série e o antes da segunda é o depois da primeira', async () => {
    const { url, cenario } = aberto;
    const gravar = (dados: typeof PRIMEIRA | typeof SEGUNDA) =>
      comDb(url, cenario.contaC, (db) => configFinanceira.salvarConfig(db, cenario.grupoG, dados), { confirmar: true });
    const [a, b] = await Promise.all([gravar(PRIMEIRA), gravar(SEGUNDA)]);

    const semAntes = [a, b].filter((r) => r.antes === null);
    const comAntes = [a, b].filter((r) => r.antes !== null);
    expect(semAntes).toHaveLength(1);
    expect(comAntes).toHaveLength(1);
    expect(comAntes[0]?.antes).toEqual(semAntes[0]?.depois);

    const registros = await auditorias();
    expect(registros).toHaveLength(2);
    expect(registros.filter((l) => l.resumo.antes === null)).toHaveLength(1);
    expect(await linhas()).toHaveLength(1);
  });
});
