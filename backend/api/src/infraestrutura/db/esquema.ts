import type pg from 'pg';

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

async function linhas(cliente: Cliente, sql: string): Promise<string[]> {
  const r = await cliente.query<{ l: string }>(sql, [TABELAS_IGNORADAS]);
  return r.rows.map((x) => x.l);
}

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

export interface OpcoesLerEsquema {
  /**
   * Ignora o atributo LOGIN das roles `pelada_*`. As roles são do cluster, e o seed local
   * dá LOGIN a elas (AD-009); a comparação com a referência gerada num cluster novo usa isto.
   */
  ignorarLogin?: boolean;
}

export async function lerEsquema(cliente: Cliente, _opcoes: OpcoesLerEsquema = {}): Promise<string[]> {
  const categorias = [relacoes, colunas, restricoes, indices, triggers];
  const tudo: string[] = [];
  for (const categoria of categorias) tudo.push(...(await categoria(cliente)));
  return tudo.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
