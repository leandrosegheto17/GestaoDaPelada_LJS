# Planos e cobrança — Tarefas

**Modo**: enxuto
**Passada**: rascunho
**Base**: .specs/features/planos-e-cobranca/spec.md (aprovada em 2026-11-04), conferido em 2026-11-04
**Branch pai**: `feature/financeiro` (a `financeiro` ainda não estará integrada). Se já estiver integrada na `main` quando o `/executar` começar, a Branch pai passa a ser `main`.
**Feature**: 7 de 8 do roteiro (AD-001, AD-015). Requisitos `PLA-01` a `PLA-74`.

> Convenções: `S:` = `.specs/features/planos-e-cobranca/spec.md`; `F:` = `.specs/features/fundacao/tasks.md`; `FD:` = `.specs/features/fundacao/design.md`; `CA:` = `.specs/features/conta-e-acesso/tasks.md`; `GE:` = `.specs/features/grupos-e-elenco/tasks.md`; `PR:` = `.specs/features/partidas-e-ranking/tasks.md`; `SIM:` = `.specs/features/simulador/spec.md`; `FIN:` = `.specs/features/financeiro/spec.md`; `NOT:` = `.specs/features/notificacoes/spec.md`; `M:` = `ljs:backend/api/src/infraestrutura/db/migracoes/` (as 23 migrações que a fundação copia byte a byte, AD-003; `ljs:` = `C:\Leandro\Projetos\GestaoDaPelada_LJS` @ `e557292`). Nenhuma feature foi executada: os `arquivo:linha` de código ainda não existem e o molde é a tarefa que o cria (`GE:901` = a T22 da grupos-e-elenco). Do zero (AD-002). ADs desta feature: AD-087 a AD-097 e AD-113 a AD-115 (`.specs/STATE.md`). Nome de teste de tarefa de risco alto cita o `PLA-NN`.

## Delta

1. **Banco conferido** (`M:1792843200000_linha-de-base.sql:72-78`): `situacao_comercial` com os 5 valores e default `uso_proprio`, `trial_inicio date` e o CHECK `grupos_trial` (trial ⇔ `trial_inicio` não nulo). Consequência que a spec não diz: sair de `trial` para `ativo` exige `trial_inicio = NULL` no mesmo UPDATE (T16). `auditoria.autor_tipo` aceita `infraestrutura` sem conta (`M:…linha-de-base.sql:52,60`), o que serve ao webhook (PLA-14). A `pelada_app` não tem UPDATE nessas colunas (`M:1792844400000_grupos-grants-coluna.sql:6-7`): confere com PLA-13.
2. **Onde o plano mora (AD-056 era PREMISSA):** confirmado, com o que faltava (AD-088): `pago_ate`, a cobrança que deu o Pro e o último evento aplicado ficam em `assinaturas`; `eventos_asaas` sem `grupo_id`, com RLS `FORCE` e nenhum acesso direto da `pelada_app`. As tabelas novas precisam de `GRANT SELECT` e policy `USING (true)` explícitos para `pelada_backup_ro` (o grant de `M:1792843260000_roles.sql:35` só valeu para as tabelas de então, e sem a policy o dump sai vazio, AD-010).
3. **`grupo_criar` vigente é a de 7 parâmetros** (`PR:987`, AD-037); a de 6 é removida pela `simulador` (AD-048). PLA-10 redefine a de 7 com `CREATE OR REPLACE`, e `trial_inicio = p_hoje` (o Relógio da API, `GE:831`), porque o teste da T22 da PR (`PR:987`) reprova função que use `now()` para data (AD-087). A migração de dados (PLA-11) não é função: usa a data de São Paulo do momento da migração e não grava auditoria, para a contagem de linhas ficar igual.
4. **Leitura do plano por função** (AD-088): `plano_do_grupo` e `plano_grupos_da_criadora` (`SECURITY DEFINER`, só para grupo em `grupos_visiveis()`). Sem elas, admin convidado não enxerga os outros grupos da criadora (PLA-17), e o contexto do slug não lê `pago_ate` (PLA-25).
5. **Webhook fora do `X-Pelada`** (`CA:723` exige o cabeçalho em toda escrita de `/api/*`; o Asaas só manda `asaas-access-token`): `POST /api/webhooks/asaas` é a única exceção, autenticada pelo token (AD-093).
6. **Escopo da trava somente leitura** (AD-092): vale para grupo, jogadores, períodos, habilidades, notas, partidas e pesos. Ficam fora: inativar jogador (PLA-15), arquivar e reativar, admins e convites, plano e assinatura. Simulador e financeiro respondem `plano_pro` (FIN-50 já pede esse código), nunca `somente_leitura`.
7. **Contrato público muda** (AD-095): o `rankingPublico` (`PR:913`) ganha `pdfLiberado`, para a t01 esconder "Exportar PDF" (PLA-25) sem nova chamada.
8. **Fatura da primeira cobrança:** a resposta de criar assinatura não traz `invoiceUrl`; a API lê `GET /v3/subscriptions/{id}/payments` (AD-089). Se essa leitura falhar com a assinatura já criada no Asaas, a API a remove (`DELETE`, compensação) e responde 502 sem gravar nada (AD-114).
9. **Prova no sandbox** (Independent Test de S:164 e S:190) exige a prévia no ar, a chave e o webhook configurados no Asaas: é passo do usuário no `/preparar` Nível 2 e evidência do `/validar`. Aqui ela fica no CI com o Asaas falso (T30) e nas jornadas (T56). Sem tarefa de infraestrutura.
10. **Testes existentes que mudam** (autorizados pelo usuário em 2026-11-04, `## Autorizações` do `STATE.md`: mesma força, nenhuma asserção removida, motivo no commit): a auditoria do `grupo_criar` (`GE:397`, T2), o teste "libera todos" do ponto único (FIN-45 e SIM-68) e os testes da página provisória de `/` (`F:1545`, `F:1691`, `CA:1309`).

### Suposições sobre as features 3 a 6 (sem tasks.md da simulador e da financeiro ainda)

| ID | Suposição | Usada em |
|---|---|---|
| S-01 | O ponto único é `recursoLiberado(db, grupoId, recurso): Promise<boolean>` em `backend/api/src/aplicacao/plano/recurso-liberado.ts`, sempre `true`, chamado pelas rotas do simulador (SIM-68, `SIM:273`) e do financeiro (FIN-45, `FIN:183`). Se o nome ou o local for outro, vale o da feature dona e a T21 só o liga | T21, T25 |
| S-02 | Rotas do simulador: `POST …/simulador/previa`, `…/sugerir`, `…/avaliar` e `POST …/escalacoes` (`SIM:110,226,254,272`), e `GET …/simulador/contexto` | T25 |
| S-03 | Escritas do financeiro: `PUT …/financeiro/config`, `POST` e `DELETE …/pagamentos`, `POST`, `PUT` e `DELETE …/lancamentos`, `PATCH …/admins/:contaId/financeiro` (`FIN:61,102,108,124-128,147`); leitura `GET …/financeiro/mes` | T25 |
| S-04 | A última migração antes desta é da `financeiro` (AD-052); os nomes saem de `pnpm migracao:nova` (`F:883`) | T10 a T17 |
| S-05 | Telas: simulador em `/app/grupos/:grupoId/simulador` (AD-047), financeiro em `/app/grupos/:grupoId/financeiro` (AD-054), em `frontend/web/src/telas/simulador/` e `telas/financeiro/` (PREMISSA) | T50 |
| S-06 | `@pelada/web` pode importar `@pelada/dominio` (domínio puro, sem I/O, `F:385`); se não puder, a T52 acrescenta a dependência | T52, T54 |
| S-07 | A `notificacoes` lê os eventos de `eventos_asaas` e traduz `PAYMENT_CREATED`, `PAYMENT_CONFIRMED`/`RECEIVED` e `PAYMENT_OVERDUE` para os nomes de `NOT:38`; o aviso dela é único por (cobrança, tipo), então `eventos_asaas` guarda `cobranca_id` e `evento` em toda linha e a `notificacoes` confere o plano por `recursoLiberado(…, 'push')` ao assinar push. Contrato a manter: colunas `id`, `evento`, `data_criacao`, `cobranca_id`, `assinatura_id`, `status`, `valor_centavos` e o grupo pela assinatura | T2, T10, T15, T21 |

## Critérios

