-- Up Migration
-- Teto global de e-mails por dia (ACE-72; SEC-CA-02, AD-012, T63). Aditiva (G-14): tabela e funções novas.
-- O envios_email não serve de contador: guarda só o último envio por destino e tipo (a linha é atualizada a cada
-- envio) e a exclusão da conta apaga as linhas do e-mail. Por isso um contador próprio, uma linha por dia.

-- Total de e-mails enviados por dia no fuso de São Paulo (ADR-012). Não guarda destino nem tipo.
CREATE TABLE envios_email_dia (
  dia date PRIMARY KEY,
  total integer NOT NULL CHECK (total >= 0)
);
COMMENT ON TABLE envios_email_dia IS 'Total de e-mails de conta enviados por dia (fuso de São Paulo), para o teto diário do Resend (ACE-72). Não guarda destino nem tipo.';

-- RLS com FORCE, como as outras tabelas de conta (ACE-45). pelada_backup lê tudo; pelada_app não tem grant: só a
-- função abaixo toca.
ALTER TABLE envios_email_dia ENABLE ROW LEVEL SECURITY;
ALTER TABLE envios_email_dia FORCE ROW LEVEL SECURITY;
CREATE POLICY envios_email_dia_backup ON envios_email_dia FOR SELECT TO pelada_backup USING (true);
GRANT SELECT ON envios_email_dia TO pelada_backup;

-- Reserva um envio no dia de p_momento (São Paulo): soma 1 e devolve true se o total do dia ainda está abaixo de
-- p_teto; senão devolve false sem mudar nada. Atômica: o ON CONFLICT ... WHERE reavalia o total na versão mais nova
-- da linha, com a linha travada até o fim da transação, então envios simultâneos nunca passam do teto. A reserva vai
-- junto com a transação da requisição: se o envio falhar, o ROLLBACK a desfaz e o envio não conta.
-- Sem SECURITY DEFINER e sem EXECUTE para ninguém além do owner: o momento explícito serve aos testes; a pelada_app
-- só chama email_cota_reservar, que usa now().
CREATE FUNCTION email_cota_reservar_em(p_momento timestamptz, p_teto integer) RETURNS boolean
  LANGUAGE sql VOLATILE
  SET search_path = public, pg_temp
  AS $$
    WITH reservado AS (
      INSERT INTO envios_email_dia AS e (dia, total)
      SELECT (p_momento AT TIME ZONE 'America/Sao_Paulo')::date, 1
       WHERE p_teto > 0
      ON CONFLICT (dia) DO UPDATE SET total = e.total + 1
        WHERE e.total < p_teto
      RETURNING 1
    )
    SELECT EXISTS (SELECT 1 FROM reservado)
  $$;
REVOKE ALL ON FUNCTION email_cota_reservar_em(timestamptz, integer) FROM PUBLIC;

-- O que a API chama antes de cada e-mail de conta, com o teto da categoria (80% ou 100% de LIMITE_EMAILS_DIA).
CREATE FUNCTION email_cota_reservar(p_teto integer) RETURNS boolean
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT email_cota_reservar_em(now(), p_teto)
  $$;
REVOKE ALL ON FUNCTION email_cota_reservar(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION email_cota_reservar(integer) TO pelada_app;
