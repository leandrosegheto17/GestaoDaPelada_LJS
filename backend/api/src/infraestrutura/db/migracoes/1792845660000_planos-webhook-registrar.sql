-- Up Migration
-- Registro do evento do webhook do Asaas (planos-e-cobranca T15; PLA-13, PLA-41, PLA-42, PLA-48, PLA-49; AD-088,
-- AD-093). Aditiva.
-- O webhook não tem sessão nem slug: a rota (T35) roda a transação como pelada_app sem contexto, e esta função é a única
-- porta de escrita em eventos_asaas. Ela exige o contexto vazio (o inverso de evento_publico_registrar,
-- 1792844700000_eventos-uso.sql:11-56), grava o evento com ON CONFLICT (id) DO NOTHING e, para evento novo de
-- assinatura conhecida, trava a assinatura (FOR UPDATE) e devolve o estado que o domínio precisa (T4,
-- `AssinaturaGravada`). Envios simultâneos do mesmo evento: o segundo espera o primeiro no índice da chave e sai
-- `repetido` (PLA-43). Envios simultâneos de eventos diferentes da mesma assinatura: o FOR UPDATE os põe em fila, e cada
-- um decide sobre o estado já gravado pelo anterior (PLA-48).
-- `dateCreated` chega como texto do Asaas (`AAAA-MM-DD HH:MM:SS`, hora de São Paulo): asaas_data o converte; texto fora
-- do formato vira nulo (o domínio trata como sem data, `fora_de_ordem` quando já houve evento aplicado). O estado volta
-- com `ultimo_evento_em` no mesmo formato de texto, para a comparação do domínio.
-- Casos limite (Domínio: sim): id repetido (`repetido`, nada muda, sem estado); assinatura desconhecida (grava, `novo`
-- sem estado, PLA-49); conta no contexto ou slug no contexto (42501, nada gravado); id ou evento vazios (o CHECK da
-- tabela recusa, 23514; a rota já respondeu 400 antes, PLA-50).
-- SPEC_DEVIATION: timestamp escolhido à mão (1792845660000), conferido pelo /executar (S-04).

-- Conversão do `dateCreated` do Asaas. Sem SECURITY DEFINER e sem EXECUTE para ninguém além do owner: só é chamada de
-- dentro das funções do webhook, que rodam como owner.
CREATE FUNCTION asaas_data(p_texto text) RETURNS timestamptz
  LANGUAGE sql STABLE
  SET search_path = public, pg_temp
  AS $$
    SELECT CASE
             WHEN p_texto ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$'
               THEN (p_texto::timestamp AT TIME ZONE 'America/Sao_Paulo')
           END
  $$;
REVOKE ALL ON FUNCTION asaas_data(text) FROM PUBLIC;

CREATE FUNCTION asaas_evento_registrar(
  p_id text,
  p_evento text,
  p_data_criacao text,
  p_cobranca text,
  p_assinatura text,
  p_status text,
  p_valor_centavos integer
)
  RETURNS TABLE (
    resultado text,
    grupo_id uuid,
    situacao text,
    valor_centavos integer,
    pago_ate date,
    cobranca_pro_id text,
    ultimo_evento_em text
  )
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  #variable_conflict use_column
  DECLARE
    v_gravou integer;
  BEGIN
    IF app_conta_id() IS NOT NULL OR app_slug_publico() IS NOT NULL THEN
      RAISE EXCEPTION 'asaas_evento_registrar é só do webhook, sem conta e sem slug'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    INSERT INTO eventos_asaas (id, evento, data_criacao, cobranca_id, assinatura_id, status, valor_centavos, recebido_em)
    VALUES (p_id, p_evento, asaas_data(p_data_criacao), p_cobranca, p_assinatura, p_status, p_valor_centavos, now())
    ON CONFLICT (id) DO NOTHING;
    GET DIAGNOSTICS v_gravou = ROW_COUNT;

    IF v_gravou = 0 THEN
      RETURN QUERY SELECT 'repetido'::text, NULL::uuid, NULL::text, NULL::integer, NULL::date, NULL::text, NULL::text;
      RETURN;
    END IF;

    RETURN QUERY
      SELECT 'novo'::text, a.grupo_id, a.situacao, a.valor_centavos, a.pago_ate, a.cobranca_pro_id,
             to_char(a.ultimo_evento_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS')
        FROM assinaturas a
       WHERE p_assinatura IS NOT NULL AND a.asaas_assinatura_id = p_assinatura
         FOR UPDATE;
    IF NOT FOUND THEN
      RETURN QUERY SELECT 'novo'::text, NULL::uuid, NULL::text, NULL::integer, NULL::date, NULL::text, NULL::text;
    END IF;
  END
  $$;
REVOKE ALL ON FUNCTION asaas_evento_registrar(text, text, text, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION asaas_evento_registrar(text, text, text, text, text, text, integer) TO pelada_app;
