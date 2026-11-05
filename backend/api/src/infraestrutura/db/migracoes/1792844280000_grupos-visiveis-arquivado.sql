-- Up Migration
-- Grupo arquivado escondido pela RLS (grupos-e-elenco, design C1; GEL-25; AD-014).
-- Com conta, um grupo arquivado só é visível à conta que tem vínculo E é a criadora (grupos.criado_por). Assim toda
-- policy, o exigirVinculo e as consultas das features seguintes respeitam o arquivamento sem código novo: para os
-- outros admins o grupo some (404 nas rotas, fora das listas). O ramo do slug público não muda (FUN-14): a página
-- "Grupo indisponível" é da partidas-e-ranking.
-- Mesmas proteções da função original (1792843320000_rls.sql): SECURITY DEFINER para ler vinculos_admin e grupos sem
-- cair nas próprias policies (o owner tem BYPASSRLS), search_path fixo, STABLE e EXECUTE só para pelada_app.
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
    SELECT g.id FROM grupos g WHERE app_conta_id() IS NULL AND g.slug = app_slug_publico()
  $$;
REVOKE ALL ON FUNCTION grupos_visiveis() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION grupos_visiveis() TO pelada_app;
