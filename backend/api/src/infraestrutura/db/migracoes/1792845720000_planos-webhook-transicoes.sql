-- Up Migration
-- Transições do plano pelo webhook (planos-e-cobranca T16; PLA-13, PLA-14, PLA-44, PLA-45, PLA-46, PLA-47; AD-088,
-- AD-096). Aditiva.
-- Uma função por transição (PLA-13), chamada pela rota do webhook (T36) na mesma transação do asaas_evento_registrar
-- (T15), depois que o domínio decidiu o efeito (T4). As três: só sem conta e sem slug; só para asaas_assinatura_id
-- gravado (desconhecido devolve false, sem efeito); travam a assinatura e o grupo; marcam `efeito` no evento; auditam
-- com autor_tipo `infraestrutura`, sem autor_conta_id (auditoria_autor, 1792843200000_linha-de-base.sql:60), com
-- antes e depois da situação do grupo. Qualquer falha (inclusive na auditoria) desfaz tudo: é um comando só.
-- - plano_ativar: grupo `ativo` com trial_inicio = NULL no mesmo UPDATE (CHECK grupos_trial, :78); assinatura `ativa`
--   com pago_ate, cobranca_pro_id e ultimo_evento_em (PLA-44);
-- - plano_inadimplente: só o grupo muda (`inadimplente`, trial_inicio = NULL); a assinatura segue como está, só com o
--   ultimo_evento_em (PLA-45, PLA-47, AD-096);
-- - plano_cancelado: assinatura `cancelada`, pago_ate mantido (PLA-46); o grupo vai a `cancelado` se a assinatura era
--   `ativa`; se era a pendente, o grupo não muda (o mesmo do cancelamento pela criadora, T14, AD-115).
-- Casos limite e estados (Domínio: sim): ativar grupo em `trial` (zera trial_inicio), `inadimplente`, `cancelado` ou
-- `uso_proprio` (a cortesia não é rebaixada nem promovida: fica como está, só a assinatura muda); cancelar já
-- cancelada (sem efeito, false); assinatura desconhecida (false); com conta ou slug (42501); grupo arquivado (aplica:
-- o Asaas manda o que aconteceu, e a T38 impede arquivar com assinatura vigente).
-- SPEC_DEVIATION: a spec lista (p_assinatura, …, p_data_evento); as três recebem também p_evento_id, o id do evento
-- que as dispara, para marcar `efeito` nele (o What pede "marca efeito no evento" e só o id o acha).
-- SPEC_DEVIATION: timestamp escolhido à mão (1792845720000), conferido pelo /executar (S-04).

-- Guarda comum das três: contexto vazio.
CREATE FUNCTION plano_exigir_webhook() RETURNS void
  LANGUAGE plpgsql STABLE
  SET search_path = public, pg_temp
  AS $$
  BEGIN
    IF app_conta_id() IS NOT NULL OR app_slug_publico() IS NOT NULL THEN
      RAISE EXCEPTION 'transição do plano é só do webhook, sem conta e sem slug' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END
  $$;
REVOKE ALL ON FUNCTION plano_exigir_webhook() FROM PUBLIC;

CREATE FUNCTION plano_ativar(
  p_assinatura text,
  p_pago_ate date,
  p_cobranca text,
  p_data_evento text,
  p_evento_id text
)
  RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_assinatura assinaturas%ROWTYPE;
    v_antes text;
    v_depois text;
  BEGIN
    PERFORM plano_exigir_webhook();
    IF p_pago_ate IS NULL OR p_cobranca IS NULL THEN
      RAISE EXCEPTION 'plano_ativar exige pago_ate e a cobrança' USING ERRCODE = 'invalid_parameter_value';
    END IF;

    SELECT * INTO v_assinatura FROM assinaturas a WHERE a.asaas_assinatura_id = p_assinatura FOR UPDATE;
    IF NOT FOUND OR v_assinatura.situacao = 'cancelada' THEN
      RETURN false;
    END IF;
    SELECT g.situacao_comercial INTO v_antes FROM grupos g WHERE g.id = v_assinatura.grupo_id FOR UPDATE;

    UPDATE assinaturas a
       SET situacao = 'ativa', pago_ate = p_pago_ate, cobranca_pro_id = p_cobranca,
           ultimo_evento_em = coalesce(asaas_data(p_data_evento), a.ultimo_evento_em)
     WHERE a.id = v_assinatura.id;

    -- [LACUNA] grupo de cortesia (uso_proprio) que assina: a spec não diz; conservador, a cortesia fica.
    v_depois := CASE WHEN v_antes = 'uso_proprio' THEN 'uso_proprio' ELSE 'ativo' END;
    IF v_depois = 'ativo' THEN
      UPDATE grupos g SET situacao_comercial = 'ativo', trial_inicio = NULL WHERE g.id = v_assinatura.grupo_id;
    END IF;

    UPDATE eventos_asaas e SET efeito = 'ativar' WHERE e.id = p_evento_id;

    INSERT INTO auditoria (autor_tipo, autor_conta_id, acao, entidade, entidade_id, grupo_id, momento, resumo)
    VALUES ('infraestrutura', NULL, 'plano_ativado', 'assinatura', v_assinatura.id::text, v_assinatura.grupo_id, now(),
            jsonb_build_object('antes', v_antes, 'depois', v_depois, 'pago_ate', p_pago_ate));
    RETURN true;
  END
  $$;
