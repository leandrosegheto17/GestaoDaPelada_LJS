# Planos e cobrança — Especificação

> Feature 7 de 8 do roteiro (AD-001, AD-015). **Rascunho, aguardando aprovação do usuário.** Fluxo 2, fase 4. Entradas: `.specs/produto/necessidade.md` §3 a §6 (D2), `.specs/projeto/roadmap.md` linha 7, AD-002, AD-003, AD-004, AD-015 e AD-023 de `.specs/STATE.md`. O LJS não tem spec desta feature (nunca começou): a base é a decisão D2 de `GestaoDaPelada_LJS/.specs/produto/analise-legado.md` §8, o `decisao.md` do LJS e o que as specs do LJS adiaram para cá (`conta-e-acesso/spec.md:29`, `grupos-e-elenco/spec.md:33`, `partidas-e-ranking/spec.md:38` @ `c6dc82c`). Documentação do Asaas consultada em 2026-11-04 (fontes na seção Assumptions).

## Problem Statement

O produto tem dois planos (D2), mas nada no banco os aplica: a coluna `grupos.situacao_comercial` existe desde a linha de base (`1792843200000_linha-de-base.sql:72-78`), todo grupo nasce `uso_proprio` e "não muda nada no app" (mockup `t28-grupo-dono--sucesso`). Sem esta feature, qualquer grupo usa tudo de graça e para sempre, não há como pagar, e quem chega em `/` vê só a página provisória. A feature liga os planos Free e Pro ao grupo, dá 14 dias de trial Pro a todo grupo novo, cobra o Pro pelo Asaas (sandbox) com o webhook como fonte da verdade do pagamento, mostra o plano ao organizador e apresenta os planos na landing, sem apagar dado nenhum quando o grupo cai para o Free.

## Goals

- [ ] Um grupo novo nasce em trial Pro de 14 dias, cai sozinho para o Free no 15º dia e nada é apagado: o que passa do limite fica somente leitura.
- [ ] O organizador assina o Pro (R$ 9,90/mês) no sandbox do Asaas, paga a primeira cobrança e o grupo vira Pro só quando o webhook autenticado confirma o pagamento ("Bom o bastante" de `necessidade.md` §3).
- [ ] Os recursos Pro (simulador, financeiro, PDF e o sinal de push) e os limites do Free (1 grupo, 20 jogadores) são decididos por uma única regra de domínio, aplicada na API, e provados por teste em cada feature que trava.
- [ ] O grupo de teste do usuário continua Pro, sem cobrança (cortesia).
- [ ] `/` mostra a landing com os dois planos e os preços, sem perder a faixa "Sua conta foi excluída" da `conta-e-acesso`.

## Out of Scope

