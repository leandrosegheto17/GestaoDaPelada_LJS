-- Up Migration
-- A recuperação de senha zera as falhas de login do e-mail (ACE-76, ACE-74; SEC-CA-15, T72). Aditiva (G-14):
-- link_nova_senha é redefinida sem mudar a assinatura nem o retorno, para o Worker da versão anterior continuar
-- chamando-a (rollback). Sem isso, o bloqueio por conta (50 falhas em 1 h, de quaisquer IPs) sobrevivia à recuperação
-- e o atacante o renovava enquanto o dono, já com a senha nova, não conseguia entrar.

-- Consome o link de recuperação válido, troca a senha, confirma o e-mail, apaga todas as sessões da conta (ACE-24) e
-- apaga as tentativas de login do e-mail da conta, na mesma transação (ACE-76): some o bloqueio por conta e o por par.
-- Link vencido, usado ou inexistente: false, sem alterar a senha nem as tentativas (ACE-25).
CREATE OR REPLACE FUNCTION link_nova_senha(p_token_hash bytea, p_senha text) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_conta uuid;
    v_email text;
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
     WHERE c.id = v_conta
    RETURNING c.email INTO v_email;
    DELETE FROM sessoes s WHERE s.conta_id = v_conta;
    -- tentativas_login guarda o e-mail como conta_entrar o normaliza (lower(btrim)), o mesmo formato de contas.email.
    DELETE FROM tentativas_login t WHERE t.email = lower(btrim(v_email));
    RETURN true;
  END
  $$;
REVOKE ALL ON FUNCTION link_nova_senha(bytea, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION link_nova_senha(bytea, text) TO pelada_app;