REVOKE ALL ON FUNCTION plano_ativar(text, date, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plano_ativar(text, date, text, text, text) TO pelada_app;

CREATE FUNCTION plano_inadimplente(p_assinatura text, p_data_evento text, p_evento_id text)
  RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_assinatura assinaturas%ROWTYPE;
    v_antes text;
    v_depois text;
  BEGIN
    PERFORM plano_exigir_webhook();

    SELECT * INTO v_assinatura FROM assinaturas a WHERE a.asaas_assinatura_id = p_assinatura FOR UPDATE;
    IF NOT FOUND OR v_assinatura.situacao = 'cancelada' THEN
      RETURN false;
    END IF;
    SELECT g.situacao_comercial INTO v_antes FROM grupos g WHERE g.id = v_assinatura.grupo_id FOR UPDATE;

    UPDATE assinaturas a
       SET ultimo_evento_em = coalesce(asaas_data(p_data_evento), a.ultimo_evento_em)
     WHERE a.id = v_assinatura.id;

    v_depois := CASE WHEN v_antes = 'uso_proprio' THEN 'uso_proprio' ELSE 'inadimplente' END;
    IF v_depois = 'inadimplente' THEN
      UPDATE grupos g SET situacao_comercial = 'inadimplente', trial_inicio = NULL WHERE g.id = v_assinatura.grupo_id;
    END IF;

    UPDATE eventos_asaas e SET efeito = 'inadimplente' WHERE e.id = p_evento_id;

    INSERT INTO auditoria (autor_tipo, autor_conta_id, acao, entidade, entidade_id, grupo_id, momento, resumo)
    VALUES ('infraestrutura', NULL, 'plano_inadimplente', 'assinatura', v_assinatura.id::text, v_assinatura.grupo_id,
            now(), jsonb_build_object('antes', v_antes, 'depois', v_depois));
    RETURN true;
  END
  $$;
REVOKE ALL ON FUNCTION plano_inadimplente(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plano_inadimplente(text, text, text) TO pelada_app;

CREATE FUNCTION plano_cancelado(p_assinatura text, p_data_evento text, p_evento_id text)
  RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_assinatura assinaturas%ROWTYPE;
    v_antes text;
    v_depois text;
  BEGIN
    PERFORM plano_exigir_webhook();

    SELECT * INTO v_assinatura FROM assinaturas a WHERE a.asaas_assinatura_id = p_assinatura FOR UPDATE;
    IF NOT FOUND OR v_assinatura.situacao = 'cancelada' THEN
      RETURN false;
    END IF;
    SELECT g.situacao_comercial INTO v_antes FROM grupos g WHERE g.id = v_assinatura.grupo_id FOR UPDATE;

    UPDATE assinaturas a
       SET situacao = 'cancelada', ultimo_evento_em = coalesce(asaas_data(p_data_evento), a.ultimo_evento_em)
     WHERE a.id = v_assinatura.id;

    v_depois := v_antes;
    IF v_assinatura.situacao = 'ativa' AND v_antes <> 'uso_proprio' THEN
      v_depois := 'cancelado';
      UPDATE grupos g SET situacao_comercial = 'cancelado', trial_inicio = NULL WHERE g.id = v_assinatura.grupo_id;
    END IF;

    UPDATE eventos_asaas e SET efeito = 'cancelar' WHERE e.id = p_evento_id;

    INSERT INTO auditoria (autor_tipo, autor_conta_id, acao, entidade, entidade_id, grupo_id, momento, resumo)
    VALUES ('infraestrutura', NULL, 'plano_cancelado', 'assinatura', v_assinatura.id::text, v_assinatura.grupo_id,
            now(), jsonb_build_object('antes', v_antes, 'depois', v_depois, 'assinatura', v_assinatura.situacao));
    RETURN true;
  END
  $$;
REVOKE ALL ON FUNCTION plano_cancelado(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plano_cancelado(text, text, text) TO pelada_app;

-- O efeito "nenhum" também fica marcado no evento, para conferência (PLA-49, PLA-51): mesma guarda, sem auditoria
-- (nada mudou no plano).
CREATE FUNCTION asaas_evento_sem_efeito(p_evento_id text, p_motivo text)
  RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  BEGIN
    PERFORM plano_exigir_webhook();
    UPDATE eventos_asaas e SET efeito = 'nenhum:' || p_motivo WHERE e.id = p_evento_id AND e.efeito IS NULL;
  END
  $$;
REVOKE ALL ON FUNCTION asaas_evento_sem_efeito(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION asaas_evento_sem_efeito(text, text) TO pelada_app;
