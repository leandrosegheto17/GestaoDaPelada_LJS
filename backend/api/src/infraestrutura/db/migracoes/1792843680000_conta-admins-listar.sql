-- Up Migration
-- Lista dos admins de um grupo (ACE-37, ACE-41; design C2 `admins.listar`). Aditiva (G-14).
-- SPEC_DEVIATION: o design C2 prevê `admins.listar(db, grupoId)` como leitura comum, mas a RLS de `contas` deixa a
-- pelada_app ler só a própria linha (ACE-43, AD-008): o nome e o e-mail dos outros admins não chegariam. Segue o
-- padrão escolhido no design para ler conta alheia: função SECURITY DEFINER com search_path fixo, que devolve só o
-- necessário (id, nome, e-mail e acessa_financeiro dos admins) e só a quem tem vínculo com o grupo.
-- Sem conta na requisição ou sem vínculo com o grupo: nenhuma linha.
CREATE FUNCTION admins_listar(p_grupo_id uuid)
  RETURNS TABLE (id uuid, nome text, email text, acessa_financeiro boolean)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT c.id, c.nome, c.email, v.acessa_financeiro
      FROM vinculos_admin v JOIN contas c ON c.id = v.conta_id
     WHERE v.grupo_id = p_grupo_id
       AND app_conta_id() IS NOT NULL
       AND EXISTS (SELECT 1 FROM vinculos_admin m WHERE m.grupo_id = p_grupo_id AND m.conta_id = app_conta_id())
     ORDER BY c.nome, c.id
  $$;
REVOKE ALL ON FUNCTION admins_listar(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admins_listar(uuid) TO pelada_app;
