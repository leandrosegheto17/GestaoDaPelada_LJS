-- Up Migration
-- Funções do envio do ranking (notificacoes T10; NOT-29, NOT-30, NOT-69; AD-101). Aditiva.
-- O consumidor da fila roda como `pelada_app` numa transação sem conta e sem slug (AD-101): nenhuma destas funções serve
-- ao contexto de uma pessoa, e a ausência do contexto é conferida em cada uma por `push_exigir_sem_contexto`. SECURITY
-- DEFINER (o owner lê e grava as tabelas sem grant), `search_path` fixo, `REVOKE ALL FROM PUBLIC` e EXECUTE só para
-- `pelada_app`.
-- SPEC_DEVIATION: `push_ranking_resultado` recebe o grupo do lote (`p_grupo`) como primeiro parâmetro, porque a
-- tarefa pede que só as linhas do grupo do lote mudem e que o id de outro grupo seja ignorado (caso limite da T10).
-- S-01 (o `recursoLiberado` vale sem conta nem slug) é conferida pela T0 ainda não executada; enquanto isso
-- `push_envio_grupo` devolve nome, slug, arquivado e as entradas do `planoEfetivo` (situação comercial, início do trial e
-- `pago_ate`), e a API decide o plano pelo domínio (AD-104). S-01 não vale: o `recursoLiberado` da planos-e-cobranca
-- (`aplicacao/plano/recurso-liberado.ts`) devolve `false` para grupo que o contexto não enxerga, e o consumidor da fila
-- roda sem conta nem slug (notificacoes T18, plano B da S-01). SPEC_DEVIATION: o plano vem daqui, não do `recursoLiberado`.

-- Usada pelas funções que só o consumidor da fila e o Cron chamam: com conta ou com slug no contexto, recusa (42501).
CREATE FUNCTION push_exigir_sem_contexto(p_funcao text) RETURNS void
  LANGUAGE plpgsql STABLE
  SET search_path = public, pg_temp
  AS $$
  BEGIN
    IF app_conta_id() IS NOT NULL OR app_slug_publico() IS NOT NULL THEN
      RAISE EXCEPTION '% é só do envio, sem conta nem slug no contexto', p_funcao USING ERRCODE = 'insufficient_privilege';
    END IF;
  END
  $$;
REVOKE ALL ON FUNCTION push_exigir_sem_contexto(text) FROM PUBLIC;

-- O grupo do aviso: nome, slug, se está arquivado (o consumidor não envia de grupo arquivado, NOT-24) e as entradas do
-- plano efetivo (NOT-24, NOT-68), com o `pago_ate` escolhido como na `plano_do_grupo` (1792845480000_planos-leitura.sql:26).
-- Grupo inexistente: nenhuma linha.
CREATE FUNCTION push_envio_grupo(p_grupo uuid)
  RETURNS TABLE (nome text, slug text, arquivado boolean, situacao_comercial text, trial_inicio date, pago_ate date)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  #variable_conflict use_column
  BEGIN
    PERFORM push_exigir_sem_contexto('push_envio_grupo');
    RETURN QUERY
      SELECT g.nome, g.slug, g.arquivado_em IS NOT NULL, g.situacao_comercial, g.trial_inicio,
             (SELECT a.pago_ate
                FROM assinaturas a
               WHERE a.grupo_id = g.id
               ORDER BY (a.situacao <> 'cancelada') DESC, a.criada_em DESC, a.id
               LIMIT 1)
        FROM grupos g
       WHERE g.id = p_grupo;
  END
  $$;
REVOKE ALL ON FUNCTION push_envio_grupo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION push_envio_grupo(uuid) TO pelada_app;

-- Um lote de assinaturas do grupo, por `id` crescente a partir de `p_apos_id`, no máximo `p_limite`, só as sem envio
-- aceito desde `p_desde` (`ultimo_envio_em` nulo ou anterior). Uma nova chamada com o mesmo `p_desde` depois do
-- resultado não devolve as já aceitas, e um lote que parou no meio retoma sem reenviar a elas (NOT-69).
CREATE FUNCTION push_ranking_lote(p_grupo uuid, p_apos_id bigint, p_limite integer, p_desde timestamptz)
  RETURNS TABLE (id bigint, endpoint text, p256dh text, auth text)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  #variable_conflict use_column
  BEGIN
    PERFORM push_exigir_sem_contexto('push_ranking_lote');
    RETURN QUERY
      SELECT p.id, p.endpoint, p.p256dh, p.auth
        FROM push_ranking p
       WHERE p.grupo_id = p_grupo AND p.id > p_apos_id
         AND (p.ultimo_envio_em IS NULL OR p.ultimo_envio_em < p_desde)
       ORDER BY p.id
       LIMIT greatest(p_limite, 0);
  END
  $$;
REVOKE ALL ON FUNCTION push_ranking_lote(uuid, bigint, integer, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION push_ranking_lote(uuid, bigint, integer, timestamptz) TO pelada_app;

-- O resultado do lote: os aceitos ganham `ultimo_envio_em = now()` (NOT-29) e os revogados (404 ou 410 do serviço de
-- push) somem (NOT-30). Só linhas do grupo do lote: um id de outro grupo é ignorado.
CREATE FUNCTION push_ranking_resultado(p_grupo uuid, p_aceitos bigint[], p_revogados bigint[])
  RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  BEGIN
    PERFORM push_exigir_sem_contexto('push_ranking_resultado');
    UPDATE push_ranking p SET ultimo_envio_em = now()
     WHERE p.grupo_id = p_grupo AND p.id = ANY (coalesce(p_aceitos, '{}'::bigint[]));
    DELETE FROM push_ranking p
     WHERE p.grupo_id = p_grupo AND p.id = ANY (coalesce(p_revogados, '{}'::bigint[]));
  END
  $$;
REVOKE ALL ON FUNCTION push_ranking_resultado(uuid, bigint[], bigint[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION push_ranking_resultado(uuid, bigint[], bigint[]) TO pelada_app;
