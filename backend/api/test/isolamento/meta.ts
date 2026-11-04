import type pg from 'pg';
import { tabelasComGrupo } from './apoio.ts';
import type { CasoDaMatriz } from './matriz.ts';

/**
 * Descobre pelo catálogo toda tabela com `grupo_id` (e `grupos`) e devolve os problemas: tabela sem
 * ENABLE ou FORCE ROW LEVEL SECURITY, ou sem caso na matriz (FUN-12). Lista vazia = tudo coberto.
 */
export async function verificarMatriz(
  c: pg.ClientBase,
  casos: readonly CasoDaMatriz[],
): Promise<string[]> {
  const problemas: string[] = [];
  const naMatriz = new Set(casos.map((k) => k.tabela));
  for (const { tabela } of await tabelasComGrupo(c)) {
    const { rows } = await c.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      'select relrowsecurity, relforcerowsecurity from pg_class where oid = $1::regclass',
      [`public.${tabela}`],
    );
    const r = rows[0]!;
    if (!r.relrowsecurity) problemas.push(`${tabela}: sem ENABLE ROW LEVEL SECURITY`);
    if (!r.relforcerowsecurity) problemas.push(`${tabela}: sem FORCE ROW LEVEL SECURITY`);
    if (!naMatriz.has(tabela)) problemas.push(`${tabela}: sem caso na matriz`);
  }
  return problemas;
}
