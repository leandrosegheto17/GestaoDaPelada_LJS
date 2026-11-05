import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type pg from 'pg';

/** Referência versionada: impressão digital de um banco vazio migrado só com as 23 (FUN-08). */
export const ARQUIVO_REFERENCIA = join(import.meta.dirname, 'migracoes', 'esquema-producao.txt');

/**
 * Impressão digital do schema `public` (FUN-08): uma linha por item, ordenada, lida do
 * `pg_catalog`. Duas leituras do mesmo banco dão a mesma lista; qualquer mudança de
 * estrutura muda pelo menos uma linha.
 *
 * Ignora as tabelas de controle de migração: `pgmigrations` (node-pg-migrate) e
 * `migracoes_aplicadas` (do legado, que a v2 ignora; design, Data Models).
 */
export const TABELAS_IGNORADAS = ['pgmigrations', 'migracoes_aplicadas'] as const;

type Cliente = pg.ClientBase;

const FILTRO_TABELA = `n.nspname = 'public' AND c.relname <> ALL ($1::text[])`;

async function linhas(
  cliente: Cliente,
  sql: string,
  parametros: unknown[] = [TABELAS_IGNORADAS],
): Promise<string[]> {
  const r = await cliente.query<{ l: string }>(sql, parametros);
  return r.rows.map((x) => x.l);
}

/** Nome do grantee de um aclexplode; 0 é PUBLIC. */
const GRANTEE = `CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END`;

/** Tabelas, views e sequências do schema public. */
function relacoes(cliente: Cliente): Promise<string[]> {
  return linhas(
    cliente,
    `SELECT CASE c.relkind
              WHEN 'r' THEN 'tabela ' || c.relname
              WHEN 'p' THEN 'tabela ' || c.relname || ' particionada'
              WHEN 'v' THEN 'view ' || c.relname || ' ' || md5(pg_get_viewdef(c.oid))
              WHEN 'm' THEN 'view-materializada ' || c.relname || ' ' || md5(pg_get_viewdef(c.oid))
              WHEN 'S' THEN 'sequencia ' || c.relname
            END AS l
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE ${FILTRO_TABELA} AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
        AND NOT (c.relkind = 'S' AND c.relname LIKE 'pgmigrations%')`,
  );
}

/** Colunas: tipo, not null, default, identity e coluna gerada. */
function colunas(cliente: Cliente): Promise<string[]> {
  return linhas(
    cliente,
    `SELECT 'coluna ' || c.relname || '.' || a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
            || CASE WHEN a.attnotnull THEN ' not null' ELSE '' END
            || CASE WHEN a.attidentity = 'a' THEN ' identity always'
                    WHEN a.attidentity = 'd' THEN ' identity by default' ELSE '' END
            || CASE WHEN a.attgenerated <> '' THEN ' generated ' || pg_get_expr(d.adbin, d.adrelid)
                    WHEN d.adbin IS NOT NULL THEN ' default ' || pg_get_expr(d.adbin, d.adrelid)
                    ELSE '' END AS l
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE ${FILTRO_TABELA} AND c.relkind IN ('r', 'p', 'v', 'm')
        AND a.attnum > 0 AND NOT a.attisdropped`,
  );
}

/** Restrições (PK, FK, unique, check, exclusion). O not null já está na linha da coluna. */
function restricoes(cliente: Cliente): Promise<string[]> {
  return linhas(
    cliente,
    `SELECT 'restricao ' || c.relname || '.' || k.conname || ' ' || pg_get_constraintdef(k.oid) AS l
       FROM pg_constraint k
       JOIN pg_class c ON c.oid = k.conrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE ${FILTRO_TABELA} AND k.contype <> 'n'`,
  );
}

function indices(cliente: Cliente): Promise<string[]> {
  return linhas(
    cliente,
    `SELECT 'indice ' || c.relname || '.' || i.relname || ' ' || pg_get_indexdef(i.oid) AS l
       FROM pg_index x
       JOIN pg_class i ON i.oid = x.indexrelid
       JOIN pg_class c ON c.oid = x.indrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE ${FILTRO_TABELA}`,
  );
}

function triggers(cliente: Cliente): Promise<string[]> {
  return linhas(
    cliente,
    `SELECT 'trigger ' || c.relname || '.' || t.tgname || ' ' || pg_get_triggerdef(t.oid)
            || CASE t.tgenabled WHEN 'D' THEN ' desabilitado' ELSE '' END AS l
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE ${FILTRO_TABELA} AND NOT t.tgisinternal`,
  );
}

/** Funções do schema public, fora as de extensão: assinatura, segurança, config e hash do corpo. */
function funcoes(cliente: Cliente): Promise<string[]> {
  return linhas(
    cliente,
    `SELECT 'funcao ' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
            || ' retorna ' || coalesce(pg_get_function_result(p.oid), '-')
            || ' ' || l.lanname
            || CASE WHEN p.prosecdef THEN ' security definer' ELSE ' security invoker' END
            || ' ' || CASE p.provolatile WHEN 'i' THEN 'immutable' WHEN 's' THEN 'stable' ELSE 'volatile' END
            || ' config=' || coalesce(array_to_string(p.proconfig, ';'), '')
            || ' corpo=' || md5(coalesce(p.prosrc, '')) AS l
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       JOIN pg_language l ON l.oid = p.prolang
      WHERE n.nspname = 'public'
        AND NOT EXISTS (SELECT 1 FROM pg_depend d
                         WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')`,
    [],
  );
}

