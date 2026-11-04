import { expect, test } from 'vitest';
import { comCenario, tabelasComGrupo } from './apoio.ts';
import { CASOS_DA_MATRIZ } from './matriz.ts';
import { verificarMatriz } from './meta.ts';

test('FUN-12: toda tabela com grupo_id do catálogo tem ENABLE e FORCE e um caso na matriz', async () => {
  await comCenario(async ({ c }) => {
    expect(await verificarMatriz(c, CASOS_DA_MATRIZ)).toEqual([]);
    const forcadas = await c.query<{ n: number }>(
      `select count(*)::int as n from pg_class where relforcerowsecurity and relkind = 'r'
        and relnamespace = 'public'::regnamespace and relname = any($1)`,
      [(await tabelasComGrupo(c)).map((t) => t.tabela)],
    );
    expect(forcadas.rows[0]!.n).toBe(CASOS_DA_MATRIZ.length);
  });
}, 120_000);

test('FUN-12: tabela de exemplo com grupo_id sem RLS e sem caso na matriz faz o meta-teste falhar', async () => {
  await comCenario(async ({ c }) => {
    await c.query('create table exemplo_sem_rls (id int, grupo_id uuid)');
    const problemas = await verificarMatriz(c, CASOS_DA_MATRIZ);
    expect(problemas).toEqual(
      expect.arrayContaining([
        'exemplo_sem_rls: sem ENABLE ROW LEVEL SECURITY',
        'exemplo_sem_rls: sem FORCE ROW LEVEL SECURITY',
        'exemplo_sem_rls: sem caso na matriz',
      ]),
    );
  });
}, 120_000);

test('FUN-12: RLS ligada mas sem FORCE também reprova', async () => {
  await comCenario(async ({ c }) => {
    await c.query('alter table jogadores no force row level security');
    expect(await verificarMatriz(c, CASOS_DA_MATRIZ)).toEqual([
      'jogadores: sem FORCE ROW LEVEL SECURITY',
    ]);
  });
}, 120_000);
