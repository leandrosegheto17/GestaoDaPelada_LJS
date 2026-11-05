import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { abrirCenario, type CenarioAberto } from './apoio.ts';
import { MATRIZ, problemasDeCobertura } from './matriz.ts';

/**
 * Meta-teste da RLS (FUN-12): pelo catálogo, toda tabela com `grupo_id` (e `grupos`) tem
 * `ENABLE` e `FORCE ROW LEVEL SECURITY` e caso na matriz. As variantes que devem reprovar
 * rodam numa transação do superusuário desfeita ao fim (DDL é transacional no Postgres).
 */

let aberto: CenarioAberto;

beforeAll(async () => {
  aberto = await abrirCenario();
});

afterAll(async () => {
  await aberto?.fechar();
});

/** Aplica `ddl` numa transação, lê os problemas e desfaz tudo. */
async function problemasCom(ddl: string): Promise<string[]> {
  const { db } = aberto;
  await db.query('BEGIN');
  try {
    await db.query(ddl);
    return await problemasDeCobertura(db);
  } finally {
    await db.query('ROLLBACK');
  }
}

describe('meta-teste da RLS', () => {
  it('FUN-12: no banco migrado, toda tabela com grupo_id tem RLS forçada e caso na matriz', async () => {
    expect(await problemasDeCobertura(aberto.db)).toEqual([]);
  });

  it('FUN-12: todas as tabelas com grupo_id do catálogo têm relforcerowsecurity', async () => {
    const { db } = aberto;
    const r = await db.query<{ tabela: string }>(
      `SELECT c.relname AS tabela
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
          AND (c.relname = 'grupos'
               OR EXISTS (SELECT 1 FROM pg_attribute a
                           WHERE a.attrelid = c.oid AND a.attname = 'grupo_id' AND NOT a.attisdropped))
          AND NOT (c.relrowsecurity AND c.relforcerowsecurity)`,
    );
    expect(r.rows).toEqual([]);
  });

  it('FUN-12: a matriz cobre as 16 tabelas da fundação, sem repetir', () => {
    const nomes = MATRIZ.map((c) => c.tabela);
    expect(new Set(nomes).size).toBe(nomes.length);
    expect(nomes).toHaveLength(16);
  });

  it('FUN-12: tabela nova com grupo_id sem RLS e sem caso na matriz faz o meta-teste falhar', async () => {
    const p = await problemasCom(
      'CREATE TABLE exemplo_sem_rls (id int PRIMARY KEY, grupo_id uuid)',
    );
    expect(p).toEqual([
      'exemplo_sem_rls: sem ENABLE ROW LEVEL SECURITY',
      'exemplo_sem_rls: sem FORCE ROW LEVEL SECURITY',
      'exemplo_sem_rls: sem caso na matriz',
    ]);
  });

  it('FUN-12: tabela nova com RLS forçada, mas sem caso na matriz, faz o meta-teste falhar', async () => {
    const p = await problemasCom(`
      CREATE TABLE exemplo_forcada (id int PRIMARY KEY, grupo_id uuid);
      ALTER TABLE exemplo_forcada ENABLE ROW LEVEL SECURITY;
      ALTER TABLE exemplo_forcada FORCE ROW LEVEL SECURITY;
    `);
    expect(p).toEqual(['exemplo_forcada: sem caso na matriz']);
  });

  it('FUN-12: tirar o FORCE de uma tabela herdada faz o meta-teste falhar', async () => {
    const p = await problemasCom('ALTER TABLE jogadores NO FORCE ROW LEVEL SECURITY');
    expect(p).toEqual(['jogadores: sem FORCE ROW LEVEL SECURITY']);
  });

  it('FUN-12: desligar a RLS de grupos faz o meta-teste falhar', async () => {
    const p = await problemasCom('ALTER TABLE grupos DISABLE ROW LEVEL SECURITY');
    expect(p).toEqual(['grupos: sem ENABLE ROW LEVEL SECURITY']);
  });

  it('FUN-12: caso da matriz sem tabela no catálogo faz o meta-teste falhar', async () => {
    const p = await problemasDeCobertura(aberto.db, [
      ...MATRIZ,
      { tabela: 'tabela_que_nao_existe', coluna: 'grupo_id', leitura: 'por-grupo' },
    ]);
    expect(p).toEqual(['tabela_que_nao_existe: caso na matriz sem tabela no catálogo']);
  });

  it('FUN-12: a matriz sem o caso de uma tabela herdada faz o meta-teste falhar', async () => {
    const p = await problemasDeCobertura(
      aberto.db,
      MATRIZ.filter((c) => c.tabela !== 'presencas'),
    );
    expect(p).toEqual(['presencas: sem caso na matriz']);
  });
});
