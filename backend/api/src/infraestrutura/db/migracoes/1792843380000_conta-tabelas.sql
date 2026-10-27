-- Up Migration
-- Tabelas, RLS e grants da conta e acesso (design C1; ACE-43 a ACE-46). Aditiva (G-14).
-- As funções SECURITY DEFINER que tocam estas tabelas vêm nas migrations seguintes.

-- Contas: confirmação do e-mail, aceite dos termos e exclusão (anonimização).
ALTER TABLE contas ADD COLUMN email_confirmado_em timestamptz;
ALTER TABLE contas ADD COLUMN termos_versao text;
ALTER TABLE contas ADD COLUMN termos_aceitos_em timestamptz;
ALTER TABLE contas ADD COLUMN excluida_em timestamptz;
-- Premissa da spec: toda conta que já existe é considerada com o e-mail confirmado.
UPDATE contas SET email_confirmado_em = criada_em WHERE email_confirmado_em IS NULL;

-- Tentativas de login: o bloqueio é pelo par (e-mail, IP). Só o SHA-256 do IP fica gravado (LGPD).
-- Linhas antigas ficam sem ip_hash.
ALTER TABLE tentativas_login ADD COLUMN ip_hash bytea CHECK (ip_hash IS NULL OR octet_length(ip_hash) = 32);
CREATE INDEX tentativas_login_email_ip_momento ON tentativas_login (email, ip_hash, momento);
COMMENT ON TABLE tentativas_login IS 'Contador de tentativas de login por e-mail, hash do IP e momento, para limitar força bruta. Guarda só o SHA-256 do IP, nunca o IP nem o user-agent; senha e token nunca entram.';

-- Links de conta (confirmação e recuperação): só o SHA-256 do token; um pendente por conta e tipo.
CREATE TABLE links_conta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id uuid NOT NULL REFERENCES contas (id),
  tipo text NOT NULL CHECK (tipo IN ('confirmacao', 'recuperacao')),
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  criado_em timestamptz NOT NULL,
  expira_em timestamptz NOT NULL,
  usado_em timestamptz
);
CREATE UNIQUE INDEX links_conta_um_pendente ON links_conta (conta_id, tipo) WHERE usado_em IS NULL;

-- Convites de admin: por grupo e e-mail; um pendente por grupo e e-mail.
CREATE TABLE convites_admin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES grupos (id),
  email text NOT NULL CHECK (email = lower(btrim(email)) AND char_length(email) <= 254),
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  criado_por uuid NOT NULL REFERENCES contas (id),
  criado_em timestamptz NOT NULL,
  expira_em timestamptz NOT NULL,
  usado_em timestamptz,
  cancelado_em timestamptz
);
CREATE UNIQUE INDEX convites_admin_um_pendente ON convites_admin (grupo_id, email)
  WHERE usado_em IS NULL AND cancelado_em IS NULL;

-- Último envio de cada tipo de e-mail por destino, para o intervalo de 60 s (ACE-51). Guarda só o hash do destino.
CREATE TABLE envios_email (
  destino_hash bytea NOT NULL CHECK (octet_length(destino_hash) = 32),
  tipo text NOT NULL,
  enviado_em timestamptz NOT NULL,
  PRIMARY KEY (destino_hash, tipo)
);

-- RLS com FORCE nas tabelas de conta e nas novas (ACE-45). pelada_backup lê tudo (G-27, G-29, spike S2).
DO $$
DECLARE
  tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['contas', 'sessoes', 'tentativas_login', 'links_conta', 'envios_email',
                                'pedidos_reset', 'convites_admin']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tabela);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tabela);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO pelada_backup USING (true)', tabela || '_backup', tabela);
  END LOOP;
END
$$;

-- contas: pelada_app lê e altera só a própria linha (ACE-43); senha_hash fica fora do SELECT por grant de coluna.
CREATE POLICY contas_ler ON contas FOR SELECT TO pelada_app USING (id = app_conta_id());
CREATE POLICY contas_alterar ON contas FOR UPDATE TO pelada_app
  USING (id = app_conta_id()) WITH CHECK (id = app_conta_id());
GRANT SELECT (id, email, nome, senha_temporaria, e_dono, aviso_privacidade_visto_em, criada_em,
              email_confirmado_em, termos_versao, termos_aceitos_em, excluida_em)
  ON contas TO pelada_app;
GRANT UPDATE (nome) ON contas TO pelada_app;

-- sessoes: pelada_app lê e apaga só as da própria conta (ACE-44).
CREATE POLICY sessoes_ler ON sessoes FOR SELECT TO pelada_app USING (conta_id = app_conta_id());
CREATE POLICY sessoes_apagar ON sessoes FOR DELETE TO pelada_app USING (conta_id = app_conta_id());
GRANT SELECT, DELETE ON sessoes TO pelada_app;

-- convites_admin: padrão de grupo, com escrita só com conta. Sem DELETE (cancelar é marcar cancelado_em).
-- SPEC_DEVIATION: o design pede o padrão de grupo, cuja leitura vale também para o slug público. Aqui a leitura
-- exige conta: o convite traz o e-mail de quem foi convidado, que não pode aparecer numa rota pública.
CREATE POLICY convites_admin_ler ON convites_admin FOR SELECT TO pelada_app
  USING (app_conta_id() IS NOT NULL AND grupo_id IN (SELECT grupos_visiveis()));
CREATE POLICY convites_admin_inserir ON convites_admin FOR INSERT TO pelada_app
  WITH CHECK (app_conta_id() IS NOT NULL AND grupo_id IN (SELECT grupos_visiveis()));
CREATE POLICY convites_admin_alterar ON convites_admin FOR UPDATE TO pelada_app
  USING (app_conta_id() IS NOT NULL AND grupo_id IN (SELECT grupos_visiveis()))
  WITH CHECK (app_conta_id() IS NOT NULL AND grupo_id IN (SELECT grupos_visiveis()));
GRANT SELECT, INSERT, UPDATE ON convites_admin TO pelada_app;

-- auditoria: só INSERT (as policies de grupo do ..._rls.sql já valem); nunca UPDATE nem DELETE (ACE-46).
GRANT INSERT ON auditoria TO pelada_app;

-- tentativas_login, links_conta, envios_email e pedidos_reset: sem grant para pelada_app; só as funções tocam.

-- Backup: só leitura nas tabelas novas (o GRANT ... ON ALL TABLES do ..._roles.sql valeu só para as que existiam).
GRANT SELECT ON links_conta, convites_admin, envios_email TO pelada_backup;
