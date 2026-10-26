-- Financeiro do grupo: configuração do caixa, lançamentos e pagamentos de mensalidade.
-- Valores em centavos inteiros; datas e momentos vêm do relógio da API (sem DEFAULT now()).
CREATE TABLE config_financeira (
  grupo_id uuid PRIMARY KEY REFERENCES grupos (id),
  mensalidade_centavos integer CHECK (mensalidade_centavos BETWEEN 1 AND 99999999),
  saldo_inicial_centavos integer NOT NULL CHECK (saldo_inicial_centavos BETWEEN -99999999 AND 99999999),
  data_saldo_inicial date NOT NULL
);

CREATE TABLE lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES grupos (id),
  tipo text NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  data date NOT NULL,
  descricao text NOT NULL CHECK (char_length(btrim(descricao)) BETWEEN 1 AND 80),
  valor_centavos integer NOT NULL CHECK (valor_centavos BETWEEN 1 AND 99999999),
  criado_por uuid NOT NULL REFERENCES contas (id),
  criado_em timestamptz NOT NULL,
  alterado_por uuid NOT NULL REFERENCES contas (id),
  alterado_em timestamptz NOT NULL,
  UNIQUE (id, grupo_id)
);
CREATE INDEX lancamentos_grupo_data ON lancamentos (grupo_id, data);

-- Pagamento é histórico: sem cascata, ele bloqueia a exclusão do jogador (como a presença) e o lançamento
-- vinculado não some sozinho. Com lancamento_id nulo (mensalidade não configurada) a chave composta não é checada.
CREATE TABLE pagamentos_mes (
  grupo_id uuid NOT NULL,
  jogador_id uuid NOT NULL,
  mes text NOT NULL CHECK (mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  lancamento_id uuid,
  marcado_por uuid NOT NULL REFERENCES contas (id),
  marcado_em timestamptz NOT NULL,
  PRIMARY KEY (jogador_id, mes),
  UNIQUE (lancamento_id),
  FOREIGN KEY (jogador_id, grupo_id) REFERENCES jogadores (id, grupo_id),
  FOREIGN KEY (lancamento_id, grupo_id) REFERENCES lancamentos (id, grupo_id) ON DELETE RESTRICT
);
CREATE INDEX pagamentos_mes_grupo_mes ON pagamentos_mes (grupo_id, mes);
