-- Up Migration
-- Cadastro e links de conta (confirmação e recuperação), design C1; ACE-01, ACE-04 a ACE-08, ACE-23 a ACE-25, ACE-51.
-- Funções SECURITY DEFINER: pelada_app não lê contas de outros nem as tabelas de apoio; só executa estas funções.
-- O tempo vem de now() (início da transação). A senha chega como parâmetro e o hash é bcrypt de custo 12 (G-08).

-- Intervalo de 60 s entre e-mails do mesmo tipo para o mesmo destino (ACE-51). Grava o envio e devolve true, ou
-- devolve false sem gravar se o último envio tem menos de 60 s. Atômica (ON CONFLICT ... WHERE).
-- Se o envio falhar, a transação da requisição termina em ROLLBACK (com-banco.ts) e o registro some junto:
-- o intervalo só conta envios bem-sucedidos.
-- Auxiliar das funções abaixo (que rodam como owner): sem EXECUTE para PUBLIC nem para pelada_app.
CREATE FUNCTION envio_permitido(p_destino text, p_tipo text) RETURNS boolean
  LANGUAGE sql VOLATILE
  SET search_path = public, pg_temp
  AS $$
    WITH registrado AS (
      INSERT INTO envios_email AS e (destino_hash, tipo, enviado_em)
      VALUES (digest(p_destino, 'sha256'), p_tipo, now())
      ON CONFLICT (destino_hash, tipo) DO UPDATE SET enviado_em = excluded.enviado_em
        WHERE e.enviado_em <= now() - interval '60 seconds'
      RETURNING 1
    )
    SELECT EXISTS (SELECT 1 FROM registrado)
  $$;
REVOKE ALL ON FUNCTION envio_permitido(text, text) FROM PUBLIC;

-- Cadastro (ACE-01, ACE-04, ACE-05). E-mail novo: cria a conta não confirmada, com a versão e a data dos termos, e o
-- link de confirmação de 24 h. E-mail que já existe: não altera nada e devolve 'existente' (o aviso vai ao dono do
-- e-mail). O bcrypt roda nos dois casos, para o tempo de resposta não revelar se o e-mail tem conta.
CREATE FUNCTION conta_cadastrar(p_email text, p_nome text, p_senha text, p_termos_versao text, p_token_hash bytea)
  RETURNS TABLE (situacao text, conta_id uuid, enviar boolean)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  #variable_conflict use_column
  DECLARE
    v_email text := lower(btrim(p_email));
    v_id uuid;
  BEGIN
    INSERT INTO contas (email, nome, senha_hash, criada_em, termos_versao, termos_aceitos_em)
    VALUES (v_email, p_nome, crypt(p_senha, gen_salt('bf', 12)), now(), p_termos_versao, now())
    ON CONFLICT (email) DO NOTHING
    RETURNING contas.id INTO v_id;

    IF v_id IS NULL THEN
      SELECT c.id INTO v_id FROM contas c WHERE c.email = v_email;
      RETURN QUERY SELECT 'existente'::text, v_id, envio_permitido(v_email, 'aviso_cadastro');
      RETURN;
    END IF;

    INSERT INTO links_conta (conta_id, tipo, token_hash, criado_em, expira_em)
    VALUES (v_id, 'confirmacao', p_token_hash, now(), now() + interval '24 hours');
    RETURN QUERY SELECT 'nova'::text, v_id, envio_permitido(v_email, 'confirmacao');
  END
  $$;
