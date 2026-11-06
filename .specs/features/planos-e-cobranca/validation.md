# Planos e cobrança: Validação (rodada 1)

**Data**: 2026-11-06 | **Spec**: `.specs/features/planos-e-cobranca/spec.md` | **Faixa**: código da feature já na `main` (`71b5abe6` a `923b39e2`), árvore `6bfdb8be` (HEAD `f9801ec0`) | **Verificador**: independente (autor ≠ verificador) | **Veredito**: FAIL ❌ (15 achados, 9 críticos, após consolidar verificador, revisão de código e segurança)

Tarefas: T0 a T57 = 58 de 58 `concluída` (`tasks.md`), nenhuma bloqueada. Caminhos abreviados: D=`backend/dominio/test/plano`, C=`backend/contrato/test`, A=`backend/api/test`, W=`frontend/web/test`, E=`frontend/web/e2e`.

## Critérios (spec → `arquivo:linha` e asserção → resultado)

| PLA | `arquivo:linha` e asserção | |
|---|---|---|
| 01 | `backend/scripts/checagens/test/plano-unico.test.ts:15` arquivo de prova com `situacao === 'ativo'` em `api/src` reprova; `D/plano-efetivo.test.ts:80` toda situação do CHECK tem resultado | ✅ |
| 02-04 | `D/plano-efetivo.test.ts:18` `uso_proprio`→cortesia; `:24-26` trial 01-11 até 13-11 e free no 15; `:55-57` cancelado `pagoAte` 12-10 é pro, 12-11 free; `:50` inadimplente free | ✅ |
| 05, 06 | `D/recursos.test.ts:14,37` free só partidas/ranking, 20 jogadores; `:58` `990`; `:68` ida e volta 1..99.999; `:75` 9.905 → RangeError | ✅ |
| 07 | `A/aplicacao/recurso-liberado.test.ts:63,74,82,93,101,124` trial vencido nega, último dia libera, cortesia e ativo liberam, conta B false | ✅ |
| 08, 09 | `A/rotas/plano.test.ts:88-93` `expect(corpo).toEqual({...})` com `trialFimEm`, `podeAssinar`; `:164` não admin 404 igual a inexistente | ✅ |
| 10, 14 | `A/banco/planos-grupo-criar-trial.test.ts:48` `trial_inicio` = `p_hoje`; `:61,129` auditoria `plano_trial_iniciado` e rollback; `planos-assinatura.test.ts:111,205`, `planos-webhook-transicoes.test.ts:176,248,293` antes/depois, `infraestrutura` | ✅ |
| 11 | `A/banco/planos-cortesia.test.ts:90,105,115,134` só o slug fica `uso_proprio`, contagem igual, aborta sem slug; `backend/scripts/test/ensaio-migracao-planos.test.ts:125` | ✅ |
| 12, 13 | `A/banco/plano-caracterizacao.test.ts:53,98,111,120,129` default, INSERT recusado, UPDATE 42501; `A/isolamento/planos.test.ts:149-209,299` matriz política × comando e `EXECUTE` só `pelada_app`; `planos-webhook-transicoes.test.ts:319,327` com conta/slug 42501 | ✅ |
| 15-17 | `A/rotas/plano-editavel.test.ts:208` 21 ativos 403 `limite_jogadores`, `:254` inativar 200, `:306` antigo 200 e novo 403; `A/concorrencia/limite-jogadores.test.ts:184,194` 20 ativos cadastrar/reativar 403 | ✅ |
| 18-21 | `plano-editavel.test.ts:189` GET igual; `A/rotas/publico-plano.test.ts:154` ranking 200; `plano-editavel.test.ts:263` volta a aceitar; `limite-jogadores.test.ts:122` 2 cadastros simultâneos → 20 ativos e um 403 | ✅ |
| 22 | `W/componentes/faixa-somente-leitura.test.tsx:44,54`; `W/telas/somente-leitura-elenco.test.tsx:115-174`, `somente-leitura-partidas.test.tsx:110-147` botões desabilitados. Texto da spec truncado ("…"): lacuna de precisão menor | ✅ ⚠ |
| 23-26, 28 | `A/rotas/plano-recursos.test.ts:104,136,154`; `plano-matriz.test.ts:254` toda rota × 4 situações, `:279` PDF, `:292` meta-teste de rota sem linha; `publico-plano.test.ts:93,113` PDF 403 e `pdf_exportado` sem linha em `eventos_uso` | ✅ |
| 27 | `W/componentes/aviso-recurso-pro.test.tsx:22` "R$ 9,90/mês" e botão; `W/telas/aviso-pro-telas.test.tsx:67,90` | ✅ |
| 29-33 | `A/aplicacao/assinar.test.ts:77` campos do cliente e da assinatura; `A/rotas/assinatura.test.ts:138` 201 + linha `aguardando_pagamento`, `:150` plano segue trial, `:165` convidada 403 sem chamar Asaas, `:174` 409 com a mesma fatura | ✅ |
| 34-38 | `A/infraestrutura/asaas.test.ts:281,264,162` sem cartão, log sem CPF, 10 s; `A/rotas/assinatura.test.ts:190` 502 com a mensagem literal; `C/plano.test.ts:59`; `A/isolamento/planos.test.ts:243`; `chave-asaas.test.ts:13`; `so-previa.test.ts:99` | ✅ |
| 39-43 | `A/rotas/webhook-asaas.test.ts:112-144` 401 sem gravar nem logar; `:162,176,184` 429, 413 em 65.537 B, 64 KiB aceito; `:221` sem dado de pessoa; `webhook-asaas-aplicar.test.ts:246` `repetido`; `A/concorrencia/webhook-asaas.test.ts:237` `expect(await auditorias('plano_ativado')).toBe(1)` | ✅ |
| 44-51 | `webhook-asaas-aplicar.test.ts:160,184,201,229,255,264,277` ativo/inadimplente/cancelado/estorno/desconhecido/valor divergente (Sentry só id e tipo); `transicoes.test.ts:146` rollback; `D/eventos-asaas.test.ts:203-232` fora de ordem; `webhook-asaas.test.ts:193,200,210` 400 só sem `id`/`event` | ✅ |
| 52-60 | `W/telas/meu-plano.test.tsx:35,43,73,79`; `assinar-pro.test.tsx:53`; `assinatura-atual.test.tsx:45,77`; `A/rotas/assinatura-cancelar.test.ts:173,209` 502 e grupo segue `ativo`; `W/app/rotas-plano.test.tsx:45,55` menu; `assinatura.test.ts:221,228` 401 e 429; `E/planos.spec.ts:226,261,296` (rodado) | ✅ |
| 61-65 | `W/telas/landing.test.tsx:36,47`; `E/landing.spec.ts:34` boundingBox lado a lado (rodado); `landing-preco.test.tsx:21` preço vem do domínio; `rotas-acesso.test.tsx:112`; `rotas-landing.test.tsx:54,69`; `landing.spec.ts:82` axe | ✅ |
| 66, 67 | `W/telas/termos-cobranca.test.tsx:18,32,39`; `termos-tabela.test.tsx:22` | ✅ |
| 68, 69 | `A/rotas/assinatura-bloqueia.test.ts:160,117` 409, conta intacta, `arquivado_em` nulo; a `mensagem` é comparada com a constante do próprio código (`:124,:166`), nenhum teste fixa o texto literal da spec | ⚠ GAP (A-01) |
| 70-74 | `D/plano-efetivo.test.ts:65`; `A/rotas/plano.test.ts:173,179` 02:59Z trial / 03:00Z free; `docs/runbook.md:245-249` + `concorrencia/webhook-asaas.test.ts:387` lote de 5 atrasados; `:321` reenvio após 429 uma vez; `:359` 16º dia free e depois pro, `linhasDoGrupo` igual | ✅ |