| Feature | Reason |
| ----------- | -------------- |
| Push e e-mail de cobrança ao organizador (cobrança gerada, pagamento confirmado, atraso) | Feature `notificacoes` (D3). Aqui só se grava o estado que ela vai ler |
| Push de ranking para quem assinou o link público | Feature `notificacoes`. Aqui só se expõe se o grupo tem o recurso `push` (PLA-07) |
| Asaas em produção (chave real, cobrança de verdade) | "Bom o bastante" é o sandbox (`necessidade.md` §3). A troca é um passo do runbook, com confirmação específica |
| Plano anual, cupom, desconto, outros preços | Fora do escopo do LJS (`decisao.md` linha 35) |
| Tela do dono da plataforma para mudar a situação comercial (t28 na versão do dono) | A `grupos-e-elenco` tirou a área do dono do escopo (`GestaoDaPelada_LJS/.specs/features/grupos-e-elenco/spec.md:34`, D1: dono só suporte) |
| Nota fiscal, split, antecipação, reembolso pelo app | Fora do produto; o estorno feito no painel do Asaas só é refletido pelo webhook (PLA-46) |
| Guardar cartão ou dado de cartão no app | A cobrança vai com `billingType` `UNDEFINED`: a pessoa escolhe Pix, boleto ou cartão na fatura do próprio Asaas (PLA-34) |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | --------------- | --------- | ---------- |
| Planos e preço | Free: 1 grupo, até 20 jogadores, partidas e ranking (inclusive o público). Pro: R$ 9,90/mês por grupo (990 centavos), jogadores ilimitados, simulador, financeiro, PDF e push. Trial Pro de 14 dias sem cartão | D2 (`analise-legado.md` §8, `necessidade.md:39`) | y |
| Onde o plano mora no banco | Reaproveitar `grupos.situacao_comercial` e `grupos.trial_inicio` (linha de base). Os 5 valores do CHECK bastam: `uso_proprio` = cortesia Pro, `trial`, `ativo` = Pro pago, `inadimplente`, `cancelado`. O Free não é um valor: é o que sobra (trial vencido, inadimplente, cancelado). Tabelas novas só para a assinatura do Asaas e os eventos do webhook, por migração aditiva com timestamp > `1792844520000` (AD-003) | O schema já tem as colunas e o CHECK `grupos_trial`; a `grupos-grants-coluna` já tirou da `pelada_app` o UPDATE dessas colunas, de propósito para esta feature (`1792844400000_grupos-grants-coluna.sql:4-7`) | n |
| Quem tem cortesia | Só o grupo de teste do usuário, identificado pelo slug numa constante da migração desta feature, fica `uso_proprio` (cortesia Pro permanente). Grupo criado depois nasce `trial`. [A ESCLARECER: slug do grupo de teste, a ler na main do Neon antes do design] | Decisão do usuário (2026-11-04); `necessidade.md:80`. Evita cortesia para grupos criados nos testes da prévia, que grava no banco de produção (AD-015 de 2026-11-04) | y |
| Demais grupos `uso_proprio` na migração | Passam a `trial` com `trial_inicio` = data da migração (SP): ganham os 14 dias e depois caem para o Free, sem perder dado | Decisão do usuário (2026-11-04). Consequência da cortesia só por slug: `uso_proprio` passa a significar cortesia e não pode ficar em grupo de teste da prévia | y |
| Contagem do trial | `trial_inicio` = data de criação no fuso `America/Sao_Paulo`; o grupo é Pro enquanto a data de hoje (SP) for menor que `trial_inicio` + 14 dias. Criado em 01/11, último dia Pro 14/11, Free em 15/11 | `trial_inicio` é `date`; fuso do produto (`necessidade.md:42`) | n |
| Trial por grupo ou por conta | Por grupo: todo grupo novo ganha o seu trial | D2 diz "trial Pro de 14 dias" e a assinatura é por grupo (D1). Risco aceito: criar grupo novo renova o trial | y |
| Limite "1 grupo" do Free | Conta pela criadora (`grupos.criado_por`), entre os grupos não arquivados dela que estão no Free. Grupo em trial, Pro ou cortesia não conta. Passando de 1, o mais antigo segue editável e os demais ficam somente leitura | D1: quem cria é a organizadora e quem paga; os admins convidados entram por vínculo | y |
| Limite "20 jogadores" do Free e o excedente | Conta os jogadores **ativos** (período aberto). Com mais de 20 ativos no Free, o grupo inteiro fica somente leitura (ranking público continua) até ficar com 20 ou assinar o Pro, exceto inativar jogador, que é sempre permitido | D2 diz só "o excedente fica somente leitura"; escolher quais jogadores travam quebraria presença e ranking. Ver Perguntas | y |
| Financeiro e escalações no Free | Os dados de financeiro e as escalações confirmadas do tempo de Pro seguem visíveis; escrever e simular exigem Pro | "Sem apagar dados, e o excedente fica somente leitura" (D2) | y |
| Inadimplência | `PAYMENT_OVERDUE` leva o grupo a `inadimplente`, que vale como Free na hora, sem carência. O pagamento atrasado (`PAYMENT_CONFIRMED` ou `PAYMENT_RECEIVED`) volta a `ativo` | D2 ("ao expirar, cai para Free"). Carência não está definida em fonte nenhuma | y |
| Cancelamento | O organizador cancela em Meu plano; o app remove a assinatura no Asaas (`DELETE /v3/subscriptions/{id}`, que apaga as cobranças pendentes) e o grupo segue Pro até o próximo vencimento já pago; depois vira Free | Prática comum; a fonte não define. Ver Perguntas | y |
| Quem assina e cancela | Só a criadora do grupo (`criado_por`), que é a responsável pela assinatura; os demais admins veem Meu plano sem os botões. A `notificacoes` manda os avisos de cobrança só a ela | Decisão do usuário (2026-11-04); mesmo padrão do arquivar (`1792844520000_grupos-arquivar-so-criadora.sql`) | y |
| Primeiro vencimento | Hoje (SP): a assinatura gera a primeira cobrança na hora e o app leva a pessoa à fatura (`invoiceUrl`). Em trial, o grupo segue em trial até o pagamento confirmar | Mais simples de provar no sandbox. Alternativa: vencer no fim do trial | y |
| CPF do pagador | O Asaas exige `name` e `cpfCnpj` para criar o cliente (referência "Criar novo cliente", consultada em 2026-11-04). O app pede o CPF no formulário de assinatura, valida os dígitos, envia ao Asaas e **não guarda** o CPF; guarda só o id do cliente no Asaas | LGPD: dado pessoal mínimo (`necessidade.md` §5). Ver Perguntas | y |
| Forma de pagamento | `billingType` `UNDEFINED`, `cycle` `MONTHLY`, `value` 9.90, `externalReference` = id do grupo: a pessoa escolhe Pix, boleto ou cartão na fatura do Asaas | Referência "Criar nova assinatura" (2026-11-04): `UNDEFINED`, `BOLETO`, `CREDIT_CARD` e `PIX` aceitos; obrigatórios `customer`, `billingType`, `value`, `nextDueDate`, `cycle`. O app não toca dado de cartão | n |
| Ambiente do Asaas | Só o sandbox (`https://api-sandbox.asaas.com/v3`), com a chave no header `access_token`. A URL base e a chave são configuração, nunca código | Página "Sandbox" e referência da API (2026-11-04); `necessidade.md` §3 | y |
| Autenticação do webhook | Webhook configurado com `authToken`; o Asaas manda o valor no header `asaas-access-token` e a API compara com o segredo `ASAAS_WEBHOOK_TOKEN` | Página "Receba eventos do Asaas no seu endpoint de Webhook" (2026-11-04): o token tem de 32 a 255 caracteres e não pode ser a chave de API. O Asaas não assina o corpo | y |
| Entrega do webhook | Pelo menos uma vez, sem ordem garantida; só HTTP 200 conta como entrega; 15 falhas seguidas pausam a fila e eventos guardados há mais de 14 dias somem. Idempotência pelo `id` do evento, persistir antes de responder 200 e ignorar campo desconhecido | Páginas "Receba eventos…", "Webhook para cobranças" e "Fila pausada" (2026-11-04) | y |
| Limites da API do Asaas | 25 mil requisições em 12 h, 50 GET concorrentes, 429 com `RateLimit-Limit`, `RateLimit-Remaining` e `RateLimit-Reset`; o limite por endpoint não é publicado | Página "Requisições bloqueadas por ausência de controle de limites" (2026-11-04) | y |
| Rotas novas | Landing em `/` (AD-023); Meu plano em `/app/grupos/:grupoId/plano` (PREMISSA: o `telas.json` não tem a rota); API em `/api/grupos/:grupoId/plano`, `/api/grupos/:grupoId/assinatura` e `POST /api/webhooks/asaas` | Padrão das rotas da `conta-e-acesso` (AD-017, AD-022) | n |
| Resposta da API para recurso Pro no Free | 403 com `{"erro":"plano_pro","recurso":"<recurso>"}`; escrita bloqueada pelo excedente: 403 com `{"erro":"somente_leitura","motivo":"limite_grupos"|"limite_jogadores"}` | Um código só por motivo, para a tela e o teste reconhecerem | n |
| Contratos das features 3 a 6 | O simulador (determinístico) e o financeiro chegam liberados para todo grupo, com a regra de plano num único ponto da API que esta feature liga (`recursoLiberado`, PLA-07). No Free: simular bloqueado; financeiro com escrita bloqueada e leitura aberta. As demais rotas travadas (grupos, jogadores, partidas, PDF) vêm das specs do LJS (`grupos-e-elenco`, `partidas-e-ranking` @ `c6dc82c`) e são conferidas no design contra o `tasks.md` da feature dona (AD-015: "só o delta") | Decisão registrada no planejamento das features 5 e 6 (informada pelo coordenador em 2026-11-04) | y |
| Telas sem mockup | Não há mockup de módulo. Landing, Meu plano, aviso de recurso Pro e faixa de somente leitura seguem o estilo das demais telas (componentes e tokens do guia em `.specs/mockup/`), sem comparação visual nelas (AD-064) | Decisão do usuário (2026-11-04) | y |