REVOKE ALL ON FUNCTION conta_cadastrar(text, text, text, text, bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION conta_cadastrar(text, text, text, text, bytea) TO pelada_app;

-- Novo link de confirmação (24 h) ou de recuperação (1 h) (ACE-08, ACE-23, ACE-51). Dentro dos 60 s, não envia e
-- não mexe no link anterior (que continua valendo, já que nenhum e-mail novo sai). Fora deles, o link pendente do
-- mesmo tipo é apagado (perde a validade) e um novo é criado. Sem conta, ou confirmação de conta já confirmada,
-- devolve enviar = false: a rota responde igual nos dois casos.
CREATE FUNCTION link_pedir(p_email text, p_tipo text, p_token_hash bytea)
  RETURNS TABLE (enviar boolean, nome text)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  #variable_conflict use_column
  DECLARE
    v_email text := lower(btrim(p_email));
    v_conta contas%ROWTYPE;
  BEGIN
    IF p_tipo NOT IN ('confirmacao', 'recuperacao') THEN
      RAISE EXCEPTION 'tipo de link inválido: %', p_tipo USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_conta FROM contas c WHERE c.email = v_email AND c.excluida_em IS NULL;
    IF v_conta.id IS NULL OR (p_tipo = 'confirmacao' AND v_conta.email_confirmado_em IS NOT NULL) THEN
      RETURN QUERY SELECT false, NULL::text;
      RETURN;
    END IF;

    IF NOT envio_permitido(v_email, p_tipo) THEN
      RETURN QUERY SELECT false, v_conta.nome;
      RETURN;
    END IF;

    DELETE FROM links_conta l WHERE l.conta_id = v_conta.id AND l.tipo = p_tipo AND l.usado_em IS NULL;
    INSERT INTO links_conta (conta_id, tipo, token_hash, criado_em, expira_em)
    VALUES (v_conta.id, p_tipo, p_token_hash, now(),
            now() + CASE p_tipo WHEN 'confirmacao' THEN interval '24 hours' ELSE interval '1 hour' END);
    RETURN QUERY SELECT true, v_conta.nome;
  END
  $$;
REVOKE ALL ON FUNCTION link_pedir(text, text, bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION link_pedir(text, text, bytea) TO pelada_app;

-- Consome o link de confirmação válido (dentro do prazo, sem uso), marca o e-mail como confirmado e cria a sessão
-- (12 h absolutas) com o hash do token da sessão (ACE-06, ACE-07). Link vencido, usado ou inexistente: nulo.
-- O UPDATE ... RETURNING é atômico: dois usos simultâneos do mesmo link consomem uma vez só.
CREATE FUNCTION link_confirmar(p_token_hash bytea, p_token_sessao_hash bytea) RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_conta uuid;
  BEGIN
    UPDATE links_conta l SET usado_em = now()
     WHERE l.token_hash = p_token_hash AND l.tipo = 'confirmacao' AND l.usado_em IS NULL AND l.expira_em > now()
    RETURNING l.conta_id INTO v_conta;
    IF v_conta IS NULL THEN
      RETURN NULL;
    END IF;

    UPDATE contas c SET email_confirmado_em = coalesce(c.email_confirmado_em, now()) WHERE c.id = v_conta;
    INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
    VALUES (p_token_sessao_hash, v_conta, 'completo', now(), now(), now() + interval '12 hours');
    RETURN v_conta;
  END
  $$;
REVOKE ALL ON FUNCTION link_confirmar(bytea, bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION link_confirmar(bytea, bytea) TO pelada_app;

-- Consome o link de recuperação válido, troca a senha, confirma o e-mail e apaga todas as sessões da conta
-- (ACE-24). Link vencido, usado ou inexistente: false, sem alterar a senha (ACE-25).
CREATE FUNCTION link_nova_senha(p_token_hash bytea, p_senha text) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_conta uuid;
  BEGIN
    UPDATE links_conta l SET usado_em = now()
     WHERE l.token_hash = p_token_hash AND l.tipo = 'recuperacao' AND l.usado_em IS NULL AND l.expira_em > now()
    RETURNING l.conta_id INTO v_conta;
    IF v_conta IS NULL THEN
      RETURN false;
    END IF;

    UPDATE contas c
       SET senha_hash = crypt(p_senha, gen_salt('bf', 12)),
           email_confirmado_em = coalesce(c.email_confirmado_em, now())
     WHERE c.id = v_conta;
    DELETE FROM sessoes s WHERE s.conta_id = v_conta;
    RETURN true;
  END
  $$;
REVOKE ALL ON FUNCTION link_nova_senha(bytea, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION link_nova_senha(bytea, text) TO pelada_app;
