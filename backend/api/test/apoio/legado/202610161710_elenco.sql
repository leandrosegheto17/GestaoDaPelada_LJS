CREATE TABLE jogadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES grupos (id),
  apelido text NOT NULL CHECK (char_length(btrim(apelido)) BETWEEN 2 AND 30),
  -- anuláveis no banco: a anonimização (LGPD) apaga estes campos; a obrigatoriedade é do contrato
  ano_nascimento smallint CHECK (ano_nascimento >= 1940),
  posicao text CHECK (posicao IN ('goleiro', 'defensor', 'meio_campo', 'atacante')),
  telefone text CHECK (telefone ~ '^[0-9]{11}$'),
  criado_por uuid NOT NULL REFERENCES contas (id),
  criado_em timestamptz NOT NULL,
  alterado_por uuid NOT NULL REFERENCES contas (id),
  alterado_em timestamptz NOT NULL,
  UNIQUE (id, grupo_id)
);
CREATE UNIQUE INDEX jogadores_apelido_grupo ON jogadores (grupo_id, lower(apelido));

CREATE TABLE periodos_ativos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jogador_id uuid NOT NULL,
  grupo_id uuid NOT NULL,
  inicio date NOT NULL,
  fim date,
  CONSTRAINT periodo_fim_depois_inicio CHECK (fim IS NULL OR fim >= inicio),
  FOREIGN KEY (jogador_id, grupo_id) REFERENCES jogadores (id, grupo_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX periodos_um_aberto ON periodos_ativos (jogador_id) WHERE fim IS NULL;
CREATE INDEX periodos_grupo_jogador ON periodos_ativos (grupo_id, jogador_id, inicio);