**Open questions:** as linhas com `Confirmed? = n` acima (contagem do trial, onde o plano mora, rotas e códigos de resposta) e o `[A ESCLARECER]` do slug do grupo de teste, lido na `main` do Neon antes do design por consulta só leitura, com confirmação do usuário na hora.

---

## User Stories

### P1: Plano efetivo do grupo ⭐ MVP

**User Story**: Como organizador, quero que o app saiba a qualquer momento se o meu grupo está no Free, no trial, no Pro ou em cortesia, para que os recursos liberados sejam sempre os do plano certo.

**Why P1**: Todas as travas e telas desta feature e da `notificacoes` dependem dessa resposta.

**Acceptance Criteria**:

1. The pacote `backend/dominio` SHALL ter uma única função pura `planoEfetivo(situacaoComercial, trialInicio, pagoAte, hoje)`, sem relógio nem I/O, que devolve `cortesia`, `trial`, `pro` ou `free`, e um teste SHALL falhar se outro módulo decidir o plano sem chamá-la. [PLA-01]
2. WHEN a situação é `uso_proprio` THEN `planoEfetivo` SHALL devolver `cortesia`, com os mesmos recursos do Pro e sem data de fim. [PLA-02]
3. WHILE a situação é `trial` e a data de hoje em `America/Sao_Paulo` é menor que `trial_inicio` + 14 dias THEN `planoEfetivo` SHALL devolver `trial`; no 15º dia SHALL devolver `free`. [PLA-03]
4. WHEN a situação é `ativo` THEN `planoEfetivo` SHALL devolver `pro`; WHEN é `inadimplente` THEN SHALL devolver `free`; WHEN é `cancelado` THEN SHALL devolver `pro` até `pagoAte` (inclusive) e `free` depois. [PLA-04]
5. The domínio SHALL definir os recursos por plano numa tabela só: `free` = partidas e ranking (inclusive o público), até 1 grupo por criadora e 20 jogadores ativos; `trial`, `pro` e `cortesia` = jogadores ilimitados, `simulador`, `financeiro`, `pdf` e `push`. [PLA-05]
6. The domínio SHALL guardar o preço do Pro como inteiro em centavos (`990`), e a conversão para reais SHALL acontecer só na fronteira com o Asaas (`9.90`), com teste de ida e volta sem arredondamento. [PLA-06]
7. The API SHALL expor ao restante do backend uma função `recursoLiberado(grupoId, recurso)` que lê a situação no banco e chama `planoEfetivo`, é o único ponto da regra de plano na API (o simulador e o financeiro já chamam esse ponto, liberado para todos antes desta feature, e esta feature o liga), usada por todas as travas desta spec e pela `notificacoes` para o recurso `push`. [PLA-07]
8. WHEN um admin abre `GET /api/grupos/:grupoId/plano` THEN a API SHALL responder 200 com `plano`, `situacao`, `trialFimEm` (data, só em trial), `pagoAte` (data, quando houver), `jogadoresAtivos`, `limiteJogadores` (`20` ou `null`), `somenteLeitura` (com o motivo), `recursos` e `podeAssinar` (verdadeiro só para a criadora). [PLA-08]
9. IF quem chama `GET /api/grupos/:grupoId/plano` não é admin do grupo THEN a API SHALL responder 404, igual a grupo inexistente, sem revelar a situação comercial. [PLA-09]

**Independent Test**: testes de domínio com tabela de casos (cada situação × hoje antes, no e depois do fim do trial e de `pagoAte`) e um teste de rota com dois grupos de contas diferentes.

---

### P1: Trial e cortesia no banco ⭐ MVP

**User Story**: Como organizador, quero que o grupo que eu criar já venha com 14 dias de Pro sem cartão, e como dono do app quero que o grupo de teste continue Pro sem cobrança.

**Why P1**: Sem isso, todo grupo novo nasce `uso_proprio`, que agora significa cortesia: o Pro ficaria de graça para todos.

**Acceptance Criteria**:

