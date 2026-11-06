-- Up Migration
-- Retrabalho R1 da planos-e-cobranca (A-03, `validation.md`; PLA-04, PLA-07, PLA-17). Aditiva: CREATE OR REPLACE das duas
-- leituras de 1792845480000_planos-leitura.sql, que não se edita.
-- Defeito: a assinatura não cancelada vinha primeiro mesmo sem `pago_ate`. Quem cancela (Pro até `pago_ate`) e reassina
-- ganha uma `aguardando_pagamento` com `pago_ate` NULL, que escondia os dias já pagos e derrubava o grupo para Free.
-- Agora a assinatura que tem `pago_ate` vem antes das que não têm; entre as que têm, a não cancelada mais recente
-- continua vencendo a cancelada (a regra anterior, intacta). Sem nenhuma com `pago_ate`, o resultado é NULL como antes.

CREATE OR REPLACE FUNCTION plano_do_grupo(p_grupo_id uuid)
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
             ORDER BY (a.pago_ate IS NOT NULL) DESC, (a.situacao <> 'cancelada') DESC, a.criada_em DESC, a.id
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

CREATE OR REPLACE FUNCTION plano_grupos_da_criadora(p_grupo_id uuid)
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
             ORDER BY (a.pago_ate IS NOT NULL) DESC, (a.situacao <> 'cancelada') DESC, a.criada_em DESC, a.id
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
