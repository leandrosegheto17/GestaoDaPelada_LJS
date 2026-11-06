-- Up Migration
-- Trava de linhas de vinculos_admin sem passar pela policy restritiva de UPDATE (conta-e-acesso/grupos-e-elenco;
-- FUN-12, ACE-39, ACE-40, GEL-22). Aditiva: nenhum DROP.
-- Motivo: o Postgres exige passar na policy de UPDATE para travar linha (SELECT ... FOR UPDATE / FOR KEY SHARE). A
-- restritiva vinculos_admin_trava_financeiro_alterar (1792845360000_financeiro-trava-acesso.sql:16) devolve zero linhas
-- para a trava da própria linha e dos vínculos do grupo; relaxá-la quebraria FIN-41. A trava vai para uma função
-- SECURITY DEFINER (owner com BYPASSRLS, como as demais), que só devolve algo a quem tem vínculo no grupo e só devolve
-- ids de conta; o UPDATE e o DELETE continuam sujeitos às policies.
CREATE FUNCTION vinculos_travar(p_grupo_id uuid, p_todos boolean)
  RETURNS TABLE (conta_id uuid)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  BEGIN
    IF app_conta_id() IS NULL OR NOT EXISTS (
         SELECT 1 FROM vinculos_admin v WHERE v.grupo_id = p_grupo_id AND v.conta_id = app_conta_id()) THEN
      RETURN;
    END IF;
    IF p_todos THEN
      RETURN QUERY SELECT v.conta_id FROM vinculos_admin v WHERE v.grupo_id = p_grupo_id FOR UPDATE;
    ELSE
      RETURN QUERY SELECT v.conta_id FROM vinculos_admin v
        WHERE v.grupo_id = p_grupo_id AND v.conta_id = app_conta_id() FOR KEY SHARE;
    END IF;
  END
  $$;
REVOKE ALL ON FUNCTION vinculos_travar(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION vinculos_travar(uuid, boolean) TO pelada_app;