| ID | Resumo | Tarefa |
|---|---|---|
| PLA-01 | `planoEfetivo` puro e único; teste reprova decisão fora dele | T1, T8 |
| PLA-02 | `uso_proprio` = cortesia | T1 |
| PLA-03 | Trial até `trial_inicio` + 14 dias (SP); 15º dia é Free | T1 |
| PLA-04 | `ativo` = Pro; `inadimplente` = Free; `cancelado` = Pro até `pagoAte` | T1 |
| PLA-05 | Tabela única de recursos por plano | T2 |
| PLA-06 | Preço em centavos (990); reais só na fronteira do Asaas | T2, T29 |
| PLA-07 | `recursoLiberado` é o único ponto da regra na API | T20, T21 |
| PLA-08 | `GET …/plano` com os campos | T6, T24 |
| PLA-09 | Não admin: 404 | T24, T39 |
| PLA-10 | `grupo_criar` grava `trial` e `trial_inicio` | T13 |
| PLA-11 | Migração da cortesia por slug; aborta sem o slug | T9, T17, T18 |
| PLA-12 | Default `uso_proprio` mantido; `pelada_app` não insere em `grupos` | T0, T13 |
| PLA-13 | Mudança de situação só por função `SECURITY DEFINER`, uma por transição | T14, T15, T16 |
| PLA-14 | Auditoria de cada transição com antes e depois | T13, T14, T16 |
| PLA-15 | Free com mais de 20 ativos: escrita 403, salvo inativar | T5, T22, T28 |
| PLA-16 | Free com 20 ativos: cadastrar e reativar 403 | T5, T23 |
| PLA-17 | Criadora com mais de um grupo Free: só o mais antigo edita | T5, T12, T22 |
| PLA-18 | Nada apagado, escondido ou alterado no Free | T22, T28 |
| PLA-19 | Ranking público aberto em qualquer plano | T26, T28 |
| PLA-20 | Deixou de exceder: a próxima requisição aceita | T22 |
| PLA-21 | Trava na API, na mesma transação | T22, T23 |
| PLA-22 | Faixa de somente leitura e botões desabilitados | T43, T48, T49 |
| PLA-23 | Simulador no Free: 403 `plano_pro`; escalações legíveis | T25 |
| PLA-24 | Financeiro no Free: escrita 403, leitura 200 | T25 |
| PLA-25 | PDF público 403 no Free; t01 sem "Exportar PDF" | T26, T27, T51 |
| PLA-26 | `pdf_exportado` não gravado sem o recurso | T26 |
| PLA-27 | Aviso de recurso Pro com o preço e o botão | T42, T50 |
| PLA-28 | Por rota travada: Free 403, trial, Pro e cortesia normais | T25, T28 |
| PLA-29 | Criar cliente e assinatura no Asaas com os campos | T29, T32 |
| PLA-30 | Gravar a assinatura `aguardando_pagamento`; 201 com a fatura | T14, T31, T33 |
| PLA-31 | Assinar não muda o plano | T33 |
| PLA-32 | Quem não é a criadora: 403 sem chamar o Asaas | T33, T39 |
| PLA-33 | Já há assinatura pendente ou ativa: 409 com a fatura | T10, T32, T33 |
| PLA-34 | O app não toca em cartão | T29, T45 |
| PLA-35 | CPF validado e nunca guardado | T6, T29, T32, T45 |
| PLA-36 | Asaas com erro, 429 ou 10 s: 502 sem gravar nem repetir | T29, T32 |
| PLA-37 | Segredos só como nome; teste do prefixo `$aact_` | T40 |
| PLA-38 | `deploy.yml` recusa `ASAAS_URL` fora do sandbox | T40 |
| PLA-39 | Webhook sem token ou com token errado: 401 | T35 |
| PLA-40 | `LIMITE_WEBHOOK` e corpo de até 64 KiB | T35 |
| PLA-41 | Evento gravado antes do 200, sem dado pessoal | T15, T36 |
| PLA-42 | Evento repetido: 200 sem efeito | T15, T36 |
| PLA-43 | Envios simultâneos: um efeito só | T10, T37 |
| PLA-44 | Pagamento confirmado: `ativo`, `ativa` e `pagoAte` numa transação | T3, T4, T16, T36 |
| PLA-45 | Atraso da cobrança mais recente: `inadimplente` | T4, T16, T36 |
| PLA-46 | Assinatura apagada ou inativada: `cancelado`, mantém `pagoAte` | T4, T16, T36 |
| PLA-47 | Estorno da cobrança que deu o Pro: `inadimplente` | T4, T16, T36 |
| PLA-48 | Evento mais antigo que o último aplicado não regride | T4, T15, T37 |
| PLA-49 | Tipo ou id desconhecido: grava e 200 sem efeito | T4, T15, T36 |
| PLA-50 | Corpo tolerante; 400 só sem `id` ou `event` | T7, T35 |
| PLA-51 | Valor divergente: grava, não ativa, Sentry sem dado pessoal | T4, T36 |
| PLA-52 | Meu plano: plano, datas, jogadores e recursos | T44 |
| PLA-53 | Criadora sem assinatura: formulário e fatura | T45 |
| PLA-54 | Aguardando: texto e link da fatura | T46 |
| PLA-55 | Cancelar com confirmação; mantém `pagoAte` | T14, T34, T46 |
| PLA-56 | Falha no cancelamento: 502, segue `ativo` | T34 |
| PLA-57 | Não criadora: sem botões, com o texto | T44 |
| PLA-58 | Cortesia: texto, sem assinar nem cancelar | T44 |
| PLA-59 | Item "Meu plano" no menu do grupo | T47 |
| PLA-60 | Escritas da assinatura com `LIMITE_ESCRITA` e sessão | T33 |
| PLA-61 | Landing: produto, planos lado a lado, preços, botões | T52, T55 |
| PLA-62 | Preços da landing da tabela do domínio | T2, T52 |
| PLA-63 | Landing com a faixa "Sua conta foi excluída" | T52, T55 |
| PLA-64 | Com sessão, `/` leva a `/app` | T53, T55 |
| PLA-65 | Landing sem depender da API, rodapé e axe | T53, T55 |
| PLA-66 | Privacidade cita o Asaas e os dados | T54 |
| PLA-67 | Termos com planos, trial, queda e cancelamento | T54 |
| PLA-68 | Excluir conta com assinatura ativa: recusa | T38 |
| PLA-69 | Arquivar grupo com assinatura ativa: recusa | T38 |
| PLA-70 | `trial_inicio` no futuro: trial, sem erro | T1 |
| PLA-71 | Virada à meia-noite de SP, com 23:59 e 00:00 | T1, T24 |
| PLA-72 | Runbook da fila pausada; atrasados pela regra de PLA-48 | T37, T57 |
| PLA-73 | Reenvio depois do 429 aplicado uma vez | T37 |
| PLA-74 | Pagamento depois do fim do trial: passa pelo Free e volta | T37 |

Nenhum critério fica fora. Mudam de leitura pelas ADs: PLA-10 (`p_hoje`, AD-087), PLA-15 a PLA-17 (escopo, AD-092), PLA-23 (só os POST, AD-092), PLA-25 (`pdfLiberado`, AD-095), PLA-64 e PLA-65 (AD-094). Decididos pelo usuário: PLA-11 (banco vazio não faz nada, AD-113), PLA-36 (compensação, AD-114), PLA-68, PLA-69 e PLA-55 (pendente também bloqueia e pode ser cancelada, AD-115).

## Linha de base

- **Comando da suíte** (o de `.specs/projeto/testes.json` ao fim da fundação, `F:409`): `docker compose up -d --wait && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:checagens && pnpm --filter @pelada/web build && pnpm --filter @pelada/web e2e && pnpm --filter @pelada/web visual`.
- **Resultado hoje**: não roda. O `testes.json` é a dispensa temporária (repositório só com documentação) e as features 1 a 6 ainda não foram executadas.
- **Falhas preexistentes**: nenhuma conhecida. A linha de base é o gate final da `financeiro`; o `/executar` roda a suíte uma vez antes do lote 1 e registra o resultado aqui. A T0 caracteriza o que esta feature troca no banco e ainda não tem teste próprio.

## Test Coverage Matrix

> Gerada da Base, dos contratos das features 1 a 6 e das regras de teste do `.claude/CLAUDE.md`. Todo critério tem teste; nome de teste de tarefa de risco alto cita o `PLA-NN`.

| Camada | Tipo de teste exigido | Expectativa de cobertura | Padrão de local | Comando |
|---|---|---|---|---|
| Domínio (`backend/dominio/src/plano/`) | unit | Tabela de casos: cada situação × antes, no e depois do fim do trial e de `pagoAte`; 23:59 e 00:00 de SP; cada evento × cada estado da assinatura | `backend/dominio/test/plano/*.test.ts` | `pnpm --filter @pelada/dominio test` |
| Contrato | unit | CPF válido e inválido; corpo do webhook com campo novo; sem `id` ou `event` | `backend/contrato/test/*.test.ts` | `pnpm --filter @pelada/contrato test` |
| Banco: migrações, funções, RLS, grants | integration | Postgres local como `pelada_app` (`comoApp`, `F:909`); matriz abaixo; cada função com conta errada, sem conta e id desconhecido; rollback | `backend/api/test/banco/*.test.ts`, `backend/api/test/isolamento/*.test.ts` | `pnpm --filter @pelada/api test` |
| Repositórios e aplicação | integration | Cada caminho, auditoria na mesma transação, duas conexões para concorrência | `backend/api/test/repositorios/*.test.ts`, `backend/api/test/concorrencia/*.test.ts` | `pnpm --filter @pelada/api test` |
| Cliente do Asaas | unit | `fetch` falso: 2xx, 4xx, 429, 5xx, rede caída, mais de 10 s; corpo e log sem CPF | `backend/api/test/infraestrutura/asaas.test.ts` | `pnpm --filter @pelada/api test` |
| Middlewares e rotas | e2e | Pool `workerd` com Postgres local e relógio fixo: cada código da spec, Free × trial × Pro × cortesia por rota travada, 401, 404, 409, 413, 429, 502 | `backend/api/test/rotas/*.test.ts` | `pnpm --filter @pelada/api test` |
| Isolamento de rotas | e2e | Toda rota nova: conta do grupo A contra o B | `backend/api/test/isolamento/rotas.test.ts` | `pnpm --filter @pelada/api test` |
| Checagens | unit | Caso que passa e caso que falha | `backend/scripts/checagens/test/*.test.ts` | `pnpm test:checagens` |
| Ensaio da migração | integration | Dump da produção restaurado: contagem por tabela, schema, cortesia preservada | `backend/scripts/src/ensaio-migracao.ts` | `pnpm --filter @pelada/scripts ensaio` |
| Front: telas e componentes | unit | jsdom + Testing Library + axe: cada estado e cada texto da spec | `frontend/web/src/**/*.test.{ts,tsx}` | `pnpm --filter @pelada/web test` |
| Front: landing e jornadas | e2e | Playwright com `wrangler dev`, seed e Asaas falso; `boundingBox` para "lado a lado"; axe | `frontend/web/e2e/*.spec.ts` | `pnpm --filter @pelada/web e2e` |
| Documentação | none | Gate de build | — | gate de build |

Sem comparação visual nas telas desta feature (AD-064).

**Matriz política × comando** (como `pelada_app`; grupos A e B; contextos conta A criadora, conta C admin convidada de A, conta B, slug de A e sem contexto; cada célula é um teste que morre com a policy aberta `USING (true)`, sem `WITH CHECK` ou com grant a mais):

| Tabela ou função | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `assinaturas` | A e C só as de A; B zero; slug zero; sem contexto zero (T11) | recusado para todos, sem grant; só por `assinatura_registrar` (T11) | recusado, sem grant; `UPDATE` sem `WHERE` afeta 0 linhas (T11) | recusado, sem grant; `DELETE` sem `WHERE` afeta 0 linhas (T11) |
| `eventos_asaas` | zero para todos os contextos (T11) | recusado, sem grant (T11) | recusado, sem grant (T11) | recusado, sem grant; TRUNCATE recusado (T11) |
| `pelada_backup_ro` nas duas | lê tudo (T11) | recusado (T11) | recusado (T11) | recusado (T11) |
| `grupos` (colunas do plano) | inalterado (T0) | recusado (T0, PLA-12) | `situacao_comercial` e `trial_inicio` recusados (T0) | recusado (T0) |
| `plano_do_grupo` | conta com vínculo e slug do grupo: uma linha; B e sem contexto: zero (T12) | — | — | — |
| `plano_grupos_da_criadora` | A e C veem os grupos não arquivados da criadora de A, só colunas do plano; B zero; slug zero (T12) | — | — | — |
| `assinatura_registrar`, `assinatura_cancelar` | — | só a criadora, com conta; C, B e sem contexto recusados (T14) | idem (T14) | — |
| `asaas_evento_registrar` e as 3 de transição | — | sem conta aceita; com conta ou slug recusado; assinatura desconhecida sem efeito (T15, T16) | idem (T16) | — |
| `EXECUTE` | `PUBLIC` sem `EXECUTE` em nenhuma função nova; só `pelada_app` (T11, T16) | — | — | — |

## Gate Check Commands

| Nível do gate | Quando usar | Comando |
|---|---|---|
| Quick | Tarefas só com teste unitário, no pacote tocado | `pnpm --filter <pacote> test` |
| Full | Tarefas com integration ou e2e; exige o Postgres local | `docker compose up -d --wait && pnpm typecheck && pnpm test && pnpm test:checagens` |
| Build | Telas, documentação e o fim da feature | O comando da seção Linha de base |

## Execution Plan

As Phases rodam em ordem; dentro de cada uma, em sequência. Criticidade: Phases 1 a 15 **críticas** (67h), 16 a 21 **comuns** (24,5h). Total: 58 tarefas, 21 Phases, 91,5h. Lotes previstos (até 6h, Phases inteiras; o `progresso.py --lote` confirma): L1 = P1 + P2 (6h); L2 = P3 (3,5h); L3 = P4 (3,5h); L4 = P5 (4,5h); L5 = P6 (5,5h); L6 = P7 (5,5h); L7 = P8 (3h); L8 = P9 (5h); L9 = P10 (5h); L10 = P11 (4,5h); L11 = P12 (5h); L12 = P13 (5h); L13 = P14 (5,5h); L14 = P15 (5h), todos críticos; L15 = P16 (3,5h); L16 = P17 (5h); L17 = P18 (4h); L18 = P19 (4,5h); L19 = P20 + P21 (7,5h, lote final de 2 tarefas junto ao anterior), comuns. Lotes com tarefa de `Domínio: sim`: L1, L2, L5, L6, L8, L9, L11, L12, L13. Pausa do usuário: T9 (L4), antes da migração da cortesia; a T18 também pede o dump decifrado pelo usuário.