1. WHEN uma conta cria um grupo THEN a `grupo_criar` SHALL gravar `situacao_comercial = 'trial'` e `trial_inicio` = data de hoje em `America/Sao_Paulo`, na mesma transação, por migração aditiva que redefine a função sem mudar a assinatura nem o retorno. [PLA-10]
2. WHEN a migração desta feature roda THEN ela SHALL manter `uso_proprio` (cortesia) só no grupo do slug do grupo de teste, SHALL passar os demais grupos `uso_proprio` a `trial` com `trial_inicio` = data da migração em `America/Sao_Paulo`, SHALL não alterar nenhuma outra coluna, e SHALL manter a contagem de linhas de toda tabela; IF não existe grupo com esse slug THEN a migração SHALL abortar sem alterar nada. [PLA-11]
3. The coluna `grupos.situacao_comercial` SHALL manter o default `uso_proprio` (trocá-lo por `trial` violaria o CHECK `grupos_trial` sem `trial_inicio`), a `grupo_criar` SHALL ser o único caminho de criação de grupo, e um teste SHALL falhar se a `pelada_app` conseguir inserir em `grupos` direto. [PLA-12]
4. The `pelada_app` SHALL continuar sem UPDATE em `situacao_comercial` e `trial_inicio` (`1792844400000_grupos-grants-coluna.sql`), e toda mudança de situação SHALL passar por função `SECURITY DEFINER` com `search_path` fixo, uma por transição, com `REVOKE ALL FROM PUBLIC` e `EXECUTE` só para a `pelada_app`. As do webhook rodam sem conta na sessão e SHALL só aceitar ids de assinatura já gravados na tabela de assinaturas. [PLA-13]
5. WHEN uma função muda a situação comercial de um grupo THEN ela SHALL gravar em `auditoria` a ação (`plano_trial_iniciado`, `plano_assinado`, `plano_ativado`, `plano_inadimplente`, `plano_cancelado`), o grupo, a situação de antes e a de depois, com `autor_tipo` `conta` quando vem da sessão e `infraestrutura` quando vem do webhook. [PLA-14]

**Independent Test**: no Postgres local, criar um grupo pela API e ler `situacao_comercial` e `trial_inicio`; rodar a migração sobre um dump com um grupo `uso_proprio` e conferir que ele segue `uso_proprio` e que a contagem de linhas não muda.

---

### P1: Limites do Free e excedente somente leitura ⭐ MVP

**User Story**: Como organizador no Free, quero continuar vendo tudo o que o grupo já tem, e saber por que não consigo editar, para decidir entre ajustar o grupo ou assinar o Pro.

**Why P1**: É a regra de D2 que impede o Free de virar Pro de graça, sem apagar dado nenhum.

**Acceptance Criteria**:

1. WHILE o grupo está no plano `free` e tem mais de 20 jogadores ativos THEN a API SHALL recusar com 403 `somente_leitura` (`limite_jogadores`) toda escrita do grupo (jogadores, habilidades, notas, partidas, presenças, pesos, dados do grupo), exceto inativar jogador. [PLA-15]
2. WHILE o grupo está no plano `free` e tem 20 jogadores ativos THEN a API SHALL recusar com 403 `somente_leitura` (`limite_jogadores`) cadastrar jogador novo e reativar jogador. [PLA-16]
3. WHILE a criadora tem mais de um grupo não arquivado no plano `free` THEN a API SHALL manter editável só o mais antigo (`criado_em`) e SHALL recusar com 403 `somente_leitura` (`limite_grupos`) toda escrita nos demais. [PLA-17]
4. The trava de somente leitura SHALL valer para todas as leituras como antes: nenhum dado SHALL ser apagado, escondido ou alterado quando o grupo cai para o Free. [PLA-18]
5. The ranking público `/g/:slug` SHALL seguir aberto e atualizado em qualquer plano, inclusive para grupo somente leitura. [PLA-19]
6. WHEN o grupo deixa de exceder o limite (inativou jogadores, assinou o Pro, outro grupo foi arquivado) THEN a próxima requisição SHALL já aceitar a escrita, sem passo manual. [PLA-20]
7. The trava SHALL ser decidida na API, antes de abrir a escrita no banco, a partir de `recursoLiberado` e da contagem lida na mesma transação, e a tela SHALL só refletir a resposta da API. [PLA-21]
8. WHILE o grupo está somente leitura THEN as telas do grupo SHALL mostrar uma faixa com o motivo ("Este grupo passou do limite do plano Free…") e o link para Meu plano, e SHALL desabilitar os botões de escrita. A faixa SHALL seguir os componentes e tokens do guia em `.specs/mockup/` (AD-064). [PLA-22]

**Independent Test**: um grupo de teste com 21 jogadores ativos e trial vencido recebe 403 em `POST` de partida e 200 em inativar jogador; depois de inativar um, a partida é aceita. Uma criadora com dois grupos Free só edita o mais antigo.

---

### P1: Recursos Pro travados no Free ⭐ MVP

**User Story**: Como organizador no Free, quero ver o que o Pro libera quando tento usá-lo, em vez de um erro, para entender o que estou deixando de ter.

**Why P1**: É a diferença entre os planos (D2).

**Acceptance Criteria**:

