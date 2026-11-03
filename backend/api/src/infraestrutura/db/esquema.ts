import type { ClientBase } from 'pg';

/*
 * Impressão digital do schema (FUN-08): uma linha ordenada por item, lida do pg_catalog.
 * A tabela `pgmigrations` fica de fora: ela registra o histórico, não o schema.
 */

// No PG 18, NOT NULL também vira linha em pg_constraint (contype 'n'); ela já aparece como notnull= da coluna.
const TABELAS = `
  c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and c.relname <> 'pgmigrations'
`;

const GRANTEE = "coalesce(r.rolname, 'PUBLIC')";
// Funções do schema public que não pertencem a extensão.
const FUNCOES = `p.pronamespace = 'public'::regnamespace and not exists (
  select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')`;

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
    () =>
      linhas(
        db,
        `select format('funcao %s(%s) returns %s language=%s securitydefiner=%s config=%s corpo=%s',
            p.proname, pg_get_function_identity_arguments(p.oid), format_type(p.prorettype, null),
            l.lanname, p.prosecdef::text, coalesce(array_to_string(p.proconfig, ';'), 'none'), md5(p.prosrc)) as linha
           from pg_proc p
           join pg_language l on l.oid = p.prolang
          where ${FUNCOES}`,
      ),
    () =>
      linhas(
        db,
        `select format('policy %s.%s cmd=%s roles=%s using=%s check=%s',
            tablename, policyname, cmd,
            (select string_agg(r, ',' order by r) from unnest(roles) r),
            coalesce(qual, 'none'), coalesce(with_check, 'none')) as linha
           from pg_policies where schemaname = 'public' and tablename <> 'pgmigrations'`,
      ),
    () =>
      linhas(
        db,
        `select format('rls %s enable=%s force=%s', c.relname, c.relrowsecurity::text, c.relforcerowsecurity::text) as linha
           from pg_class c where ${TABELAS}`,
      ),
    () =>
      linhas(
        db,
        `select format('grant tabela %s %s %s', c.relname, ${GRANTEE}, string_agg(x.privilege_type, ',' order by x.privilege_type)) as linha
           from pg_class c
           cross join lateral aclexplode(c.relacl) x
           left join pg_roles r on r.oid = x.grantee
          where ${TABELAS} and x.grantee <> c.relowner and (x.grantee = 0 or r.rolname like 'pelada\_%')
          group by c.relname, x.grantee, r.rolname`,
      ),
    () =>
      linhas(
        db,
        `select format('grant coluna %s.%s %s %s', c.relname, a.attname, ${GRANTEE}, string_agg(x.privilege_type, ',' order by x.privilege_type)) as linha
           from pg_class c
           join pg_attribute a on a.attrelid = c.oid and a.attacl is not null and not a.attisdropped
           cross join lateral aclexplode(a.attacl) x
           left join pg_roles r on r.oid = x.grantee
          where ${TABELAS} and x.grantee <> c.relowner and (x.grantee = 0 or r.rolname like 'pelada\_%')
          group by c.relname, a.attname, x.grantee, r.rolname`,
      ),
    () =>
      linhas(
        db,
        `select format('grant funcao %s(%s) %s %s', p.proname, pg_get_function_identity_arguments(p.oid), ${GRANTEE}, string_agg(x.privilege_type, ',' order by x.privilege_type)) as linha
           from pg_proc p
           cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
           left join pg_roles r on r.oid = x.grantee
          where ${FUNCOES} and x.grantee <> p.proowner and (x.grantee = 0 or r.rolname like 'pelada\_%')
          group by p.oid, p.proname, x.grantee, r.rolname`,
      ),
    () =>
      linhas(
        db,
        `select format('role %s login=%s bypassrls=%s superuser=%s createdb=%s createrole=%s replication=%s',
            rolname, rolcanlogin::text, rolbypassrls::text, rolsuper::text, rolcreatedb::text, rolcreaterole::text, rolreplication::text) as linha
           from pg_roles where rolname like 'pelada\_%'`,
      ),
    () => linhas(db, `select 'extensao ' || extname as linha from pg_extension`),
  ];
  // em série: um cliente pg não aceita consultas concorrentes
  const partes: string[][] = [];
  for (const consulta of consultas) partes.push(await consulta());
  return partes.flat().sort();
}
