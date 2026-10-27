-- Up Migration
-- Convites de admin (design C1; ACE-31 a ACE-36, ACE-42, ACE-67). SECURITY DEFINER com search_path fixo.
-- Convite: 7 dias, uso único. Válido = sem uso, sem cancelamento e dentro do prazo.
-- As funções que criam convite ou vínculo gravam a própria linha de auditoria (ACE-42): convite_cadastrar roda sem
-- sessão (sem app.conta_id), e a policy de auditoria não deixaria a aplicação gravar por ela.

-- Cria o convite para o e-mail no grupo (ACE-31, ACE-32, ACE-51). Resultados:
-- - 'sem_vinculo': a conta da sessão não é admin do grupo; nada muda.
-- - 'ja_e_admin': o e-mail é de uma conta com vínculo no grupo; nada muda.
-- - 'ok': convite novo (o pendente anterior do mesmo grupo e e-mail é cancelado) e enviar = true. Dentro dos 60 s
--   desde o último envio do convite deste grupo a este e-mail, devolve o convite pendente sem criar outro e com
--   enviar = false (o link que a pessoa recebeu continua valendo).
CREATE FUNCTION convite_criar(p_grupo_id uuid, p_email text, p_token_hash bytea)
  RETURNS TABLE (resultado text, convite_id uuid, expira_em timestamptz, enviar boolean)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  #variable_conflict use_column
  DECLARE
    v_conta uuid := app_conta_id();
    v_email text := lower(btrim(p_email));
    v_pendente convites_admin%ROWTYPE;
    v_novo convites_admin%ROWTYPE;
    v_enviar boolean;
  BEGIN
    IF v_conta IS NULL OR NOT EXISTS (
      SELECT 1 FROM vinculos_admin v WHERE v.conta_id = v_conta AND v.grupo_id = p_grupo_id
    ) THEN
      RETURN QUERY SELECT 'sem_vinculo'::text, NULL::uuid, NULL::timestamptz, false;
      RETURN;
    END IF;

    IF EXISTS (
      SELECT 1 FROM vinculos_admin v JOIN contas c ON c.id = v.conta_id
       WHERE v.grupo_id = p_grupo_id AND c.email = v_email AND c.excluida_em IS NULL
    ) THEN
      RETURN QUERY SELECT 'ja_e_admin'::text, NULL::uuid, NULL::timestamptz, false;
      RETURN;
    END IF;

    SELECT * INTO v_pendente FROM convites_admin ca
     WHERE ca.grupo_id = p_grupo_id AND ca.email = v_email AND ca.usado_em IS NULL AND ca.cancelado_em IS NULL
       FOR UPDATE;
    v_enviar := envio_permitido(v_email, 'convite:' || p_grupo_id::text);
    IF NOT v_enviar AND v_pendente.id IS NOT NULL THEN
      RETURN QUERY SELECT 'ok'::text, v_pendente.id, v_pendente.expira_em, false;
      RETURN;
    END IF;

    UPDATE convites_admin ca SET cancelado_em = now() WHERE ca.id = v_pendente.id;
    INSERT INTO convites_admin (grupo_id, email, token_hash, criado_por, criado_em, expira_em)
    VALUES (p_grupo_id, v_email, p_token_hash, v_conta, now(), now() + interval '7 days')
    RETURNING * INTO v_novo;
    INSERT INTO auditoria (autor_tipo, autor_conta_id, acao, entidade, entidade_id, grupo_id, momento)
    VALUES ('conta', v_conta, 'convidar_admin', 'convite_admin', v_novo.id::text, p_grupo_id, now());
    RETURN QUERY SELECT 'ok'::text, v_novo.id, v_novo.expira_em, v_enviar;
  END
  $$;
REVOKE ALL ON FUNCTION convite_criar(uuid, text, bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION convite_criar(uuid, text, bytea) TO pelada_app;

-- Dados mínimos do convite válido (ACE-34, ACE-36): o e-mail convidado, o nome do grupo e se o e-mail já tem
-- conta. Convite inválido ou inexistente: nenhuma linha.
CREATE FUNCTION convite_ler(p_token_hash bytea)
  RETURNS TABLE (email text, grupo_nome text, conta_existe boolean)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT ca.email, g.nome,
           EXISTS (SELECT 1 FROM contas c WHERE c.email = ca.email AND c.excluida_em IS NULL)
      FROM convites_admin ca JOIN grupos g ON g.id = ca.grupo_id
     WHERE ca.token_hash = p_token_hash AND ca.usado_em IS NULL AND ca.cancelado_em IS NULL
       AND ca.expira_em > now()
  $$;
REVOKE ALL ON FUNCTION convite_ler(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION convite_ler(bytea) TO pelada_app;

-- Aceita o convite com a conta da sessão (ACE-33, ACE-35, ACE-36, ACE-67). Trava o convite (FOR UPDATE): dois
-- aceites simultâneos criam um vínculo só, e o segundo encontra o convite já usado. Resultados:
-- - 'link_invalido': vencido, usado, cancelado ou inexistente (ou sem conta na sessão).
-- - 'convite_de_outro_email': o convite é de outro e-mail; nada muda e o convite continua valendo.
-- - 'ok': cria o vínculo com acessa_financeiro falso e marca o convite como usado.
CREATE FUNCTION convite_aceitar(p_token_hash bytea)
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
    SELECT * INTO v_convite FROM convites_admin ca
     WHERE ca.token_hash = p_token_hash AND ca.usado_em IS NULL AND ca.cancelado_em IS NULL AND ca.expira_em > now()
       FOR UPDATE;
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

-- Cadastro pelo convite (ACE-34): cria a conta já confirmada com o e-mail do convite, os termos aceitos, o vínculo
-- (acessa_financeiro falso) e a sessão de 12 h, e marca o convite como usado. Resultados:
-- - 'link_invalido': convite vencido, usado, cancelado ou inexistente.
-- - 'conta_existente': o e-mail do convite já tem conta (a pessoa entra e aceita); nada muda.
-- - 'ok': com a conta e o grupo.
CREATE FUNCTION convite_cadastrar(p_token_hash bytea, p_nome text, p_senha text, p_termos_versao text,
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
    SELECT * INTO v_convite FROM convites_admin ca
     WHERE ca.token_hash = p_token_hash AND ca.usado_em IS NULL AND ca.cancelado_em IS NULL AND ca.expira_em > now()
       FOR UPDATE;
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
