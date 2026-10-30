-- Up Migration
-- Convite de grupo arquivado (grupos-e-elenco, T76; SEC-004). As três funções que partem do token do convite
-- (1792843620000_conta-convites.sql, que não se edita) passam a tratar o convite de um grupo arquivado como
-- indisponível: convite_ler não devolve linha e convite_aceitar e convite_cadastrar respondem 'link_invalido', sem
-- criar vínculo, conta ou sessão e sem usar o convite. Reativado o grupo, o mesmo convite volta a valer (dentro do
-- prazo). Nas duas que escrevem, o grupo é lido com FOR SHARE: o arquivar (FOR UPDATE na linha do grupo) espera o
-- aceite em curso, ou o aceite espera o arquivar e já vê o grupo arquivado.
-- CREATE OR REPLACE mantém o dono, o SECURITY DEFINER declarado abaixo e os GRANTs da migration original; os REVOKE
-- e GRANT são repetidos para deixar a regra explícita.

CREATE OR REPLACE FUNCTION convite_ler(p_token_hash bytea)
  RETURNS TABLE (email text, grupo_nome text, conta_existe boolean)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT ca.email, g.nome,
           EXISTS (SELECT 1 FROM contas c WHERE c.email = ca.email AND c.excluida_em IS NULL)
      FROM convites_admin ca JOIN grupos g ON g.id = ca.grupo_id
     WHERE ca.token_hash = p_token_hash AND ca.usado_em IS NULL AND ca.cancelado_em IS NULL
       AND ca.expira_em > now() AND g.arquivado_em IS NULL
  $$;
REVOKE ALL ON FUNCTION convite_ler(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION convite_ler(bytea) TO pelada_app;

CREATE OR REPLACE FUNCTION convite_aceitar(p_token_hash bytea)
  RETURNS TABLE (resultado text, grupo_id uuid)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  #variable_conflict use_column
  DECLARE
    v_conta contas%ROWTYPE;
    v_convite convites_admin%ROWTYPE;
  BEGIN
    SELECT * INTO v_conta FROM contas c WHERE c.id = app_conta_id() AND c.excluida_em IS NULL;
    SELECT ca.* INTO v_convite FROM convites_admin ca JOIN grupos g ON g.id = ca.grupo_id
     WHERE ca.token_hash = p_token_hash AND ca.usado_em IS NULL AND ca.cancelado_em IS NULL AND ca.expira_em > now()
       AND g.arquivado_em IS NULL
       FOR UPDATE OF ca FOR SHARE OF g;
    IF v_conta.id IS NULL OR v_convite.id IS NULL THEN
      RETURN QUERY SELECT 'link_invalido'::text, NULL::uuid;
      RETURN;
    END IF;
    IF v_convite.email <> v_conta.email THEN
      RETURN QUERY SELECT 'convite_de_outro_email'::text, NULL::uuid;
      RETURN;
    END IF;

    INSERT INTO vinculos_admin (conta_id, grupo_id, acessa_financeiro, criado_por, criado_em)
    VALUES (v_conta.id, v_convite.grupo_id, false, v_convite.criado_por, now())
    ON CONFLICT DO NOTHING;
    UPDATE convites_admin ca SET usado_em = now() WHERE ca.id = v_convite.id;
    INSERT INTO auditoria (autor_tipo, autor_conta_id, acao, entidade, entidade_id, grupo_id, momento)
    VALUES ('conta', v_conta.id, 'aceitar_convite', 'vinculo_admin', v_convite.id::text, v_convite.grupo_id, now());
    RETURN QUERY SELECT 'ok'::text, v_convite.grupo_id;
  END
  $$;
REVOKE ALL ON FUNCTION convite_aceitar(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION convite_aceitar(bytea) TO pelada_app;

CREATE OR REPLACE FUNCTION convite_cadastrar(p_token_hash bytea, p_nome text, p_senha text, p_termos_versao text,
                                             p_token_sessao_hash bytea)
  RETURNS TABLE (resultado text, conta_id uuid, grupo_id uuid)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  #variable_conflict use_column
  DECLARE
    v_convite convites_admin%ROWTYPE;
    v_conta uuid;
  BEGIN
    SELECT ca.* INTO v_convite FROM convites_admin ca JOIN grupos g ON g.id = ca.grupo_id
     WHERE ca.token_hash = p_token_hash AND ca.usado_em IS NULL AND ca.cancelado_em IS NULL AND ca.expira_em > now()
       AND g.arquivado_em IS NULL
       FOR UPDATE OF ca FOR SHARE OF g;
    IF v_convite.id IS NULL THEN
      RETURN QUERY SELECT 'link_invalido'::text, NULL::uuid, NULL::uuid;
      RETURN;
    END IF;

    INSERT INTO contas (email, nome, senha_hash, criada_em, email_confirmado_em, termos_versao, termos_aceitos_em)
    VALUES (v_convite.email, p_nome, crypt(p_senha, gen_salt('bf', 12)), now(), now(), p_termos_versao, now())
    ON CONFLICT (email) DO NOTHING
    RETURNING contas.id INTO v_conta;
    IF v_conta IS NULL THEN
      RETURN QUERY SELECT 'conta_existente'::text, NULL::uuid, NULL::uuid;
      RETURN;
    END IF;

    INSERT INTO vinculos_admin (conta_id, grupo_id, acessa_financeiro, criado_por, criado_em)
    VALUES (v_conta, v_convite.grupo_id, false, v_convite.criado_por, now());
    UPDATE convites_admin ca SET usado_em = now() WHERE ca.id = v_convite.id;
    INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
    VALUES (p_token_sessao_hash, v_conta, 'completo', now(), now(), now() + interval '12 hours');
    INSERT INTO auditoria (autor_tipo, autor_conta_id, acao, entidade, entidade_id, grupo_id, momento)
    VALUES ('conta', v_conta, 'aceitar_convite', 'vinculo_admin', v_convite.id::text, v_convite.grupo_id, now());
    RETURN QUERY SELECT 'ok'::text, v_conta, v_convite.grupo_id;
  END
  $$;
REVOKE ALL ON FUNCTION convite_cadastrar(bytea, text, text, text, bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION convite_cadastrar(bytea, text, text, text, bytea) TO pelada_app;