1. IF o grupo não tem o recurso `simulador` THEN as rotas de sortear e de confirmar escalação SHALL responder 403 `plano_pro` (`simulador`), e as escalações já confirmadas SHALL seguir legíveis. [PLA-23]
2. IF o grupo não tem o recurso `financeiro` THEN as rotas de escrita do financeiro (mensalidade, lançamento, configuração) SHALL responder 403 `plano_pro` (`financeiro`), e as leituras (saldo, mensalidades, lançamentos) SHALL seguir respondendo 200. [PLA-24]
3. IF o grupo não tem o recurso `pdf` THEN `GET /api/publico/:slug/pdf` SHALL responder 403 `plano_pro` (`pdf`), e a tela pública do ranking SHALL não mostrar "Exportar PDF". [PLA-25]
4. The registro de evento de uso `pdf_exportado` SHALL não ser gravado para grupo sem o recurso `pdf`. [PLA-26]
5. WHEN um admin abre uma tela de recurso Pro num grupo sem o recurso THEN a tela SHALL mostrar o aviso de recurso Pro com o preço "R$ 9,90/mês" e o botão para Meu plano, no lugar do formulário. A tela SHALL seguir os componentes e tokens do guia em `.specs/mockup/` (AD-064). [PLA-27]
6. The verificação de recurso SHALL ter, por rota travada, um teste em que o grupo Free recebe 403 e o mesmo grupo em trial, Pro e cortesia recebe a resposta normal. [PLA-28]

**Independent Test**: com o mesmo grupo, trocar a situação no banco local entre `trial` vencido, `ativo` e `uso_proprio` e chamar sortear, lançar mensalidade e o PDF público: 403 só no Free.

---

### P1: Assinatura Pro pelo Asaas (sandbox) ⭐ MVP

**User Story**: Como criadora do grupo, quero assinar o Pro por R$ 9,90/mês e pagar a primeira cobrança, para liberar tudo para o meu grupo.

**Why P1**: É o "Bom o bastante" do produto: assinatura Pro de ponta a ponta no sandbox.

**Acceptance Criteria**:

1. WHEN a criadora envia `POST /api/grupos/:grupoId/assinatura` com nome e CPF válidos THEN a API SHALL criar (ou reaproveitar) o cliente no Asaas com `name`, `cpfCnpj`, o e-mail da conta e `externalReference` = id da conta, e SHALL criar a assinatura com `billingType` `UNDEFINED`, `cycle` `MONTHLY`, `value` `9.90`, `nextDueDate` = hoje (SP), `description` com o nome do grupo e `externalReference` = id do grupo. [PLA-29]
2. WHEN o Asaas cria a assinatura THEN a API SHALL gravar na tabela de assinaturas o grupo, o id do cliente, o id da assinatura, o valor em centavos e a situação `aguardando_pagamento`, e SHALL responder 201 com o endereço da fatura da primeira cobrança. [PLA-30]
3. The criação da assinatura SHALL não mudar o plano do grupo: o grupo SHALL só virar `ativo` pelo webhook de pagamento confirmado (PLA-44). [PLA-31]
4. IF quem chama não é a criadora do grupo THEN a API SHALL responder 403, sem chamar o Asaas. [PLA-32]
5. IF o grupo já tem assinatura `aguardando_pagamento` ou `ativa` THEN a API SHALL responder 409 com o endereço da fatura pendente, sem criar outra assinatura no Asaas. [PLA-33]
6. The app SHALL não receber, trafegar nem guardar número de cartão: a forma de pagamento SHALL ser escolhida na fatura do Asaas. [PLA-34]
7. The app SHALL validar os dígitos do CPF antes de chamar o Asaas e SHALL não gravar o CPF no banco, em log, em auditoria nem no Sentry; o banco SHALL guardar só o id do cliente no Asaas. [PLA-35]
8. IF o Asaas responde erro, 429 ou não responde em até 10 s THEN a API SHALL responder 502 com "Não foi possível falar com o sistema de pagamento. Tente de novo em instantes.", SHALL não gravar assinatura pela metade e SHALL não repetir a chamada sozinha. [PLA-36]
9. The chave de API do Asaas (`ASAAS_API_KEY`), o token do webhook (`ASAAS_WEBHOOK_TOKEN`) e a URL base (`ASAAS_URL`) SHALL ser secrets ou variáveis do Worker, SHALL constar em `.env.example` só pelo nome, e um teste SHALL falhar se aparecer chave com o prefixo do Asaas (`$aact_`) no repositório. [PLA-37]
10. WHILE a v2 não tiver a decisão de produção do Asaas registrada em AD THEN o `deploy.yml` SHALL recusar `ASAAS_URL` diferente de `https://api-sandbox.asaas.com/v3`. [PLA-38]

**Independent Test**: no sandbox do Asaas, a criadora assina, abre a fatura, simula o pagamento no painel do sandbox e vê o grupo virar Pro em Meu plano. No CI, um servidor falso do Asaas cobre sucesso, 4xx, 429 e tempo esgotado.

---

### P1: Webhook do Asaas ⭐ MVP

**User Story**: Como dono do app, quero que o estado do pagamento venha só do Asaas, autenticado e sem efeito duplicado, para que ninguém vire Pro sem pagar e ninguém perca o Pro por um evento repetido ou fora de ordem.

**Why P1**: É a fonte da verdade do dinheiro; o Asaas entrega pelo menos uma vez e sem ordem garantida.

**Acceptance Criteria**:

1. IF `POST /api/webhooks/asaas` chega sem o header `asaas-access-token` ou com valor diferente de `ASAAS_WEBHOOK_TOKEN` (comparação em tempo constante) THEN a API SHALL responder 401, SHALL não gravar nada e SHALL não registrar o valor recebido em log. [PLA-39]
2. The rota do webhook SHALL usar o binding `LIMITE_WEBHOOK` (60/min, FUN-26) e responder 429 acima dele, e SHALL aceitar corpo de no máximo 64 KiB, recusando maior com 413. [PLA-40]
3. WHEN chega um evento autenticado THEN a API SHALL gravar o `id` do evento (chave única), o `event`, o `dateCreated`, o id da cobrança e da assinatura e o status, sem e-mail, nome ou CPF, e SHALL responder 200 depois de gravar. [PLA-41]
4. WHEN chega de novo um evento com `id` já gravado THEN a API SHALL responder 200 sem aplicar o efeito outra vez. [PLA-42]
5. WHEN dois envios do mesmo evento chegam ao mesmo tempo THEN só um SHALL aplicar o efeito, garantido pela chave única no banco. [PLA-43]
6. WHEN chega `PAYMENT_CONFIRMED` ou `PAYMENT_RECEIVED` de uma cobrança de assinatura conhecida THEN o sistema SHALL mudar o grupo para `ativo`, a assinatura para `ativa` e `pagoAte` para o vencimento da cobrança + 1 mês, numa só transação. Este é o critério que liga a assinatura ao Pro (citado em PLA-31). [PLA-44]
7. WHEN chega `PAYMENT_OVERDUE` da cobrança mais recente de uma assinatura ativa THEN o sistema SHALL mudar o grupo para `inadimplente`. [PLA-45]
8. WHEN chega `SUBSCRIPTION_DELETED` ou `SUBSCRIPTION_INACTIVATED` THEN o sistema SHALL mudar o grupo para `cancelado`, mantendo `pagoAte`. [PLA-46]
9. WHEN chega `PAYMENT_REFUNDED` ou `PAYMENT_CHARGEBACK_REQUESTED` da cobrança que deu o Pro atual THEN o sistema SHALL mudar o grupo para `inadimplente`. [PLA-47]
10. IF um evento chega com `dateCreated` anterior ao último evento já aplicado na mesma assinatura THEN o sistema SHALL gravá-lo e SHALL não regredir a situação (ex.: `PAYMENT_CREATED` atrasado não desfaz um `PAYMENT_RECEIVED`). [PLA-48]
11. IF o evento é de um tipo que o sistema não trata, ou de cobrança ou assinatura desconhecida THEN o sistema SHALL gravá-lo e responder 200, sem mudar plano nenhum. [PLA-49]
12. The leitura do corpo do webhook SHALL ignorar campos desconhecidos (sem `.strict()`), porque o Asaas acrescenta atributos, e SHALL recusar com 400 só corpo sem `id` ou `event`. [PLA-50]
13. IF a cobrança do evento tem valor diferente do valor da assinatura gravada (em centavos) THEN o sistema SHALL gravar o evento, SHALL não ativar o grupo e SHALL reportar o caso ao Sentry sem dado pessoal. [PLA-51]

**Independent Test**: no CI, uma suíte manda ao webhook: token errado, o mesmo evento duas vezes (sequencial e concorrente), `PAYMENT_RECEIVED` antes de `PAYMENT_CREATED`, evento desconhecido e corpo com campo novo; o estado final do grupo é conferido no banco. No sandbox, o pagamento simulado ativa o grupo.

---

### P1: Meu plano ⭐ MVP

**User Story**: Como admin do grupo, quero ver o plano, até quando ele vale e o que ele libera, e como criadora, quero assinar ou cancelar, para controlar o custo do grupo.

**Why P1**: É onde a assinatura começa e onde a pessoa vê o resultado do pagamento.

**Acceptance Criteria**:

1. WHEN um admin abre `/app/grupos/:grupoId/plano` THEN a tela SHALL mostrar o plano (Free, Trial Pro, Pro ou Cortesia), a data de fim do trial ("Trial Pro até dd/mm/aaaa") ou de `pagoAte`, os jogadores ativos contra o limite ("21 de 20 jogadores") e a lista de recursos com o que está liberado. A tela SHALL seguir os componentes e tokens do guia em `.specs/mockup/`, sem comparação visual (AD-064). [PLA-52]
2. WHERE quem abre é a criadora e o grupo não tem assinatura pendente nem ativa THEN a tela SHALL mostrar "Assinar Pro: R$ 9,90/mês" com o formulário de nome e CPF; ao enviar com sucesso, SHALL abrir a fatura do Asaas. [PLA-53]
3. WHILE a assinatura está `aguardando_pagamento` THEN a tela SHALL mostrar "Aguardando a confirmação do pagamento" com o link para a fatura, e SHALL atualizar o plano ao reabrir a tela. [PLA-54]
4. WHERE quem abre é a criadora e a assinatura está ativa THEN a tela SHALL mostrar "Cancelar assinatura" com confirmação ("O grupo continua Pro até dd/mm/aaaa"); ao confirmar, a API SHALL remover a assinatura no Asaas, gravar `cancelado` e manter `pagoAte`. [PLA-55]
5. IF o cancelamento no Asaas falha THEN a API SHALL responder 502 e SHALL manter o grupo `ativo`, sem gravar `cancelado`. [PLA-56]
6. WHERE quem abre não é a criadora THEN a tela SHALL mostrar o plano sem os botões de assinar e cancelar, com o texto "Só quem criou o grupo pode assinar ou cancelar". [PLA-57]
7. WHEN o grupo é cortesia THEN a tela SHALL mostrar "Cortesia: Pro sem cobrança" e SHALL não mostrar assinar nem cancelar. [PLA-58]
8. The menu do grupo SHALL ter o item "Meu plano" para todo admin. [PLA-59]
9. The escritas de `/api/grupos/:grupoId/assinatura` SHALL usar o `LIMITE_ESCRITA` (60/min por conta) e SHALL exigir sessão válida. [PLA-60]

**Independent Test**: com o servidor falso do Asaas no E2E, a criadora assina, o teste dispara o webhook de pagamento e a tela mostra Pro; um admin convidado vê o plano sem botões.

---

### P1: Landing com os planos ⭐ MVP

**User Story**: Como visitante, quero entender o que é o Gestão da Pelada e quanto custa, para decidir criar a conta.