### Phase 1: Rede de proteção (crítica, 1,5h)

```
T0
```

### Phase 2: Domínio: plano efetivo, recursos e datas (crítica, 4,5h)

```
T1 → T2 → T3
```

### Phase 3: Domínio: eventos do Asaas e excedente (crítica, 3,5h)

```
T4 → T5
```

### Phase 4: Contrato e checagem do ponto único (crítica, 3,5h)

```
T6 → T7 → T8
```

### Phase 5: Slug do grupo de teste e tabelas novas (crítica, 4,5h)

```
T9 → T10 → T11
```

### Phase 6: Funções de leitura, trial e assinatura (crítica, 5,5h)

```
T12 → T13 → T14
```

### Phase 7: Funções do webhook e cortesia (crítica, 5,5h)

```
T15 → T16 → T17
```

### Phase 8: Ensaio e tipos (crítica, 3h)

```
T18 → T19
```

### Phase 9: Regra de plano na API (crítica, 5h)

```
T20 → T21 → T22
```

### Phase 10: Limite de jogadores, rota do plano e travas Pro (crítica, 5h)

```
T23 → T24 → T25
```

### Phase 11: PDF público e prova por rota (crítica, 4,5h)

```
T26 → T27 → T28
```

### Phase 12: Cliente do Asaas e repositório de assinaturas (crítica, 5h)

```
T29 → T30 → T31
```

### Phase 13: Assinar e cancelar (crítica, 5h)

```
T32 → T33 → T34
```

### Phase 14: Webhook (crítica, 5,5h)

```
T35 → T36 → T37
```

### Phase 15: Arquivar, excluir, isolamento e segredos (crítica, 5h)

```
T38 → T39 → T40
```

### Phase 16: Web: dados e componentes do plano (comum, 3,5h)

```
T41 → T42 → T43
```

### Phase 17: Web: Meu plano (comum, 5h)

```
T44 → T45 → T46
```

### Phase 18: Web: rota, menu e somente leitura nas telas (comum, 4h)

```
T47 → T48 → T49
```

### Phase 19: Web: avisos Pro, ranking público e landing (comum, 4,5h)

```
T50 → T51 → T52
```

### Phase 20: Web: rota da landing, termos e e2e (comum, 4h)

```
T53 → T54 → T55
```

### Phase 21: Jornadas e documentação (comum, 3,5h)

```
T56 → T57
```

## Task Breakdown

#### Phase 1: Rede de proteção

### T0: Caracterização da situação comercial e da `grupo_criar` antes da mudança

**What**: Caracterizar como `pelada_app`, antes de mudar: grupo criado pela `grupo_criar` de 7 parâmetros nasce `uso_proprio` com `trial_inicio` nulo; o default da coluna é `uso_proprio`; o CHECK `grupos_trial` recusa `trial` sem data e data sem `trial`; `INSERT` direto em `grupos` é recusado; `UPDATE` de `situacao_comercial` e `trial_inicio` é recusado; o `recursoLiberado` libera todo grupo (o teste de FIN-45 e SIM-68 continua verde). Evidência no fim desta tarefa.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/banco/plano-caracterizacao.test.ts`
**Depends on**: None
**Reuses**: método da skill `rede-de-protecao`; cenário de `GE:348` (T0); `M:1792843200000_linha-de-base.sql:72-78`; `M:1792844400000_grupos-grants-coluna.sql:6-7`; `grupo_criar` de `PR:987`
**Requirement**: PLA-12, PLA-13

**Done when**:

- [ ] Teste `PLA-12`: `INSERT INTO grupos` como `pelada_app` com conta no contexto é recusado; o default de `situacao_comercial` é `uso_proprio`
- [ ] Teste `PLA-13`: `UPDATE grupos SET situacao_comercial = 'ativo'` e `SET trial_inicio = …` como `pelada_app` dão 42501
- [ ] Teste: `grupo_criar` hoje grava `uso_proprio` e `trial_inicio` nulo (este teste é trocado na T13, com motivo no commit)
- [ ] `Evidência`: saída dos testes e a árvore em que rodaram, registradas aqui
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 2: Domínio: plano efetivo, recursos e datas

### T1: `planoEfetivo` e fim do trial

**What**: Função pura `planoEfetivo(situacaoComercial, trialInicio, pagoAte, hoje)` → `cortesia | trial | pro | free`, e `fimDoTrial(trialInicio)` (= `trialInicio` + 14 dias; o último dia Pro é o 14º), com datas `AAAA-MM-DD` de São Paulo recebidas de fora (sem relógio).
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/plano/plano-efetivo.ts`
**Depends on**: T0
**Reuses**: regra de domínio sem relógio (`GE:527`, AD-028); datas do domínio de `PR:457` (`backend/dominio/src/datas.ts`); AD-087; S:39
**Requirement**: PLA-01, PLA-02, PLA-03, PLA-04, PLA-70, PLA-71

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código: cada uma das 5 situações; hoje antes, igual e depois de `fimDoTrial` e de `pagoAte`; `trial_inicio` no futuro; `cancelado` sem `pagoAte`; virada do mês e do ano. Resultado não definido na Base = pare e pergunte
- [ ] Teste `PLA-03`: criado em 2026-11-01, `trial` até 2026-11-14 e `free` em 2026-11-15
- [ ] Teste `PLA-04`: `cancelado` com `pagoAte` 2026-12-10 é `pro` em 12-10 e `free` em 12-11; `inadimplente` é `free`
- [ ] Teste `PLA-70`: `trial_inicio` daqui a 3 dias devolve `trial`, sem erro
- [ ] Teste `PLA-71`: a função recebe a data de SP; a conversão 23:59 e 00:00 de SP é provada com o Relógio na T24
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T2: Tabela de recursos e preço em centavos

**What**: `RECURSOS_POR_PLANO` (`free`: partidas e ranking, `limiteJogadores` 20, `limiteGrupos` 1; `trial`, `pro`, `cortesia`: ilimitado, `simulador`, `financeiro`, `pdf`, `push`), `PRECO_PRO_CENTAVOS = 990`, `centavosParaReais`/`reaisParaCentavos` (só para a fronteira) e `formatarPreco(990)` = "R$ 9,90".
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/dominio/src/plano/recursos.ts`
**Depends on**: T1
**Reuses**: centavos inteiros do financeiro (FIN, `FIN:7`); exportação pelo índice do domínio (`backend/dominio/src/index.ts`, `GE:726`)
**Requirement**: PLA-05, PLA-06, PLA-62

**Done when**:

- [ ] Teste `PLA-05`: cada plano tem exatamente os recursos de S:77
- [ ] Teste `PLA-06`: `reaisParaCentavos(centavosParaReais(990)) === 990` e `centavosParaReais(990) === 9.9`, sem arredondamento, para 1 a 99.999 centavos
- [ ] Teste `PLA-62`: `formatarPreco(PRECO_PRO_CENTAVOS)` = "R$ 9,90"
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T3: `pagoAte` a partir do vencimento

**What**: `pagoAteDe(vencimento)` = vencimento + 1 mês, com o dia limitado ao último dia do mês (31/01 → 28/02 ou 29/02).
**Estimativa**: 1h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/plano/pago-ate.ts`
**Depends on**: T2
**Reuses**: datas do domínio (`PR:457`); AD-096
**Requirement**: PLA-44

**Done when**:

- [ ] Casos limite listados antes do código: 31/01, 29/02 em ano bissexto, 30/11, 31/12
- [ ] Teste `PLA-44`: 2026-11-04 → 2026-12-04; 2027-01-31 → 2027-02-28; 2028-01-31 → 2028-02-29; 2026-12-31 → 2027-01-31
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 3: Domínio: eventos do Asaas e excedente

### T4: Máquina de estado dos eventos do Asaas

**What**: Função pura `efeitoDoEvento(evento, assinatura)` → `ativar(pagoAte, cobrancaId) | inadimplente | cancelar | nenhum(motivo)`, com `assinatura` = situação, valor em centavos, cobrança que deu o Pro e `dateCreated` do último evento aplicado.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/plano/eventos-asaas.ts`
**Depends on**: T3
**Reuses**: `pagoAteDe` (T3); `reaisParaCentavos` (T2); S:52 (ordem não garantida); AD-096 (inadimplente mantém a assinatura `ativa`)
**Requirement**: PLA-44, PLA-45, PLA-46, PLA-47, PLA-48, PLA-49, PLA-51

**Done when**:

- [ ] Casos limite e estados listados antes do código: cada evento tratado × `aguardando_pagamento`, `ativa`, `cancelada`; evento mais antigo que o último aplicado; valor divergente; `PAYMENT_OVERDUE` de cobrança que não é a mais recente; estorno de cobrança que não deu o Pro. Resultado não definido na Base = pare e pergunte
- [ ] Teste `PLA-44`: `PAYMENT_RECEIVED` e `PAYMENT_CONFIRMED` com valor igual → `ativar` com `pagoAteDe(dueDate)`
- [ ] Teste `PLA-45`: `PAYMENT_OVERDUE` da cobrança mais recente de assinatura `ativa` → `inadimplente`; em `aguardando_pagamento` → `nenhum`
- [ ] Teste `PLA-46`: `SUBSCRIPTION_DELETED` e `SUBSCRIPTION_INACTIVATED` → `cancelar`
- [ ] Teste `PLA-47`: `PAYMENT_REFUNDED` e `PAYMENT_CHARGEBACK_REQUESTED` da cobrança do Pro atual → `inadimplente`; de outra → `nenhum`
- [ ] Teste `PLA-48`: `PAYMENT_CREATED` com `dateCreated` anterior a um `PAYMENT_RECEIVED` aplicado → `nenhum('fora_de_ordem')`
- [ ] Testes `PLA-49`, `PLA-51`: tipo desconhecido → `nenhum('nao_tratado')`; valor divergente → `nenhum('valor_divergente')`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T5: Regra do excedente do Free

**What**: Função pura `somenteLeitura({ plano, jogadoresAtivos, gruposFreeDaCriadora, grupoId, operacao })` → `null | 'limite_jogadores' | 'limite_grupos'`, com `operacao` em `escrita | cadastrar_jogador | reativar_jogador | inativar_jogador`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/plano/excedente.ts`
**Depends on**: T4
**Reuses**: `RECURSOS_POR_PLANO` (T2); decisões de S:41-42 e AD-062
**Requirement**: PLA-15, PLA-16, PLA-17

**Done when**:

- [ ] Casos limite listados antes do código: 19, 20 e 21 ativos; plano não Free com 30; dois grupos Free com o mesmo `criado_em`; grupo arquivado (fora da lista); inativar com 25
- [ ] Teste `PLA-15`: Free com 21 ativos → `limite_jogadores` para `escrita`; `inativar_jogador` → `null`
- [ ] Teste `PLA-16`: Free com 20 → `cadastrar_jogador` e `reativar_jogador` dão `limite_jogadores`; `escrita` → `null`
- [ ] Teste `PLA-17`: dois grupos Free da criadora → o de menor `criado_em` (desempate pelo id) `null`, o outro `limite_grupos`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 4: Contrato e checagem do ponto único

### T6: Contrato do plano e da assinatura

