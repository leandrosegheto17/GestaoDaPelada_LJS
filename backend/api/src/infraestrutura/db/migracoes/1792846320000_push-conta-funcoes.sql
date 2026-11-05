-- Up Migration
-- Funções da assinatura do organizador e limpeza na exclusão da conta (notificacoes T9; NOT-45, NOT-53, NOT-55; AD-101,
-- AD-102, AD-107). Aditiva.
-- As funções exigem conta no contexto, não excluída (senão 42501), e só tocam as linhas de `push_conta` dessa conta: a
-- conta B nunca vê, cancela nem consulta a assinatura da conta A, mesmo com o mesmo endpoint (NOT-53). Mesmas proteções
-- da T8: SECURITY DEFINER, `search_path` fixo, `REVOKE ALL FROM PUBLIC` e EXECUTE só para `pelada_app`.

-- Assina (ou atualiza as chaves de) um endpoint da conta. 'criada', 'atualizada' ou 'limite' (teto de 10 por conta,
-- AD-107). A trava por conta serializa assinaturas simultâneas, como a T8 faz por grupo.
CREATE FUNCTION push_conta_assinar(p_endpoint text, p_p256dh text, p_auth text)
  RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_conta uuid := app_conta_id();
    v_outros integer;
    v_nova boolean;
  BEGIN
    IF v_conta IS NULL OR NOT EXISTS (SELECT 1 FROM contas c WHERE c.id = v_conta AND c.excluida_em IS NULL) THEN
      RAISE EXCEPTION 'push_conta_assinar exige uma conta ativa' USING ERRCODE = 'insufficient_privilege';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('push_conta:' || v_conta::text, 0));

    SELECT count(*)::integer INTO v_outros FROM push_conta p WHERE p.conta_id = v_conta AND p.endpoint <> p_endpoint;
    IF v_outros >= 10 THEN
      RETURN 'limite';
    END IF;

    INSERT INTO push_conta AS p (conta_id, endpoint, p256dh, auth)
    VALUES (v_conta, p_endpoint, p_p256dh, p_auth)
    ON CONFLICT ON CONSTRAINT push_conta_conta_endpoint DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth
    RETURNING (xmax = 0) INTO v_nova;

    RETURN CASE WHEN v_nova THEN 'criada' ELSE 'atualizada' END;
  END
  $$;
REVOKE ALL ON FUNCTION push_conta_assinar(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION push_conta_assinar(text, text, text) TO pelada_app;

-- Cancela: apaga só a linha da conta do contexto com (endpoint, auth) iguais; não diz se havia.
CREATE FUNCTION push_conta_cancelar(p_endpoint text, p_auth text)
  RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_conta uuid := app_conta_id();
  BEGIN
    IF v_conta IS NULL OR NOT EXISTS (SELECT 1 FROM contas c WHERE c.id = v_conta AND c.excluida_em IS NULL) THEN
      RAISE EXCEPTION 'push_conta_cancelar exige uma conta ativa' USING ERRCODE = 'insufficient_privilege';
    END IF;
    DELETE FROM push_conta p WHERE p.conta_id = v_conta AND p.endpoint = p_endpoint AND p.auth = p_auth;
  END
  $$;
REVOKE ALL ON FUNCTION push_conta_cancelar(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION push_conta_cancelar(text, text) TO pelada_app;

-- Estado: 'ativa' se a conta do contexto tem a linha (endpoint, auth); 'ausente' caso contrário (não enumera).
CREATE FUNCTION push_conta_estado(p_endpoint text, p_auth text)
  RETURNS text
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_conta uuid := app_conta_id();
  BEGIN
    IF v_conta IS NULL OR NOT EXISTS (SELECT 1 FROM contas c WHERE c.id = v_conta AND c.excluida_em IS NULL) THEN
      RAISE EXCEPTION 'push_conta_estado exige uma conta ativa' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF EXISTS (SELECT 1 FROM push_conta p WHERE p.conta_id = v_conta AND p.endpoint = p_endpoint AND p.auth = p_auth) THEN
      RETURN 'ativa';
    END IF;
    RETURN 'ausente';
  END
  $$;
REVOKE ALL ON FUNCTION push_conta_estado(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION push_conta_estado(text, text) TO pelada_app;

-- NOT-55, AD-102: a exclusão de conta anonimiza (`excluida_em = now()`), não apaga a linha, então um ON DELETE CASCADE não
-- bastaria. Quando `excluida_em` passa de nulo a preenchido, a trigger apaga as assinaturas da conta na mesma transação
-- (um ROLLBACK da exclusão as devolve). Não redefine `conta_excluir`, que a `planos-e-cobranca` redefine (PLA-68).
CREATE FUNCTION push_conta_apagar_na_exclusao() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  BEGIN
    DELETE FROM push_conta p WHERE p.conta_id = NEW.id;
    RETURN NEW;
  END
  $$;
REVOKE ALL ON FUNCTION push_conta_apagar_na_exclusao() FROM PUBLIC;

CREATE TRIGGER push_conta_apagar_na_exclusao
  AFTER UPDATE OF excluida_em ON contas
  FOR EACH ROW WHEN (OLD.excluida_em IS NULL AND NEW.excluida_em IS NOT NULL)
  EXECUTE FUNCTION push_conta_apagar_na_exclusao();
