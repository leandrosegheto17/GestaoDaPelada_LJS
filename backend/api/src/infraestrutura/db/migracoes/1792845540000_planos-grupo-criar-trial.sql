-- Up Migration
-- Grupo novo nasce em trial (planos-e-cobranca T13; PLA-10, PLA-12, PLA-14; AD-087, AD-037). Aditiva.
-- CREATE OR REPLACE da grupo_criar de 7 parâmetros (a única desde 1792844940000_grupo-criar-contrair.sql), com a mesma
-- assinatura, o mesmo retorno, o owner e os grants de 1792844640000_grupo-criar-pesos.sql. Duas diferenças:
-- - o INSERT em grupos grava situacao_comercial = 'trial' e trial_inicio = p_hoje (a data de São Paulo que o Worker lê
--   do Relógio; nenhuma função do schema lê o relógio para uma data, AD-015, teste da T22 da partidas-e-ranking);
-- - a auditoria plano_trial_iniciado, depois de grupo_criado, com resumo {"antes": null, "depois": "trial"}.
-- O default da coluna continua uso_proprio (PLA-12): a pelada_app não insere em grupos, e a migração de dados da T17
-- decide os grupos que já existem.
-- Casos limite (Domínio: sim):
-- - p_hoje nulo: o RAISE que já existia (invalid_parameter_value) acontece antes do INSERT; o CHECK grupos_trial
--   também recusaria trial sem data;
-- - colisão de slug: o laço de até 3 tentativas não muda; cada tentativa grava trial com a mesma data;
-- - falha no meio (habilidade inválida, pesos): o comando inteiro desfaz grupo, vínculo, habilidades, pesos e as duas
--   auditorias;
-- - p_hoje no futuro (relógio adiantado): grava assim mesmo; o domínio trata trial_inicio futuro como trial (PLA-70).
-- SPEC_DEVIATION: timestamp escolhido à mão (1792845540000), conferido pelo /executar (S-04).

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

    -- Configuração padrão de pesos (PAR-15), registrada pela conta que cria o grupo.
    INSERT INTO config_pesos (grupo_id, vigente_desde, presenca_sem_chuva, presenca_com_chuva, lesionado_sem_chuva,
                              lesionado_com_chuva, expulso, expulso_com_chuva, registrado_por, registrado_em)
    VALUES (v_id, p_hoje, 1, 1, 1, 1, -1, -1, v_conta, now());

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
