-- Escalação confirmada de uma partida (uma por grupo e data; confirmar de novo substitui a anterior).
-- Em "dois_times", k NULL significa "ilimitado"; em "varios_times" não há K (k é sempre NULL).
-- A forma interna de "composicao" é validada pela aplicação; o banco só garante que é um objeto.
CREATE TABLE escalacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES grupos (id),
  data date NOT NULL,
  formato text NOT NULL CHECK (formato IN ('dois_times', 'varios_times')),
  n smallint NOT NULL CHECK (n BETWEEN 2 AND 11),
  k smallint CHECK (k BETWEEN 0 AND 20),
  composicao jsonb NOT NULL CHECK (jsonb_typeof(composicao) = 'object'),
  confirmada_por uuid NOT NULL REFERENCES contas (id),
  confirmada_em timestamptz NOT NULL,
  CONSTRAINT escalacoes_grupo_data UNIQUE (grupo_id, data),
  CONSTRAINT escalacoes_k_so_em_dois_times CHECK (formato = 'dois_times' OR k IS NULL)
);
