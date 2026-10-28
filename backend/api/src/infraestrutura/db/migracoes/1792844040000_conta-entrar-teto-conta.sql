-- Up Migration
-- Teto suave por conta no login, somando todos os IPs (ACE-74; SEC-CA-04, AD-013, T67). Aditiva (G-14): conta_entrar
-- é redefinida sem mudar a assinatura nem as colunas, para o Worker da versão anterior continuar chamando-a
-- (rollback). Sem tabela nova: as falhas por e-mail já estão em tentativas_login (índice por e-mail e momento).

-- Entrar com e-mail e senha, a partir de um IP (só o SHA-256 da chave dele chega aqui).
-- 1. Trava o e-mail até o fim da transação: tentativas simultâneas do mesmo e-mail, de qualquer IP, são avaliadas uma
--    depois da outra e nenhuma falha se perde (ACE-66 para o par; ACE-74 para a conta).
-- 2. Bloqueio do par (ACE-13, ACE-14): 5 falhas do par em até 15 min, sem sucesso do par depois delas, bloqueiam o
--    par até 15 min depois da quinta.
-- 3. Bloqueio da conta (ACE-74): 50 falhas do e-mail em até 1 h, de quaisquer IPs, sem sucesso do e-mail depois
--    delas, bloqueiam o e-mail até 10 min depois da 50ª. Vale igual para e-mail sem conta (a resposta não revela se a
--    conta existe). Passados os 10 min, as falhas da última hora continuam contando: uma nova falha bloqueia de novo.
--    Tentativa bloqueada (2 ou 3) não é gravada e não confere a senha; por isso a senha certa só zera a contagem fora
--    do bloqueio.
-- 4. Confere a senha. Sem conta (ou sem hash bcrypt válido), compara com um hash fixo, para o tempo ser o mesmo
--    e a resposta ser a mesma 'invalida' (ACE-11).
-- 5. Senha certa de conta não confirmada: 'nao_confirmado', sem sessão (ACE-12).
-- 6. Senha certa de conta confirmada: grava o sucesso (zera as contagens do par e da conta) e cria a sessão de 12 h.
-- As tentativas com mais de 24 h são apagadas aqui (o hash do IP não fica guardado além disso).
CREATE OR REPLACE FUNCTION conta_entrar(p_email text, p_senha text, p_ip_hash bytea, p_token_hash bytea)
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
    v_ultimo_sucesso_conta timestamptz;
    v_bloqueado_ate timestamptz;
    v_conta contas%ROWTYPE;
    v_hash text;
    v_ok boolean;
  BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('entrar|' || v_email, 0));

    DELETE FROM tentativas_login t WHERE t.momento < now() - interval '24 hours';

    -- Bloqueio do par: a quinta falha de uma sequência de 5 em até 15 min, se ela aconteceu nos últimos 15 min.
    SELECT coalesce(max(t.momento), '-infinity') INTO v_ultimo_sucesso
      FROM tentativas_login t WHERE t.email = v_email AND t.ip_hash = p_ip_hash AND t.sucesso;

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

    -- Bloqueio da conta: a 50ª falha do e-mail (de qualquer IP) numa sequência de 50 em até 1 h, se ela aconteceu
    -- nos últimos 10 min.
    SELECT coalesce(max(t.momento), '-infinity') INTO v_ultimo_sucesso_conta
      FROM tentativas_login t WHERE t.email = v_email AND t.sucesso;

    SELECT max(f.momento) + interval '10 minutes' INTO v_bloqueado_ate
      FROM tentativas_login f
     WHERE f.email = v_email AND NOT f.sucesso
       AND f.momento > v_ultimo_sucesso_conta AND f.momento > now() - interval '10 minutes'
       AND (SELECT count(*) FROM tentativas_login g
             WHERE g.email = v_email AND NOT g.sucesso AND g.momento > v_ultimo_sucesso_conta
               AND g.momento > f.momento - interval '1 hour' AND g.momento <= f.momento) >= 50;
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
