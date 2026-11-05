import type { PesosCorpo } from '@pelada/contrato';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { pesos } from '../../src/infraestrutura/db/repositorios/pesos.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from './apoio.ts';

/**
 * Repositório de pesos (T28; PAR-01 a PAR-05, PAR-09, PAR-142), contra o cenário de grupos. No `beforeAll`, G fica só
 * com a configuração de 2026-01-01 do cenário (3, 4, 1, 2, -1, -1, por C): a que a `grupo_criar` gravou na data real
 * sai, para o teste não depender do relógio. "Hoje" é 2026-11-05. Cada caso apaga, no `afterEach`, as configurações
 * de G além de 2026-01-01, as auditorias de pesos e o gatilho de falha.
 *
 * Casos limite: uma configuração; várias; salvar sem configuração de hoje; salvar duas vezes no mesmo dia; ontem
 * intacta; falha na auditoria; grupo de outra conta.
 */

const HOJE = '2026-11-05';
const NOVOS: PesosCorpo = {
  presencaSemChuva: 2,
  presencaComChuva: 3,
  lesionadoSemChuva: 1,
  lesionadoComChuva: 1,
  expulsoSemChuva: -2,
  expulsoComChuva: -4,
};

let aberto: CenarioGruposAberto;
let nomeC: string;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const { db, cenario } = aberto;
  await db.query(`DELETE FROM config_pesos WHERE grupo_id = $1 AND vigente_desde <> '2026-01-01'`, [
    cenario.grupoG,
  ]);
  const r = await db.query<{ nome: string }>('SELECT nome FROM contas WHERE id = $1', [
    cenario.contaC,
  ]);
  nomeC = r.rows[0]?.nome ?? '';
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  const { db, cenario } = aberto;
  await db.query(`DELETE FROM config_pesos WHERE grupo_id = $1 AND vigente_desde <> '2026-01-01'`, [
    cenario.grupoG,
  ]);
  await db.query(
    `DELETE FROM auditoria WHERE acao IN ('pesos_configurados', 'pesos_substituidos')`,
  );
  await db.query('DROP TRIGGER IF EXISTS falha_teste_par05 ON auditoria');
  await db.query('DROP FUNCTION IF EXISTS falha_teste_par05()');
});

/** Grava uma configuração de G como superusuário. */
async function configurar(vigente: string, autora: string, valores: number[]): Promise<void> {
  await aberto.db.query(
    `INSERT INTO config_pesos (grupo_id, vigente_desde, presenca_sem_chuva, presenca_com_chuva, lesionado_sem_chuva,
       lesionado_com_chuva, expulso, expulso_com_chuva, registrado_por, registrado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())`,
    [aberto.cenario.grupoG, vigente, ...valores, autora],
  );
}

async function linhasDeG() {
  const r = await aberto.db.query<{ vigente: string; pesos: number[]; autora: string }>(
    `SELECT vigente_desde::text AS vigente,
            ARRAY[presenca_sem_chuva, presenca_com_chuva, lesionado_sem_chuva, lesionado_com_chuva, expulso,
                  expulso_com_chuva]::int[] AS pesos,
            registrado_por AS autora
       FROM config_pesos WHERE grupo_id = $1 ORDER BY vigente_desde`,
    [aberto.cenario.grupoG],
  );
  return r.rows;
}

async function auditoriasDePesos() {
  const r = await aberto.db.query<{ acao: string; autor: string; resumo: Record<string, unknown> }>(
    `SELECT acao, autor_conta_id AS autor, resumo FROM auditoria
      WHERE acao IN ('pesos_configurados', 'pesos_substituidos') ORDER BY id`,
  );
  return r.rows;
}

const salvarComo = (conta: string, p: PesosCorpo = NOVOS) =>
  comDb(aberto.url, conta, (db) => pesos.salvar(db, aberto.cenario.grupoG, p, HOJE), {
    confirmar: true,
  });

