-- Up Migration
-- Entrar e tocar a sessão (design C1, AD-007, AD-008; ACE-11 a ACE-16, ACE-66). SECURITY DEFINER com search_path
-- fixo; o tempo vem de now(). Sessão: 15 min de inatividade e 12 h absolutas desde a criação (D7).

-- Entrar com e-mail e senha, a partir de um IP (só o SHA-256 dele chega aqui).
-- 1. Trava o par (e-mail, IP) até o fim da transação: tentativas simultâneas do mesmo par são avaliadas uma depois
--    da outra e nenhuma falha se perde (ACE-66).
-- 2. Bloqueio (ACE-13, ACE-14): 5 falhas do par em até 15 min, sem sucesso do par depois delas, bloqueiam o par
--    até 15 min depois da quinta. Tentativa bloqueada não é gravada e não confere a senha. Outro IP não é afetado.
-- 3. Confere a senha. Sem conta (ou sem hash bcrypt válido), compara com um hash fixo, para o tempo ser o mesmo
--    e a resposta ser a mesma 'invalida' (ACE-11).
-- 4. Senha certa de conta não confirmada: 'nao_confirmado', sem sessão (ACE-12).
-- 5. Senha certa de conta confirmada: grava o sucesso (zera a contagem do par) e cria a sessão de 12 h.
-- As tentativas com mais de 24 h são apagadas aqui (o hash do IP não fica guardado além disso).
CREATE FUNCTION conta_entrar(p_email text, p_senha text, p_ip_hash bytea, p_token_hash bytea)
  RETURNS TABLE (resultado text, conta_id uuid, nome text, bloqueado_ate timestamptz)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  #variable_conflict use_column
  DECLARE
    -- Hash bcrypt fixo (custo 12, sem relação com nenhuma senha), o mesmo do legado.
    c_hash_fixo constant text := '$2a$12$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234';
    v_email text := lower(btrim(p_email));
    v_ultimo_sucesso timestamptz;
    v_bloqueado_ate timestamptz;
    v_conta contas%ROWTYPE;
    v_hash text;
    v_ok boolean;
  BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_email || '|' || encode(p_ip_hash, 'hex'), 0));

    DELETE FROM tentativas_login t WHERE t.momento < now() - interval '24 hours';

    SELECT coalesce(max(t.momento), '-infinity') INTO v_ultimo_sucesso
      FROM tentativas_login t WHERE t.email = v_email AND t.ip_hash = p_ip_hash AND t.sucesso;

    -- A quinta falha de uma sequência de 5 em até 15 min, se ela aconteceu nos últimos 15 min.
    SELECT max(f.momento) + interval '15 minutes' INTO v_bloqueado_ate
      FROM tentativas_login f
     WHERE f.email = v_email AND f.ip_hash = p_ip_hash AND NOT f.sucesso
       AND f.momento > v_ultimo_sucesso AND f.momento > now() - interval '15 minutes'
       AND (SELECT count(*) FROM tentativas_login g
             WHERE g.email = v_email AND g.ip_hash = p_ip_hash AND NOT g.sucesso AND g.momento > v_ultimo_sucesso
               AND g.momento > f.momento - interval '15 minutes' AND g.momento <= f.momento) >= 5;
    IF v_bloqueado_ate IS NOT NULL THEN
      RETURN QUERY SELECT 'bloqueado'::text, NULL::uuid, NULL::text, v_bloqueado_ate;
      RETURN;
    END IF;

    SELECT * INTO v_conta FROM contas c WHERE c.email = v_email AND c.excluida_em IS NULL;
    v_hash := CASE WHEN v_conta.senha_hash LIKE '$2_$%' THEN v_conta.senha_hash ELSE c_hash_fixo END;
    v_ok := crypt(p_senha, v_hash) = v_hash AND v_hash <> c_hash_fixo;

    IF NOT v_ok THEN
      INSERT INTO tentativas_login (email, ip_hash, momento, sucesso) VALUES (v_email, p_ip_hash, now(), false);
      RETURN QUERY SELECT 'invalida'::text, NULL::uuid, NULL::text, NULL::timestamptz;
      RETURN;
    END IF;

    IF v_conta.email_confirmado_em IS NULL THEN
      RETURN QUERY SELECT 'nao_confirmado'::text, NULL::uuid, NULL::text, NULL::timestamptz;
      RETURN;
    END IF;

    INSERT INTO tentativas_login (email, ip_hash, momento, sucesso) VALUES (v_email, p_ip_hash, now(), true);
    INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
    VALUES (p_token_hash, v_conta.id, 'completo', now(), now(), now() + interval '12 hours');
    RETURN QUERY SELECT 'ok'::text, v_conta.id, v_conta.nome, NULL::timestamptz;
  END
  $$;
REVOKE ALL ON FUNCTION conta_entrar(text, text, bytea, bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION conta_entrar(text, text, bytea, bytea) TO pelada_app;

-- Resolve a sessão pelo hash do token (AD-007; ACE-15, ACE-16). Parada há 15 min ou criada há 12 h (expira_em):
-- apaga e devolve nulo. Válida: renova ultimo_uso_em e devolve a conta. Sessões de escopo antigo do legado
-- ('troca_de_senha') não valem.
CREATE FUNCTION sessao_tocar(p_token_hash bytea) RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_conta uuid;
  BEGIN
    DELETE FROM sessoes s
     WHERE s.token_hash = p_token_hash
       AND (s.expira_em <= now() OR s.ultimo_uso_em <= now() - interval '15 minutes');
    UPDATE sessoes s SET ultimo_uso_em = now()
     WHERE s.token_hash = p_token_hash AND s.escopo = 'completo'
    RETURNING s.conta_id INTO v_conta;
    RETURN v_conta;
  END
  $$;
REVOKE ALL ON FUNCTION sessao_tocar(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sessao_tocar(bytea) TO pelada_app;
