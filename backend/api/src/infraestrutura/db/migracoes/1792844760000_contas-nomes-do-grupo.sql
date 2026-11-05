-- Up Migration
-- Nomes das contas autoras de um grupo (partidas-e-ranking T24; PAR-01, PAR-44, PAR-52; BD:138-140; AD-036). Aditiva.
-- A RLS de contas deixa a pelada_app ler só a própria linha (AD-008): o nome de outra admin que registrou pesos ou
-- lançou e alterou partidas não chegaria às telas (PAR-01, PAR-44, PAR-52). Segue o padrão de admins_listar
-- (1792843680000_conta-admins-listar.sql:8-21): SECURITY DEFINER com search_path fixo, que devolve só id e nome (nunca
-- e-mail) e só das contas que aparecem em config_pesos.registrado_por ou em partidas.criada_por e alterada_por do
-- grupo. Só com conta e com o grupo em grupos_visiveis() (BC:25, P13): grupo de outra conta, grupo arquivado para quem
-- não o criou, ou sem conta (só o slug, ou sem contexto), nenhuma linha.
CREATE FUNCTION contas_nomes_do_grupo(p_grupo_id uuid)
  RETURNS TABLE (id uuid, nome text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT c.id, c.nome
      FROM contas c
     WHERE app_conta_id() IS NOT NULL
       AND p_grupo_id IN (SELECT grupos_visiveis())
       AND c.id IN (
             SELECT cp.registrado_por FROM config_pesos cp WHERE cp.grupo_id = p_grupo_id
             UNION
             SELECT p.criada_por FROM partidas p WHERE p.grupo_id = p_grupo_id
             UNION
             SELECT p.alterada_por FROM partidas p WHERE p.grupo_id = p_grupo_id
           )
     ORDER BY c.nome, c.id
  $$;
REVOKE ALL ON FUNCTION contas_nomes_do_grupo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION contas_nomes_do_grupo(uuid) TO pelada_app;