**Status**: 72 de 74 com resultado conforme a spec; PLA-68 e PLA-69 sem prova do texto literal; PLA-22 com lacuna de precisão da spec (texto truncado).

## Sensor (cópia isolada `…-val-planos-mut`, só o teste do arquivo mutado; 10 mutações + 2 sondas)

| # | Arquivo | Mutação | Resultado |
|---|---|---|---|
| 1 | `dominio/src/plano/plano-efetivo.ts` | fim do trial `<` → `<=` | ✅ morto (3 falhas) |
| 2 | `dominio/src/plano/eventos-asaas.ts` | remove conferência do valor (PLA-51) | ✅ morto (2) |
| 3 | `dominio/src/plano/eventos-asaas.ts` | remove guarda de fora de ordem (PLA-48) | ✅ morto (4) |
| 4 | `dominio/src/plano/excedente.ts` | inativar jogador deixa de ser exceção (PLA-15) | ✅ morto (2) |
| 5 | `api/src/infraestrutura/asaas/token-webhook.ts` | aceita qualquer token (`diferenca === 0` removido) | ✅ morto (3) |
| 6 | `api/src/entrada/rotas/publico.ts` | `pdf_exportado` sem trava de recurso (PLA-26) | ✅ morto (1) |
| 7 | `api/src/aplicacao/plano/cancelar.ts` | ignora falha do Asaas ao cancelar (PLA-56) | ✅ morto (1) |
| 8 | `api/src/aplicacao/plano/assinar.ts` | remove a checagem da criadora (PLA-32) | ✅ morto (1) |
| 9 | `migracoes/…planos-tabelas.sql` | `GRANT INSERT, UPDATE, DELETE` a `pelada_app` em `assinaturas` | ✅ morto (20) |
| 10 | `migracoes/…planos-tabelas.sql` | policy `assinaturas_ler` sem `grupos_visiveis()` (isolamento) | ✅ morto (3) |
| S1, S2 | `contrato/src/plano.ts:162,166` | troca o texto de PLA-69 e PLA-68 | ❌ sobreviveram (não equivalentes: o texto é o definido pela spec) → A-01 |

