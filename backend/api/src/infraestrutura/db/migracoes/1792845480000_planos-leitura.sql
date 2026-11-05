-- Up Migration
-- Leitura do plano por função (planos-e-cobranca T12; PLA-07, PLA-17, PLA-25; AD-088). Aditiva.
-- O plano efetivo é decidido no domínio (PLA-01); a API só precisa dos dados de entrada. Duas leituras não cabem na
-- RLS: `pago_ate` mora em `assinaturas`, que o slug público não lê (PLA-25: o PDF público pergunta o plano), e a regra
-- do excedente do Free compara todos os grupos da criadora (PLA-17), que a admin convidada não enxerga.
-- Mesmo molde de contas_nomes_do_grupo (1792844760000_contas-nomes-do-grupo.sql): SECURITY DEFINER com search_path
-- fixo, STABLE, EXECUTE só para pelada_app, e só responde para grupo em grupos_visiveis(). Nunca nome nem e-mail.
-- - plano_do_grupo: com conta (vínculo) ou com o slug do próprio grupo; `pago_ate` da assinatura não cancelada mais
--   recente ou, sem ela, da cancelada mais recente (cancelado é Pro até `pago_ate`, PLA-04); `jogadores_ativos` conta
--   os períodos abertos (`periodos_um_aberto`, 1792843200000_linha-de-base.sql:131).
-- - plano_grupos_da_criadora: só com conta; os grupos não arquivados de quem criou p_grupo_id, com as colunas do plano.

CREATE FUNCTION plano_do_grupo(p_grupo_id uuid)
  RETURNS TABLE (
    situacao_comercial text,
    trial_inicio date,
    pago_ate date,
    criado_por uuid,
    criado_em timestamptz,
    jogadores_ativos integer
  )
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT g.situacao_comercial,
           g.trial_inicio,
           (SELECT a.pago_ate
              FROM assinaturas a
             WHERE a.grupo_id = g.id
             ORDER BY (a.situacao <> 'cancelada') DESC, a.criada_em DESC, a.id
             LIMIT 1),
           g.criado_por,
           g.criado_em,
           (SELECT count(*)::integer FROM periodos_ativos p WHERE p.grupo_id = g.id AND p.fim IS NULL)
      FROM grupos g
     WHERE g.id = p_grupo_id
       AND p_grupo_id IN (SELECT grupos_visiveis())
  $$;
REVOKE ALL ON FUNCTION plano_do_grupo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plano_do_grupo(uuid) TO pelada_app;

CREATE FUNCTION plano_grupos_da_criadora(p_grupo_id uuid)
  RETURNS TABLE (
    id uuid,
    criado_em timestamptz,
    situacao_comercial text,
    trial_inicio date,
    pago_ate date
  )
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT o.id,
           o.criado_em,
           o.situacao_comercial,
           o.trial_inicio,
           (SELECT a.pago_ate
              FROM assinaturas a
             WHERE a.grupo_id = o.id
             ORDER BY (a.situacao <> 'cancelada') DESC, a.criada_em DESC, a.id
             LIMIT 1)
      FROM grupos alvo
      JOIN grupos o ON o.criado_por = alvo.criado_por
     WHERE alvo.id = p_grupo_id
       AND app_conta_id() IS NOT NULL
       AND p_grupo_id IN (SELECT grupos_visiveis())
       AND o.arquivado_em IS NULL
     ORDER BY o.criado_em, o.id
  $$;
REVOKE ALL ON FUNCTION plano_grupos_da_criadora(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plano_grupos_da_criadora(uuid) TO pelada_app;
