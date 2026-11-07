# Planos e cobrança: Validação (rodada 3, retrabalho R1)

**Data**: 2026-11-06 | **Spec**: `.specs/features/planos-e-cobranca/spec.md` | **Escopo**: rodada 3 = `git diff 66e8e95d..HEAD` (T71, A-17, SEC-007, `87d4d8e1`, `1485d94c`) mais regressão; rodada 2 = `git diff d06e52f4^ HEAD` (T58 a T70) | **Árvore**: `fae49606` (HEAD `1485d94c`; código idêntico ao de `87d4d8e1`) | **Verificador**: independente | **Veredito**: FAIL ❌ (A-16 e A-17 fechados; 1 achado novo, A-18: mutantes vivos no teto por conta)

A rodada 1 (72 de 74 critérios conformes, A-01 a A-15) está no git (`d06e52f4`). A-15 é risco aceito (AD-128), fora do retrabalho. Aqui só o diff do retrabalho. Caminhos: A=`backend/api`, C=`backend/contrato`, W=`frontend/web`.

## Achados da rodada 1 (mutação: reverte só o código da correção numa cópia isolada e roda só o teste dele)

| ID | Teste novo (`arquivo:linha`, asserção) | Sem a correção | Com a correção | Situação |
|---|---|---|---|---|
| A-01 | `C/test/plano.test.ts:182,188` `toBe('Cancele a assinatura antes de arquivar o grupo')` e `mensagemCanceleAntesDeExcluir('Pelada de Quinta')` com o literal de `spec.md:244,252` | texto trocado em `plano.ts:162,166`: 2 falhas | 23/23 | fechado |
| A-02 | `A/vitest.config.ts:89` `hookTimeout: 120_000` no projeto `worker` (config, sem teste possível); gate do api sem `Hook timed out` | n/a | ok | fechado (inspeção) |
| A-03 | `A/test/banco/planos-leitura.test.ts:102` `plano_do_grupo` e `plano_grupos_da_criadora` devolvem `pago_ate` `2026-04-05` com a nova pendente | migração `1794004084481` removida: 1 falha | 14/14 | fechado |
| A-04 | `A/test/aplicacao/assinar.test.ts:369` `{resultado:'grupo_cortesia'}` e `asaas.chamadas` `[]`; `A/test/rotas/assinatura.test.ts:174` 409 e mensagem | `=== 'cortesia'` anulado: 1 falha em cada arquivo; rota revertida: falha | verde | fechado |
| A-05 | `A/test/concorrencia/cancelar-ordem-locks.test.ts:38` `FOR UPDATE NOWAIT` do grupo passa enquanto o cancelar espera a assinatura | migração `1794004086107` removida: 1 falha | 1/1 | fechado (ordem do webhook: `1792845720000_planos-webhook-transicoes.sql:57,61`) |
| A-06 | `assinar.test.ts:283` dois testes (fatura lança; INSERT lança por trigger): `removida` `true`, `removerAssinatura` por último, erro sobe | `compensar('erro_inesperado')` removido: 2 falhas | 20/20 | fechado |
| A-07 | `C/test/sentry.test.ts:104` `asaas-access-token` fora e `JSON.stringify` sem o segredo | `sentry.ts` revertido: 1 falha | 7/7 | fechado |
| A-08 | `A/test/rotas/webhook-asaas.test.ts:177` chave `webhook:recusado:` e nunca `webhook:asaas`; `:196` 429 por IP; `assinar.test.ts:325` e `assinatura.test.ts:197` teto de 5 por hora, 429 com `Retry-After: 3600`, sem chamar o Asaas | rota revertida: falha; chave fixa para todos: falha; teto +1000: falha nos 2 arquivos | verde | fechado |
| A-09 | `A/test/infraestrutura/asaas.test.ts:298` 8 URLs recusadas (http, produção, host parecido, usuário, `@`) com `fetch` não chamado e log `url_nao_permitida`; 4 permitidas | `cliente.ts` revertido: 12 falhas | 30/30 | fechado (`wrangler.jsonc:59` já é o sandbox) |
| A-10 | `A/test/rotas/plano.test.ts:145` convidada: `assinatura` igual a `{situacao, faturaUrl:null}` e sem `sandbox.asaas.com` | `plano.ts` revertido: 1 falha | 9/9 | fechado (lado da API; RLS de leitura em AD-128) |
| A-11 | `A/test/infraestrutura/token-webhook.test.ts:12-47` 31, 32, 255 e 256 caracteres, vazio, igual à chave da API; `tokenDoWebhookConfere` recusa o valor idêntico | `token-webhook.ts` revertido: 5 falhas | 7/7 | fechado |
| A-12 | `A/test/aplicacao/evento-asaas.test.ts:7-40` 4 formatos viram `AAAA-MM-DD HH:MM:SS`; `Z`, fuso, só data, vazio e texto viram `null`; `eventoDoCorpo` grava a normalizada | `evento-asaas.ts` revertido: 12 falhas | 12/12 | fechado |
| A-13 | `W/test/telas/assinar-pro.test.tsx:70` com `window.open` bloqueado, o link "Abrir a fatura" tem `href` da fatura, `target=_blank` e `rel` com `noopener` | `AssinarPro.tsx` revertido: 1 falha | verde | fechado |
| A-14 | `W/test/telas/texto-validade.test.ts:19` `pagoAte` vencido dá "Pro: renovação em andamento", sem `05/12/2026`; o último dia ainda mostra a data | `MeuPlano.tsx` revertido: 1 falha | 16/16 (3 arquivos) | fechado |