**What**: `planoResposta` (campos de PLA-08), `assinaturaCorpo` (`nome` 3 a 100, `cpf` com 11 dígitos e dígitos verificadores, `strictObject`), `assinaturaCriada` (`faturaUrl`) e os erros `plano_pro`, `somente_leitura`, `assinatura_pendente`, `assinatura_ativa`, `pagamento_indisponivel`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/contrato/src/plano.ts`
**Depends on**: T5
**Reuses**: primitivos do contrato (`CA:550`); códigos de erro de `backend/api/src/entrada/corpo.ts` (`GE:854`); AD-091
**Requirement**: PLA-08, PLA-35

**Done when**:

- [ ] Teste `PLA-35`: CPF com dígito errado, todos iguais (`111.111.111-11`) e com 10 dígitos são recusados no campo `cpf`; com máscara é normalizado
- [ ] Teste `PLA-08`: `planoResposta` aceita o exemplo de cada plano e recusa campo extra
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T7: Contrato tolerante do webhook

**What**: `asaasEventoCorpo`: exige `id` e `event` (texto), aceita `dateCreated`, `payment` (`id`, `subscription`, `value`, `dueDate`, `status`, `invoiceUrl`) e `subscription` (`id`), e ignora todo campo desconhecido (sem `.strict()`, AD-060).
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/contrato/src/asaas.ts`
**Depends on**: T6
**Reuses**: AD-060; S:52
**Requirement**: PLA-50

**Done when**:

- [ ] Teste `PLA-50`: corpo com campo novo no topo e dentro de `payment` é aceito e o campo some do resultado
- [ ] Teste `PLA-50`: sem `id` ou sem `event` é recusado; `customer` com e-mail não aparece no resultado
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T8: Checagem: o plano só se decide no domínio

**What**: Checagem que reprova, fora de `backend/dominio/src/plano/`, das migrações e dos testes, comparação com os valores `uso_proprio`, `trial`, `ativo`, `inadimplente` ou `cancelado` de `situacao_comercial`, ou `planoEfetivo` reimplementado.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/scripts/checagens/plano-unico.ts`
**Depends on**: T7
**Reuses**: molde das checagens da fundação (`F:1251`, `backend/scripts/checagens/`)
**Requirement**: PLA-01

**Done when**:

- [ ] Teste `PLA-01`: arquivo de prova em `backend/api/src` com `situacao === 'ativo'` reprova; o mesmo em `dominio/src/plano/` passa
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 5: Slug do grupo de teste e tabelas novas

### T9: Ação do usuário: ler o slug do grupo de teste na produção

**What**: Pausa. A sessão mostra a consulta só leitura (`SELECT id, slug, nome, situacao_comercial, criado_em FROM grupos ORDER BY criado_em`) e o usuário a roda na `main` do Neon, com confirmação específica na hora, e informa o slug do grupo de teste. O slug vira o parâmetro `SLUG_GRUPO_TESTE` da T17, registrado aqui. Nenhuma escrita; nada roda da máquina do agente contra o Neon.
**Estimativa**: 30 min
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `.specs/features/planos-e-cobranca/tasks.md`
**Depends on**: T8
**Reuses**: S:37 e S:59; AD-057; regra de ação externa da Retomada de `.specs/STATE.md`
**Requirement**: PLA-11

**Done when**:

- [ ] Slug registrado nesta tarefa: `SLUG_GRUPO_TESTE = <valor informado pelo usuário nesta pausa>`
- [ ] O slug casa com `^[a-z0-9-]{1,64}$` e o usuário confirmou que é o grupo dele
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: none
**Gate**: quick

---

### T10: Migração: tabelas `assinaturas` e `eventos_asaas`

**What**: `assinaturas` (`id`, `grupo_id` FK, `asaas_cliente_id`, `asaas_assinatura_id` único, `valor_centavos` inteiro > 0, `situacao` CHECK `aguardando_pagamento|ativa|cancelada`, `fatura_url`, `pago_ate date`, `cobranca_pro_id`, `ultimo_evento_em timestamptz`, `criada_por`, `criada_em`), com índice único parcial de uma assinatura `aguardando_pagamento` ou `ativa` por grupo; `eventos_asaas` (`id text` PK = id do evento, `evento`, `data_criacao`, `cobranca_id`, `assinatura_id`, `status`, `valor_centavos`, `recebido_em`, `efeito`), sem colunas de pessoa. RLS `FORCE` nas duas; `assinaturas_ler` para `pelada_app` só com conta e grupo visível; `GRANT SELECT` só em `assinaturas`; `pelada_backup_ro` com `GRANT SELECT` e policy `USING (true)` nas duas.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/migracoes/<ts>_planos-tabelas.sql`
**Depends on**: T9
**Reuses**: gerador `pnpm migracao:nova` (`F:883`); policies em laço de `M:1792843320000_rls.sql:33-59` e `M:1792843380000_conta-tabelas.sql:54-64`; `pelada_backup_ro` (AD-016); checagem aditiva (`F:858`); AD-088
**Requirement**: PLA-13, PLA-30, PLA-33, PLA-41, PLA-43

**Done when**:

- [ ] Teste `PLA-33`: a segunda linha `aguardando_pagamento` do mesmo grupo dá 23505; depois de `cancelada`, uma nova entra
- [ ] Teste `PLA-43`: `eventos_asaas.id` repetido dá 23505
- [ ] Teste `PLA-41`: `eventos_asaas` não tem coluna de e-mail, nome ou CPF (catálogo)
- [ ] O meta-teste da fundação (`F:957`) e o da CA (`CA:338`) passam com as duas tabelas
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T11: Matriz política × comando das tabelas novas

**What**: Escrever os casos da matriz para `assinaturas` e `eventos_asaas` (seção Test Coverage Matrix) com os contextos conta A criadora, conta C convidada, conta B, slug de A e sem contexto, e `pelada_backup_ro`.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/isolamento/planos.test.ts`
**Depends on**: T10
**Reuses**: `comoApp` e `bancoDeTeste` (`F:909`, `F:507`); molde da matriz de `CA:313` (T2)
**Requirement**: PLA-13, PLA-35

**Done when**:

- [ ] Teste `PLA-13`: cada célula da matriz para as duas tabelas, incluindo `UPDATE` e `DELETE` sem `WHERE`
- [ ] Teste `PLA-13`: `pelada_backup_ro` lê as duas e não escreve; `PUBLIC` sem `EXECUTE` nas funções novas (completado nas T12 a T16)
- [ ] Evidência: com `assinaturas_ler` trocada por `USING (true)`, o caso da conta B fica vermelho (registrar aqui)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 6: Funções de leitura, trial e assinatura

### T12: Migração: funções de leitura do plano

**What**: `plano_do_grupo(p_grupo_id)` → `situacao_comercial`, `trial_inicio`, `pago_ate` (da assinatura não cancelada mais recente ou da cancelada), `criado_por`, `criado_em`, `jogadores_ativos` (períodos com `fim IS NULL`); e `plano_grupos_da_criadora(p_grupo_id)` → `id`, `criado_em`, `situacao_comercial`, `trial_inicio`, `pago_ate` dos grupos não arquivados de quem criou `p_grupo_id`. As duas `SECURITY DEFINER`, `search_path` fixo, `STABLE`, só respondem se `p_grupo_id IN (SELECT grupos_visiveis())`, sem nome nem e-mail.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/migracoes/<ts>_planos-leitura.sql`
**Depends on**: T11
**Reuses**: molde de `contas_nomes_do_grupo` (`PR:1063`, AD-036); `grupos_visiveis()` (`M:1792844280000_grupos-visiveis-arquivado.sql:9`, ramo do slug de `PR:1109`); índice `periodos_um_aberto` (`M:1792843200000_linha-de-base.sql:131`)
**Requirement**: PLA-07, PLA-17, PLA-25

**Done when**:

- [ ] Teste `PLA-17`: a conta C (convidada em G1 da criadora A) recebe os dois grupos Free de A pela função, sem ver o G2 pela RLS
- [ ] Teste `PLA-25`: no contexto do slug de G1, `plano_do_grupo(G1)` responde; `plano_do_grupo(G2)` com o slug de G1 não responde
- [ ] Teste: conta B e sem contexto recebem zero linhas; `PUBLIC` sem `EXECUTE`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T13: Migração: `grupo_criar` nasce em trial

**What**: `CREATE OR REPLACE` da `grupo_criar` de 7 parâmetros (mesma assinatura e retorno) gravando `situacao_comercial = 'trial'` e `trial_inicio = p_hoje` no INSERT, e a auditoria `plano_trial_iniciado` (`autor_tipo` `conta`, `resumo` `{"antes": null, "depois": "trial"}`) na mesma transação. O default da coluna continua `uso_proprio`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/migracoes/<ts>_planos-grupo-criar-trial.sql`
**Depends on**: T12
**Reuses**: corpo vigente da `grupo_criar` de 7 parâmetros (`PR:987`, a partir de `M:1792844340000_grupo-criar.sql:10-75`; INSERT em `:47`, auditoria em `:68`); AD-087; AD-037
**Requirement**: PLA-10, PLA-12, PLA-14

**Done when**:

- [ ] Casos limite listados antes do código: `p_hoje` nulo; colisão de slug com repetição; falha no meio desfaz a auditoria nova também
- [ ] Teste `PLA-10`: grupo criado com `p_hoje = 2026-11-01` tem `trial` e `trial_inicio = 2026-11-01`
- [ ] Teste `PLA-14`: uma linha `plano_trial_iniciado` com o grupo, a conta e antes/depois
- [ ] Teste `PLA-12`: o default da coluna segue `uso_proprio`; o teste da T22 da PR (`PR:987`: nenhuma função com `now()` para data) continua verde
- [ ] O teste de `uso_proprio` da T0 e o de auditoria de `GE:397` são trocados com a mesma força e motivo no commit (autorizado, `## Autorizações` do `STATE.md`)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T14: Migração: `assinatura_registrar` e `assinatura_cancelar`

**What**: `assinatura_registrar(p_grupo_id, p_cliente, p_assinatura, p_valor_centavos, p_fatura_url)`: exige conta, `criado_por = app_conta_id()` e grupo ativo, insere `aguardando_pagamento` e audita `plano_assinado` (antes e depois iguais). `assinatura_cancelar(p_grupo_id)`: exige a criadora e assinatura `ativa` ou `aguardando_pagamento` (AD-115), marca `cancelada`; se era `ativa`, muda o grupo para `cancelado` mantendo `pago_ate`; se era pendente, o grupo não muda (segue `trial` ou Free); audita `plano_cancelado`. `SECURITY DEFINER`, `search_path` fixo, `REVOKE ALL FROM PUBLIC`, `EXECUTE` só para `pelada_app`.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/migracoes/<ts>_planos-assinatura.sql`
**Depends on**: T13
**Reuses**: conferência da criadora de `M:1792844520000_grupos-arquivar-so-criadora.sql:8-20`; molde `SECURITY DEFINER` de `M:1792844340000_grupo-criar.sql:18-21,74-75`; AD-088
**Requirement**: PLA-13, PLA-14, PLA-30, PLA-55

**Done when**:

- [ ] Casos limite e estados listados antes do código: conta C; sem conta; grupo arquivado; já existe pendente (23505 sobe); cancelar sem assinatura ativa; cancelar duas vezes
- [ ] Teste `PLA-30`: a criadora registra e a linha fica `aguardando_pagamento` com o valor em centavos; o grupo não muda
- [ ] Teste `PLA-13`: a conta C e a sem contexto recebem 42501
- [ ] Teste `PLA-55`: cancelar deixa o grupo `cancelado` com o mesmo `pago_ate` e audita `plano_cancelado` com antes `ativo`
- [ ] Teste `PLA-55`: cancelar a pendente marca `cancelada` e o grupo segue `trial` (AD-115)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 7: Funções do webhook e cortesia

### T15: Migração: `asaas_evento_registrar`

**What**: `asaas_evento_registrar(p_id, p_evento, p_data_criacao, p_cobranca, p_assinatura, p_status, p_valor_centavos)` → `novo | repetido`, mais o estado da assinatura conhecida (situação, valor, `cobranca_pro_id`, `ultimo_evento_em`, grupo) ou nada: exige sem conta e sem slug, `INSERT … ON CONFLICT (id) DO NOTHING` e trava a assinatura (`FOR UPDATE`) antes de devolver o estado.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/migracoes/<ts>_planos-webhook-registrar.sql`
**Depends on**: T14
**Reuses**: exigência de contexto de `evento_publico_registrar` (`PR:1038`, invertida: sem conta e sem slug); `eventos_asaas` (T10); AD-088
**Requirement**: PLA-41, PLA-42, PLA-48, PLA-49, PLA-13