**Why P1**: AD-023 trouxe a landing para esta feature; hoje `/` é a página provisória.

**Acceptance Criteria**:

1. WHEN alguém sem sessão abre `/` THEN a tela SHALL mostrar o nome do produto, o que ele resolve, os dois planos lado a lado com os recursos de cada um, "Grátis" no Free, "R$ 9,90/mês por grupo" no Pro, "14 dias de Pro grátis, sem cartão", e os botões "Criar conta" (`/cadastro`) e "Entrar" (`/entrar`). A tela SHALL seguir os componentes e tokens do guia em `.specs/mockup/`, sem comparação visual (AD-064). [PLA-61]
2. The preços e os recursos da landing SHALL vir da mesma tabela do domínio de PLA-05 e PLA-06, e um teste SHALL falhar se a landing mostrar valor diferente de 990 centavos formatado. [PLA-62]
3. WHEN `/` abre com `?aviso=conta-excluida` THEN a landing SHALL mostrar a faixa "Sua conta foi excluída", mantendo o ACE-28 da `conta-e-acesso` (hoje sobre a página provisória). [PLA-63]
4. WHEN alguém com sessão válida abre `/` THEN o app SHALL levar a pessoa a `/app`. [PLA-64]
5. The landing SHALL funcionar sem chamar a API, ter links para `/termos` e `/privacidade` no rodapé e passar na checagem de acessibilidade do E2E da fundação. [PLA-65]

**Independent Test**: E2E abre `/` sem sessão (planos e preços), com `?aviso=conta-excluida` (faixa) e com sessão (vai a `/app`).

---

### P2: Privacidade e termos com a cobrança

**User Story**: Como organizador, quero saber que dados vão para o Asaas, para assinar sabendo o que acontece com eles.

**Why P2**: LGPD (`necessidade.md` §5); não bloqueia a assinatura no sandbox.

**Acceptance Criteria**:

1. The página de privacidade SHALL citar o Asaas como operador da cobrança e listar os dados enviados (nome, CPF, e-mail) e o que o app guarda (só o id do cliente no Asaas). [PLA-66]
2. The termos SHALL descrever os planos, o trial de 14 dias, a queda para o Free sem apagar dados e o cancelamento, com o texto a partir da mesma tabela do domínio. [PLA-67]
3. WHEN a conta é excluída (fluxo da `conta-e-acesso`) e é criadora de grupo com assinatura ativa THEN o sistema SHALL recusar a exclusão com "Cancele a assinatura do grupo <nome> antes de excluir a conta". [PLA-68]

**Independent Test**: E2E abre `/privacidade` e `/termos` e confere os trechos; teste de rota tenta excluir a conta com assinatura ativa e recebe a recusa.

---

## Edge Cases

- WHEN o grupo com assinatura ativa é arquivado THEN o sistema SHALL recusar o arquivamento com "Cancele a assinatura antes de arquivar o grupo", para não cobrar grupo arquivado. [PLA-69]
- IF o banco tem um grupo `trial` com `trial_inicio` no futuro (relógio ou dado errado) THEN `planoEfetivo` SHALL devolver `trial` e o fim do trial SHALL continuar sendo `trial_inicio` + 14 dias, sem erro. [PLA-70]
- WHEN o trial acaba na virada do dia em `America/Sao_Paulo` THEN o plano SHALL mudar à meia-noite de SP, não à de UTC, com teste nas 23:59 e 00:00 de SP. [PLA-71]
- IF o webhook fica fora do ar e o Asaas pausa a fila (15 falhas) THEN o runbook SHALL ter o passo de reativar a fila e reprocessar, e o app SHALL aceitar os eventos atrasados pela regra de PLA-48. [PLA-72]
- IF o `LIMITE_WEBHOOK` devolve 429 THEN o Asaas conta falha e reenvia; um teste SHALL provar que o reenvio do mesmo evento depois do 429 é aplicado uma vez só. [PLA-73]
- WHEN a criadora assina e o pagamento só confirma depois do fim do trial THEN o grupo SHALL passar por `free` (somente leitura, se exceder) e voltar a Pro no webhook, sem perder dado. [PLA-74]

---

## Implicit-requirement sweep

