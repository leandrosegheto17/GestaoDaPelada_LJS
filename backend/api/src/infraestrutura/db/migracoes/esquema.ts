import type pg from 'pg';

/** Tabelas de controle das migrations: não fazem parte do schema da aplicação. */
export const TABELAS_CONTROLE = ['pgmigrations', 'migracoes_aplicadas'] as const;

const CONTROLE = `ARRAY['${TABELAS_CONTROLE.join("','")}']`;

const CONSULTA = `
WITH tabelas AS (
  SELECT c.oid, c.relname
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT (c.relname = ANY (${CONTROLE}))
)
SELECT 'tabela ' || t.relname AS linha FROM tabelas t
UNION ALL
SELECT format('coluna %s.%s %s%s%s%s%s', t.relname, a.attname, format_type(a.atttypid, a.atttypmod),
              CASE WHEN a.attnotnull THEN ' not null' ELSE '' END,
              CASE a.attidentity WHEN 'a' THEN ' identity always' WHEN 'd' THEN ' identity by default' ELSE '' END,
              CASE WHEN a.attgenerated = 's' THEN ' generated' ELSE '' END,
              COALESCE(' default ' || pg_get_expr(d.adbin, d.adrelid), ''))
FROM tabelas t
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
LEFT JOIN pg_attrdef d ON d.adrelid = t.oid AND d.adnum = a.attnum
UNION ALL
SELECT format('restricao %s.%s %s', t.relname, r.conname, pg_get_constraintdef(r.oid, true))
FROM tabelas t JOIN pg_constraint r ON r.conrelid = t.oid
UNION ALL
SELECT format('indice %s.%s %s', t.relname, i.relname, pg_get_indexdef(i.oid))
FROM tabelas t JOIN pg_index x ON x.indrelid = t.oid JOIN pg_class i ON i.oid = x.indexrelid
UNION ALL
SELECT format('trigger %s.%s %s', t.relname, g.tgname, pg_get_triggerdef(g.oid, true))
FROM tabelas t JOIN pg_trigger g ON g.tgrelid = t.oid AND NOT g.tgisinternal`;

/**
 * Descreve o schema `public` da aplicação lendo só o `pg_catalog`, sem dados: tabelas, colunas
 * (tipo, nulidade, identity, default), restrições, índices e triggers. Uma linha por item, ordenadas.
 */
export async function lerEsquema(cliente: pg.ClientBase): Promise<string[]> {
  const { rows } = await cliente.query<{ linha: string }>(CONSULTA);
  // Ordena aqui, e não no SQL, para a ordem não depender da collation do servidor.
  return rows.map((r) => r.linha).sort();
}