**Done when**:

- [ ] Casos limite listados antes do código: id repetido; assinatura desconhecida; com conta no contexto; com slug no contexto
- [ ] Teste `PLA-42`: o segundo registro do mesmo id devolve `repetido` e não muda a linha
- [ ] Teste `PLA-49`: assinatura desconhecida grava o evento e devolve sem estado
- [ ] Teste `PLA-13`: com conta ou com slug no contexto, 42501
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T16: Migração: funções de transição do webhook

**What**: `plano_ativar(p_assinatura, p_pago_ate, p_cobranca, p_data_evento)` (grupo `ativo` com `trial_inicio = NULL`, assinatura `ativa`, `pago_ate`, `cobranca_pro_id`, `ultimo_evento_em`), `plano_inadimplente(p_assinatura, p_data_evento)` e `plano_cancelado(p_assinatura, p_data_evento)` (mantém `pago_ate`). Cada uma: sem conta, só aceita `asaas_assinatura_id` gravado, marca `efeito` no evento, audita `plano_ativado`, `plano_inadimplente` ou `plano_cancelado` com `autor_tipo` `infraestrutura` e antes e depois.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/migracoes/<ts>_planos-webhook-transicoes.sql`
**Depends on**: T15
**Reuses**: CHECK `grupos_trial` (`M:1792843200000_linha-de-base.sql:78`); `auditoria_autor` (`M:…:60`); molde da T14
**Requirement**: PLA-13, PLA-14, PLA-44, PLA-45, PLA-46, PLA-47

**Done when**:

- [ ] Casos limite e estados listados antes do código: ativar grupo em `trial`, `inadimplente`, `cancelado`; cancelar já cancelado; id de assinatura desconhecido; com conta
- [ ] Teste `PLA-44`: grupo em `trial` vira `ativo` com `trial_inicio` nulo, assinatura `ativa` e `pago_ate` gravado, numa transação (falha forçada na auditoria desfaz tudo)
- [ ] Testes `PLA-45`, `PLA-47`: `plano_inadimplente` muda só o grupo; a assinatura segue `ativa`
- [ ] Teste `PLA-46`: `plano_cancelado` mantém `pago_ate`
- [ ] Teste `PLA-14`: cada transição grava a ação com `infraestrutura` e sem `autor_conta_id`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T17: Migração: cortesia do grupo de teste

**What**: Migração de dados com a constante `SLUG_GRUPO_TESTE` (o valor registrado na T9): mantém `uso_proprio` só nesse grupo e passa os demais `uso_proprio` a `trial` com `trial_inicio = (now() AT TIME ZONE 'America/Sao_Paulo')::date`, num só `UPDATE` das duas colunas, sem auditoria. Aborta com `RAISE EXCEPTION` só quando há grupos e nenhum tem o slug; com `grupos` vazio (CI, banco de teste) não faz nada (AD-113).
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/migracoes/<ts>_planos-cortesia.sql`
**Depends on**: T16, T9
**Reuses**: slug da T9; S:37-38; AD-057; AD-113; contagem de linhas de `F:2233`
**Requirement**: PLA-11

**Done when**:

- [ ] Casos limite listados antes do código: slug presente; slug ausente com outros grupos; banco sem grupos; grupo do slug já `trial` ou `ativo` (não muda); grupo `uso_proprio` arquivado
- [ ] Teste `PLA-11`: com 3 grupos `uso_proprio` (um deles o do slug), só o do slug segue `uso_proprio`; os outros ficam `trial` com a data de SP; nenhuma outra coluna muda; contagem de linhas igual em toda tabela
- [ ] Teste `PLA-11`: sem o slug e com grupos, a migração aborta e nada muda
- [ ] Teste `PLA-11`: com `grupos` vazio, a migração termina sem erro e sem escrita (AD-113)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 8: Ensaio e tipos

### T18: Ensaio das migrações sobre um dump da produção (AD-033, AD-073)

**What**: Pausa do usuário para o dump (artefato do `backup.yml`, decifrado fora do repositório). Restaurar no Postgres local, contar linhas por tabela, aplicar `pnpm migrar` com as migrações de T10 a T17 e conferir: mesma contagem em toda tabela, o grupo do slug `uso_proprio`, os demais `trial` com a data do ensaio, schema = referência mais o diff destas migrações e segunda execução sem DDL. Dump com zero linhas nas tabelas de negócio: pare e pergunte (AD-073). Nada roda contra a `main` do Neon.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/scripts/src/ensaio-migracao.ts`
**Depends on**: T17
**Reuses**: estender o ensaio de `PR:1684` (T81); `lerEsquema` e a referência (`F:736`, `F:784`); migrar sobre banco migrado (`F:834`); AD-033, AD-073
**Requirement**: PLA-11, PLA-12

**Done when**:

- [ ] `Evidência`: data e origem do dump, contagem por tabela antes e depois, situação de cada grupo antes e depois (sem nome), diff do schema e a segunda execução, registrados aqui
- [ ] Teste `PLA-11`: nenhuma tabela muda de contagem; só o grupo do slug fica `uso_proprio`
- [ ] Banco de ensaio removido no `finally`; o dump decifrado não entra no git
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T19: Tipos Kysely das tabelas novas

**What**: Acrescentar `assinaturas` e `eventos_asaas` e os retornos das funções novas aos tipos do banco, com o teste contra o catálogo.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/tipos.ts`
**Depends on**: T18
**Reuses**: estender `tipos.ts` (`GE:878`, ampliado em `PR:1013`)
**Requirement**: PLA-30

**Done when**:

- [ ] Teste: cada coluna tipada existe no catálogo com o tipo correspondente
- [ ] `pnpm typecheck` passa
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 9: Regra de plano na API

### T20: Repositório do plano

**What**: `plano.ler(db, grupoId)` (chama `plano_do_grupo`) e `plano.gruposDaCriadora(db, grupoId)` (chama `plano_grupos_da_criadora`), devolvendo tipos do domínio, sem decidir o plano.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/plano.ts`
**Depends on**: T19
**Reuses**: molde de repositório que chama função (`eventos.registrarPublico`, `PR:1289`); T12
**Requirement**: PLA-07, PLA-17

**Done when**:

- [ ] Teste `PLA-07`: `plano.ler` de grupo de outra conta devolve nulo
- [ ] Teste `PLA-17`: `gruposDaCriadora` pela conta convidada devolve os grupos da criadora
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T21: Ligar o `recursoLiberado`

**What**: Trocar o corpo do ponto único (S-01) por: `plano.ler` + `planoEfetivo(…, relogio.hoje())` + `RECURSOS_POR_PLANO`; grupo não visível → `false`. A mesma função exporta `estadoDoPlano(db, grupoId, hoje)` para a T22 e a T24.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/aplicacao/plano/recurso-liberado.ts`
**Depends on**: T20
**Reuses**: estender o `recursoLiberado` da `simulador` (SIM-68, `SIM:273`) e da `financeiro` (FIN-45, `FIN:183`), AD-049, S-01; Relógio (`GE:831`)
**Requirement**: PLA-07, PLA-23, PLA-24, PLA-28

**Done when**:

- [ ] Casos limite listados antes do código: cada plano × cada recurso; grupo arquivado; contexto do slug; recurso desconhecido (erro de tipo)
- [ ] Teste `PLA-07`: `trial` vencido → `simulador` `false`; `uso_proprio` → `true`; `ativo` → `true`
- [ ] O teste "libera todos" de FIN-45 e SIM-68 é trocado com a mesma força e motivo no commit (autorizado, `## Autorizações` do `STATE.md`)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T22: Middleware `exigirPlanoEditavel`

**What**: Depois do `exigirGrupoAtivo`, em método diferente de GET e HEAD nas rotas de grupo, jogadores, períodos, habilidades, notas, partidas e pesos (AD-092): lê `estadoDoPlano` e os grupos da criadora na transação da requisição, chama `somenteLeitura` e responde 403 `{"erro":"somente_leitura","motivo":…}` sem abrir a escrita. Fora: `…/jogadores/:id/inativar`, arquivar, reativar, admins, plano, assinatura, simulador, escalações e financeiro.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/middlewares/plano-editavel.ts`
**Depends on**: T21
**Reuses**: estender a cadeia do `exigirGrupoAtivo` (`GE:901`, com o modo `READ ONLY` das prévias de `PR:1362`, que passam); `somenteLeitura` (T5); AD-062
**Requirement**: PLA-15, PLA-17, PLA-18, PLA-20, PLA-21

**Done when**:

- [ ] Casos limite listados antes do código: prévia `POST …/previa` (só leitura, passa); inativar; PATCH do grupo; 21 ativos depois de uma inativação; segundo grupo Free; grupo em trial
- [ ] Teste `PLA-15`: trial vencido com 21 ativos → `POST …/partidas` 403 `limite_jogadores` e nada gravado; `POST …/inativar` 200
- [ ] Teste `PLA-20`: depois de inativar um, o mesmo `POST …/partidas` é aceito
- [ ] Teste `PLA-17`: criadora com dois grupos Free edita o mais antigo e recebe 403 `limite_grupos` no outro
- [ ] Teste `PLA-18`: os GET do grupo somente leitura devolvem o mesmo corpo de antes da queda
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 10: Limite de jogadores, rota do plano e travas Pro

### T23: Cadastrar e reativar jogador no limite

**What**: No `POST …/jogadores` e no `…/reativar`, com o grupo no Free: `pg_advisory_xact_lock` do grupo, contar os ativos na mesma transação e recusar com 403 `limite_jogadores` quando já há 20.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/aplicacao/plano/limite-jogadores.ts`
**Depends on**: T22
**Reuses**: rotas de `GE:1256` (T36) e `GE:1409` (T42); `somenteLeitura` com `cadastrar_jogador` e `reativar_jogador` (T5); duas conexões de `GE:976` (T25)
**Requirement**: PLA-16, PLA-21

**Done when**:

- [ ] Casos limite listados antes do código: 19 com dois cadastros simultâneos; 20 e reativar; trial com 20 (passa)
- [ ] Teste `PLA-16`: com 20 ativos no Free, cadastrar e reativar dão 403 e nada é gravado
- [ ] Teste `PLA-21`: com 19 ativos, dois cadastros simultâneos terminam com 20 ativos e um 403
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T24: `GET /api/grupos/:grupoId/plano`

