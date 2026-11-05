-- Up Migration
-- Evento público e grants de eventos_uso (partidas-e-ranking T23; PAR-127, PAR-129, PAR-130, PAR-131; BD:130-137;
-- AD-034). Aditiva.
-- A única escrita do contexto público (só o slug, sem conta) é esta função: o slug público nunca escreve direto em
-- tabela nenhuma (a policy de INSERT exige conta, 1792843320000_rls.sql:53). Ela exige que não haja conta e que o slug
-- recebido seja o do contexto; acha o grupo ativo do slug; sem grupo (inexistente ou arquivado) ou com outro slug,
-- devolve false sem gravar. Só aceita ranking_aberto (com dispositivo, sem mês) e pdf_exportado (com mês, sem
-- dispositivo). A linha gravada tem só grupo, tipo, momento e dispositivo_id ou mes_exportado (PAR-129).
-- Mesmas proteções de admins_listar (1792843680000_conta-admins-listar.sql:8-21): SECURITY DEFINER (o owner grava
-- sem cair nas policies), search_path fixo e EXECUTE só para pelada_app.
CREATE FUNCTION evento_publico_registrar(
  p_slug text,
  p_tipo text,
  p_dispositivo uuid,
  p_mes text,
  p_momento timestamptz
)
  RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_grupo uuid;
  BEGIN
    IF app_conta_id() IS NOT NULL THEN
      RAISE EXCEPTION 'evento_publico_registrar é só do contexto público' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_tipo = 'ranking_aberto' THEN
      IF p_dispositivo IS NULL OR p_mes IS NOT NULL THEN
        RAISE EXCEPTION 'ranking_aberto exige o dispositivo e não tem mês' USING ERRCODE = 'invalid_parameter_value';
      END IF;
    ELSIF p_tipo = 'pdf_exportado' THEN
      IF p_mes IS NULL OR p_dispositivo IS NOT NULL THEN
        RAISE EXCEPTION 'pdf_exportado exige o mês e não tem dispositivo' USING ERRCODE = 'invalid_parameter_value';
      END IF;
    ELSE
      RAISE EXCEPTION 'tipo de evento público inválido' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF p_momento IS NULL THEN
      RAISE EXCEPTION 'evento_publico_registrar exige o momento' USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF p_slug IS NULL OR p_slug IS DISTINCT FROM app_slug_publico() THEN
      RETURN false;
    END IF;

    SELECT g.id INTO v_grupo FROM grupos g WHERE g.slug = p_slug AND g.arquivado_em IS NULL;
    IF v_grupo IS NULL THEN
      RETURN false;
    END IF;

    INSERT INTO eventos_uso (grupo_id, tipo, momento, dispositivo_id, mes_exportado)
    VALUES (v_grupo, p_tipo, p_momento, p_dispositivo, p_mes);
    RETURN true;
  END
  $$;
REVOKE ALL ON FUNCTION evento_publico_registrar(text, text, uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evento_publico_registrar(text, text, uuid, text, timestamptz) TO pelada_app;

-- pelada_app lê e insere eventos com conta (partida_lancada, escalacao_confirmada); nunca altera, apaga nem trunca.
GRANT SELECT, INSERT ON eventos_uso TO pelada_app;

-- Só com conta: o contexto do slug não lê eventos (o dispositivo_id não sai para o público, PAR-129).
ALTER POLICY eventos_uso_ler ON eventos_uso
  USING (app_conta_id() IS NOT NULL AND grupo_id IN (SELECT grupos_visiveis()));
