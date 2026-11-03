-- Up Migration
-- "Esqueci a senha" de conta não confirmada gasta a cota de cadastro, e não a reserva da recuperação (ACE-73;
-- SEC-CA-02, AD-013, T65). Aditiva (G-14): função nova, que devolve também se o e-mail da conta já foi confirmado;
-- link_pedir é redefinida sem mudar a assinatura nem as colunas, chamando a nova, para o Worker da versão anterior
-- continuar chamando-a (rollback) e a regra do link e do intervalo de 60 s ficar num lugar só.

-- A mesma regra de link_pedir (ACE-08, ACE-23, ACE-51), mais a coluna confirmada: true só para conta com o e-mail
-- confirmado. Sem conta, confirmada = false (a rota não envia e responde igual).
CREATE FUNCTION link_pedir_com_confirmacao(p_email text, p_tipo text, p_token_hash bytea)
  RETURNS TABLE (enviar boolean, nome text, confirmada boolean)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  #variable_conflict use_column
  DECLARE
    v_email text := lower(btrim(p_email));
    v_conta contas%ROWTYPE;
    v_confirmada boolean;
  BEGIN
    IF p_tipo NOT IN ('confirmacao', 'recuperacao') THEN
      RAISE EXCEPTION 'tipo de link inválido: %', p_tipo USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_conta FROM contas c WHERE c.email = v_email AND c.excluida_em IS NULL;
    v_confirmada := v_conta.id IS NOT NULL AND v_conta.email_confirmado_em IS NOT NULL;
    IF v_conta.id IS NULL OR (p_tipo = 'confirmacao' AND v_confirmada) THEN
      RETURN QUERY SELECT false, NULL::text, v_confirmada;
      RETURN;
    END IF;

    IF NOT envio_permitido(v_email, p_tipo) THEN
      RETURN QUERY SELECT false, v_conta.nome, v_confirmada;
      RETURN;
    END IF;

    DELETE FROM links_conta l WHERE l.conta_id = v_conta.id AND l.tipo = p_tipo AND l.usado_em IS NULL;
    INSERT INTO links_conta (conta_id, tipo, token_hash, criado_em, expira_em)
    VALUES (v_conta.id, p_tipo, p_token_hash, now(),
            now() + CASE p_tipo WHEN 'confirmacao' THEN interval '24 hours' ELSE interval '1 hour' END);
    RETURN QUERY SELECT true, v_conta.nome, v_confirmada;
  END
  $$;
REVOKE ALL ON FUNCTION link_pedir_com_confirmacao(text, text, bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION link_pedir_com_confirmacao(text, text, bytea) TO pelada_app;

-- A assinatura e as colunas de antes (enviar, nome), sobre a função nova.
CREATE OR REPLACE FUNCTION link_pedir(p_email text, p_tipo text, p_token_hash bytea)
  RETURNS TABLE (enviar boolean, nome text)
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT r.enviar, r.nome FROM link_pedir_com_confirmacao(p_email, p_tipo, p_token_hash) r
  $$;
REVOKE ALL ON FUNCTION link_pedir(text, text, bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION link_pedir(text, text, bytea) TO pelada_app;
