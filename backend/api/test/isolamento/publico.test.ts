import { expect, test } from 'vitest';
import { comCenario, comoApp, inserirLinha } from './apoio.ts';
import { CASOS_DA_MATRIZ } from './matriz.ts';

const COM_LEITURA = CASOS_DA_MATRIZ.filter((k) => k.leitura === 'rls');
const BLOQUEADO = /row-level security|permission denied/;

test('FUN-14: só com o slug do grupo A, SELECT devolve só linhas do grupo A', async () => {
  await comCenario(async (cen) => {
    for (const caso of COM_LEITURA) {
      const chaves = await comoApp(cen.c, { slug: cen.A.slug }, async () =>
        (
          await cen.c.query<{ k: string }>(
            `select "${caso.coluna}"::text as k from "${caso.tabela}"`,
          )
        ).rows.map((r) => r.k),
      );
      // a policy de convites_admin exige conta: o slug público não vê convite nenhum
      if (caso.tabela === 'convites_admin') expect(chaves, caso.tabela).toEqual([]);
      else expect(chaves.length, caso.tabela).toBeGreaterThan(0);
      expect(
        chaves.every((k) => k === cen.A.grupoId),
        caso.tabela,
      ).toBe(true);
    }
  });
}, 180_000);

test('FUN-14: INSERT, UPDATE e DELETE só com o slug são recusados ou afetam zero linhas', async () => {
  await comCenario(async (cen) => {
    for (const caso of CASOS_DA_MATRIZ) {
      const { tabela, coluna } = caso;
      const contagem = async () =>
        (await cen.c.query<{ n: number }>(`select count(*)::int as n from "${tabela}"`)).rows[0]!.n;
      const antes = await contagem();

      const resultado = await comoApp(cen.c, { slug: cen.A.slug }, async () => {
        const saida: { insert?: Error; update: number | Error; delete: number | Error } = {
          update: 0,
          delete: 0,
        };
        const tenta = async <T>(fn: () => Promise<T>) => {
          await cen.c.query('savepoint t');
          try {
            return await fn();
          } catch (e) {
            await cen.c.query('rollback to savepoint t');
            return e as Error;
          }
        };
        const extra: Record<string, string> = tabela === 'grupos' ? { slug: 'novo-publico' } : {};
        saida.insert = (await tenta(() =>
          inserirLinha(cen.c, tabela, coluna, cen.A.grupoId, extra),
        )) as Error;
        const u = await tenta(() =>
          cen.c.query(`update "${tabela}" set "${coluna}" = "${coluna}"`),
        );
        saida.update = u instanceof Error ? u : (u.rowCount ?? 0);
        const d = await tenta(() => cen.c.query(`delete from "${tabela}"`));
        saida.delete = d instanceof Error ? d : (d.rowCount ?? 0);
        return saida;
      });

      expect(resultado.insert, `${tabela} INSERT`).toBeInstanceOf(Error);
      expect((resultado.insert as Error).message, `${tabela} INSERT`).toMatch(BLOQUEADO);
      for (const cmd of ['update', 'delete'] as const) {
        const r = resultado[cmd];
        if (r instanceof Error) expect(r.message, `${tabela} ${cmd}`).toMatch(BLOQUEADO);
        else expect(r, `${tabela} ${cmd}`).toBe(0);
      }
      expect(await contagem(), `${tabela} contagem`).toBe(antes);
    }
  });
}, 300_000);

test('FUN-15: sem nenhum contexto, toda tabela de negócio devolve zero linhas', async () => {
  await comCenario(async (cen) => {
    for (const caso of COM_LEITURA) {
      const n = await comoApp(
        cen.c,
        {},
        async () =>
          (await cen.c.query<{ n: number }>(`select count(*)::int as n from "${caso.tabela}"`))
            .rows[0]!.n,
      );
      expect(n, caso.tabela).toBe(0);
    }
  });
}, 180_000);