**Sensor**: 17 mutações (todo o código de A-01 a A-14, com A-04, A-06 e A-08 também em ramos separados), 17 mortas, 0 sobreviventes; A-02 sem mutante possível (config). Cópia `…-val-planos-mut2` (junções de `node_modules`) removida; `git status --porcelain` só mostra `seguranca.md` (de outro agente); nenhum banco ou role `teste_*` em 5447.

## Regressão e processo

- Testes existentes: o diff dos testes só tem linhas adicionadas (0 removidas). `assinar.test.ts:55-60` prepara G, H e H2 em `trial` no `beforeAll`: necessário porque o cenário nasce `uso_proprio` (cortesia) e A-04 agora recusa; os testes antigos mantêm as asserções e `rotas/assinatura.test.ts:101` já fazia o mesmo. Não é enfraquecimento.
- `esquema-producao.txt`: 3 linhas trocadas, só o hash de `assinatura_cancelar`, `plano_do_grupo` e `plano_grupos_da_criadora` (as funções que as 2 migrações redefinem); nenhuma outra. Migrações aditivas (arquivos novos com `CREATE OR REPLACE`), nenhuma aplicada foi editada.
- Spec × design: `grupo_cortesia` e `muitas_tentativas` são códigos novos do contrato (`C/src/plano.ts:191,203`), nomeados em T61 e T65; sem divergência da spec.
- (a) `testes.json` roda todos os pacotes. (b) typecheck de HEAD verde (gate do chamador); commits intermediários não amostrados (links do workspace apontam ao HEAD, inconclusivo como na rodada 1). Commits agrupam T58-T64 e T65-T70 em dois commits, em vez de um por pacote ou assunto: sem efeito.
- Observação, sem achado: `dataCriacaoNormalizada` devolve `null` para formato fora de `AAAA-MM-DD HH:MM:SS`; com evento já aplicado, o domínio trata `null` como `fora_de_ordem` (`dominio/src/plano/eventos-asaas.ts:96-97`). É o desenho de T69 ("recusar"); se o Asaas mudasse o formato, os eventos seguintes seriam descartados sem aviso.
- Observação: `webhook-asaas.test.ts:207` (a cota de quem errou o token não afeta o Asaas) passa também com o código antigo; quem discrimina é o `:177`, morto na reversão.

## Gate (árvore `66e8e95d`, rodado pelo chamador; não repetido)

lint, format, typecheck, checagens 134/134, build do web; contrato 570, dominio 668, scripts, web 1062/1063 (SIM-15 só por tempo sob carga, passa isolado), api 3663/3667 (push-backup x2 e push-cpu: pendências aceitas em `tasks.md:7`; FUN-08 corrigido depois), e2e 72/74 (2 de `pdf-visual` PAR-108, idênticas na `main` `f9801ec0`: pré-existente). Reconfirmado por mim na cópia limpa: contrato 30/30 (plano e sentry), api banco 84/84 nos 6 arquivos tocados, api worker 42/42 nos 3 arquivos de rota, web 16/16.