**What**: Rota de leitura com `plano`, `situacao`, `trialFimEm` (só em trial), `pagoAte`, `jogadoresAtivos`, `limiteJogadores`, `somenteLeitura` (com motivo), `recursos`, `podeAssinar` (só a criadora), `assinatura` (situação e `faturaUrl` quando pendente ou o grupo está `inadimplente`, AD-096).
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/plano.ts`
**Depends on**: T23
**Reuses**: `estadoDoPlano` (T21); `planoResposta` (T6); molde de rota de leitura `GE:1080` (T29); Relógio falso de `GE:831`
**Requirement**: PLA-08, PLA-09, PLA-71

**Done when**:

- [ ] Teste `PLA-08`: criadora em trial recebe `trialFimEm`, `podeAssinar` verdadeiro; admin convidada recebe `podeAssinar` falso
- [ ] Teste `PLA-09`: conta B recebe 404 igual ao de grupo inexistente
- [ ] Teste `PLA-71`: com o relógio em 02:59Z do 15º dia (23:59 de SP do 14º) o plano é `trial`; em 03:00Z, `free`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T25: Travas Pro no simulador e no financeiro

**What**: Conferir que as rotas do simulador (S-02) e do financeiro (S-03) chamam o ponto único e, ligado, respondem 403 `{"erro":"plano_pro","recurso":…}`: no simulador, os 4 POST (prévia, sugerir, avaliar e confirmar escalação, AD-092); no financeiro, todas as escritas. As leituras de escalação e do financeiro seguem 200.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/rotas/plano-recursos.test.ts`
**Depends on**: T24
**Reuses**: FIN-50 (`FIN:184`); SIM-68 (`SIM:273`); `recursoLiberado` ligado (T21); S-02, S-03
**Requirement**: PLA-23, PLA-24, PLA-28

**Done when**:

- [ ] Teste `PLA-23`: grupo Free → `POST …/simulador/sugerir` e `POST …/escalacoes` 403 `plano_pro` (`simulador`); a escalação confirmada no tempo de trial segue legível
- [ ] Teste `PLA-24`: grupo Free → `POST …/financeiro/lancamentos` 403 `plano_pro` (`financeiro`) sem gravar; `GET …/financeiro/mes` 200
- [ ] Se uma rota não passar pelo ponto único, a correção vai na rota (uma linha) e o desvio é anotado aqui
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 11: PDF público e prova por rota

### T26: Trava do PDF público e do `pdf_exportado`

**What**: `GET /api/publico/:slug/pdf` responde 403 `plano_pro` (`pdf`) quando o grupo não tem o recurso; `POST /api/publico/:slug/eventos` com `pdf_exportado` responde 403 sem gravar; `ranking_aberto` e o ranking seguem em qualquer plano.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/publico.ts`
**Depends on**: T25
**Reuses**: rotas de `PR:1611` (T46) e `PR:1634` (T47); `recursoLiberado` no contexto do slug (T21, T12)
**Requirement**: PLA-19, PLA-25, PLA-26

**Done when**:

- [ ] Teste `PLA-25`: grupo Free → PDF 403 `plano_pro`; cortesia → 200
- [ ] Teste `PLA-26`: `pdf_exportado` de grupo Free não cria linha em `eventos_uso`
- [ ] Teste `PLA-19`: `GET /api/publico/:slug/ranking` de grupo Free somente leitura responde 200 com a última partida
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T27: Ranking público informa `pdfLiberado`

**What**: Acrescentar `pdfLiberado: boolean` ao `rankingPublico` e preenchê-lo na rota do ranking (AD-095).
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/contrato/src/publico.ts`
**Depends on**: T26
**Reuses**: estender `rankingPublico` (`PR:913`, T19) e a rota `PR:1584` (T45); `CAMPOS_PROIBIDOS_PUBLICO` continua valendo
**Requirement**: PLA-25

**Done when**:

- [ ] Teste `PLA-25`: Free → `pdfLiberado` falso; trial → verdadeiro
- [ ] O teste de campos proibidos do público (`PR:913`) continua verde
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T28: Free × trial × Pro × cortesia em cada rota travada

**What**: Suíte em tabela: para cada rota travada (simulador, financeiro, PDF, e as escritas da trava somente leitura), o mesmo grupo em `trial` vencido com 21 ativos recebe 403 com o código certo, e em `trial` válido, `ativo` e `uso_proprio` recebe a resposta normal. Meta-teste: rota nova de escrita sob `/api/grupos/:grupoId` sem linha na tabela reprova.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/rotas/plano-matriz.test.ts`
**Depends on**: T27
**Reuses**: meta-teste de rotas de `CA:1070` (T32); T22, T25, T26
**Requirement**: PLA-28, PLA-15, PLA-18, PLA-19

**Done when**:

- [ ] Teste `PLA-28`: cada linha da tabela × 4 situações
- [ ] Teste `PLA-18`: depois da rodada, a contagem de linhas do grupo é a mesma do início
- [ ] Teste `PLA-28`: o meta-teste falha com uma rota de escrita de prova sem linha
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 12: Cliente do Asaas e repositório de assinaturas

### T29: Cliente do Asaas

**What**: Interface `Asaas` e `asaasHttp(env)`: `criarCliente({name, cpfCnpj, email, externalReference})`, `criarAssinatura({customer, billingType: 'UNDEFINED', cycle: 'MONTHLY', value, nextDueDate, description, externalReference})`, `primeiraCobranca(assinaturaId)` (`GET /v3/subscriptions/{id}/payments`) e `removerAssinatura(id)` (`DELETE /v3/subscriptions/{id}`), com `ASAAS_URL` e o header `access_token`, `AbortSignal` de 10 s por chamada; não 2xx, 429 ou abortado vira `'falhou'` com log só do status. O valor sai de `centavosParaReais`.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/asaas/cliente.ts`
**Depends on**: T28
**Reuses**: molde do `remetenteResend` (`CA:647`, T15: `fetch` direto, 10 s, log só do status); `centavosParaReais` (T2); S:48-53; AD-058, AD-089
**Requirement**: PLA-29, PLA-34, PLA-35, PLA-36, PLA-06

**Done when**:

- [ ] Casos limite listados antes do código: 200, 400, 401, 429 com `RateLimit-Reset`, 500, rede caída, resposta depois de 10 s, lista de cobranças vazia
- [ ] Teste `PLA-29`: o corpo de `criarAssinatura` tem `billingType` `UNDEFINED`, `cycle` `MONTHLY`, `value` 9.9 e `externalReference` = id do grupo
- [ ] Teste `PLA-36`: 429, 500 e 10 s viram `'falhou'` sem segunda chamada
- [ ] Teste `PLA-35`: nenhum log contém o CPF nem o `access_token`
- [ ] Teste `PLA-34`: nenhum corpo enviado tem campo de cartão (`creditCard`, `creditCardHolderInfo`)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T30: Asaas em memória e servidor falso para o e2e

**What**: `asaasMemoria()` (para testes de rota, com falhas programáveis) e `asaas-falso.mjs` (servidor HTTP local com as 4 rotas, fatura falsa e um endpoint de teste que dispara o webhook com o token), subido pelo Playwright com `ASAAS_URL` apontando para ele.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: crítica
**Where**: `frontend/web/e2e/apoio/asaas-falso.mjs`
**Depends on**: T29
**Reuses**: `remetenteMemoria()` (`CA:647`); `webServer` do Playwright (`F:1691`)
**Requirement**: PLA-36, PLA-53

**Done when**:

- [ ] Teste: o servidor falso responde às 4 rotas com o formato do Asaas e recusa `access_token` ausente com 401
- [ ] Teste: `asaasMemoria` programada para falhar na segunda chamada devolve `'falhou'` nela
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T31: Repositório de assinaturas

**What**: `assinaturas.pendenteOuAtiva(db, grupoId)`, `assinaturas.clienteDaConta(db, contaId)` (o `asaas_cliente_id` mais recente dos grupos que a conta criou, AD-096), `assinaturas.registrar(…)` e `assinaturas.cancelar(…)` (chamam as funções da T14) e `assinaturas.travarGrupo(db, grupoId)` (`pg_advisory_xact_lock`, AD-097).
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/assinaturas.ts`
**Depends on**: T30
**Reuses**: T14; molde de repositório de `PR:1289`
**Requirement**: PLA-30, PLA-33

**Done when**:

- [ ] Teste `PLA-30`: `registrar` grava e `pendenteOuAtiva` a devolve com `faturaUrl`
- [ ] Teste `PLA-33`: com duas conexões, a segunda `travarGrupo` espera o fim da primeira transação
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 13: Assinar e cancelar

### T32: Aplicação: assinar o Pro

**What**: `assinar(db, asaas, { grupoId, conta, nome, cpf, hoje })`: trava o grupo; se há pendente ou ativa, devolve `assinatura_pendente` com a fatura; reaproveita ou cria o cliente; cria a assinatura com `nextDueDate = hoje` e `description` com o nome do grupo; lê a primeira cobrança; grava. Falha do Asaas → `pagamento_indisponivel` sem gravar; falha depois de a assinatura existir no Asaas (leitura da fatura) → `removerAssinatura` (compensação, não repetição) e `pagamento_indisponivel` sem gravar (AD-114).
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/aplicacao/plano/assinar.ts`
**Depends on**: T31
**Reuses**: cliente (T29), memória (T30), repositório (T31); S:47-49; AD-114
**Requirement**: PLA-29, PLA-33, PLA-35, PLA-36

**Done when**:

- [ ] Casos limite e estados listados antes do código: falha em cada uma das 3 chamadas; cliente já existente; pendente já existe; trial, Free, inadimplente e cancelado
- [ ] Teste `PLA-29`: cliente criado com `externalReference` = id da conta e o e-mail da conta; segundo grupo da mesma conta reaproveita o cliente
- [ ] Teste `PLA-36`: falha em `criarCliente` ou `criarAssinatura` não grava nada e não repete
- [ ] Teste `PLA-36`: falha em `primeiraCobranca` chama `removerAssinatura` uma vez, responde `pagamento_indisponivel` e não grava nada; falha também na remoção é registrada no log com o id da assinatura, sem CPF (AD-114)
- [ ] Teste `PLA-35`: depois do sucesso, nenhuma tabela nem a auditoria contém o CPF (busca pelo valor em todas as colunas de texto)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T33: Rota `POST /api/grupos/:grupoId/assinatura`

**What**: Rota com sessão e `LIMITE_ESCRITA`: corpo `assinaturaCorpo`; não criadora → 403 `so_quem_criou` sem chamar o Asaas; 201 `{faturaUrl}`; 409 `assinatura_pendente` com a fatura; 502 com "Não foi possível falar com o sistema de pagamento. Tente de novo em instantes.".
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/assinatura.ts`
**Depends on**: T32
**Reuses**: `LIMITE_ESCRITA` por conta (`GE:928`, T23); `so_quem_criou` (`GE:854`); molde de rota de `GE:1105` (T30)
**Requirement**: PLA-30, PLA-31, PLA-32, PLA-33, PLA-60

**Done when**:

- [ ] Teste `PLA-31`: depois do 201, `GET …/plano` segue `trial`
- [ ] Teste `PLA-32`: admin convidada recebe 403 e o Asaas em memória não recebeu chamada
- [ ] Teste `PLA-33`: segundo POST recebe 409 com a mesma `faturaUrl`
- [ ] Teste `PLA-60`: sem sessão, 401; a 61.ª escrita da conta, 429
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T34: Cancelar a assinatura

**What**: `DELETE /api/grupos/:grupoId/assinatura`: só a criadora, com assinatura `ativa` ou `aguardando_pagamento` (AD-115); chama `removerAssinatura` no Asaas e, só com sucesso, `assinatura_cancelar`; falha → 502 com o grupo `ativo`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/aplicacao/plano/cancelar.ts`
**Depends on**: T33
**Reuses**: T29, T31, T14; rota de T33
**Requirement**: PLA-55, PLA-56

