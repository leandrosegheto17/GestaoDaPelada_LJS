import type pg from 'pg';

const SCHEMA = 'public';

/**
 * Impressão digital do schema (FUN-08): uma linha ordenada por item, lida do `pg_catalog`.
 * Cada categoria é uma consulta própria, para que a comparação aponte o que mudou.
 */
export async function lerEsquema(db: pg.ClientBase): Promise<string[]> {
  const linhas = [...(await estrutura(db))];
  return linhas.sort();
}

async function estrutura(db: pg.ClientBase): Promise<string[]> {
  const q = async (sql: string) =>
    (await db.query<{ l: string }>(sql, [SCHEMA])).rows.map((r) => r.l);
  return [
    ...(await q(`
      select 'tabela ' || n.nspname || '.' || c.relname as l
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1 and c.relkind in ('r','p') and c.relname <> 'pgmigrations'`)),
    ...(await q(`
      select 'coluna ' || n.nspname || '.' || c.relname || '.' || a.attname || ' '
        || format_type(a.atttypid, a.atttypmod)
        || case when a.attnotnull then ' not null' else '' end
        || coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), '')
        || case when a.attidentity <> '' then ' identity=' || a.attidentity::text else '' end as l
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where n.nspname = $1 and c.relkind in ('r','p') and c.relname <> 'pgmigrations'
        and a.attnum > 0 and not a.attisdropped`)),
    ...(await q(`
      select 'restricao ' || n.nspname || '.' || c.relname || '.' || k.conname || ' ' || pg_get_constraintdef(k.oid) as l
      from pg_constraint k
      join pg_class c on c.oid = k.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1 and c.relname <> 'pgmigrations'
        and k.contype <> 'n'`)),
    ...(await q(`
      select 'indice ' || n.nspname || '.' || c.relname || '.' || i.relname || ' ' || pg_get_indexdef(i.oid) as l
      from pg_index x
      join pg_class i on i.oid = x.indexrelid
      join pg_class c on c.oid = x.indrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1 and c.relname <> 'pgmigrations'`)),
    ...(await q(`
      select 'trigger ' || n.nspname || '.' || c.relname || '.' || t.tgname || ' ' || pg_get_triggerdef(t.oid) as l
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1 and not t.tgisinternal and c.relname <> 'pgmigrations'`)),
  ];
}
