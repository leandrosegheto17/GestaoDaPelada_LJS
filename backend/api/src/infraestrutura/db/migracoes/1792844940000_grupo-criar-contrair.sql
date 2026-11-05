-- Up Migration
-- contrair: AD-037. Remove a grupo_criar de 6 parâmetros (simulador T25; AD-037, AD-048), que delegava à de 7 com
-- (now() AT TIME ZONE 'America/Sao_Paulo')::date (1792844640000_grupo-criar-pesos.sql:86-103) só para o Worker do
-- deploy anterior e o rollback do deploy.yml. Pré-condição: a prévia já roda o deploy da partidas-e-ranking (que usa a
-- de 7, backend/api/src/infraestrutura/db/repositorios/grupos.ts) e nada mais chama a de 6 (rede da T1: src, seed).
-- A de 7 fica igual: SECURITY DEFINER, search_path fixo e EXECUTE só para pelada_app. Com isto, nenhuma função do
-- schema lê o relógio para uma data (fim da exceção da AD-037, AD-015).
-- SPEC_DEVIATION: o timestamp (1792844940000) fica entre a última da partidas-e-ranking (1792844880000) e a primeira
-- do financeiro (1792845300000), na folga reservada à feature 5 (1792845360000_financeiro-trava-acesso.sql:4).
DROP FUNCTION grupo_criar(text, text, text, time, text, text[]);
