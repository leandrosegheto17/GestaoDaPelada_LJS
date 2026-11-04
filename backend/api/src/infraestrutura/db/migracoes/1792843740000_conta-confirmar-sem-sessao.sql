-- Up Migration
-- Confirmar o e-mail não abre sessão (ACE-06 reescrito na T57, ACE-07; SEC-CA-01, AD-012). Aditiva (G-14): redefine
-- link_confirmar sem mudar a assinatura, para o Worker da versão anterior continuar chamando a função (rollback).
-- O segundo parâmetro (hash do token da sessão) deixa de ser usado; tirá-lo da assinatura fica para uma contração
-- num deploy seguinte, quando nenhum Worker no ar o passar mais.
-- Consome o link de confirmação válido (dentro do prazo, sem uso) e marca o e-mail como confirmado. Não cria sessão:
-- a pessoa entra com a senha. Link vencido, usado ou inexistente: nulo. O UPDATE ... RETURNING é atômico: dois usos
-- simultâneos do mesmo link consomem uma vez só.
CREATE OR REPLACE FUNCTION link_confirmar(p_token_hash bytea, p_token_sessao_hash bytea) RETURNS uuid
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
    RETURN v_conta;
  END
  $$;
REVOKE ALL ON FUNCTION link_confirmar(bytea, bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION link_confirmar(bytea, bytea) TO pelada_app;
