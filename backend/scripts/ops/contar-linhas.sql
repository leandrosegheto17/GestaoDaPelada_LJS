-- Conta as linhas de cada tabela de `public` (inclui `migracoes_aplicadas`). Só leitura; uma linha por tabela.
-- Uso: psql "$URL" -f backend/scripts/ops/contar-linhas.sql
-- Rode no banco de origem e no restaurado e compare as duas listas (com `-At`, dá para usar `diff`).
SELECT
  table_name AS tabela,
  (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', table_name), false, true, '')))[1]::text::bigint AS linhas
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;
