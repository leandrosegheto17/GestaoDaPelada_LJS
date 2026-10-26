CREATE TABLE habilidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES grupos (id),
  nome text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 2 AND 30),
  UNIQUE (id, grupo_id)
);
CREATE UNIQUE INDEX habilidades_nome_grupo ON habilidades (grupo_id, lower(nome));

CREATE TABLE notas (
  jogador_id uuid NOT NULL,
  habilidade_id uuid NOT NULL,
  grupo_id uuid NOT NULL,
  valor smallint NOT NULL CHECK (valor BETWEEN 1 AND 10),
  PRIMARY KEY (jogador_id, habilidade_id),
  FOREIGN KEY (jogador_id, grupo_id) REFERENCES jogadores (id, grupo_id),
  FOREIGN KEY (habilidade_id, grupo_id) REFERENCES habilidades (id, grupo_id) ON DELETE CASCADE
);
CREATE INDEX notas_grupo_jogador ON notas (grupo_id, jogador_id);
