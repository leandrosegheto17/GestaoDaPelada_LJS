import { expect, test } from 'vitest';
import { comCenario, comoApp, comoRole, tabelasComGrupo } from './apoio.ts';

const NEGADO = /permission denied|must be owner/;

test('FUN-11: pelada_app não tem TRUNCATE, CREATE TABLE nem DROP TABLE', async () => {
  await comCenario(async ({ c, A }) => {
    for (const sql of [
      'truncate jogadores',
      'create table intruso (x int)',
      'drop table jogadores',
    ]) {
      const erro = await comoApp(c, { contaId: A.contaId }, () => c.query(sql)).catch(
        (e: Error) => e,
      );
      expect(erro, sql).toBeInstanceOf(Error);
      expect((erro as Error).message, sql).toMatch(NEGADO);
    }
  });
}, 120_000);

test('FUN-11: pelada_app não tem BYPASSRLS; pelada_backup_ro não escreve em nenhuma tabela', async () => {
  await comCenario(async ({ c }) => {
    const r = await c.query<{ rolbypassrls: boolean; rolsuper: boolean }>(
      "select rolbypassrls, rolsuper from pg_roles where rolname = 'pelada_app'",
    );
    expect(r.rows[0]).toEqual({ rolbypassrls: false, rolsuper: false });

    const escrita = await c.query<{ tabela: string; priv: string }>(`
      select c.relname as tabela, p.priv
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p(priv)
       where n.nspname = 'public' and c.relkind = 'r'
         and has_table_privilege('pelada_backup_ro', c.oid, p.priv)`);
    expect(escrita.rows).toEqual([]);
  });
}, 120_000);

test('FUN-11: pelada_backup_ro enxerga todas as linhas de todas as tabelas de negócio', async () => {
  await comCenario(async ({ c }) => {
    for (const { tabela } of await tabelasComGrupo(c)) {
      const real = (await c.query<{ n: number }>(`select count(*)::int as n from "${tabela}"`))
        .rows[0]!.n;
      const vistas = await comoRole(
        c,
        'pelada_backup_ro',
        {},
        async () =>
          (await c.query<{ n: number }>(`select count(*)::int as n from "${tabela}"`)).rows[0]!.n,
      );
      expect(real, tabela).toBeGreaterThanOrEqual(2);
      expect(vistas, tabela).toBe(real);
    }
  });
}, 120_000);
