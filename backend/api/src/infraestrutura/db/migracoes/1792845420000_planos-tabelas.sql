-- Up Migration
-- Tabelas do plano Pro (planos-e-cobranca T10; PLA-13, PLA-30, PLA-33, PLA-41, PLA-43; AD-056, AD-088). Aditiva.
-- O plano efetivo continua decidido no domínio (PLA-01); aqui só mora o que o Asaas informou:
-- - `assinaturas`: uma linha por assinatura criada no Asaas. `pago_ate`, a cobrança que deu o Pro e o `dateCreated`
--   do último evento aplicado ficam nela (AD-088). No máximo uma `aguardando_pagamento` ou `ativa` por grupo (PLA-33),
--   pelo índice único parcial: a segunda tentativa simultânea morre no 23505.
-- - `eventos_asaas`: um evento do webhook por linha, com o id do Asaas como chave (PLA-42, PLA-43: o repetido morre no
--   23505). Sem `grupo_id` (o grupo vem pela assinatura) e sem nenhuma coluna de pessoa (PLA-41): nem e-mail, nem nome,
--   nem CPF. `cobranca_id`, `evento` e `data_criacao` em toda linha, para a `notificacoes` (S-07).
-- Escrita só pelas funções `SECURITY DEFINER` das T14 a T16 (PLA-13): `pelada_app` não tem INSERT, UPDATE nem DELETE
-- nas duas, e não tem nem SELECT em `eventos_asaas`. `pelada_backup` (o grupo de `pelada_backup_ro`) lê as duas: o
-- `GRANT SELECT ON ALL TABLES` de `1792843260000_roles.sql:35` só valeu para as tabelas de então, e sem a policy o
-- `pg_dump` com FORCE sai vazio e com exit 0 (AD-010).
-- SPEC_DEVIATION: o timestamp (1792845420000) segue a última migração do financeiro (1792845360000) com o passo de
-- 60 s das anteriores; o /executar confere a ordem com `pnpm migracao:nova` e renomeia se preciso (S-04).

CREATE TABLE assinaturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES grupos (id),
  asaas_cliente_id text NOT NULL CHECK (char_length(asaas_cliente_id) BETWEEN 1 AND 100),
  asaas_assinatura_id text NOT NULL UNIQUE CHECK (char_length(asaas_assinatura_id) BETWEEN 1 AND 100),
  valor_centavos integer NOT NULL CHECK (valor_centavos > 0),
  situacao text NOT NULL CHECK (situacao IN ('aguardando_pagamento', 'ativa', 'cancelada')),
  fatura_url text CHECK (fatura_url IS NULL OR fatura_url ~ '^https://'),
  -- Último dia com o Pro pago (PLA-44); nulo até o primeiro pagamento confirmado.
  pago_ate date,
  -- A cobrança cujo pagamento deu o Pro atual (estorno dela derruba o Pro, PLA-47).
  cobranca_pro_id text,
  -- `dateCreated` do último evento que teve efeito (PLA-48), em São Paulo convertido para timestamptz.
  ultimo_evento_em timestamptz,
  criada_por uuid NOT NULL REFERENCES contas (id),
  criada_em timestamptz NOT NULL,
  CONSTRAINT assinaturas_ativa_tem_pago_ate CHECK (situacao <> 'ativa' OR pago_ate IS NOT NULL)
);

-- PLA-33, PLA-43: uma assinatura pendente ou ativa por grupo; a cancelada não conta.
CREATE UNIQUE INDEX assinaturas_uma_vigente ON assinaturas (grupo_id)
  WHERE situacao IN ('aguardando_pagamento', 'ativa');
CREATE INDEX assinaturas_grupo_criada ON assinaturas (grupo_id, criada_em);

CREATE TABLE eventos_asaas (
  -- O `id` do evento do Asaas (PLA-42): o reenvio do mesmo evento morre aqui.
  id text PRIMARY KEY CHECK (char_length(id) BETWEEN 1 AND 100),
  evento text NOT NULL CHECK (char_length(evento) BETWEEN 1 AND 100),
  data_criacao timestamptz,
  cobranca_id text,
  assinatura_id text,
  status text,
  valor_centavos integer,
  recebido_em timestamptz NOT NULL,
  -- O que o evento fez: `ativar`, `inadimplente`, `cancelar` ou `nenhum:<motivo>` (T4); nulo enquanto não aplicado.
  efeito text
);
CREATE INDEX eventos_asaas_assinatura ON eventos_asaas (assinatura_id, data_criacao);
CREATE INDEX eventos_asaas_cobranca ON eventos_asaas (cobranca_id, evento);

ALTER TABLE assinaturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE assinaturas FORCE ROW LEVEL SECURITY;
ALTER TABLE eventos_asaas ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos_asaas FORCE ROW LEVEL SECURITY;

-- pelada_app lê as assinaturas só com conta no contexto e do grupo visível (o slug público não lê, PLA-09). Sem
-- policy de INSERT, UPDATE ou DELETE: além de não ter grant, nada passaria.
CREATE POLICY assinaturas_ler ON assinaturas FOR SELECT TO pelada_app
  USING (app_conta_id() IS NOT NULL AND grupo_id IN (SELECT grupos_visiveis()));
GRANT SELECT ON assinaturas TO pelada_app;

-- eventos_asaas: nenhuma policy nem grant para pelada_app.

CREATE POLICY assinaturas_backup ON assinaturas FOR SELECT TO pelada_backup USING (true);
CREATE POLICY eventos_asaas_backup ON eventos_asaas FOR SELECT TO pelada_backup USING (true);
GRANT SELECT ON assinaturas, eventos_asaas TO pelada_backup;
