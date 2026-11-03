import type { ClientBase } from 'pg';

/*
 * Impressão digital do schema (FUN-08): uma linha ordenada por item, lida do pg_catalog.
 * A tabela `pgmigrations` fica de fora: ela registra o histórico, não o schema.
 */

// No PG 18, NOT NULL também vira linha em pg_constraint (contype 'n'); ela já aparece como notnull= da coluna.
const TABELAS = `
  c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and c.relname <> 'pgmigrations'
`;

async function linhas(db: ClientBase, sql: string): Promise<string[]> {
  const { rows } = await db.query<{ linha: string }>(sql);
  return rows.map((r) => r.linha);
}

export async function lerEsquema(db: ClientBase): Promise<string[]> {
  const consultas = [
    () => linhas(db, `select 'tabela ' || c.relname as linha from pg_class c where ${TABELAS}`),
    () =>
      linhas(
        db,
        `select format('coluna %s.%s %s notnull=%s default=%s identity=%s generated=%s',
          c.relname, a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull::text,
          coalesce(pg_get_expr(d.adbin, d.adrelid), 'none'),
          case a.attidentity when 'a' then 'always' when 'd' then 'by default' else 'none' end,
          case a.attgenerated when 's' then 'stored' else 'none' end) as linha
         from pg_class c
         join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
         left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
        where ${TABELAS}`,
      ),
    () =>
      linhas(
        db,
        `select format('restricao %s.%s %s', c.relname, k.conname, pg_get_constraintdef(k.oid)) as linha
         from pg_class c join pg_constraint k on k.conrelid = c.oid and k.contype <> 'n'
        where ${TABELAS}`,
      ),
    () =>
      linhas(
        db,
        `select format('indice %s.%s %s', c.relname, i.relname, pg_get_indexdef(i.oid)) as linha
         from pg_class c
         join pg_index x on x.indrelid = c.oid
         join pg_class i on i.oid = x.indexrelid
        where ${TABELAS}`,
      ),
    () =>
      linhas(
        db,
        `select format('trigger %s.%s %s', c.relname, t.tgname, pg_get_triggerdef(t.oid)) as linha
         from pg_class c join pg_trigger t on t.tgrelid = c.oid and not t.tgisinternal
        where ${TABELAS}`,
      ),
  ];
  // em série: um cliente pg não aceita consultas concorrentes
  const partes: string[][] = [];
  for (const consulta of consultas) partes.push(await consulta());
  return partes.flat().sort();
}