/** EXECUTE nas funções, inclusive o PUBLIC implícito (ACL nula), fora o dono. */
function grantsDeFuncao(cliente: Cliente): Promise<string[]> {
  return linhas(
    cliente,
    `SELECT 'grant funcao ' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') '
            || ${GRANTEE} || ' ' || a.privilege_type AS l
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      WHERE n.nspname = 'public' AND a.grantee <> p.proowner
        AND NOT EXISTS (SELECT 1 FROM pg_depend d
                         WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')`,
    [],
  );
}

function policies(cliente: Cliente): Promise<string[]> {
  return linhas(
    cliente,
    `SELECT 'policy ' || p.tablename || '.' || p.policyname || ' ' || p.cmd || ' ' || p.permissive
            || ' roles=' || array_to_string(ARRAY(SELECT r FROM unnest(p.roles) r ORDER BY 1), ',')
            || ' using=' || coalesce(p.qual, '') || ' check=' || coalesce(p.with_check, '') AS l
       FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename <> ALL ($1::text[])`,
  );
}

function rls(cliente: Cliente): Promise<string[]> {
  return linhas(
    cliente,
    `SELECT 'rls ' || c.relname || ' enable=' || c.relrowsecurity::text
            || ' force=' || c.relforcerowsecurity::text AS l
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE ${FILTRO_TABELA} AND c.relkind IN ('r', 'p')`,
  );
}

/** Grants de tabela, view e sequência por role, fora o dono (que muda entre local e Neon). */
function grantsDeTabela(cliente: Cliente): Promise<string[]> {
  return linhas(
    cliente,
    `SELECT 'grant tabela ' || c.relname || ' ' || ${GRANTEE} || ' ' || a.privilege_type AS l
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL aclexplode(c.relacl) a
      WHERE ${FILTRO_TABELA} AND c.relkind IN ('r', 'p', 'v', 'm', 'S') AND a.grantee <> c.relowner
        AND NOT (c.relkind = 'S' AND c.relname LIKE 'pgmigrations%')`,
  );
}

function grantsDeColuna(cliente: Cliente): Promise<string[]> {
  return linhas(
    cliente,
    `SELECT 'grant coluna ' || c.relname || '.' || at.attname || ' ' || ${GRANTEE} || ' '
            || a.privilege_type AS l
       FROM pg_attribute at
       JOIN pg_class c ON c.oid = at.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL aclexplode(at.attacl) a
      WHERE ${FILTRO_TABELA} AND at.attnum > 0 AND NOT at.attisdropped AND a.grantee <> c.relowner`,
  );
}

function grantsDoSchema(cliente: Cliente): Promise<string[]> {
  return linhas(
    cliente,
    `SELECT 'grant schema public ' || ${GRANTEE} || ' ' || a.privilege_type AS l
       FROM pg_namespace n
       CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
      WHERE n.nspname = 'public' AND a.grantee <> n.nspowner`,
    [],
  );
}

/** Atributos das roles pelada_*. A senha nunca entra. */
function roles(cliente: Cliente, opcoes: OpcoesLerEsquema): Promise<string[]> {
  const login = opcoes.ignorarLogin ? `''` : `' login=' || r.rolcanlogin::text`;
  return linhas(
    cliente,
    `SELECT 'role ' || r.rolname || ${login}
            || ' superuser=' || r.rolsuper::text || ' createdb=' || r.rolcreatedb::text
            || ' createrole=' || r.rolcreaterole::text || ' inherit=' || r.rolinherit::text
            || ' replication=' || r.rolreplication::text || ' bypassrls=' || r.rolbypassrls::text
            || ' connlimit=' || r.rolconnlimit::text AS l
       FROM pg_roles r
      WHERE r.rolname LIKE 'pelada\\_%'`,
    [],
  );
}

function extensoes(cliente: Cliente): Promise<string[]> {
  return linhas(cliente, `SELECT 'extensao ' || e.extname AS l FROM pg_extension e`, []);
}

export interface OpcoesLerEsquema {
  /**
   * Ignora o atributo LOGIN das roles `pelada_*`. As roles são do cluster, e o seed local
   * dá LOGIN a elas (AD-009); a comparação com a referência gerada num cluster novo usa isto.
   */
  ignorarLogin?: boolean;
}

type Categoria = (cliente: Cliente, opcoes: OpcoesLerEsquema) => Promise<string[]>;

const CATEGORIAS: Categoria[] = [
  relacoes,
  colunas,
  restricoes,
  indices,
  triggers,
  funcoes,
  grantsDeFuncao,
  policies,
  rls,
  grantsDeTabela,
  grantsDeColuna,
  grantsDoSchema,
  roles,
  extensoes,
];

export async function lerEsquema(cliente: Cliente, opcoes: OpcoesLerEsquema = {}): Promise<string[]> {
  const tudo: string[] = [];
  for (const categoria of CATEGORIAS) tudo.push(...(await categoria(cliente, opcoes)));
  return tudo.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Opções da referência: sem o LOGIN das roles, porque as roles são do cluster e o seed local
 * dá LOGIN a elas (AD-009), enquanto o cluster novo do CI não.
 * [LACUNA] O LOGIN fica fora da comparação com a referência; a paridade com a dev (T80) confere à parte.
 */
export const OPCOES_REFERENCIA: OpcoesLerEsquema = { ignorarLogin: true };

export function lerReferencia(): string[] {
  return readFileSync(ARQUIVO_REFERENCIA, 'utf8')
    .split('\n')
    .filter((l) => l !== '');
}