**Sensor**: profundidade alta (dinheiro, webhook, isolamento); 10/10 mortos, 2 sondas vivas. Isolamento: `git status --porcelain` da árvore real igual ao de antes (só `revisao-codigo.md` e `seguranca.md` de outros agentes); junções removidas antes do `git worktree remove`; nenhum `teste_*` órfão em 5447.

## Gate (árvore atual `6bfdb8be` ≠ `abc17b49` do `tasks.md`: 190 arquivos mudaram, gate repetido; sempre com `.env` do 5447)

lint 0, format 0, typecheck 0, checagens 134/134, build do web ok. Vitest: contrato 567/567; scripts 326/326; dominio 665/668; web 1046/1058; api 3619/3623; raiz `test/` 48/50.
- Pendências aceitas (`tasks.md:7`): `push-backup` (pg_dump de versão diferente), `push-cpu` e SIM-58 (CPU).
- Falhas de carga (CPU a 100% por outras sessões), todas verdes ao repetir: 8 arquivos `worker` com `Hook timed out in 10000ms` (verdes com `--no-file-parallelism`, 129 testes) e PLA-28 matriz (verde isolada); 12 do web (SIM-15 passa com `--testTimeout=60000`); GEL-70 e PAR-61/PAR-140 (timeout de 5 s do eslint embutido; os de `test/lint` passam isolados, 18/18; GEL-70 segue vermelho sob carga); PAR-63.
- Playwright (teto 2 tentativas, na cópia com portas 8747/8749/8797 e banco `pelada_planos`): `landing.spec.ts` 7/7, `planos.spec.ts` 3/3 (J-27, J-28, J-30). `visual` não rodado: AD-064 isenta as telas desta feature.

## Checagens de processo

(a) `testes.json` roda todos os pacotes (`pnpm -r`). (b) typecheck verde em HEAD; amostra de commits intermediários não conclusiva: os commits são de rascunho e os links do workspace apontam ao HEAD; `a37a43bb` ("corrige casts de tipo da base") e `STATE.md:155-157` registram que rascunhos não fechavam verde (regime autorizado em `STATE.md:168`). (c) testes existentes alterados: renomeação/dados com a mesma força e motivo no commit (ex.: `3b476bcb`), cobertos por `STATE.md:141,168`. (d) sem `reuso.md`. (e) sem `teste_*` órfão. (f) matriz política × comando completa para `assinaturas`, `eventos_asaas`, backup e as 9 funções (`isolamento/planos.test.ts`). (g) divergências spec × design têm AD (087-097, 113-115). Decisões da Base seguidas: `grupo_criar` de 7 parâmetros com `p_hoje`, webhook fora do `X-Pelada`, compensação do Asaas (`assinar.test.ts:206`), `pdfLiberado`.

## Achados