## Rodada 3 (escopo curto)

| ID | Evidência | Situação |
|---|---|---|
| A-16 | `tasks.md:299` (Phase 22) traz `Gate: lint, format, typecheck, vitest por pacote, checagens e build do web @ df3213e0… = verde, com pendências aceitas (…)`. `git rev-parse 87d4d8e1^{tree}` = `df3213e0…` (commit de código do lote; `git diff 87d4d8e1 HEAD` só tem `tasks.md`). Resultado conferido por mim: api banco 148/148 (aplicacao, asaas, concorrencia) e 53/53 nos 2 arquivos tocados, api worker 42/42 (assinatura, plano, webhook-asaas), contrato 570/570, checagens 134/134, FUN-08 (`esquema.test.ts`) 4/4, `tsc --noEmit` do api verde | fechado |
| A-17 | `A/test/aplicacao/assinar.test.ts:371,390` (PLA-60: 10 da conta em outro grupo: `{resultado:'muitas_tentativas'}` e `asaas.chamadas` `[]`; 9: `'criada'`); `A/test/infraestrutura/asaas.test.ts:333` `toHaveBeenCalledWith(…, objectContaining({redirect:'error'}))`. Cenário compartilhado intacto: `assinar.test.ts` 22/22, rotas 42/42 | fechado (com A-18 em aberto) |

**Sensor da rodada 3** (cópia `val3-mut-planos`, junções, só o teste do arquivo; 6 mutações): M1 checagem por conta anulada (a condição por conta em `assinar.ts` vira `false`): 1 falha, morta. M3 `>` no lugar de `>=` no teto por conta: 1 falha, morta. M2 `redirect:'error'` removido (`cliente.ts:139`): 1 falha, morta. M2b `redirect:'follow'`: 1 falha, morta. **M4** contagem sem `criada_por` (`assinaturas.ts:164`, conta de todos): 22/22, **sobrevive**. **M5** janela da conta de 1 dia (`assinaturas.ts:164`): 22/22, **sobrevive**. Nenhum dos dois é equivalente: M5 bloquearia a conta por um dia; M4 (parcial: a RLS do `pelada_app` esconde parte das linhas alheias, mas não as do mesmo grupo) bloquearia por assinaturas de outras contas. O teto por grupo tem o par que falta (`assinar.test.ts:359` com `now() - interval '2 hours'`). Cópia removida, `git status --porcelain` vazio, nenhum banco ou role `teste_*` em 5447.

## Resumo das rodadas

- R1 (72/74 critérios; A-01 a A-15; A-15 risco aceito, AD-128): `d06e52f4`. R2: A-01 a A-14 fechados, 17 mutações mortas. R3: A-16 e A-17 fechados; SEC-007 corrigido; SEC-005 de banco é risco aceito na AD-128 (decisão do usuário, mesmo tipo do A-15); A-18 novo.
- Gate completo (árvore `df3213e0`, rodado pelo chamador): reaproveitado, não repetido.

## Achados abertos

| ID | `arquivo:linha` | Achado e evidência | Correção sugerida | Criticidade |
|---|---|---|---|---|
| A-18 | `backend/api/test/aplicacao/assinar.test.ts:371-408`, `backend/api/src/infraestrutura/db/repositorios/assinaturas.ts:164` | O teto por conta só tem teste de contagem (10 bloqueia, 9 passa, todas com `criada_por` da conta e a 10 min). M4 (sem `criada_por`) e M5 (`interval '1 day'`) sobrevivem com 22/22. Falta o par do teto por grupo: linhas de 2 h atrás e linhas de outra conta no mesmo grupo não contam | No `describe` A-17, acrescentar: 9 recentes da conta mais 1 de 2 h atrás e 1 de outra conta, ainda `criada`; teste deve morrer com M4 e M5 | crítica (mutante vivo em isolamento por dono e janela do teto de cobrança) |
