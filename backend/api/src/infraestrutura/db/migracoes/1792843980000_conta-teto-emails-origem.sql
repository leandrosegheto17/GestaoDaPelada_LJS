-- Up Migration
-- Teto de pedidos de e-mail por origem em 1 h (ACE-73; SEC-CA-02, AD-013, T66). Aditiva (G-14): tabela e funções
-- novas. A origem é o IPv4 inteiro ou o prefixo /48 do IPv6, e chega aqui só como o SHA-256 da chave (como o ip_hash
-- do login). Cadastro, reenvio de confirmação, convite e "esqueci a senha" somam juntos.

-- Um pedido por linha. Os de mais de 1 h são apagados a cada registro: não guarda a origem além do necessário.
CREATE TABLE pedidos_email_origem (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chave_hash bytea NOT NULL,
  momento timestamptz NOT NULL
);
CREATE INDEX pedidos_email_origem_chave_momento ON pedidos_email_origem (chave_hash, momento);
CREATE INDEX pedidos_email_origem_momento ON pedidos_email_origem (momento);
COMMENT ON TABLE pedidos_email_origem IS 'Pedidos de e-mail de conta por origem (SHA-256 do IPv4 ou do /48 do IPv6) na última hora, para o teto de 20 por hora (ACE-73). Não guarda destino nem IP em claro.';

-- RLS com FORCE, como as outras tabelas de conta (ACE-45). pelada_backup lê tudo; pelada_app não tem grant: só a
-- função abaixo toca.
ALTER TABLE pedidos_email_origem ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos_email_origem FORCE ROW LEVEL SECURITY;
CREATE POLICY pedidos_email_origem_backup ON pedidos_email_origem FOR SELECT TO pelada_backup USING (true);
GRANT SELECT ON pedidos_email_origem TO pelada_backup;

-- Registra um pedido da origem em p_momento e devolve true se ela tinha menos de p_teto pedidos na hora anterior;
-- senão devolve false sem gravar. Trava a origem (advisory lock da transação) para pedidos simultâneos dela serem
-- contados um depois do outro e nunca passarem do teto. Sem SECURITY DEFINER e sem EXECUTE para ninguém além do
-- owner: o momento explícito serve aos testes; a pelada_app só chama email_origem_registrar, que usa now().
CREATE FUNCTION email_origem_registrar_em(p_momento timestamptz, p_chave_hash bytea, p_teto integer) RETURNS boolean
  LANGUAGE plpgsql VOLATILE
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_total integer;
  BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('email_origem|' || encode(p_chave_hash, 'hex'), 0));
    DELETE FROM pedidos_email_origem p WHERE p.momento <= p_momento - interval '1 hour';
    SELECT count(*) INTO v_total
      FROM pedidos_email_origem p
     WHERE p.chave_hash = p_chave_hash AND p.momento > p_momento - interval '1 hour';
    IF p_teto IS NULL OR v_total >= p_teto THEN
      RETURN false;
    END IF;
    INSERT INTO pedidos_email_origem (chave_hash, momento) VALUES (p_chave_hash, p_momento);
    RETURN true;
  END
  $$;
REVOKE ALL ON FUNCTION email_origem_registrar_em(timestamptz, bytea, integer) FROM PUBLIC;

-- O que a API chama antes de cada pedido de e-mail de conta, numa transação própria e curta (o pedido conta mesmo
-- que a rota responda erro, e a trava da origem não fica presa durante o envio).
CREATE FUNCTION email_origem_registrar(p_chave_hash bytea, p_teto integer) RETURNS boolean
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT email_origem_registrar_em(now(), p_chave_hash, p_teto)
  $$;
REVOKE ALL ON FUNCTION email_origem_registrar(bytea, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION email_origem_registrar(bytea, integer) TO pelada_app;
