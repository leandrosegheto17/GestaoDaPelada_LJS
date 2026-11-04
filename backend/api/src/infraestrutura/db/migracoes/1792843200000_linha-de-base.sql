-- Up Migration
-- Linha de base: concatenação literal, sem alteração, das 13 migrations do legado (AD-003).
-- Num banco que já tem o schema do legado, esta migration é registrada com --fake (backend/scripts/migrar.ts).

-- legado: 202610161700_acesso.sql
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

-- legado: 202610161701_grupos.sql
CREATE TABLE grupos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (char_length(nome) BETWEEN 3 AND 60),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{1,64}$'),
  dia_semana text NOT NULL CHECK (dia_semana IN ('domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado')),
  frequencia text NOT NULL CHECK (frequencia IN ('semanal', 'quinzenal', 'mensal')),
  horario time NOT NULL,
  situacao_comercial text NOT NULL DEFAULT 'uso_proprio'
    CHECK (situacao_comercial IN ('uso_proprio', 'trial', 'ativo', 'inadimplente', 'cancelado')),
  trial_inicio date,
  arquivado_em timestamptz,
  criado_por uuid NOT NULL REFERENCES contas (id),
  criado_em timestamptz NOT NULL,
  CONSTRAINT grupos_trial CHECK ((situacao_comercial = 'trial') = (trial_inicio IS NOT NULL))
);

-- O slug é o endereço público do grupo: nunca muda depois de gerado.
CREATE FUNCTION grupos_slug_imutavel() RETURNS trigger AS $$
BEGIN
  IF NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION 'O slug do grupo não pode ser alterado' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER grupos_slug_imutavel
  BEFORE UPDATE OF slug ON grupos
  FOR EACH ROW EXECUTE FUNCTION grupos_slug_imutavel();

CREATE TABLE vinculos_admin (
  conta_id uuid NOT NULL REFERENCES contas (id),
  grupo_id uuid NOT NULL REFERENCES grupos (id),
  acessa_financeiro boolean NOT NULL DEFAULT false,
  criado_por uuid NOT NULL REFERENCES contas (id),
  criado_em timestamptz NOT NULL,
  PRIMARY KEY (conta_id, grupo_id)
);
CREATE INDEX vinculos_admin_grupo ON vinculos_admin (grupo_id);

-- legado: 202610161710_elenco.sql
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

-- legado: 202610161711_habilidades.sql
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

-- legado: 202610161712_partidas.sql
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

