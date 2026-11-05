-- Up Migration
-- Criação de grupo com os pesos padrão (partidas-e-ranking T22; PAR-15, PAR-16; BD:125-129; AD-037). Aditiva: expandir.
-- A nova grupo_criar de 7 parâmetros é o corpo de 1792844340000_grupo-criar.sql:10-75 mais a configuração padrão de
-- pesos (1, 1, 1, 1, -1, -1) vigente desde p_hoje, o dia de hoje em São Paulo que o Worker lê do relógio (AD-015) e
-- passa; p_hoje nulo levanta erro. Tudo no mesmo comando: falha nos pesos desfaz grupo, vínculo e habilidades.
-- A de 6 parâmetros passa a delegar à nova com (now() AT TIME ZONE 'America/Sao_Paulo')::date, só para o Worker do
-- deploy anterior e o rollback do deploy.yml: é a única função do schema que lê o relógio para uma data (exceção
-- temporária ao AD-015, AD-037). Sai numa migração "-- contrair:" da simulador.
CREATE FUNCTION grupo_criar(
  p_nome text,
  p_dia_semana text,
  p_frequencia text,
  p_horario time,
  p_slug_base text,
  p_habilidades text[],
  p_hoje date
)
  RETURNS TABLE (id uuid, slug text)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  #variable_conflict use_column
  DECLARE
    v_conta uuid := app_conta_id();
    v_id uuid;
    v_slug text;
    v_sufixo integer;
    v_tentativa integer := 0;
    v_restricao text;
    v_habilidade text;
  BEGIN
    IF v_conta IS NULL THEN
      RAISE EXCEPTION 'grupo_criar exige a conta da sessão' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_hoje IS NULL THEN
      RAISE EXCEPTION 'grupo_criar exige a data de hoje (p_hoje)' USING ERRCODE = 'invalid_parameter_value';
    END IF;

    LOOP
      v_tentativa := v_tentativa + 1;
      -- Primeiro sufixo livre, contando todos os grupos (arquivados também). Cada comando vê o que já foi confirmado.
      v_slug := p_slug_base;
      v_sufixo := 1;
      WHILE EXISTS (SELECT 1 FROM grupos g WHERE g.slug = v_slug) LOOP
        v_sufixo := v_sufixo + 1;
        v_slug := p_slug_base || '-' || v_sufixo;
      END LOOP;

      BEGIN
        INSERT INTO grupos (nome, slug, dia_semana, frequencia, horario, criado_por, criado_em)
        VALUES (p_nome, v_slug, p_dia_semana, p_frequencia, p_horario, v_conta, now())
        RETURNING grupos.id INTO v_id;
        EXIT;
      EXCEPTION
        WHEN unique_violation THEN
          GET STACKED DIAGNOSTICS v_restricao = CONSTRAINT_NAME;
          IF v_restricao IS DISTINCT FROM 'grupos_slug_key' OR v_tentativa >= 3 THEN
            RAISE;
          END IF;
      END;
    END LOOP;

    INSERT INTO vinculos_admin (conta_id, grupo_id, acessa_financeiro, criado_por, criado_em)
    VALUES (v_conta, v_id, true, v_conta, now());

    -- Uma por vez, para a coluna ordem (identity) seguir a ordem recebida (GEL-02).
    FOREACH v_habilidade IN ARRAY coalesce(p_habilidades, ARRAY[]::text[]) LOOP
      INSERT INTO habilidades (grupo_id, nome) VALUES (v_id, v_habilidade);
    END LOOP;

    -- Configuração padrão de pesos (PAR-15), registrada pela conta que cria o grupo.
    INSERT INTO config_pesos (grupo_id, vigente_desde, presenca_sem_chuva, presenca_com_chuva, lesionado_sem_chuva,
                              lesionado_com_chuva, expulso, expulso_com_chuva, registrado_por, registrado_em)
    VALUES (v_id, p_hoje, 1, 1, 1, 1, -1, -1, v_conta, now());

    INSERT INTO auditoria (autor_tipo, autor_conta_id, acao, entidade, entidade_id, grupo_id, momento)
    VALUES ('conta', v_conta, 'grupo_criado', 'grupo', v_id::text, v_id, now());

    RETURN QUERY SELECT v_id, v_slug;
  END
  $$;
REVOKE ALL ON FUNCTION grupo_criar(text, text, text, time, text, text[], date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION grupo_criar(text, text, text, time, text, text[], date) TO pelada_app;

-- A de 6 parâmetros delega (AD-037). CREATE OR REPLACE mantém o owner e os grants (EXECUTE só para pelada_app).
CREATE OR REPLACE FUNCTION grupo_criar(
  p_nome text,
  p_dia_semana text,
  p_frequencia text,
  p_horario time,
  p_slug_base text,
  p_habilidades text[]
)
  RETURNS TABLE (id uuid, slug text)
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT g.id, g.slug
      FROM grupo_criar(p_nome, p_dia_semana, p_frequencia, p_horario, p_slug_base, p_habilidades,
                       (now() AT TIME ZONE 'America/Sao_Paulo')::date) g
  $$;
REVOKE ALL ON FUNCTION grupo_criar(text, text, text, time, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION grupo_criar(text, text, text, time, text, text[]) TO pelada_app;
