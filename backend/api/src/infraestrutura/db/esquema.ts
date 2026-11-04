import type pg from 'pg';

const SCHEMA = 'public';

/**
 * Impressão digital do schema (FUN-08): uma linha ordenada por item, lida do `pg_catalog`.
 * Cada categoria é uma consulta própria, para que a comparação aponte o que mudou.
 */
export async function lerEsquema(
  db: pg.ClientBase,
  opcoes: { roles?: readonly string[] } = {},
): Promise<string[]> {
  const linhas = [...(await estrutura(db)), ...(await seguranca(db, opcoes.roles))];
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

/** Funções, policies, RLS, grants, atributos das roles `pelada_*` e extensões (FUN-08, FUN-11). */
async function seguranca(db: pg.ClientBase, roles?: readonly string[]): Promise<string[]> {
  const q = async (sql: string, extra: unknown[] = []) =>
    (await db.query<{ l: string }>(sql, [SCHEMA, ...extra])).rows.map((r) => r.l);
  return [
    // funções próprias do schema (as de extensão não entram); o corpo vira hash
    ...(await q(`
      select 'funcao ' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
        || ' security=' || case when p.prosecdef then 'definer' else 'invoker' end
        || ' config=' || coalesce(array_to_string(p.proconfig, ','), '-')
        || ' corpo=' || encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') as l
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = $1 and p.prokind in ('f','p')
        and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')`)),
    ...(await q(`
      select 'policy ' || n.nspname || '.' || c.relname || '.' || o.polname
        || case when o.polpermissive then ' permissive' else ' restrictive' end
        || ' cmd=' || o.polcmd::text
        || ' roles=' || case when o.polroles = '{0}' then 'public'
             else (select string_agg(r.rolname, ',' order by r.rolname) from pg_roles r where r.oid = any(o.polroles)) end
        || ' using=' || coalesce(pg_get_expr(o.polqual, o.polrelid), '-')
        || ' check=' || coalesce(pg_get_expr(o.polwithcheck, o.polrelid), '-') as l
      from pg_policy o
      join pg_class c on c.oid = o.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1`)),
    ...(await q(`
      select 'rls ' || n.nspname || '.' || c.relname
        || ' enabled=' || case when c.relrowsecurity then 't' else 'f' end
        || ' force=' || case when c.relforcerowsecurity then 't' else 'f' end as l
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1 and c.relkind in ('r','p') and c.relname <> 'pgmigrations'`)),
    // grants: o dono da tabela fica de fora (o nome dele muda entre local, CI e Neon)
    ...(await q(`
      select 'grant ' || n.nspname || '.' || c.relname || ' '
        || case when a.grantee = 0 then 'public' else (select rolname from pg_roles where oid = a.grantee) end
        || ' ' || a.privilege_type as l
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(c.relacl) a
      where n.nspname = $1 and c.relkind in ('r','p') and c.relname <> 'pgmigrations'
        and a.grantee <> c.relowner`)),
    ...(await q(`
      select 'grant-coluna ' || n.nspname || '.' || c.relname || '.' || t.attname || ' '
        || case when a.grantee = 0 then 'public' else (select rolname from pg_roles where oid = a.grantee) end
        || ' ' || a.privilege_type as l
      from pg_attribute t
      join pg_class c on c.oid = t.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(t.attacl) a
      where n.nspname = $1 and c.relname <> 'pgmigrations' and not t.attisdropped
        and a.grantee <> c.relowner`)),
    // roles da aplicação: atributos, nunca a senha
    ...(await q(
      `
      select 'role ' || rolname
        || ' login=' || case when rolcanlogin then 't' else 'f' end
        || ' bypassrls=' || case when rolbypassrls then 't' else 'f' end
        || ' superuser=' || case when rolsuper then 't' else 'f' end
        || ' createdb=' || case when rolcreatedb then 't' else 'f' end
        || ' createrole=' || case when rolcreaterole then 't' else 'f' end
        || ' inherit=' || case when rolinherit then 't' else 'f' end as l
      from pg_roles
      where $1::text is not null
        and case when $2::text[] is null then left(rolname, 7) = 'pelada_' else rolname = any($2::text[]) end`,
      [roles ?? null],
    )),
    ...(await q(`select 'extensao ' || extname as l from pg_extension where $1::text is not null`)),
  ];
}
