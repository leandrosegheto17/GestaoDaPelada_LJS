-- Up Migration
-- Criação de grupo (grupos-e-elenco, design C1; GEL-01, GEL-02, GEL-09, GEL-10, GEL-14, GEL-15).
-- A policy de INSERT de grupos exige id IN (grupos_visiveis()), e um grupo que ainda não existe não tem vínculo: a
-- pelada_app não consegue criá-lo direto. Esta função (SECURITY DEFINER, padrão do AD-008) cria de uma vez o grupo
-- (criado_por = conta da sessão), o vínculo de admin com acessa_financeiro, as habilidades na ordem recebida e a
-- auditoria grupo_criado. Ela lê os slugs de todos os grupos, inclusive os arquivados, que a RLS esconde.
-- A base do slug vem do domínio (slugBase); aqui se escolhe o primeiro sufixo livre: base, base-2, base-3...
-- Numa colisão concorrente (unique_violation no slug), repete com o próximo sufixo livre, até 3 tentativas; depois,
-- o erro sobe. Tudo é um comando só na transação da requisição: qualquer falha desfaz grupo, vínculo e habilidades.
CREATE FUNCTION grupo_criar(
  p_nome text,
  p_dia_semana text,
  p_frequencia text,
  p_horario time,
  p_slug_base text,
  p_habilidades text[]
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

    INSERT INTO auditoria (autor_tipo, autor_conta_id, acao, entidade, entidade_id, grupo_id, momento)
    VALUES ('conta', v_conta, 'grupo_criado', 'grupo', v_id::text, v_id, now());

    RETURN QUERY SELECT v_id, v_slug;
  END
  $$;
REVOKE ALL ON FUNCTION grupo_criar(text, text, text, time, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION grupo_criar(text, text, text, time, text, text[]) TO pelada_app;
