-- Up Migration
-- Tabelas das notificações (notificacoes T7; NOT-12, NOT-49, NOT-50, NOT-57; AD-101). Aditiva.
-- - `push_ranking`: uma assinatura de push do ranking público por (grupo, endpoint). Só as 6 colunas da spec (NOT-12):
--   o endereço técnico do aparelho e as duas chaves; nada de IP, user agent, conta nem jogador. `ultimo_envio_em` é o
--   último envio aceito pelo serviço de push (NOT-29) e guia a limpeza de 180 dias (NOT-56).
-- - `push_conta`: a assinatura do organizador para os avisos de cobrança (NOT-44, NOT-45), uma por (conta, endpoint).
-- - `avisos_cobranca`: o registro de "uma vez por evento" (NOT-39, AD-105): chave (id da cobrança no Asaas, tipo).
--   Só id externo, tipo, grupo e momento (NOT-57); apagada em 90 dias (NOT-56).
-- Acesso só por funções `SECURITY DEFINER` (AD-101): `pelada_app` não tem grant nenhum nas três, e sem policy para ela
-- nada passaria mesmo com grant. `pelada_backup` (o grupo de `pelada_backup_ro`) lê as três: o `GRANT SELECT ON ALL
-- TABLES` de `1792843260000_roles.sql:35` só valeu para as tabelas de então, e sem a policy o `pg_dump` com FORCE sai
-- vazio e com exit 0 (AD-010).
-- SPEC_DEVIATION: o timestamp (1792846200000) deixa folga depois da última migração da `planos-e-cobranca` (as funções
-- dela ainda nascem); o /executar confere a ordem com `pnpm migracao:nova` e renomeia se preciso (NOT-49).

CREATE TABLE push_ranking (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  grupo_id uuid NOT NULL REFERENCES grupos (id) ON DELETE CASCADE,
  endpoint text NOT NULL CHECK (char_length(endpoint) BETWEEN 1 AND 1024),
  p256dh text NOT NULL CHECK (char_length(p256dh) BETWEEN 1 AND 128),
  auth text NOT NULL CHECK (char_length(auth) BETWEEN 1 AND 64),
  criada_em timestamptz NOT NULL DEFAULT now(),
  ultimo_envio_em timestamptz,
  -- NOT-07, NOT-50: o mesmo endpoint no mesmo grupo é uma linha só; em outro grupo é outra (NOT-70).
  CONSTRAINT push_ranking_grupo_endpoint UNIQUE (grupo_id, endpoint)
);
-- O lote do envio lê por grupo, em ordem de id (T10).
CREATE INDEX push_ranking_grupo_id ON push_ranking (grupo_id, id);

CREATE TABLE push_conta (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conta_id uuid NOT NULL REFERENCES contas (id) ON DELETE CASCADE,
  endpoint text NOT NULL CHECK (char_length(endpoint) BETWEEN 1 AND 1024),
  p256dh text NOT NULL CHECK (char_length(p256dh) BETWEEN 1 AND 128),
  auth text NOT NULL CHECK (char_length(auth) BETWEEN 1 AND 64),
  criada_em timestamptz NOT NULL DEFAULT now(),
  ultimo_envio_em timestamptz,
  CONSTRAINT push_conta_conta_endpoint UNIQUE (conta_id, endpoint)
);

CREATE TABLE avisos_cobranca (
  id_externo text NOT NULL CHECK (char_length(id_externo) BETWEEN 1 AND 100),
  tipo text NOT NULL CHECK (tipo IN ('cobranca_gerada', 'pagamento_confirmado', 'pagamento_atrasado')),
  grupo_id uuid NOT NULL REFERENCES grupos (id) ON DELETE CASCADE,
  enviado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id_externo, tipo)
);
CREATE INDEX avisos_cobranca_enviado ON avisos_cobranca (enviado_em);

ALTER TABLE push_ranking ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_ranking FORCE ROW LEVEL SECURITY;
ALTER TABLE push_conta ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_conta FORCE ROW LEVEL SECURITY;
ALTER TABLE avisos_cobranca ENABLE ROW LEVEL SECURITY;
ALTER TABLE avisos_cobranca FORCE ROW LEVEL SECURITY;

-- Nenhum grant nem policy para pelada_app (AD-101): só as funções das próximas migrações tocam nas tabelas.
REVOKE ALL ON push_ranking, push_conta, avisos_cobranca FROM PUBLIC;
REVOKE ALL ON push_ranking, push_conta, avisos_cobranca FROM pelada_app;

CREATE POLICY push_ranking_backup ON push_ranking FOR SELECT TO pelada_backup USING (true);
CREATE POLICY push_conta_backup ON push_conta FOR SELECT TO pelada_backup USING (true);
CREATE POLICY avisos_cobranca_backup ON avisos_cobranca FOR SELECT TO pelada_backup USING (true);
GRANT SELECT ON push_ranking, push_conta, avisos_cobranca TO pelada_backup;
