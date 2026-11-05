-- Up Migration
-- Funções dos avisos de cobrança e da limpeza (notificacoes T11; NOT-38, NOT-39, NOT-56, NOT-57; AD-070, AD-105).
-- Aditiva. Como as da T10: SECURITY DEFINER, `search_path` fixo, `REVOKE ALL FROM PUBLIC`, EXECUTE só para `pelada_app`
-- (exceto `notificacoes_limpar_em`, só do owner) e `push_exigir_sem_contexto` em todas (sessão sem conta e sem slug).
-- SPEC_DEVIATION: `push_conta_resultado` recebe a conta (`p_conta`) como primeiro parâmetro, pelo mesmo motivo do
-- `p_grupo` da T10: só as assinaturas da conta do aviso mudam.

-- O destino do aviso: só a criadora do grupo (`grupos.criado_por`), nunca outro admin (NOT-38), e só se a conta não está
-- excluída. Uma linha com e-mail, nome, nome do grupo e as assinaturas de push dela (jsonb, vazio sem nenhuma). Grupo
-- inexistente ou criadora excluída: nenhuma linha.
CREATE FUNCTION aviso_cobranca_destino(p_grupo uuid)
  RETURNS TABLE (conta_id uuid, email text, nome text, grupo_nome text, assinaturas jsonb)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  #variable_conflict use_column
  BEGIN
    PERFORM push_exigir_sem_contexto('aviso_cobranca_destino');
    RETURN QUERY
      SELECT c.id, c.email, c.nome, g.nome,
             coalesce(
               (SELECT jsonb_agg(jsonb_build_object('id', p.id, 'endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth)
                                 ORDER BY p.id)
                  FROM push_conta p WHERE p.conta_id = c.id),
               '[]'::jsonb)
        FROM grupos g JOIN contas c ON c.id = g.criado_por
       WHERE g.id = p_grupo AND c.excluida_em IS NULL;
  END
  $$;
REVOKE ALL ON FUNCTION aviso_cobranca_destino(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION aviso_cobranca_destino(uuid) TO pelada_app;

-- "Uma vez por evento" (NOT-39, AD-105): grava a chave (id da cobrança no Asaas, tipo) e devolve true; se já existia,
-- false. Duas transações com a mesma chave: a segunda espera a primeira terminar (a chave é única) e recebe false se
-- ela confirmou; se a primeira desfez, a segunda grava. O registro só guarda id externo, tipo, grupo e momento (NOT-57).
CREATE FUNCTION aviso_cobranca_registrar(p_id_externo text, p_tipo text, p_grupo uuid)
  RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_gravou boolean;
  BEGIN
    PERFORM push_exigir_sem_contexto('aviso_cobranca_registrar');
    INSERT INTO avisos_cobranca (id_externo, tipo, grupo_id, enviado_em)
    VALUES (p_id_externo, p_tipo, p_grupo, now())
    ON CONFLICT (id_externo, tipo) DO NOTHING
    RETURNING true INTO v_gravou;
    RETURN coalesce(v_gravou, false);
  END
  $$;
REVOKE ALL ON FUNCTION aviso_cobranca_registrar(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION aviso_cobranca_registrar(text, text, uuid) TO pelada_app;

-- O resultado do push de cobrança: aceitos ganham `ultimo_envio_em`, revogados somem; só da conta do aviso.
CREATE FUNCTION push_conta_resultado(p_conta uuid, p_aceitos bigint[], p_revogados bigint[])
  RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  BEGIN
    PERFORM push_exigir_sem_contexto('push_conta_resultado');
    UPDATE push_conta p SET ultimo_envio_em = now()
     WHERE p.conta_id = p_conta AND p.id = ANY (coalesce(p_aceitos, '{}'::bigint[]));
    DELETE FROM push_conta p
     WHERE p.conta_id = p_conta AND p.id = ANY (coalesce(p_revogados, '{}'::bigint[]));
  END
  $$;
REVOKE ALL ON FUNCTION push_conta_resultado(uuid, bigint[], bigint[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION push_conta_resultado(uuid, bigint[], bigint[]) TO pelada_app;

-- Limpeza diária (NOT-56, NOT-57), com o momento explícito para os testes: apaga as assinaturas do ranking sem envio
-- aceito há mais de 180 dias (contando de `criada_em` quando nunca houve envio) e os avisos de cobrança com mais de 90
-- dias. Devolve quantas linhas apagou de cada tabela. Sem EXECUTE para ninguém além do owner, como `email_cota_reservar_em`
-- (1792843860000_conta-teto-emails.sql:26): a `pelada_app` só chama `notificacoes_limpar`, que usa `now()`.
CREATE FUNCTION notificacoes_limpar_em(p_momento timestamptz)
  RETURNS TABLE (ranking integer, avisos integer)
  LANGUAGE plpgsql VOLATILE
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_ranking integer;
    v_avisos integer;
  BEGIN
    DELETE FROM push_ranking p WHERE coalesce(p.ultimo_envio_em, p.criada_em) < p_momento - interval '180 days';
    GET DIAGNOSTICS v_ranking = ROW_COUNT;
    DELETE FROM avisos_cobranca a WHERE a.enviado_em < p_momento - interval '90 days';
    GET DIAGNOSTICS v_avisos = ROW_COUNT;
    RETURN QUERY SELECT v_ranking, v_avisos;
  END
  $$;
REVOKE ALL ON FUNCTION notificacoes_limpar_em(timestamptz) FROM PUBLIC;

-- O que o Cron chama, com o momento de agora; sessão sem conta e sem slug.
CREATE FUNCTION notificacoes_limpar()
  RETURNS TABLE (ranking integer, avisos integer)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  BEGIN
    PERFORM push_exigir_sem_contexto('notificacoes_limpar');
    RETURN QUERY SELECT * FROM notificacoes_limpar_em(now());
  END
  $$;
REVOKE ALL ON FUNCTION notificacoes_limpar() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION notificacoes_limpar() TO pelada_app;
