-- Up Migration
-- Slug público só de grupo ativo (partidas-e-ranking T26; PAR-91, PAR-92, PAR-93; BD:144-145; I-3 do LJS). Aditiva.
-- Até aqui o ramo do slug de grupos_visiveis() (1792844280000_grupos-visiveis-arquivado.sql:19) mostrava também o
-- grupo arquivado: a página pública e o PDF de um grupo arquivado continuariam lendo jogadores, partidas e pesos.
-- Agora, só com slug, o grupo arquivado some de todas as tabelas (a rota pública responde o mesmo 404 do slug
-- inexistente, AD-034); reativado, volta. O ramo com conta não muda (a criadora ainda vê o arquivado, GEL-25).
-- Mesmas proteções da função anterior: SECURITY DEFINER, search_path fixo, STABLE e EXECUTE só para pelada_app.
CREATE OR REPLACE FUNCTION grupos_visiveis() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT v.grupo_id
      FROM vinculos_admin v
      JOIN grupos g ON g.id = v.grupo_id
     WHERE v.conta_id = app_conta_id()
       AND (g.arquivado_em IS NULL OR g.criado_por = app_conta_id())
    UNION
    SELECT g.id
      FROM grupos g
     WHERE app_conta_id() IS NULL
       AND g.slug = app_slug_publico()
       AND g.arquivado_em IS NULL
  $$;
REVOKE ALL ON FUNCTION grupos_visiveis() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION grupos_visiveis() TO pelada_app;
