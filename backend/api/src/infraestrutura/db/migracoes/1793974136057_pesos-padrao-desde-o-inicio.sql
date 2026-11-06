-- Up Migration
-- Pesos padrão valem desde o início do grupo (fundação R1-T2; PAR-165, PAR-15, PAR-09, PAR-56; AD-125, AD-126). Aditiva.
-- Motivo: a padrão datada em p_hoje fazia o primeiro salvar do dia substituí-la (PAR-04), e a partida de ontem passava
-- a usar o peso novo. Com a padrão em 1900-01-01, "não" insere a linha de hoje e o passado fica com o peso padrão.
-- 1) CREATE OR REPLACE da grupo_criar de 7 parâmetros (corpo de 1792845540000_planos-grupo-criar-trial.sql, mesma
--    assinatura, owner e grants) com uma só diferença: a configuração padrão nasce em DATE '1900-01-01', não em p_hoje.
-- 2) Grupos que já existem: a configuração única, datada no dia da criação (São Paulo), com os pesos padrão
--    1, 1, 1, 1, -1, -1, passa para 1900-01-01. Grupo com mais de uma linha, com pesos alterados ou com data diferente
--    da criação fica intacto. Idempotente: depois de rodar, a data deixa de ser a da criação.
-- Casos limite (Domínio: sim):
-- - p_hoje continua obrigatório (trial_inicio) e nulo levanta o erro que já existia;
-- - grupo arquivado também é atualizado (o SQL não os separa, como em 1792844580000_pesos-padrao.sql);
-- - partida com data antes de 1900-01-01 não existe; a regra PAR-56 (antes da primeira usa a mais antiga) segue valendo.

CREATE OR REPLACE FUNCTION grupo_criar(
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
        -- PLA-10: todo grupo novo nasce no trial de 14 dias, contado de p_hoje (AD-087).
        INSERT INTO grupos (nome, slug, dia_semana, frequencia, horario, situacao_comercial, trial_inicio, criado_por,
                            criado_em)
        VALUES (p_nome, v_slug, p_dia_semana, p_frequencia, p_horario, 'trial', p_hoje, v_conta, now())
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

    -- Configuração padrão de pesos (PAR-15, PAR-165), vigente desde o início do grupo (1900-01-01, AD-125, AD-126) e
    -- registrada pela conta que cria o grupo.
    INSERT INTO config_pesos (grupo_id, vigente_desde, presenca_sem_chuva, presenca_com_chuva, lesionado_sem_chuva,
                              lesionado_com_chuva, expulso, expulso_com_chuva, registrado_por, registrado_em)
    VALUES (v_id, DATE '1900-01-01', 1, 1, 1, 1, -1, -1, v_conta, now());

    INSERT INTO auditoria (autor_tipo, autor_conta_id, acao, entidade, entidade_id, grupo_id, momento)
    VALUES ('conta', v_conta, 'grupo_criado', 'grupo', v_id::text, v_id, now());

    -- PLA-14: a entrada no trial é uma transição do plano, auditada com antes e depois, no mesmo comando.
    INSERT INTO auditoria (autor_tipo, autor_conta_id, acao, entidade, entidade_id, grupo_id, momento, resumo)
    VALUES ('conta', v_conta, 'plano_trial_iniciado', 'grupo', v_id::text, v_id, now(),
            jsonb_build_object('antes', NULL, 'depois', 'trial'));

    RETURN QUERY SELECT v_id, v_slug;
  END
  $$;
REVOKE ALL ON FUNCTION grupo_criar(text, text, text, time, text, text[], date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION grupo_criar(text, text, text, time, text, text[], date) TO pelada_app;

-- 2) Dados existentes (roda como dono do schema; a pelada_app não tem UPDATE em vigente_desde, PAR-09).
UPDATE config_pesos c
   SET vigente_desde = DATE '1900-01-01'
  FROM grupos g
 WHERE g.id = c.grupo_id
   AND c.vigente_desde = (g.criado_em AT TIME ZONE 'America/Sao_Paulo')::date
   AND (c.presenca_sem_chuva, c.presenca_com_chuva, c.lesionado_sem_chuva, c.lesionado_com_chuva, c.expulso,
        c.expulso_com_chuva) = (1, 1, 1, 1, -1, -1)
   AND (SELECT count(*) FROM config_pesos o WHERE o.grupo_id = c.grupo_id) = 1;
