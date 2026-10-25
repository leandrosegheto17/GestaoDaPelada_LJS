CREATE TABLE config_pesos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES grupos (id),
  vigente_desde date NOT NULL,
  presenca_sem_chuva smallint NOT NULL CHECK (presenca_sem_chuva BETWEEN -10 AND 10),
  presenca_com_chuva smallint NOT NULL CHECK (presenca_com_chuva BETWEEN -10 AND 10),
  lesionado_sem_chuva smallint NOT NULL CHECK (lesionado_sem_chuva BETWEEN -10 AND 10),
  lesionado_com_chuva smallint NOT NULL CHECK (lesionado_com_chuva BETWEEN -10 AND 10),
  expulso smallint NOT NULL CHECK (expulso BETWEEN -10 AND 10),
  registrado_por uuid NOT NULL REFERENCES contas (id),
  registrado_em timestamptz NOT NULL,
  UNIQUE (grupo_id, vigente_desde)
);

CREATE TABLE partidas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES grupos (id),
  data date NOT NULL,
  choveu boolean NOT NULL DEFAULT false,
  criada_por uuid NOT NULL REFERENCES contas (id),
  criada_em timestamptz NOT NULL,
  alterada_por uuid NOT NULL REFERENCES contas (id),
  alterada_em timestamptz NOT NULL,
  UNIQUE (grupo_id, data),
  UNIQUE (id, grupo_id)
);

CREATE TABLE presencas (
  partida_id uuid NOT NULL,
  jogador_id uuid NOT NULL,
  grupo_id uuid NOT NULL,
  situacao text NOT NULL CHECK (situacao IN ('presente', 'lesionado', 'expulso')),
  PRIMARY KEY (partida_id, jogador_id),
  FOREIGN KEY (partida_id, grupo_id) REFERENCES partidas (id, grupo_id) ON DELETE CASCADE,
  FOREIGN KEY (jogador_id, grupo_id) REFERENCES jogadores (id, grupo_id)
);
CREATE INDEX presencas_grupo_jogador ON presencas (grupo_id, jogador_id);
