-- Up Migration
-- Retrabalho R1 da planos-e-cobranca (A-05, `validation.md`; PLA-44, PLA-56). Aditiva: CREATE OR REPLACE de
-- `assinatura_cancelar` (1792845600000_planos-assinatura.sql, que não se edita), só com a ordem dos locks trocada.
-- O webhook trava `assinaturas` e depois `grupos`; o cancelar travava `grupos` e depois `assinaturas`. Um cancelar e um
-- evento do mesmo grupo ao mesmo tempo davam deadlock (40P01) e o cancelar virava 500 depois de o Asaas já ter cancelado.
-- O resto (erros, auditoria, resultado) fica igual.

-- Devolve a situação que a assinatura tinha antes de cancelar (`ativa` ou `aguardando_pagamento`).
CREATE OR REPLACE FUNCTION assinatura_cancelar(p_grupo_id uuid)
  RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_conta uuid := app_conta_id();
    v_grupo grupos%ROWTYPE;
    v_assinatura assinaturas%ROWTYPE;
    v_depois text;
  BEGIN
    IF v_conta IS NULL THEN
      RAISE EXCEPTION 'assinatura_cancelar exige a conta da sessão' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- A-05: a assinatura vigente é travada ANTES do grupo, a mesma ordem do webhook (plano_ativar e as outras, que travam
    -- `assinaturas` e depois `grupos`). Sem isso, cancelar e um evento do mesmo grupo se cruzam e dão deadlock (40P01).
    PERFORM 1 FROM assinaturas a
     WHERE a.grupo_id = p_grupo_id AND a.situacao IN ('aguardando_pagamento', 'ativa')
       FOR UPDATE;
    SELECT * INTO v_grupo FROM grupos g WHERE g.id = p_grupo_id FOR UPDATE;
    IF NOT FOUND OR v_grupo.criado_por IS DISTINCT FROM v_conta THEN
      RAISE EXCEPTION 'Só quem criou o grupo cancela o plano.' USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT * INTO v_assinatura
      FROM assinaturas a
     WHERE a.grupo_id = p_grupo_id AND a.situacao IN ('aguardando_pagamento', 'ativa')
       FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Grupo sem assinatura para cancelar.' USING ERRCODE = 'no_data_found';
    END IF;

    UPDATE assinaturas a SET situacao = 'cancelada' WHERE a.id = v_assinatura.id;

    v_depois := v_grupo.situacao_comercial;
    IF v_assinatura.situacao = 'ativa' THEN
      -- PLA-55: segue Pro até o pago_ate, que fica na assinatura (o domínio lê `cancelado` + `pago_ate`).
      v_depois := 'cancelado';
      UPDATE grupos g SET situacao_comercial = 'cancelado', trial_inicio = NULL WHERE g.id = p_grupo_id;
    END IF;

    INSERT INTO auditoria (autor_tipo, autor_conta_id, acao, entidade, entidade_id, grupo_id, momento, resumo)
    VALUES ('conta', v_conta, 'plano_cancelado', 'assinatura', v_assinatura.id::text, p_grupo_id, now(),
            jsonb_build_object('antes', v_grupo.situacao_comercial, 'depois', v_depois,
                               'assinatura', v_assinatura.situacao));

    RETURN v_assinatura.situacao;
  END
  $$;
REVOKE ALL ON FUNCTION assinatura_cancelar(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION assinatura_cancelar(uuid) TO pelada_app;
