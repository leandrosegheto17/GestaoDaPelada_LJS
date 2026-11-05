import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { abrirCenario, comoApp, type CenarioAberto } from './apoio.ts';

/**
 * Roles do banco (FUN-11, design C3). `pelada_owner` só existe no Neon: as migrações locais
 * e do CI rodam como `postgres` e a `pelada_owner` é conferida na paridade com a `dev` (AD-009, T80).
 */

let aberto: CenarioAberto;

beforeAll(async () => {
  aberto = await abrirCenario();
});

afterAll(async () => {
  await aberto?.fechar();
});

/** Privilégios de escrita que a role tem em alguma tabela do schema public (tabela ou coluna). */
async function escritasDe(db: pg.Client, role: string, privilegios: string[]): Promise<string[]> {
  const r = await db.query<{ item: string }>(
    `SELECT c.relname || ' ' || p.priv AS item
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN unnest($2::text[]) AS p(priv)
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
        AND (has_table_privilege($1, c.oid, p.priv)
             OR CASE WHEN p.priv IN ('INSERT', 'UPDATE') THEN has_any_column_privilege($1, c.oid, p.priv)
                     ELSE false END)
      ORDER BY 1`,
    [role, privilegios],
  );
  return r.rows.map((l) => l.item);
}

/** Roda `fn` numa transação como `role`, sem contexto de conta nem de slug. */
async function comoRole<T>(db: pg.Client, role: string, fn: () => Promise<T>): Promise<T> {
  await db.query('BEGIN');
  try {
    await db.query(`SET LOCAL ROLE ${db.escapeIdentifier(role)}`);
    return await fn();
  } finally {
    await db.query('ROLLBACK');
  }
}

describe('roles do banco', () => {
  it.each([
    ['TRUNCATE', 'TRUNCATE jogadores'],
    ['CREATE TABLE', 'CREATE TABLE intrusa (id int)'],
    ['DROP TABLE', 'DROP TABLE jogadores'],
    ['ALTER TABLE', 'ALTER TABLE jogadores ADD COLUMN intrusa int'],
    ['CREATE SCHEMA', 'CREATE SCHEMA intruso'],
  ])('FUN-11: pelada_app tentando %s recebe erro de permissão', async (_comando, sql) => {
    const { db, cenario } = aberto;
    await expect(comoApp(db, { conta: cenario.contaA }, (d) => d.query(sql))).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('FUN-11: os comandos recusados não mudaram nada (jogadores segue com as linhas e sem a coluna)', async () => {
    const { db } = aberto;
    const linhas = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM jogadores');
    expect(linhas.rows[0]?.n).toBeGreaterThanOrEqual(2);
    const coluna = await db.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'jogadores' AND column_name = 'intrusa'`,
    );
    expect(coluna.rowCount).toBe(0);
  });

  it('FUN-11: pelada_app não tem BYPASSRLS, superusuário nem CREATE no schema public', async () => {
    const { db } = aberto;
    const r = await db.query<{ rolbypassrls: boolean; rolsuper: boolean; cria: boolean }>(
      `SELECT rolbypassrls, rolsuper, has_schema_privilege('pelada_app', 'public', 'CREATE') AS cria
         FROM pg_roles WHERE rolname = 'pelada_app'`,
    );
    expect(r.rows).toEqual([{ rolbypassrls: false, rolsuper: false, cria: false }]);
  });

  it('FUN-11: pelada_app não tem TRUNCATE em nenhuma tabela', async () => {
    expect(await escritasDe(aberto.db, 'pelada_app', ['TRUNCATE'])).toEqual([]);
  });

  it('FUN-11: pelada_backup_ro não tem INSERT, UPDATE, DELETE nem TRUNCATE em nenhuma tabela', async () => {
    const { db } = aberto;
    const r = await db.query<{ rolbypassrls: boolean; rolsuper: boolean; cria: boolean }>(
      `SELECT rolbypassrls, rolsuper, has_schema_privilege('pelada_backup_ro', 'public', 'CREATE') AS cria
         FROM pg_roles WHERE rolname = 'pelada_backup_ro'`,
    );
    expect(r.rows).toEqual([{ rolbypassrls: false, rolsuper: false, cria: false }]);
    expect(await escritasDe(db, 'pelada_backup_ro', ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'])).toEqual([]);
  });

  it('FUN-11: pelada_backup_ro tentando INSERT recebe erro de permissão', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoRole(db, 'pelada_backup_ro', () =>
        db.query(`INSERT INTO habilidades (grupo_id, nome) VALUES ($1, 'Intrusa')`, [cenario.grupoA]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('FUN-11: pelada_backup_ro enxerga todas as linhas de todas as tabelas com RLS', async () => {
    const { db, cenario } = aberto;
    const tabelas = (
      await db.query<{ t: string }>(
        `SELECT c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relrowsecurity ORDER BY 1`,
      )
    ).rows.map((l) => l.t);
    expect(tabelas).toEqual(expect.arrayContaining(cenario.tabelas.map((t) => t.tabela)));

    for (const t of tabelas) {
      const sql = `SELECT count(*)::int AS n FROM ${db.escapeIdentifier(t)}`;
      const total = (await db.query<{ n: number }>(sql)).rows[0]?.n;
      const visto = await comoRole(db, 'pelada_backup_ro', async () => (await db.query<{ n: number }>(sql)).rows[0]?.n);
      expect(visto, `${t}: linhas vistas por pelada_backup_ro`).toBe(total);
    }

    // As tabelas com grupo_id têm linhas dos dois grupos: a igualdade acima não é só de zeros.
    for (const { tabela } of cenario.tabelas) {
      const n = await comoRole(
        db,
        'pelada_backup_ro',
        async () =>
          (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${db.escapeIdentifier(tabela)}`)).rows[0]?.n,
      );
      expect(n, `${tabela}: linhas dos dois grupos`).toBeGreaterThanOrEqual(2);
    }
  });
});