**Done when**:

- [ ] Casos limite listados antes do código: sem assinatura ativa nem pendente (409); cancelar a pendente; `SUBSCRIPTION_DELETED` chegando antes da resposta; não criadora
- [ ] Teste `PLA-55`: 204, grupo `cancelado` com o mesmo `pagoAte`; o plano segue `pro` até ele
- [ ] Teste `PLA-56`: Asaas em memória com falha → 502, grupo `ativo`, sem auditoria `plano_cancelado`
- [ ] Teste `PLA-55`: cancelar a pendente → 204, assinatura `cancelada`, grupo sem mudança, e um novo `POST …/assinatura` é aceito (AD-115)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 14: Webhook

### T35: Rota do webhook: token, limite e corpo

**What**: `POST /api/webhooks/asaas` fora de `exigirCabecalhoPelada` (AD-093) e sem sessão: `limiteTaxa(LIMITE_WEBHOOK)` com chave fixa; `asaas-access-token` comparado com `ASAAS_WEBHOOK_TOKEN` em tempo constante (401 sem gravar e sem logar o valor); `bodyLimit` de 64 KiB (413); `asaasEventoCorpo` (400 só sem `id` ou `event`).
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/webhook-asaas.ts`
**Depends on**: T34
**Reuses**: `exigirCabecalhoPelada` (`CA:723`, T18) com a exceção da rota; `limiteTaxa` (`F:1153`); binding `LIMITE_WEBHOOK` (`F:1081`, FUN-26); `bodyLimit` de `PR:1634` (T47); T7
**Requirement**: PLA-39, PLA-40, PLA-50

**Done when**:

- [ ] Teste `PLA-39`: sem header, com header errado e com a chave de API no header → 401, `eventos_asaas` vazio, log sem o valor
- [ ] Teste `PLA-40`: binding falso nega → 429; corpo de 65.537 bytes → 413
- [ ] Teste `PLA-50`: corpo sem `event` → 400; com campo novo → segue
- [ ] Teste: o `X-Pelada` continua exigido nas outras escritas de `/api/*`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T36: Webhook: registrar e aplicar o evento

**What**: `aplicarEventoAsaas(db, corpo)`: `asaas_evento_registrar`; `repetido` → 200; com estado, `efeitoDoEvento` decide e chama a função de transição na mesma transação; valor divergente → Sentry com o id do evento e o tipo, sem dado pessoal; responde 200 depois de gravar.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/aplicacao/plano/webhook.ts`
**Depends on**: T35
**Reuses**: T4, T15, T16; Sentry do Worker (`F:1301`) com `limparEvento` (`F:1277`)
**Requirement**: PLA-41, PLA-42, PLA-44, PLA-45, PLA-46, PLA-47, PLA-49, PLA-51

**Done when**:

- [ ] Casos limite e estados listados antes do código: cada evento tratado; repetido; desconhecido; valor divergente; erro na transição (500, nada gravado, o Asaas reenvia)
- [ ] Teste `PLA-44`: `PAYMENT_RECEIVED` de assinatura pendente → grupo `ativo`, assinatura `ativa`, `pagoAte` = vencimento + 1 mês
- [ ] Testes `PLA-45`, `PLA-46`, `PLA-47`: o estado final no banco de cada evento
- [ ] Teste `PLA-42`: o mesmo evento duas vezes → 200 e uma auditoria só
- [ ] Teste `PLA-49`: `PAYMENT_DELETED` e assinatura desconhecida → 200 sem mudança
- [ ] Teste `PLA-51`: valor 5.00 contra 990 centavos → grava, não ativa, Sentry chamado sem e-mail, nome nem CPF
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T37: Webhook: concorrência, reenvio e fora de ordem

**What**: Provar com duas conexões e com sequências: dois envios simultâneos do mesmo evento aplicam um efeito; reenvio depois de 429 aplica uma vez; `PAYMENT_RECEIVED` antes de `PAYMENT_CREATED` não regride; pagamento depois do fim do trial passa pelo Free e volta a Pro; eventos atrasados depois de fila pausada seguem a regra de ordem.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/test/concorrencia/webhook-asaas.test.ts`
**Depends on**: T36
**Reuses**: molde de concorrência de `GE:976` (T25); T35, T36
**Requirement**: PLA-43, PLA-48, PLA-72, PLA-73, PLA-74

**Done when**:

- [ ] Casos limite listados antes do teste: mesmo id em paralelo; dois eventos diferentes da mesma assinatura em paralelo; 429 e reenvio
- [ ] Teste `PLA-43`: 2 envios simultâneos → uma auditoria `plano_ativado`
- [ ] Teste `PLA-73`: primeiro envio com 429, reenvio aceito, um efeito
- [ ] Teste `PLA-48`: `PAYMENT_CREATED` atrasado deixa o grupo `ativo`
- [ ] Teste `PLA-74`: relógio no 16º dia: plano `free` e somente leitura; depois do webhook, `pro` sem perda de linha
- [ ] Teste `PLA-72`: lote de 5 eventos atrasados fora de ordem termina no estado do mais recente
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 15: Arquivar, excluir, isolamento e segredos

### T38: Arquivar e excluir a conta com assinatura

**What**: `POST …/arquivar` e `POST /api/conta/excluir` recusam com 409 `assinatura_ativa` ("Cancele a assinatura antes de arquivar o grupo" e "Cancele a assinatura do grupo <nome> antes de excluir a conta") quando há assinatura `aguardando_pagamento` ou `ativa` (AD-115).
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/aplicacao/plano/assinatura-bloqueia.ts`
**Depends on**: T37
**Reuses**: `grupos.arquivar` (`GE:1027`, T27) e rota `GE:1105` (T30); `POST /api/conta/excluir` (`CA:971`, T28); AD-115
**Requirement**: PLA-68, PLA-69

**Done when**:

- [ ] Teste `PLA-69`: arquivar grupo com assinatura ativa ou pendente → 409 e `arquivado_em` nulo
- [ ] Teste `PLA-68`: excluir a conta criadora com assinatura ativa ou pendente → 409 com o nome do grupo e a conta intacta
- [ ] Os testes ACE-28 e GEL de arquivar continuam verdes
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T39: Isolamento das rotas novas

**What**: `GET …/plano`, `POST` e `DELETE …/assinatura` entram na suíte de isolamento como rotas de grupo (conta do grupo A contra o B); o webhook entra como rota sem sessão que não lê dado de grupo pelo contexto.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/isolamento/rotas.test.ts`
**Depends on**: T38
**Reuses**: suíte de `CA:1070` (T32), estendida em `GE:1607` e `PR:1658`
**Requirement**: PLA-09, PLA-32

**Done when**:

- [ ] Teste `PLA-09`: as 3 rotas novas respondem 404 ao grupo B e o banco do B fica igual
- [ ] Teste `PLA-32`: o Asaas em memória não recebe chamada nas tentativas cruzadas
- [ ] O meta-teste falha com uma rota nova sem caso
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T40: Segredos do Asaas e trava do sandbox

**What**: `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` (segredos) e `ASAAS_URL` (variável) no `.env.example` só pelo nome; regra do gitleaks e teste que reprova `$aact_` no repositório; a checagem `so-previa` passa a reprovar `ASAAS_URL` diferente de `https://api-sandbox.asaas.com/v3` no `wrangler.jsonc` e no `deploy.yml`, enquanto não houver AD de produção (AD-061). Criar os secrets na prévia é passo do usuário no `/preparar` Nível 2.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/scripts/checagens/so-previa.ts`
**Depends on**: T39
**Reuses**: checagem do `.env.example` e `.gitleaks.toml` (`F:1886`, T66); estender `so-previa.ts` (`F:2013`, T71); molde de `CA:697` (T17)
**Requirement**: PLA-37, PLA-38

**Done when**:

- [ ] Teste `PLA-37`: arquivo de prova com `$aact_` seguido de 40 caracteres reprova; o `.env.example` sem valor passa
- [ ] Teste `PLA-38`: `ASAAS_URL` com `https://api.asaas.com/v3` reprova; a do sandbox passa
- [ ] A checagem do `.env.example` passa com as 3 variáveis
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 16: Web: dados e componentes do plano

### T41: Dados do plano no front

**What**: `usarPlano(grupoId)`, `usarAssinar(grupoId)` e `usarCancelar(grupoId)` com TanStack Query; 403 `somente_leitura` ou `plano_pro` em qualquer escrita invalida `usarPlano`.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/dados/plano.ts`
**Depends on**: T40
**Reuses**: cliente HTTP do front (`CA:1169`, T36); molde de `frontend/web/src/dados/grupos.ts` (`GE:1680`, T53)
**Requirement**: PLA-21, PLA-54

**Done when**:

- [ ] Teste: 403 `somente_leitura` numa escrita refaz o `GET …/plano`
- [ ] Teste: reabrir a tela refaz a leitura (sem cache velho)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T42: Componente `AvisoRecursoPro`

**What**: Aviso com o nome do recurso, "Disponível no plano Pro: R$ 9,90/mês" (de `formatarPreco(PRECO_PRO_CENTAVOS)`) e o botão "Ver Meu plano", com CSS Module só de tokens (AD-064).
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/componentes/AvisoRecursoPro.tsx`
**Depends on**: T41
**Reuses**: `TelaMensagem` (`CA:1286`, T41); `Botao` (`F:1448`); Stylelint de tokens (`F:1374`); AD-064
**Requirement**: PLA-27

**Done when**:

- [ ] Teste `PLA-27`: mostra "R$ 9,90/mês" e o botão leva a `/app/grupos/:grupoId/plano`
- [ ] Teste: axe sem violação
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T43: `FaixaSomenteLeitura` e contexto do plano do grupo

**What**: Provedor `PlanoDoGrupo` (lê `usarPlano`) no layout das rotas `/app/grupos/:grupoId/*`, `useSomenteLeitura()` e a faixa "Este grupo passou do limite do plano Free…" com o motivo (jogadores ou grupos) e o link para Meu plano.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/componentes/FaixaSomenteLeitura.tsx`
**Depends on**: T42
**Reuses**: `Faixa` (`CA:1286`, T41); T41; AD-064
**Requirement**: PLA-22

**Done when**:

- [ ] Teste `PLA-22`: com `somenteLeitura.motivo = 'limite_jogadores'` a faixa mostra o texto e o link; sem motivo, não aparece
- [ ] Teste: axe sem violação
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 17: Web: Meu plano

### T44: Meu plano: plano, datas, jogadores e recursos

**What**: Tela `/app/grupos/:grupoId/plano`: "Free", "Trial Pro", "Pro" ou "Cortesia: Pro sem cobrança"; "Trial Pro até dd/mm/aaaa" ou a data de `pagoAte`; "21 de 20 jogadores"; lista de recursos com o liberado marcado (por texto e ícone, além da cor); sem a criadora, "Só quem criou o grupo pode assinar ou cancelar"; em cortesia, sem assinar nem cancelar.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/plano/MeuPlano.tsx`
**Depends on**: T43
**Reuses**: `Casca`, `Barra`, `Lista` (`F:1424`, `CA:1286`); `RECURSOS_POR_PLANO` (T2); AD-064
**Requirement**: PLA-52, PLA-57, PLA-58

**Done when**:

- [ ] Teste `PLA-52`: trial mostra "Trial Pro até 14/11/2026" e "21 de 20 jogadores" no Free
- [ ] Teste `PLA-57`: admin convidada vê o plano sem botões e com o texto
- [ ] Teste `PLA-58`: cortesia mostra "Cortesia: Pro sem cobrança" e nenhum botão
- [ ] Teste: axe sem violação
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T45: Meu plano: assinar com nome e CPF

**What**: Para a criadora sem assinatura pendente nem ativa: "Assinar Pro: R$ 9,90/mês", formulário com nome e CPF (validação do contrato, erro ao lado do campo), envio e abertura da `faturaUrl`; 502 mostra a mensagem da API com "Tentar de novo". Nenhum campo de cartão.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/plano/AssinarPro.tsx`
**Depends on**: T44
**Reuses**: `Campo` e `ResumoErros` (`CA:1238`, `CA:1263`); mensagem ao lado do campo (`GE:2138`, T72); `assinaturaCorpo` (T6)
**Requirement**: PLA-53, PLA-34, PLA-35

**Done when**:

- [ ] Teste `PLA-53`: envio com sucesso chama `window.open` com a `faturaUrl`
- [ ] Teste `PLA-35`: CPF inválido mostra o erro no campo sem chamar a API
- [ ] Teste `PLA-34`: o formulário não tem campo de cartão
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T46: Meu plano: aguardando e cancelar

**What**: Assinatura pendente (ou grupo `inadimplente`, AD-096): "Aguardando a confirmação do pagamento" com o link da fatura. Criadora com assinatura ativa ou pendente (AD-115): "Cancelar assinatura" com `Dialogo` ("O grupo continua Pro até dd/mm/aaaa"); 502 mostra o erro e o plano não muda.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/plano/AssinaturaAtual.tsx`
**Depends on**: T45
**Reuses**: `Dialogo` (`CA:1286`, T41); T41
**Requirement**: PLA-54, PLA-55

**Done when**:

- [ ] Teste `PLA-54`: pendente mostra o texto e o link; reabrir com `ativo` mostra Pro
- [ ] Teste `PLA-55`: o diálogo mostra a data de `pagoAte` e, confirmado, chama o DELETE
- [ ] Teste `PLA-55`: no estado pendente, "Cancelar assinatura" aparece e chama o DELETE (AD-115)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 18: Web: rota, menu e somente leitura nas telas

### T47: Rota de Meu plano e item no menu do grupo

**What**: Rota `/app/grupos/:grupoId/plano` (AD-063) sob a guarda e o item "Meu plano" no início do grupo (t09) para todo admin.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/app/rotas.tsx`
**Depends on**: T46
**Reuses**: estender `rotas.tsx` (`GE:2068`, T69); `InicioGrupo.tsx` (`GE:1847`, ampliada em `PR:2073`)
**Requirement**: PLA-59

**Done when**:

- [ ] Teste `PLA-59`: o início do grupo mostra "Meu plano" para a criadora e para a convidada
- [ ] Teste: a rota renderiza a tela e passa pela guarda
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T48: Somente leitura nas telas do elenco e do grupo

**What**: Com `useSomenteLeitura()` verdadeiro, a faixa no topo e os botões de escrita desabilitados em Dados do grupo, Jogadores, Novo jogador, Ficha (menos "Inativar") e Habilidades.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/jogadores/Jogadores.tsx`
**Depends on**: T47
**Reuses**: telas de `GE:1870`, `GE:1896`, `GE:1920`, `GE:1944`, `GE:1970`, `GE:2042`; T43
**Requirement**: PLA-22

**Done when**:

- [ ] Teste `PLA-22`: em somente leitura, "Novo jogador" e "Salvar" desabilitados e a faixa visível; "Inativar" da ficha habilitado
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T49: Somente leitura nas telas de partidas e pesos

**What**: O mesmo em Partidas do mês, Lançar e Editar partida e Pontuação.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/partidas/PaginaPartidas.tsx`
**Depends on**: T48
**Reuses**: telas de `PR:1951`, `PR:1974`, `PR:1999`, `PR:2025`; T43
**Requirement**: PLA-22

**Done when**:

- [ ] Teste `PLA-22`: em somente leitura, "Lançar partida" e "Salvar pesos" desabilitados e a faixa visível
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 19: Web: avisos Pro, ranking público e landing

### T50: Aviso Pro no simulador e no financeiro

**What**: Sem o recurso (`recursos` de `usarPlano`), a tela do simulador mostra `AvisoRecursoPro` no lugar do formulário; a do financeiro mostra os dados e o aviso no lugar dos formulários de escrita.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/simulador/PaginaSimulador.tsx`
**Depends on**: T49
**Reuses**: telas da `simulador` e da `financeiro` (S-05); T42
**Requirement**: PLA-27

**Done when**:

- [ ] Teste `PLA-27`: Free no simulador mostra o aviso com "R$ 9,90/mês" e não o formulário; no financeiro, o saldo e o aviso
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T51: Ranking público sem "Exportar PDF" no Free

**What**: A t01 só mostra "Exportar PDF" com `pdfLiberado` verdadeiro.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/ranking/PaginaRanking.tsx`
**Depends on**: T50
**Reuses**: `PaginaRanking` (`PR:1878`, T56) e `usarExportarPdf` (`PR:2222`, T70); T27
**Requirement**: PLA-25

**Done when**:

- [ ] Teste `PLA-25`: `pdfLiberado` falso → sem o botão; verdadeiro → com ele
- [ ] A comparação visual da t01 (`PR:2369`) segue verde com o seed em cortesia ou trial
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T52: Landing

**What**: Página `/`: nome do produto, o que ele resolve, os dois planos lado a lado com os recursos (de `RECURSOS_POR_PLANO`), "Grátis", "R$ 9,90/mês por grupo" (de `formatarPreco`), "14 dias de Pro grátis, sem cartão", "Criar conta" (`/cadastro`), "Entrar" (`/entrar`), rodapé com `/termos` e `/privacidade`, e a faixa "Sua conta foi excluída" com `?aviso=conta-excluida`.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/landing/Landing.tsx`
**Depends on**: T51
**Reuses**: casca da página provisória (`F:1545`, AD-007) e a faixa dela (`CA:1309`, T42); `Faixa` (`CA:1286`); T2; S-06; AD-064
**Requirement**: PLA-61, PLA-62, PLA-63

**Done when**:

- [ ] Teste `PLA-61`: os textos e os dois botões com os destinos
- [ ] Teste `PLA-62`: com `PRECO_PRO_CENTAVOS` trocado no teste por 1290, a landing mostra "R$ 12,90" (o valor vem da tabela)
- [ ] Teste `PLA-63`: com `?aviso=conta-excluida`, a faixa aparece
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 20: Web: rota da landing, termos e e2e

### T53: `/` com a landing e com sessão para `/app`

**What**: A rota `/` passa a renderizar a landing no lugar da página provisória; com sessão válida, `Navigate` para `/app`; se `GET /api/sessao` falhar ou demorar, a landing continua inteira (AD-094).
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/app/rotas.tsx`
**Depends on**: T52
**Reuses**: `useSessao` e a guarda (`CA:1192`, T37); rotas de `CA:1309`
**Requirement**: PLA-64, PLA-65

**Done when**:

- [ ] Teste `PLA-64`: com sessão, `/` vai a `/app`
- [ ] Teste `PLA-65`: com a API respondendo 500, a landing aparece inteira
- [ ] Os testes da página provisória são trocados com a mesma força e motivo no commit (autorizado, `## Autorizações` do `STATE.md`)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T54: Termos e privacidade com a cobrança

**What**: Privacidade: o Asaas como operador, os dados enviados (nome, CPF, e-mail) e o que o app guarda (só o id do cliente). Termos: planos, trial de 14 dias, queda para o Free sem apagar dados e cancelamento, com preço e limites vindos de `RECURSOS_POR_PLANO` e `formatarPreco`. Texto marcado como rascunho para revisão do usuário.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/termos/Termos.tsx`
**Depends on**: T53
**Reuses**: páginas de `CA:1458` (T48); T2
**Requirement**: PLA-66, PLA-67

**Done when**:

- [ ] Teste `PLA-66`: `/privacidade` cita "Asaas", "CPF" e "id do cliente"
- [ ] Teste `PLA-67`: `/termos` mostra "14 dias", "R$ 9,90" e "20 jogadores" vindos da tabela
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T55: E2E da landing

**What**: Playwright em `/` sem sessão (os dois planos lado a lado, preços, axe), com `?aviso=conta-excluida` (faixa) e com sessão (vai a `/app`), e o rodapé com os links.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/e2e/landing.spec.ts`
**Depends on**: T54
**Reuses**: Playwright e axe da fundação (`F:1691`, `F:1738`); sessão de e2e de `CA:1683` (T57)
**Requirement**: PLA-61, PLA-63, PLA-64, PLA-65

**Done when**:

- [ ] Teste `PLA-61`: em 1280 px, os cartões Free e Pro têm o mesmo `y` (±4 px) e o Pro à direita do Free (`boundingBox`); em 390 px, empilhados
- [ ] Teste `PLA-65`: axe sem violação; nenhuma requisição a `/api/*` além de `/api/sessao`
- [ ] Testes `PLA-63`, `PLA-64`: faixa com o aviso; com sessão, URL final `/app`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: build

---

#### Phase 21: Jornadas e documentação

### T56: Jornadas de planos ponta a ponta

**What**: Testes Playwright das jornadas desta feature (`.specs/projeto/jornadas.md`, numeradas pela sessão) contra o `wrangler dev` com o Asaas falso (T30) e relógio do servidor fixável: assinar, pagar pelo webhook disparado e ver Pro; admin convidada sem botões; grupo Free com 21 jogadores somente leitura que volta ao inativar um.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/e2e/planos.spec.ts`
**Depends on**: T55
**Reuses**: jornadas de `CA:1683`, `GE:2188`, `PR:2441`; seed (`GE:2164`); T30
**Requirement**: PLA-53, PLA-54, PLA-57, PLA-15, PLA-20, PLA-44

**Done when**:

- [ ] Teste: a criadora assina, o teste dispara `PAYMENT_RECEIVED` e Meu plano mostra Pro
- [ ] Teste: a convidada vê o plano sem botões
- [ ] Teste: grupo Free com 21 mostra a faixa; depois de inativar um, lança a partida
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: build

---

### T57: Documentação de planos e cobrança

**What**: `docs/runbook.md`: secrets `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` e a variável `ASAAS_URL` como passo do usuário (`/preparar` Nível 2), configuração do webhook no painel do sandbox (URL, `authToken` de 32 a 255 caracteres, diferente da chave), fila pausada (15 falhas: reativar e reprocessar, eventos somem em 14 dias), simular pagamento no sandbox, e a troca para produção só com AD nova. README: o Asaas falso no dev e no e2e.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `docs/runbook.md`
**Depends on**: T56
**Reuses**: runbook de `F:2063` e `F:2087`, estendido em `CA:1708`; S:50-53
**Requirement**: PLA-72, PLA-37

**Done when**:

- [ ] O runbook tem os passos da fila pausada e dos secrets, sem valor nenhum
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: none
**Gate**: build