| ID | `arquivo:linha` | Achado e evidência | Correção sugerida | Criticidade |
|---|---|---|---|---|
| A-01 | `backend/contrato/src/plano.ts:162-167`; `backend/api/test/rotas/assinatura-bloqueia.test.ts:124,166` | PLA-68 e PLA-69 definem o texto exato; os testes comparam com a constante importada do código e nenhum teste do repositório contém o literal (`git grep` vazio). Sondas S1 e S2 sobreviveram (`contrato` 21/21 verde com o texto trocado) | Teste em `backend/contrato/test/plano.test.ts` com os literais da spec ("Cancele a assinatura antes de arquivar o grupo"; `mensagemCanceleAntesDeExcluir('X')` = "Cancele a assinatura do grupo X antes de excluir a conta") | comum |
| A-02 | `backend/api/vitest.config.ts:83-87` | O projeto `worker` não define `hookTimeout` (o `banco` define 120 s em `:65`); na suíte completa 8 arquivos `worker` (inclusive `plano-editavel`, `webhook-asaas-aplicar`, `assinatura-cancelar`) falharam com `Hook timed out in 10000ms` ao clonar o molde em paralelo, e passaram com `--no-file-parallelism`. Gate do api instável em máquina carregada | `hookTimeout: 120_000` no projeto `worker` (ou `fileParallelism: false`, como no `banco`) | comum |
| A-03 | `migracoes/1792845480000_planos-leitura.sql:36-40,70-74` (R-01 da revisão) | `ORDER BY (a.situacao <> 'cancelada') DESC` prefere a assinatura não cancelada: quem cancela e reassina tem assinatura pendente com `pago_ate` NULL e cai para free na hora, perdendo os dias já pagos; `planos-leitura.test.ts:79` não cobre | Migração nova: usar o maior `pago_ate` entre as assinaturas do grupo, com teste do caso cancelar e reassinar | crítica |
| A-04 | `backend/api/src/aplicacao/plano/assinar.ts:71-96` (R-02) | Grupo de cortesia (`uso_proprio`) pode ser assinado pela API; só a tela esconde o botão (PLA-58); a criadora seria cobrada R$ 9,90/mês | Recusar na aplicação (e teste) quando o grupo é `uso_proprio` | crítica |
| A-05 | migrações `planos-assinatura`/`planos-webhook-*` (R-03) | Ordem de locks invertida: `assinatura_cancelar` trava `grupos` e depois `assinaturas`; webhook trava `assinaturas` e depois `grupos`: deadlock 40P01 possível e o cancelar vira 500 depois de o Asaas já ter cancelado | Migração com a mesma ordem de lock nas duas funções e teste de concorrência cancelar × webhook | crítica |
| A-06 | `assinar.ts:108-122` (R-04) | Erro após `criarAssinatura` (registro local, COMMIT) não é compensado: assinatura viva no Asaas sem linha local, webhook a ignora e a cliente paga sem Pro | try/catch chamando `compensar`, com teste | crítica |
| A-07 | `backend/contrato/src/sentry.ts:15` (SEC-001) | `limparEvento` só tira `cookie`, `set-cookie`, `authorization`: o `asaas-access-token` sai em claro nos eventos do webhook (prova: `scratchpad/sentry/prova.mjs`) | Lista de permissão de cabeçalhos, com teste; trocar o token se algum evento já foi ao Sentry de produção | crítica |
| A-08 | `entrada/rotas/webhook-asaas.ts:160-163` (SEC-002) | `LIMITE_WEBHOOK` com chave fixa roda antes do token: quem não tem o token esgota o limite e o Asaas pausa a fila; assinar e cancelar em ciclo gastam a cota do Asaas | Conferir o token antes do limitador (sem token: limitador por IP) e limite por grupo em assinar e cancelar | crítica |
| A-09 | `infraestrutura/asaas/cliente.ts:110` (SEC-004) | A chave do Asaas vai para qualquer `ASAAS_URL`, inclusive `http://` | Recusar em execução o que não for o sandbox, com exceção explícita do teste local | crítica |
| A-10 | `entrada/rotas/plano.ts`, `migracoes/1792845420000_planos-tabelas.sql:68-69` (SEC-005) | Admin convidado vê `faturaUrl` e id do cliente Asaas da criadora (LGPD) | `faturaUrl` só com `podeAssinar`; leitura de `assinaturas` só da criadora | crítica |
| A-11 | `webhook-asaas.ts:29-30`, `infraestrutura/asaas/token-webhook.ts` (SEC-006) | Comentário promete recusar token igual à chave da API e com menos de 32 caracteres; o código não faz | Recusar os dois casos, com teste | comum |
| A-12 | `backend/dominio/src/plano/eventos-asaas.ts` e a função SQL (R-08) | `dateCreated` comparado como texto cru; formato diferente do exato é aplicado mas deixa `ultimo_evento_em` sem avançar | Normalizar ou recusar o formato, com teste | comum |
| A-13 | `frontend/web` (tela Assinar Pro) (R-09) | `window.open` da fatura depois de POST assíncrono é bloqueado em Safari/iOS e no PWA | Link visível da fatura, com teste | comum |
| A-14 | `frontend/web` (`textoValidade`) (R-10) | Pode mostrar "Pro até <data passada>" | Corrigir o texto e testar | comum |
| A-15 | `aplicacao/plano/webhook.ts`, `assinar.ts` (R-05, R-06, R-07) e funções `plano_*` (SEC-003) | R-05: webhook antes do COMMIT do `assinar` vira `assinatura_desconhecida` sem reprocesso; R-06: transação e advisory lock seguram até 3 chamadas de 10 s ao Asaas; R-07: `asaas_evento_sem_efeito` sem chamador (a LACUNA de `webhook.ts` é contornável); SEC-003: sem conta no contexto a função `plano_ativar` aceita qualquer valor | Decisão do usuário: corrigir ou aceitar como risco registrado em AD | comum |

## Perguntas para o usuário

P-01 (`trialFimEm` é o último dia Pro?) e P-02 (aviso à criadora de pagamento divergente) são lacunas da spec, não achados; a P-02 já é `[LACUNA]` aberta no código.