describe('pesos.painel', () => {
  it('PAR-01: com uma configuração, ela é a vigente, com o nome de quem registrou, e o histórico vem vazio', async () => {
    const { cenario } = aberto;
    const p = await comDb(aberto.url, cenario.contaO, (db) =>
      pesos.painel(db, cenario.grupoG, HOJE),
    );
    expect(p).toEqual({
      hoje: HOJE,
      vigente: {
        presencaSemChuva: 3,
        presencaComChuva: 4,
        lesionadoSemChuva: 1,
        lesionadoComChuva: 2,
        expulsoSemChuva: -1,
        expulsoComChuva: -1,
        vigenteDesde: '2026-01-01',
        registradoPor: nomeC,
      },
      historico: [],
    });
  });

  it('PAR-02: histórico da mais recente para a mais antiga, cada uma até a véspera da seguinte', async () => {
    const { cenario } = aberto;
    await configurar('2026-03-10', cenario.contaO, [2, 2, 1, 1, -1, -1]);
    await configurar('2026-06-01', cenario.contaC, [5, 5, 2, 2, -3, -3]);
    const p = await comDb(aberto.url, cenario.contaC, (db) =>
      pesos.painel(db, cenario.grupoG, HOJE),
    );
    expect(p?.vigente).toMatchObject({
      vigenteDesde: '2026-06-01',
      presencaSemChuva: 5,
      registradoPor: nomeC,
    });
    expect(p?.historico.map((h) => [h.vigenteDesde, h.vigenteAte, h.registradoPor])).toEqual([
      ['2026-03-10', '2026-05-31', 'Outra Admin'],
      ['2026-01-01', '2026-03-09', nomeC],
    ]);
  });

  it('PAR-02: virada de mês e de ano: a véspera de 2026-03-01 é 2026-02-28', async () => {
    const { cenario } = aberto;
    await configurar('2026-03-01', cenario.contaC, [2, 2, 1, 1, -1, -1]);
    const p = await comDb(aberto.url, cenario.contaC, (db) =>
      pesos.painel(db, cenario.grupoG, HOJE),
    );
    expect(p?.historico.map((h) => h.vigenteAte)).toEqual(['2026-02-28']);
  });

  it('PAR-01: a conta de outro grupo recebe painel nulo', async () => {
    const { cenario } = aberto;
    expect(
      await comDb(aberto.url, cenario.contaB, (db) => pesos.painel(db, cenario.grupoG, HOJE)),
    ).toBeNull();
  });
});

describe('pesos.salvar', () => {
  it('PAR-03 e PAR-05: sem configuração de hoje, grava vigente desde hoje pela conta e audita pesos_configurados', async () => {
    const { cenario } = aberto;
    expect(await salvarComo(cenario.contaO)).toEqual({ substituiu: false });
    expect(await linhasDeG()).toEqual([
      { vigente: '2026-01-01', pesos: [3, 4, 1, 2, -1, -1], autora: cenario.contaC },
      { vigente: HOJE, pesos: [2, 3, 1, 1, -2, -4], autora: cenario.contaO },
    ]);
    expect((await auditoriasDePesos()).map((a) => [a.acao, a.autor])).toEqual([
      ['pesos_configurados', cenario.contaO],
    ]);
  });

  it('PAR-04: salvar duas vezes no mesmo dia deixa uma linha e audita pesos_substituidos', async () => {
    const { cenario } = aberto;
    await salvarComo(cenario.contaC);
    const segundo = await salvarComo(cenario.contaO, { ...NOVOS, presencaSemChuva: 7 });
    expect(segundo).toEqual({ substituiu: true });
    const deHoje = (await linhasDeG()).filter((l) => l.vigente === HOJE);
    expect(deHoje).toEqual([
      { vigente: HOJE, pesos: [7, 3, 1, 1, -2, -4], autora: cenario.contaO },
    ]);
    expect((await auditoriasDePesos()).map((a) => a.acao)).toEqual([
      'pesos_configurados',
      'pesos_substituidos',
    ]);
  });

  it('PAR-09: a configuração de ontem nunca muda', async () => {
    const { cenario } = aberto;
    await configurar('2026-11-04', cenario.contaO, [2, 2, 2, 2, -2, -2]);
    await salvarComo(cenario.contaC);
    expect((await linhasDeG()).find((l) => l.vigente === '2026-11-04')).toEqual({
      vigente: '2026-11-04',
      pesos: [2, 2, 2, 2, -2, -2],
      autora: cenario.contaO,
    });
  });

  it('PAR-09: erro forçado depois do INSERT (na auditoria) desfaz pesos e auditoria', async () => {
    const { cenario } = aberto;
    await aberto.db.query(
      `CREATE FUNCTION falha_teste_par05() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         IF NEW.acao IN ('pesos_configurados', 'pesos_substituidos') THEN
           RAISE EXCEPTION 'falha forçada (PAR-05)';
         END IF;
         RETURN NEW;
       END $$`,
    );
    await aberto.db.query(
      'CREATE TRIGGER falha_teste_par05 BEFORE INSERT ON auditoria FOR EACH ROW EXECUTE FUNCTION falha_teste_par05()',
    );
    await expect(salvarComo(cenario.contaC)).rejects.toThrow('falha forçada');
    expect((await linhasDeG()).map((l) => l.vigente)).toEqual(['2026-01-01']);
    expect(await auditoriasDePesos()).toEqual([]);
  });

  it('PAR-142: o resumo da auditoria só tem os 6 pesos, todos números', async () => {
    const { cenario } = aberto;
    await salvarComo(cenario.contaC);
    const [a] = await auditoriasDePesos();
    expect(a?.resumo).toEqual({
      presencaSemChuva: 2,
      presencaComChuva: 3,
      lesionadoSemChuva: 1,
      lesionadoComChuva: 1,
      expulsoSemChuva: -2,
      expulsoComChuva: -4,
    });
    expect(Object.values(a?.resumo ?? {}).every((v) => typeof v === 'number')).toBe(true);
  });

  it('PAR-03: a conta de outro grupo não grava em G (a RLS recusa)', async () => {
    const { cenario } = aberto;
    await expect(salvarComo(cenario.contaB)).rejects.toMatchObject({ code: '42501' });
    expect((await linhasDeG()).map((l) => l.vigente)).toEqual(['2026-01-01']);
  });
});
