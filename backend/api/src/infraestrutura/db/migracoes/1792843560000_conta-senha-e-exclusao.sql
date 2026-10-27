-- Up Migration
-- Troca de senha e exclusão de conta (design C1, "Exclusão como anonimização"; ACE-26 a ACE-30, ACE-69).
-- SECURITY DEFINER com search_path fixo. A conta vem de app_conta_id() (a sessão da requisição).

-- Troca a senha da conta da sessão se a atual confere, e apaga as outras sessões dela, mantendo a da requisição
-- (p_token_sessao_hash) (ACE-26). Senha atual errada ou sem conta na sessão: false, nada muda (ACE-27).
CREATE FUNCTION conta_trocar_senha(p_senha_atual text, p_senha_nova text, p_token_sessao_hash bytea)
  RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_conta uuid := app_conta_id();
    v_hash text;
  BEGIN
    SELECT c.senha_hash INTO v_hash FROM contas c WHERE c.id = v_conta AND c.excluida_em IS NULL;
    IF v_hash IS NULL OR v_hash NOT LIKE '$2_$%' OR crypt(p_senha_atual, v_hash) <> v_hash THEN
      RETURN false;
    END IF;

    UPDATE contas c SET senha_hash = crypt(p_senha_nova, gen_salt('bf', 12)) WHERE c.id = v_conta;
    DELETE FROM sessoes s WHERE s.conta_id = v_conta AND s.token_hash <> p_token_sessao_hash;
    RETURN true;
  END
  $$;
REVOKE ALL ON FUNCTION conta_trocar_senha(text, text, bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION conta_trocar_senha(text, text, bytea) TO pelada_app;

-- Exclui a conta da sessão (ACE-28 a ACE-30, ACE-69). Resultados:
-- - 'senha_incorreta': a senha não confere; nada muda.
-- - 'unico_admin': a conta é a única admin de algum grupo não arquivado; nada muda; grupos = [{id, nome}].
-- - 'ok': apaga as sessões, os vínculos (com uma linha de auditoria por grupo, ACE-42), os links, os convites
--   enviados ao e-mail, as tentativas de login e os envios do e-mail; anonimiza a linha da conta (e-mail
--   excluida-<id>@invalido, nome "Conta excluída", hash '!' que nunca confere, excluida_em). A linha fica porque o
--   histórico (grupos, vínculos, auditoria, pedidos de reset) a referencia; a auditoria passa a mostrar
--   "Conta excluída" como autor.
CREATE FUNCTION conta_excluir(p_senha text)
  RETURNS TABLE (resultado text, grupos jsonb)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  #variable_conflict use_column
  DECLARE
    v_conta contas%ROWTYPE;
    v_unicos jsonb;
  BEGIN
    SELECT * INTO v_conta FROM contas c WHERE c.id = app_conta_id() AND c.excluida_em IS NULL FOR UPDATE;
    IF v_conta.id IS NULL OR v_conta.senha_hash NOT LIKE '$2_$%'
       OR crypt(p_senha, v_conta.senha_hash) <> v_conta.senha_hash THEN
      RETURN QUERY SELECT 'senha_incorreta'::text, '[]'::jsonb;
      RETURN;
    END IF;

    -- Trava os vínculos dos grupos da conta: uma remoção de admin simultânea não deixa o grupo sem ninguém.
    PERFORM 1 FROM vinculos_admin v
      WHERE v.grupo_id IN (SELECT m.grupo_id FROM vinculos_admin m WHERE m.conta_id = v_conta.id)
      FOR UPDATE;

    SELECT coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'nome', g.nome) ORDER BY g.nome, g.id), '[]'::jsonb)
      INTO v_unicos
      FROM vinculos_admin v JOIN grupos g ON g.id = v.grupo_id
     WHERE v.conta_id = v_conta.id AND g.arquivado_em IS NULL
       AND NOT EXISTS (SELECT 1 FROM vinculos_admin o WHERE o.grupo_id = v.grupo_id AND o.conta_id <> v_conta.id);
    IF jsonb_array_length(v_unicos) > 0 THEN
      RETURN QUERY SELECT 'unico_admin'::text, v_unicos;
      RETURN;
    END IF;

    INSERT INTO auditoria (autor_tipo, autor_conta_id, acao, entidade, entidade_id, grupo_id, momento)
    SELECT 'conta', v_conta.id, 'excluir_conta', 'vinculo_admin', v_conta.id::text, v.grupo_id, now()
      FROM vinculos_admin v WHERE v.conta_id = v_conta.id;

    DELETE FROM sessoes s WHERE s.conta_id = v_conta.id;
    DELETE FROM vinculos_admin v WHERE v.conta_id = v_conta.id;
    DELETE FROM links_conta l WHERE l.conta_id = v_conta.id;
    DELETE FROM convites_admin ca WHERE ca.email = v_conta.email;
    DELETE FROM tentativas_login t WHERE t.email = v_conta.email;
    DELETE FROM envios_email e WHERE e.destino_hash = digest(v_conta.email, 'sha256');

    UPDATE contas c
       SET email = 'excluida-' || c.id::text || '@invalido',
           nome = 'Conta excluída',
           senha_hash = '!',
           e_dono = false,
           excluida_em = now()
     WHERE c.id = v_conta.id;
    RETURN QUERY SELECT 'ok'::text, '[]'::jsonb;
  END
  $$;
REVOKE ALL ON FUNCTION conta_excluir(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION conta_excluir(text) TO pelada_app;

-- Define a senha de uma conta pelo script do dono (G-11) e pelo seed local: só o owner executa (sem EXECUTE para
-- PUBLIC nem para pelada_app; AD-008). Com p_dono, cria a conta de dono se faltar (nome "Dono"; o CHECK
-- contas_dono_email fixa o e-mail) e marca e_dono. Sem p_dono, a conta precisa existir. Nos dois casos, troca o
-- hash, confirma o e-mail e encerra as sessões da conta. Devolve o id da conta.
CREATE FUNCTION conta_definir_senha(p_email text, p_senha text, p_dono boolean) RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_email text := lower(btrim(p_email));
    v_conta uuid;
  BEGIN
    UPDATE contas c
       SET senha_hash = crypt(p_senha, gen_salt('bf', 12)),
           email_confirmado_em = coalesce(c.email_confirmado_em, now()),
           e_dono = c.e_dono OR p_dono
     WHERE c.email = v_email AND c.excluida_em IS NULL
    RETURNING c.id INTO v_conta;

    IF v_conta IS NULL THEN
      IF NOT p_dono THEN
        RAISE EXCEPTION 'conta não encontrada' USING ERRCODE = 'P0002';
      END IF;
      INSERT INTO contas (email, nome, senha_hash, e_dono, criada_em, email_confirmado_em)
      VALUES (v_email, 'Dono', crypt(p_senha, gen_salt('bf', 12)), true, now(), now())
      RETURNING id INTO v_conta;
    END IF;

    DELETE FROM sessoes s WHERE s.conta_id = v_conta;
    RETURN v_conta;
  END
  $$;
REVOKE ALL ON FUNCTION conta_definir_senha(text, text, boolean) FROM PUBLIC;
