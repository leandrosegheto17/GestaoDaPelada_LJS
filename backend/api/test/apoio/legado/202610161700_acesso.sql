CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE contas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (email = lower(btrim(email)) AND char_length(email) <= 254),
  nome text NOT NULL CHECK (char_length(nome) BETWEEN 2 AND 60),
  senha_hash text NOT NULL,
  senha_temporaria boolean NOT NULL DEFAULT false,
  e_dono boolean NOT NULL DEFAULT false,
  aviso_privacidade_visto_em timestamptz,
  criada_em timestamptz NOT NULL,
  CONSTRAINT contas_dono_email CHECK (NOT e_dono OR email = 'leandrosegheto17@gmail.com')
);
CREATE UNIQUE INDEX contas_email_unico ON contas (email);
CREATE UNIQUE INDEX contas_um_dono ON contas ((true)) WHERE e_dono;

CREATE TABLE sessoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  conta_id uuid NOT NULL REFERENCES contas (id),
  escopo text NOT NULL CHECK (escopo IN ('completo', 'troca_de_senha')),
  criada_em timestamptz NOT NULL,
  ultimo_uso_em timestamptz NOT NULL,
  expira_em timestamptz NOT NULL
);
CREATE INDEX sessoes_conta ON sessoes (conta_id);

CREATE TABLE tentativas_login (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL,
  momento timestamptz NOT NULL,
  sucesso boolean NOT NULL
);
CREATE INDEX tentativas_login_email_momento ON tentativas_login (email, momento);

CREATE TABLE pedidos_reset (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id uuid NOT NULL REFERENCES contas (id),
  ultimo_pedido_em timestamptz NOT NULL,
  resolvido_em timestamptz,
  resolvido_por uuid REFERENCES contas (id)
);
CREATE UNIQUE INDEX pedidos_reset_um_pendente ON pedidos_reset (conta_id) WHERE resolvido_em IS NULL;

CREATE TABLE auditoria (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  autor_tipo text NOT NULL CHECK (autor_tipo IN ('conta', 'infraestrutura')),
  autor_conta_id uuid REFERENCES contas (id),
  acao text NOT NULL,
  entidade text NOT NULL,
  entidade_id text,
  grupo_id uuid,
  momento timestamptz NOT NULL,
  resumo jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT auditoria_autor CHECK ((autor_tipo = 'conta') = (autor_conta_id IS NOT NULL))
);
CREATE INDEX auditoria_grupo_momento ON auditoria (grupo_id, momento);
