-- Up Migration
-- Funções de assinatura do push do ranking pelo slug (notificacoes T8; NOT-05, NOT-07, NOT-08, NOT-10, NOT-17, NOT-18,
-- NOT-51, NOT-65, NOT-70; AD-065, AD-101, AD-104). Aditiva.
-- O contexto público (só o slug, sem conta) escreve nestas funções e em mais nada: `push_ranking` não tem grant para
-- `pelada_app`. Mesmas proteções de `evento_publico_registrar` (1792844700000_eventos-uso.sql): SECURITY DEFINER (o owner
-- grava sem cair nas policies), `search_path` fixo, `REVOKE ALL FROM PUBLIC` e EXECUTE só para `pelada_app`. Todas exigem
-- que não haja conta no contexto (recusa com 42501) e que o slug recebido seja o do contexto.
-- O plano (push liberado pelo plano do grupo, NOT-09) fica na API, pelo `recursoLiberado` (AD-104): aqui só o slug ativo
-- e o teto de 200 por grupo (NOT-10).

-- Assina (ou atualiza as chaves de) um endpoint no grupo do slug. Devolve:
-- - 'criada': linha nova;
-- - 'atualizada': o endpoint já existia no grupo; as chaves foram trocadas (NOT-07);
-- - 'limite': o grupo já tem 200 assinaturas de outros endpoints (NOT-10); nada é gravado;
-- - 'nao_encontrado': slug que não é o do contexto, inexistente ou de grupo arquivado (NOT-08).
-- A trava por grupo (`pg_advisory_xact_lock`) serializa assinaturas simultâneas do mesmo grupo até o fim da transação:
-- duas do mesmo endpoint gravam uma linha só, uma 'criada' e a outra 'atualizada' (NOT-65), e duas novas com 199 não
-- passam de 200. O teto não conta o próprio endpoint, então reassinar com 200 linhas segue valendo.
CREATE FUNCTION push_ranking_assinar(p_slug text, p_endpoint text, p_p256dh text, p_auth text)
  RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_grupo uuid;
    v_outros integer;
    v_nova boolean;
  BEGIN
    IF app_conta_id() IS NOT NULL THEN
      RAISE EXCEPTION 'push_ranking_assinar é só do contexto público' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_slug IS NULL OR p_slug IS DISTINCT FROM app_slug_publico() THEN
      RETURN 'nao_encontrado';
    END IF;

    SELECT g.id INTO v_grupo FROM grupos g WHERE g.slug = p_slug AND g.arquivado_em IS NULL;
    IF v_grupo IS NULL THEN
      RETURN 'nao_encontrado';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('push_ranking:' || v_grupo::text, 0));

    SELECT count(*)::integer INTO v_outros FROM push_ranking p WHERE p.grupo_id = v_grupo AND p.endpoint <> p_endpoint;
    IF v_outros >= 200 THEN
      RETURN 'limite';
    END IF;

    INSERT INTO push_ranking AS p (grupo_id, endpoint, p256dh, auth)
    VALUES (v_grupo, p_endpoint, p_p256dh, p_auth)
    ON CONFLICT ON CONSTRAINT push_ranking_grupo_endpoint DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth
    RETURNING (xmax = 0) INTO v_nova;

    RETURN CASE WHEN v_nova THEN 'criada' ELSE 'atualizada' END;
  END
  $$;
REVOKE ALL ON FUNCTION push_ranking_assinar(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION push_ranking_assinar(text, text, text, text) TO pelada_app;

-- Cancela: apaga só a linha de (grupo do slug, endpoint, auth). Acha o grupo também arquivado (NOT-18). Não diz se havia
-- linha (NOT-17): a API responde 204 de qualquer jeito. Slug que não é o do contexto não apaga nada.
CREATE FUNCTION push_ranking_cancelar(p_slug text, p_endpoint text, p_auth text)
  RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  BEGIN
    IF app_conta_id() IS NOT NULL THEN
      RAISE EXCEPTION 'push_ranking_cancelar é só do contexto público' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_slug IS NULL OR p_slug IS DISTINCT FROM app_slug_publico() THEN
      RETURN;
    END IF;
    DELETE FROM push_ranking p
     USING grupos g
     WHERE g.slug = p_slug AND p.grupo_id = g.id AND p.endpoint = p_endpoint AND p.auth = p_auth;
  END
  $$;
REVOKE ALL ON FUNCTION push_ranking_cancelar(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION push_ranking_cancelar(text, text, text) TO pelada_app;

-- Estado (NOT-71): 'ativa' quando há linha de (grupo ativo do slug, endpoint, auth); 'ausente' quando não há (inclusive
-- com o `auth` errado: não enumera); 'nao_encontrado' para slug que não é o do contexto, inexistente ou arquivado.
CREATE FUNCTION push_ranking_estado(p_slug text, p_endpoint text, p_auth text)
  RETURNS text
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_grupo uuid;
  BEGIN
    IF app_conta_id() IS NOT NULL THEN
      RAISE EXCEPTION 'push_ranking_estado é só do contexto público' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_slug IS NULL OR p_slug IS DISTINCT FROM app_slug_publico() THEN
      RETURN 'nao_encontrado';
    END IF;
    SELECT g.id INTO v_grupo FROM grupos g WHERE g.slug = p_slug AND g.arquivado_em IS NULL;
    IF v_grupo IS NULL THEN
      RETURN 'nao_encontrado';
    END IF;
    IF EXISTS (SELECT 1 FROM push_ranking p WHERE p.grupo_id = v_grupo AND p.endpoint = p_endpoint AND p.auth = p_auth) THEN
      RETURN 'ativa';
    END IF;
    RETURN 'ausente';
  END
  $$;
REVOKE ALL ON FUNCTION push_ranking_estado(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION push_ranking_estado(text, text, text) TO pelada_app;