-- legado: 202610161713_uso.sql
CREATE TABLE eventos_uso (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  grupo_id uuid NOT NULL REFERENCES grupos (id),
  tipo text NOT NULL CHECK (tipo IN ('ranking_aberto', 'pdf_exportado', 'partida_lancada', 'escalacao_confirmada')),
  momento timestamptz NOT NULL,
  -- sem nome, telefone, IP, localização nem jogador: o dispositivo é um identificador anônimo
  dispositivo_id uuid,
  mes_exportado text CHECK (mes_exportado ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  data_partida date,
  CONSTRAINT eventos_uso_dispositivo CHECK ((tipo = 'ranking_aberto') = (dispositivo_id IS NOT NULL)),
  CONSTRAINT eventos_uso_mes CHECK ((tipo = 'pdf_exportado') = (mes_exportado IS NOT NULL)),
  CONSTRAINT eventos_uso_data CHECK ((tipo IN ('partida_lancada', 'escalacao_confirmada')) = (data_partida IS NOT NULL))
);
CREATE INDEX eventos_uso_grupo_momento ON eventos_uso (grupo_id, momento);

-- legado: 202610161720_habilidades_ordem.sql
ALTER TABLE habilidades ADD COLUMN ordem bigint GENERATED ALWAYS AS IDENTITY;

-- legado: 202610161730_escalacoes.sql
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

-- legado: 202610161740_financeiro.sql
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

-- legado: 202610171000_comentarios_lgpd.sql
COMMENT ON COLUMN auditoria.resumo IS 'Resumo do evento auditado. Nunca recebe senha, token, hash de senha nem dado pessoal além do estritamente necessário para identificar o evento.';
COMMENT ON TABLE tentativas_login IS 'Contador de tentativas de login por e-mail e momento, para limitar força bruta. Não guarda IP nem user-agent; senha e token nunca entram.';

-- legado: 202610200000_adequacao_legado.sql
ALTER TABLE jogadores ADD COLUMN pontuacao_inicial integer NOT NULL DEFAULT 0 CHECK (pontuacao_inicial BETWEEN 0 AND 9999);

-- contrair: o CHECK de posição é trocado por outro que aceita a lista antiga e a nova, sem perda de dado
-- Aceita as posições novas e as antigas durante a transição; o CHECK só com as novas entra numa migração `-- contrair:` própria, em um deploy seguinte.
ALTER TABLE jogadores DROP CONSTRAINT jogadores_posicao_check;
ALTER TABLE jogadores ADD CONSTRAINT jogadores_posicao_check CHECK (
  posicao IN ('goleiro', 'zagueiro', 'lateral', 'volante', 'meia', 'atacante', 'centroavante', 'defensor', 'meio_campo')
);
UPDATE jogadores SET posicao = 'zagueiro' WHERE posicao = 'defensor';
UPDATE jogadores SET posicao = 'meia' WHERE posicao = 'meio_campo';

ALTER TABLE config_pesos ADD COLUMN expulso_com_chuva smallint NOT NULL DEFAULT -1 CHECK (expulso_com_chuva BETWEEN -10 AND 10);
UPDATE config_pesos SET expulso_com_chuva = expulso;

COMMENT ON COLUMN jogadores.pontuacao_inicial IS 'Pontos acumulados antes da primeira partida registrada (0 a 9999). Dado de negócio, sem dado pessoal; só as rotas de administração do grupo o devolvem.';
COMMENT ON COLUMN config_pesos.expulso IS 'Peso do expulso em partida sem chuva.';
COMMENT ON COLUMN config_pesos.expulso_com_chuva IS 'Peso do expulso em partida com chuva.';

-- legado: 202610201000_inicio_pontuacao.sql
ALTER TABLE jogadores ADD COLUMN inicio_pontuacao date;

-- Preenchimento: o que já era contado passa a ser a data de início, sem mudar nenhum acumulado.
-- É a menor entre o início do primeiro período e a primeira presença; antes da migração as presenças
-- anteriores ao período já somavam, e a pontuação inicial só valia até a primeira presença.
UPDATE jogadores j
SET inicio_pontuacao = LEAST(
  (SELECT min(p.inicio) FROM periodos_ativos p WHERE p.jogador_id = j.id AND p.grupo_id = j.grupo_id),
  (SELECT min(pa.data) FROM presencas pr
     JOIN partidas pa ON pa.id = pr.partida_id AND pa.grupo_id = pr.grupo_id
    WHERE pr.jogador_id = j.id AND pr.grupo_id = j.grupo_id)
)
WHERE EXISTS (SELECT 1 FROM periodos_ativos p WHERE p.jogador_id = j.id AND p.grupo_id = j.grupo_id);

-- Só o primeiro período de quem tinha presença anterior a ele recua até a data de início; períodos
-- encerrados e datas de saída seguem como estão.
UPDATE periodos_ativos p
SET inicio = j.inicio_pontuacao
FROM jogadores j
WHERE j.id = p.jogador_id AND j.grupo_id = p.grupo_id
  AND j.inicio_pontuacao < p.inicio
  AND p.inicio = (SELECT min(q.inicio) FROM periodos_ativos q WHERE q.jogador_id = p.jogador_id AND q.grupo_id = p.grupo_id);

COMMENT ON COLUMN jogadores.inicio_pontuacao IS 'Data a partir da qual as partidas do jogador contam pontos. Nula = início do primeiro período. Dado de negócio, sem dado pessoal.';

-- legado: 202610210000_contrai_posicao.sql
-- contrair: o CHECK de posição passa a aceitar só as 7 posições do contrato; as antigas já foram convertidas
UPDATE jogadores SET posicao = 'zagueiro' WHERE posicao = 'defensor';
UPDATE jogadores SET posicao = 'meia' WHERE posicao = 'meio_campo';
ALTER TABLE jogadores DROP CONSTRAINT jogadores_posicao_check;
ALTER TABLE jogadores ADD CONSTRAINT jogadores_posicao_check CHECK (
  posicao IN ('goleiro', 'zagueiro', 'lateral', 'volante', 'meia', 'atacante', 'centroavante')
);
