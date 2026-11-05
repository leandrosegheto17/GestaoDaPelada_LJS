-- Up Migration
-- Registrar e cancelar a assinatura do Pro (planos-e-cobranca T14; PLA-13, PLA-14, PLA-30, PLA-55; AD-088, AD-115).
-- Aditiva. A pelada_app não escreve em `assinaturas` nem nas colunas do plano em `grupos` (T10,
-- 1792844400000_grupos-grants-coluna.sql:6-7): cada mudança passa por uma função SECURITY DEFINER, uma por transição
-- (PLA-13), com a auditoria na mesma transação (PLA-14). As duas exigem a conta da sessão e que ela seja a criadora do
-- grupo, como a trigger de arquivar (1792844520000_grupos-arquivar-so-criadora.sql:8-20).
-- Casos limite e estados (Domínio: sim):
-- - sem conta, ou conta que não criou o grupo (admin convidada, outro grupo): 42501, nada gravado;
-- - grupo inexistente: 42501 (não diz se existe);
-- - grupo arquivado: registrar recusa com 55000 (object_not_in_prerequisite_state); cancelar segue valendo, porque a
--   T38 só deixa arquivar sem assinatura vigente e o cancelamento nunca pode ficar preso;
-- - registrar com uma pendente ou ativa no grupo: o 23505 do índice `assinaturas_uma_vigente` sobe (PLA-33);
-- - registrar não muda o grupo (PLA-31): antes e depois iguais na auditoria;
-- - cancelar a `ativa`: assinatura `cancelada`, grupo `cancelado`, `pago_ate` mantido (PLA-55);
-- - cancelar a `aguardando_pagamento` (AD-115): assinatura `cancelada`, o grupo não muda (segue trial ou Free);
-- - cancelar sem assinatura vigente, ou pela segunda vez: P0002 (no_data_found), nada gravado.
-- SPEC_DEVIATION: timestamp escolhido à mão (1792845600000), conferido pelo /executar (S-04).

CREATE FUNCTION assinatura_registrar(
  p_grupo_id uuid,
  p_cliente text,
  p_assinatura text,
  p_valor_centavos integer,
  p_fatura_url text
)
  RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_conta uuid := app_conta_id();
    v_grupo grupos%ROWTYPE;
    v_id uuid;
  BEGIN
    IF v_conta IS NULL THEN
      RAISE EXCEPTION 'assinatura_registrar exige a conta da sessão' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT * INTO v_grupo FROM grupos g WHERE g.id = p_grupo_id FOR UPDATE;
    IF NOT FOUND OR v_grupo.criado_por IS DISTINCT FROM v_conta THEN
      RAISE EXCEPTION 'Só quem criou o grupo assina o plano.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_grupo.arquivado_em IS NOT NULL THEN
      RAISE EXCEPTION 'Grupo arquivado não assina o plano.' USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    INSERT INTO assinaturas (grupo_id, asaas_cliente_id, asaas_assinatura_id, valor_centavos, situacao, fatura_url,
                             criada_por, criada_em)
    VALUES (p_grupo_id, p_cliente, p_assinatura, p_valor_centavos, 'aguardando_pagamento', p_fatura_url, v_conta, now())
    RETURNING assinaturas.id INTO v_id;

    INSERT INTO auditoria (autor_tipo, autor_conta_id, acao, entidade, entidade_id, grupo_id, momento, resumo)
    VALUES ('conta', v_conta, 'plano_assinado', 'assinatura', v_id::text, p_grupo_id, now(),
            jsonb_build_object('antes', v_grupo.situacao_comercial, 'depois', v_grupo.situacao_comercial));

    RETURN v_id;
  END
  $$;
REVOKE ALL ON FUNCTION assinatura_registrar(uuid, text, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION assinatura_registrar(uuid, text, text, integer, text) TO pelada_app;

-- Devolve a situação que a assinatura tinha antes de cancelar (`ativa` ou `aguardando_pagamento`).
CREATE FUNCTION assinatura_cancelar(p_grupo_id uuid)
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
