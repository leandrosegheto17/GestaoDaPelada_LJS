import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { recursoLiberadoPadrao } from '../../src/entrada/middlewares/recurso.ts';
import { abrirCenarioGrupos, comoConta, criarGrupoComoConta, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * Rede de proteção da planos-e-cobranca (T0; PLA-12, PLA-13, linha de base): como o banco trata a situação comercial
 * antes das migrações desta feature (T10 a T17). Atores do cenário de grupos: C = criadora de G, B = conta só de H.
 *
 * (a) default de `grupos.situacao_comercial` é `uso_proprio` (`1792843200000_linha-de-base.sql:72-78`): fica verde;
 * (b) o CHECK `grupos_trial` recusa `trial` sem data e data sem `trial`: fica verde até o fim;
 * (c) `pelada_app` não insere em `grupos` nem muda `situacao_comercial` e `trial_inicio`
 *     (`1792844400000_grupos-grants-coluna.sql:6-7`): fica verde até o fim;
 * (d) `grupo_criar` de 7 parâmetros grava `uso_proprio` e `trial_inicio` nulo: é o teste que a T13 troca, com motivo;
 * (e) o `recursoLiberado` vigente libera todo grupo: é trocado pela T21 (o de FIN-45 e SIM-68 continua verde até lá).
 *
 * Evidência da rede (registrar na T0 do tasks.md, pelo /executar, uma sabotagem por item numa cópia):
 * - (a) `ALTER TABLE grupos ALTER situacao_comercial SET DEFAULT 'ativo'` deixa vermelho o default;
 * - (b) `ALTER TABLE grupos DROP CONSTRAINT grupos_trial` deixa vermelhos os dois casos do CHECK;
 * - (c) `GRANT UPDATE (situacao_comercial, trial_inicio) ON grupos TO pelada_app` deixa vermelho o 42501;
 * - (d) a migração da T13 deixa vermelho "nasce uso_proprio" (é a troca prevista);
 * - (e) a T21 deixa vermelho "libera todo grupo" (é a troca prevista).
 */

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

/** Roda `fn` como superusuário numa transação desfeita, para o CHECK sem passar pelos grants. */
async function comoSuper<T>(db: pg.Client, fn: (d: pg.Client) => Promise<T>): Promise<T> {
  await db.query('BEGIN');
  try {
    return await fn(db);
  } finally {
    await db.query('ROLLBACK').catch(() => undefined);
  }
}

describe('rede do plano: default e CHECK (a, b)', () => {
  it('PLA-12: o default de situacao_comercial é uso_proprio', async () => {
    const r = await aberto.db.query<{ padrao: string | null }>(
      `SELECT column_default AS padrao FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'grupos' AND column_name = 'situacao_comercial'`,
    );
    expect(r.rows[0]?.padrao ?? '').toMatch(/^'uso_proprio'/);
  });

  it('PLA-12: CHECK grupos_trial recusa trial sem trial_inicio', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoSuper(db, (d) =>
        d.query(`UPDATE grupos SET situacao_comercial = 'trial', trial_inicio = NULL WHERE id = $1`, [cenario.grupoG]),
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('PLA-12: CHECK grupos_trial recusa trial_inicio sem trial', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoSuper(db, (d) =>
        d.query(`UPDATE grupos SET situacao_comercial = 'ativo', trial_inicio = '2026-11-01' WHERE id = $1`, [
          cenario.grupoG,
        ]),
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('PLA-12: CHECK grupos_trial aceita trial com trial_inicio (controle)', async () => {
    const { db, cenario } = aberto;
    const r = await comoSuper(db, (d) =>
      d.query(`UPDATE grupos SET situacao_comercial = 'trial', trial_inicio = '2026-11-01' WHERE id = $1`, [
        cenario.grupoG,
      ]),
    );
    expect(r.rowCount).toBe(1);
  });
});

describe('rede do plano: pelada_app sem escrita direta (c)', () => {
  it('PLA-12: INSERT INTO grupos como pelada_app com conta é recusado', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoConta(db, cenario.contaC, (d) =>
        d.query(
          `INSERT INTO grupos (nome, slug, dia_semana, frequencia, horario, criado_por, criado_em)
           VALUES ('Direto', 'direto', 'quinta', 'semanal', '20:00', $1, now())`,
          [cenario.contaC],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('PLA-13: UPDATE de situacao_comercial como pelada_app dá 42501', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoConta(db, cenario.contaC, (d) =>
        d.query(`UPDATE grupos SET situacao_comercial = 'ativo' WHERE id = $1`, [cenario.grupoG]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('PLA-13: UPDATE de trial_inicio como pelada_app dá 42501', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoConta(db, cenario.contaC, (d) =>
        d.query(`UPDATE grupos SET trial_inicio = '2026-11-01' WHERE id = $1`, [cenario.grupoG]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('PLA-13: UPDATE sem WHERE de situacao_comercial como pelada_app dá 42501', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoConta(db, cenario.contaB, (d) => d.query(`UPDATE grupos SET situacao_comercial = 'ativo'`)),
    ).rejects.toMatchObject({ code: '42501' });
  });
});

// Item (d): trocado pela T13 (`grupo_criar` passa a gravar `trial` e `trial_inicio = p_hoje`), com motivo no commit.
describe('rede do plano: grupo_criar antes da T13 (d)', () => {
  it('PLA-10 (antes da T13): grupo criado pela grupo_criar nasce uso_proprio com trial_inicio nulo', async () => {
    const { db, cenario } = aberto;
    const novo = await criarGrupoComoConta(db, cenario.contaB, 'Pelada da Rede', 'pelada-da-rede');
    const r = await db.query<{ situacao_comercial: string; trial_inicio: string | null }>(
      'SELECT situacao_comercial, trial_inicio::text FROM grupos WHERE id = $1',
      [novo.id],
    );
    expect(r.rows[0]).toEqual({ situacao_comercial: 'uso_proprio', trial_inicio: null });
  });
});

// Item (e): trocado pela T21 (o ponto único passa a ler o plano).
describe('rede do plano: recursoLiberado antes da T21 (e)', () => {
  it('PLA-07 (antes da T21): o recursoLiberado vigente libera todo grupo', async () => {
    const { cenario } = aberto;
    const db = {} as Parameters<typeof recursoLiberadoPadrao>[0];
    expect(await recursoLiberadoPadrao(db, cenario.grupoG, 'simulador')).toBe(true);
    expect(await recursoLiberadoPadrao(db, cenario.grupoH, 'financeiro')).toBe(true);
  });
});
