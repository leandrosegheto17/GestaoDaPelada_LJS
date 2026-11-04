import pg from 'pg';
import { expect, test } from 'vitest';
import { comBancoDeTeste } from '../apoio/banco.ts';
import { comCenario, comoApp, tabelasComGrupo } from './apoio.ts';

test('FUN-13: comoApp com a conta A enxerga o grupo de A e não o de B em grupos', async () => {
  await comCenario(async ({ c, A, B }) => {
    const ids = await comoApp(c, { contaId: A.contaId }, async () =>
      (await c.query<{ id: string }>('select id from grupos')).rows.map((r) => r.id),
    );
    expect(ids).toEqual([A.grupoId]);
    expect(ids).not.toContain(B.grupoId);
  });
}, 120_000);

test('FUN-13: o cenário tem ao menos uma linha por grupo em cada tabela com grupo_id do catálogo', async () => {
  await comCenario(async ({ c, A, B }) => {
    const tabelas = await tabelasComGrupo(c);
    expect(tabelas.map((t) => t.tabela)).toEqual(
      expect.arrayContaining(['grupos', 'convites_admin', 'jogadores', 'auditoria', 'eventos_uso']),
    );
    // 15 tabelas com grupo_id + grupos
    expect(tabelas).toHaveLength(16);
    for (const { tabela, coluna } of tabelas) {
      for (const g of [A.grupoId, B.grupoId]) {
        const n = (
          await c.query<{ n: number }>(
            `select count(*)::int as n from "${tabela}" where "${coluna}" = $1`,
            [g],
          )
        ).rows[0]!.n;
        expect(n, `${tabela} (${g})`).toBeGreaterThanOrEqual(1);
      }
    }
  });
}, 120_000);

test('FUN-13: o banco do cenário é removido no finally, inclusive com erro no corpo', async () => {
  let nome = '';
  await expect(
    comCenario(async ({ c }) => {
      nome = (await c.query<{ d: string }>('select current_database() as d')).rows[0]!.d;
      throw new Error('falha do corpo');
    }),
  ).rejects.toThrow('falha do corpo');
  expect(nome).toMatch(/^teste_/);
  await comBancoDeTeste(async (url) => {
    const admin = new pg.Client({ connectionString: url.replace(/\/[^/]+$/, '/postgres') });
    await admin.connect();
    const r = await admin.query('select 1 from pg_database where datname = $1', [nome]);
    await admin.end();
    expect(r.rowCount).toBe(0);
  });
}, 120_000);