| Dimensão | Cobertura |
|---|---|
| Validação de entrada e limites | PLA-35 (CPF), PLA-40 (tamanho do corpo), PLA-50 (corpo do webhook), PLA-15 a PLA-17 (limites do Free) |
| Falha e falha parcial | PLA-36 (Asaas fora), PLA-56 (cancelar falha), PLA-44 (transação única), PLA-74 |
| Idempotência e repetição | PLA-42, PLA-43, PLA-33 (assinatura duplicada), PLA-73 |
| Fronteiras de auth e rate limit | PLA-09, PLA-32, PLA-39, PLA-40, PLA-60, PLA-13 (funções `SECURITY DEFINER`) |
| Concorrência e ordem | PLA-43 (evento concorrente), PLA-48 (fora de ordem), PLA-21 (contagem na mesma transação) |
| Ciclo de vida dos dados | PLA-18 (nada apagado no Free), PLA-11 (cortesia preservada), PLA-68 e PLA-69 (exclusão e arquivamento com assinatura), PLA-35 (CPF não guardado) |
| Observabilidade | PLA-14 (auditoria), PLA-51 (Sentry sem dado pessoal), PLA-72 (runbook da fila pausada) |
| Falha de dependência externa | PLA-36, PLA-56, PLA-72, PLA-38 (só sandbox) |
| Integridade de transições de estado | PLA-02 a PLA-04 (plano efetivo), PLA-44 a PLA-48 (máquina de estado da assinatura) |
| Dinheiro | PLA-06 (centavos inteiros), PLA-51 (valor divergente) |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----------- | ------ | ------- |
| PLA-01 | P1: Plano efetivo | Design | Pending |
| PLA-02 | P1: Plano efetivo | Design | Pending |
| PLA-03 | P1: Plano efetivo | Design | Pending |
| PLA-04 | P1: Plano efetivo | Design | Pending |
| PLA-05 | P1: Plano efetivo | Design | Pending |
| PLA-06 | P1: Plano efetivo | Design | Pending |
| PLA-07 | P1: Plano efetivo | Design | Pending |
| PLA-08 | P1: Plano efetivo | Design | Pending |
| PLA-09 | P1: Plano efetivo | Design | Pending |
| PLA-10 | P1: Trial e cortesia | Design | Pending |
| PLA-11 | P1: Trial e cortesia | Design | Pending |
| PLA-12 | P1: Trial e cortesia | Design | Pending |
| PLA-13 | P1: Trial e cortesia | Design | Pending |
| PLA-14 | P1: Trial e cortesia | Design | Pending |
| PLA-15 | P1: Limites do Free | Design | Pending |
| PLA-16 | P1: Limites do Free | Design | Pending |
| PLA-17 | P1: Limites do Free | Design | Pending |
| PLA-18 | P1: Limites do Free | Design | Pending |
| PLA-19 | P1: Limites do Free | Design | Pending |
| PLA-20 | P1: Limites do Free | Design | Pending |
| PLA-21 | P1: Limites do Free | Design | Pending |
| PLA-22 | P1: Limites do Free | Design | Pending |
| PLA-23 | P1: Recursos Pro | Design | Pending |
| PLA-24 | P1: Recursos Pro | Design | Pending |
| PLA-25 | P1: Recursos Pro | Design | Pending |
| PLA-26 | P1: Recursos Pro | Design | Pending |
| PLA-27 | P1: Recursos Pro | Design | Pending |
| PLA-28 | P1: Recursos Pro | Design | Pending |
| PLA-29 | P1: Assinatura | Design | Pending |
| PLA-30 | P1: Assinatura | Design | Pending |
| PLA-31 | P1: Assinatura | Design | Pending |
| PLA-32 | P1: Assinatura | Design | Pending |
| PLA-33 | P1: Assinatura | Design | Pending |
| PLA-34 | P1: Assinatura | Design | Pending |
| PLA-35 | P1: Assinatura | Design | Pending |
| PLA-36 | P1: Assinatura | Design | Pending |
| PLA-37 | P1: Assinatura | Design | Pending |
| PLA-38 | P1: Assinatura | Design | Pending |
| PLA-39 | P1: Webhook | Design | Pending |
| PLA-40 | P1: Webhook | Design | Pending |
| PLA-41 | P1: Webhook | Design | Pending |
| PLA-42 | P1: Webhook | Design | Pending |
| PLA-43 | P1: Webhook | Design | Pending |
| PLA-44 | P1: Webhook | Design | Pending |
| PLA-45 | P1: Webhook | Design | Pending |
| PLA-46 | P1: Webhook | Design | Pending |
| PLA-47 | P1: Webhook | Design | Pending |
| PLA-48 | P1: Webhook | Design | Pending |
| PLA-49 | P1: Webhook | Design | Pending |
| PLA-50 | P1: Webhook | Design | Pending |
| PLA-51 | P1: Webhook | Design | Pending |
| PLA-52 | P1: Meu plano | Design | Pending |
| PLA-53 | P1: Meu plano | Design | Pending |
| PLA-54 | P1: Meu plano | Design | Pending |
| PLA-55 | P1: Meu plano | Design | Pending |
| PLA-56 | P1: Meu plano | Design | Pending |
| PLA-57 | P1: Meu plano | Design | Pending |
| PLA-58 | P1: Meu plano | Design | Pending |
| PLA-59 | P1: Meu plano | Design | Pending |
| PLA-60 | P1: Meu plano | Design | Pending |
| PLA-61 | P1: Landing | Design | Pending |
| PLA-62 | P1: Landing | Design | Pending |
| PLA-63 | P1: Landing | Design | Pending |
| PLA-64 | P1: Landing | Design | Pending |
| PLA-65 | P1: Landing | Design | Pending |
| PLA-66 | P2: Privacidade e termos | Design | Pending |
| PLA-67 | P2: Privacidade e termos | Design | Pending |
| PLA-68 | P2: Privacidade e termos | Design | Pending |
| PLA-69 | Edge Cases | Design | Pending |
| PLA-70 | Edge Cases | Design | Pending |
| PLA-71 | Edge Cases | Design | Pending |
| PLA-72 | Edge Cases | Design | Pending |
| PLA-73 | Edge Cases | Design | Pending |
| PLA-74 | Edge Cases | Design | Pending |

**Coverage:** 74 total, 0 mapped to tasks, 74 unmapped ⚠️ (mapeamento na fase Tasks)

---

## Success Criteria

- [ ] Assinatura Pro de ponta a ponta no sandbox do Asaas: assinar, pagar a fatura simulada, webhook autenticado, grupo Pro em Meu plano.
- [ ] Suíte do webhook verde no CI: token, duplicidade sequencial e concorrente, fora de ordem, evento desconhecido, valor divergente.
- [ ] Grupo novo em trial; no 15º dia (SP) vira Free; o excedente fica somente leitura e nenhum dado some.
- [ ] O grupo de teste do usuário continua Pro (cortesia) depois da migração, com a contagem de linhas idêntica.
- [ ] Cada rota travada tem o teste Free × trial × Pro × cortesia.
- [ ] Landing em `/` com os planos e a faixa de conta excluída.
