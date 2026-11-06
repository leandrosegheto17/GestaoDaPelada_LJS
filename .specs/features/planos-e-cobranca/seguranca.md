# Segurança: planos-e-cobranca — rodada 2: 0 críticos, 0 altos, 1 médio novo; SEC-001, 002, 004, 006 fechados

> Rodada 2 (reteste do retrabalho R1, T58 a T70), 2026-11-06, `auditor-seguranca`. Worktree `GestaoDaPelada_v2-val-planos`, branch `feature/planos-e-cobranca`, HEAD `1fbee8fb`, diff `d06e52f4^..HEAD -- backend frontend`. Somente leitura. Teste ativo só local: Postgres `127.0.0.1:5447` (`pelada_planos`, container `pelada-val-planos-pg`); as duas migrações novas foram aplicadas dentro de `BEGIN … ROLLBACK` para ler o catálogo (o `md5` de `assinatura_cancelar` voltou ao antigo depois, `641a44dc…`). Nenhum banco `teste_*` órfão. As 2 linhas de `assinaturas` e as 3 de `eventos_asaas` que existem no banco são de um e2e anterior (`sub_lo1fc4_*`, 22:09 UTC), não desta auditoria.

Ferramentas: `gitleaks` nos 5 commits do retrabalho (nenhum vazamento); `vitest` dos arquivos tocados (api: 9 arquivos, 126 testes verdes; contrato `sentry.test.ts`: 7 verdes); provas em `C:\Users\leand\AppData\Local\Temp\claude\b1dd5b99a1e67609\b0c8308b-311c-457f-93d1-1a72b7651836\scratchpad\sentry\prova.mjs`, `...\scratchpad\sentry\prova2.mjs`, `...\scratchpad\asaas\url.mjs` e `...\scratchpad\asaas\bs.mjs`. `semgrep` e `osv-scanner` não instalados.

## Situação dos achados da rodada 1

| Achado | Situação | Prova |
|---|---|---|
| SEC-001 | **fechado** | Lista de permissão em `backend/contrato/src/sentry.ts:19-30,58` (`nome.toLowerCase()`). A mesma prova da rodada 1 (`prova.mjs`, com `requestDataIntegration` real do `@sentry/core` 10.78) agora sai `{"content-type":"application/json"}`. `prova2.mjs`: `Asaas-Access-Token` e `asaas-access-token` repetidos (o SDK junta em `"A, B"`), `X-Asaas-Access-Token` e `Cookie` saem todos; `ASAAS-ACCESS-TOKEN` direto no evento sai; valor em array de cabeçalho permitido passa como está. Sem tracing (`tracesSampleRate` ausente em `backend/api/src/entrada/observabilidade.ts:34-41`), não há transação com atributos de cabeçalho. |
| SEC-002 | **fechado** (vetor sem token e vetor com um grupo); resíduo no SEC-007 | Token antes do limitador: `backend/api/src/entrada/rotas/webhook-asaas.ts:173-189`; quem erra conta em `webhook:recusado:<ip/64>` (`:178-181`) e nunca em `webhook:asaas` (`:188`). Testes `PLA-40 (A-08)` verdes. Teto em `backend/api/src/aplicacao/plano/assinar.ts:98` com `abertasNaUltimaHora` (`backend/api/src/infraestrutura/db/repositorios/assinaturas.ts:151-157`), lido depois da trava do grupo (`assinar.ts:79`), sem corrida entre duas requisições. |
| SEC-003 | fora de propósito (AD-128) | Ver "Fidelidade da AD-128" abaixo. |
| SEC-004 | **fechado** | `backend/api/src/infraestrutura/asaas/cliente.ts:93-105` e `:126` (recusa antes do `fetch`, o log leva só o motivo, nunca a URL). `url.mjs`/`bs.mjs`: recusados `http://api-sandbox…`, `api.asaas.com`, `api-sandbox.asaas.com.evil.com`, ponto final, userinfo (`u:p@`, `sandbox@evil`, `evil@sandbox`), `localhost.evil.com`, `localhost%2eevil.com`, `evil.com#@localhost`, `https://localhost`, `[::1]` (falso negativo inofensivo). Aceitos só com destino igual ao conferido: caixa alta, porta (`:8443`) no host do sandbox, `127.0.0.1`/`2130706433`/`0x7f.1`/`127.1` (normalizados para `127.0.0.1`), `*.localhost`, `localhost\@evil.com` (o `\` vira `/`, destino `localhost`). Em todos os aceitos, o host de `base + caminho` é o mesmo do `base` validado. Testes de `asaas.test.ts` verdes. |
| SEC-005 | **fechado na API**; resíduo de banco sem registro | `faturaUrl` só com `podeAssinar` em `backend/api/src/entrada/rotas/plano.ts:37,59`; teste `PLA-08 (A-10)` verde. As 409 de `assinar` com `faturaUrl` só são alcançadas pela criadora (`assinar.ts:83`). A policy `assinaturas_ler` (`1792845420000_planos-tabelas.sql:64-65`) não mudou: nenhuma migração nova a toca. Ver "Fidelidade da AD-128". |
| SEC-006 | **fechado** | `backend/api/src/infraestrutura/asaas/token-webhook.ts:11-20` (32 a 255 caracteres, diferente de `ASAAS_API_KEY`) e `:30,35` (configuração inválida recusa até o valor idêntico, ainda em tempo constante); a rota passa a chave em `webhook-asaas.ts:174`. Testes `PLA-38`/`PLA-39` de `token-webhook.test.ts` verdes. O comentário de `webhook-asaas.ts` agora corresponde ao código. |

### Fidelidade da AD-128 (`.specs/STATE.md:135`)

- **SEC-003: fiel no risco, impreciso no mecanismo.** A pré-condição ("só importa se alguém rodar SQL como `pelada_app`") e a correção futura (role própria, teto em `p_pago_ate`, preço fixo) estão certas. A redação "sem conta no contexto as funções `plano_ativar` e `assinatura_registrar` aceitam qualquer valor" mistura dois casos: o abuso é a **própria sessão** zerar `app.conta_id` (é um GUC que o chamador define) e chamar `asaas_evento_registrar` + `plano_ativar`; já `assinatura_registrar` exige a conta e aceita qualquer `p_valor_centavos` com a conta da criadora. Sugestão de redação; não reabre.
- **SEC-005: não está na AD-128.** O pedido diz que a restrição de leitura de `assinaturas` por RLS ficou de fora de propósito e está na AD-128, mas a AD-128 só lista R-05, R-06, R-07 e SEC-003. Além disso, a T67 (`tasks.md:2057-2067`) descreve "policy de leitura de `assinaturas` só da criadora (migração nova)" e está `concluída`, sem migração nenhuma. O risco residual é baixo e tem a mesma pré-condição do SEC-003 (admin convidado só lê `fatura_url` e `asaas_cliente_id` da criadora com SQL próprio como `pelada_app`; não há rota que os devolva). Falta registrar: incluir SEC-005 (parte de banco) na AD-128 e corrigir a T67 com `SPEC_DEVIATION`, ou fazer a migração.

## Achados novos

### SEC-007 [MÉDIO] O teto de 5 por hora é por grupo: uma conta com muitos grupos volta a saturar o webhook e a cota do Asaas

- **Onde:** `backend/api/src/infraestrutura/db/repositorios/assinaturas.ts:151-157` (`WHERE grupo_id = …`), usado em `backend/api/src/aplicacao/plano/assinar.ts:98`; criar grupo não tem teto por conta (`backend/api/src/entrada/rotas/grupos.ts:26-37`, só o `LIMITE_ESCRITA` de 60/min), e assinar fica fora da trava de somente leitura (AD-092), então até o 2º grupo Free em diante assina.
- **Evidência (leitura):** o teto conta só as linhas do grupo. As tentativas que chegam ao Asaas e falham (`criarCliente` ou `criarAssinatura` com `falhou`, compensações) não gravam linha e não contam.
- **Cenário:** uma conta cria cerca de 360 grupos (6 min do `LIMITE_ESCRITA`) e alterna `POST`/`DELETE …/assinatura` em rodízio, 5 por grupo por hora, até o `LIMITE_ESCRITA` (30 ciclos/min). Cada ciclo faz 3 chamadas ao Asaas (`criarAssinatura`, `primeiraCobranca`, `removerAssinatura`) e gera cerca de 3 eventos legítimos ao webhook. São perto de 90 eventos/min na chave fixa `webhook:asaas` (60/min): o fim de cada janela de 60 s vira 429 seguidos, mais que os 15 que pausam a fila do Asaas, e a cota de 25 mil chamadas em 12 h acaba em cerca de 4,5 h. Efeito igual ao 2º vetor do SEC-002 da rodada 1 (cobrança parada para todos), agora com o custo de criar grupos por script. **Outra conta não esgota o teto da criadora:** só `assinatura_registrar` insere em `assinaturas` e exige `criado_por = conta` (`1792845600000_planos-assinatura.sql:39`), e a API recusa antes (`assinar.ts:83`).
- **Correção:** teto também por conta (`criada_por` ou `grupos.criado_por`, ex.: 5 a 10 por hora no total) e contar as tentativas que chegam ao Asaas, não só as gravadas (ex.: registrar a tentativa antes da chamada, numa tabela própria ou na trava). Teste: dois grupos da mesma criadora, 5 no primeiro → o 1º do segundo grupo recebe `muitas_tentativas`.

## Conferido sem achado (rodada 2)

- **Migrações 1794004084481 e 1794004086107:** aplicadas em transação local e lidas no catálogo. `plano_do_grupo`, `plano_grupos_da_criadora` e `assinatura_cancelar` seguem `SECURITY DEFINER`, `search_path=public, pg_temp`, dono `postgres`, ACL `{postgres=X, pelada_app=X}` (sem `PUBLIC`, sem `pelada_backup_ro`); os `md5(prosrc)` batem com `esquema-producao.txt` (`d30c828f…`, `b7f6a1c2…`, `8eda9283…`). As duas leituras mantêm o filtro `grupos_visiveis()` e `app_conta_id() IS NOT NULL`. Em `assinatura_cancelar`, o `FOR UPDATE` das assinaturas vem antes da conferência de `criado_por`: quem não é a criadora (só por SQL direto, a API recusa antes) segura o lock até a exceção desfazer a transação, sem ler nem mudar nada. A troca de ordem do `pago_ate` não abre caminho de Pro sem pagar: só reaproveita o `pago_ate` já pago de uma cancelada.
- **`dateCreated`:** `dataCriacaoNormalizada` (`backend/api/src/aplicacao/plano/evento-asaas.ts:120-124`) é ancorada e devolve `null` fora do formato; com `null` e algo já aplicado, o domínio não aplica (`backend/dominio/src/plano/eventos-asaas.ts:96-98`), o que falha para o lado seguro. A entrada só chega com o token do Asaas.
- **Frente:** o link "Abrir a fatura" (`frontend/web/src/telas/plano/AssinarPro.tsx:151-157`) usa `rel="noopener noreferrer"` e um `faturaUrl` que só existe gravado com CHECK `^https://` (a 201 só sai depois do `registrar`).
- **Compensação do A-06** (`assinar.ts:150-153`): o log leva ids, nunca o CPF; o 500 que sobe ao Sentry passa pela lista de permissão e sem corpo.
- **Observações sem severidade:** (1) o `fetch` do Asaas segue redirecionamentos (padrão) e o cabeçalho `access_token` iria junto; só importa se o próprio `api-sandbox.asaas.com` redirecionasse; `redirect: 'error'` em `cliente.ts:130` fecha isso de graça. (2) A exceção `http` de loopback vale em qualquer ambiente, não só em teste; no Worker publicado ela não alcança nada fora da máquina. (3) `referer` está na lista de permissão; os tokens do app vão no fragmento (`frontend/web/src/dados/fragmento.ts:10-12`), que não sai no Referer, e a query da `url` é filtrada pelo SDK. (4) O teste do SEC-001 (`backend/contrato/test/sentry.test.ts`) usa um evento montado à mão, não o `requestDataIntegration` real; a prova acima cobre, mas o teste não pegaria uma mudança do SDK. (5) Se o Sentry de produção recebeu algum evento do webhook antes deste retrabalho, a troca do `ASAAS_WEBHOOK_TOKEN` continua recomendada.

## Bloqueia o lançamento? (rodada 2)

Não há crítico nem alto. O SEC-007 (médio) pesa do mesmo jeito que o SEC-002 da rodada 1: vale antes de ligar o Asaas de produção. Falta registrar o resíduo de banco do SEC-005 (AD-128 e T67). A severidade é proposta do auditor; aprovar é do usuário.

---

# Rodada 1 — 0 críticos, 0 altos, 2 médios, 4 baixos

> Auditoria do `auditor-seguranca` no `/validar`, 2026-11-06. Worktree `GestaoDaPelada_v2-val-planos`, branch `feature/planos-e-cobranca` (HEAD `f9801ec0`). Somente leitura; o único teste ativo foi no Postgres local `127.0.0.1:5447` (`pelada_planos`, container `pelada-val-planos-pg`), dentro de transação com `ROLLBACK` (contagem de `assinaturas` e `eventos_asaas` conferida em 0 depois).

## Escopo e superfície

| Ponto de entrada | Quem chama | Proteção conferida |
|---|---|---|
| `POST /api/webhooks/asaas` | Asaas (sem sessão) | `LIMITE_WEBHOOK` com chave fixa → token `asaas-access-token` (SHA-256 + XOR em tempo constante, ausente/vazio = 401) → `bodyLimit` 64 KiB → zod tolerante → transação sem contexto |
| `POST`/`DELETE /api/grupos/:grupoId/assinatura` | criadora do grupo | `X-Pelada`, sessão, `LIMITE_ESCRITA`, vínculo (404), grupo ativo, `criado_por` na API e de novo na função `SECURITY DEFINER` |
| `GET /api/grupos/:grupoId/plano` | admin do grupo | vínculo (404) + `plano_do_grupo` filtrado por `grupos_visiveis()` |
| `GET /api/publico/:slug/ranking` e `/pdf` | qualquer pessoa | `pdfLiberado` no contrato, 403 `plano_pro` no PDF |
| Funções `plano_*`, `assinatura_*`, `asaas_evento_*` | `pelada_app` | `SECURITY DEFINER`, `search_path = public, pg_temp`, `REVOKE ALL FROM PUBLIC`, `EXECUTE` só `pelada_app` |

Dados sensíveis: CPF, nome e e-mail do pagador (vão só ao Asaas), `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, situação comercial do grupo (dinheiro).

Ferramentas: `pnpm audit` (2 moderados, `glob` e `minimatch` via `node-pg-migrate`, fora desta feature), `gitleaks` (3 `generic-api-key` em testes de outras features, fixtures), busca embutida de segredos no histórico (249 ocorrências, todas fixtures de teste ou `.env.example`; nas da feature, só tokens falsos de teste). Nenhuma chave `$aact_` real no histórico. `osv-scanner` e `semgrep`: não instalados.

## Achados

### SEC-001 [MÉDIO] O token do webhook vai ao Sentry nos eventos capturados durante o webhook

- **Onde:** `backend/contrato/src/sentry.ts:15` (`CABECALHOS_REMOVIDOS` só tem `cookie`, `set-cookie`, `authorization`); captura dentro da requisição do webhook em `backend/api/src/aplicacao/plano/webhook.ts:47-56` (`webhook_asaas_valor_divergente`) e em `backend/api/src/entrada/middlewares/com-banco.ts:60` (`apos_commit_erro`, quando o `agendarAviso` registrado em `webhook-asaas.ts:191` falha).
- **Evidência:** o `@sentry/cloudflare` 10.78 grava toda a requisição no escopo (`scope-utils.js:14`, `winterCGRequestToRequestData`), e o `requestDataIntegration` padrão copia **todos** os cabeçalhos para `event.request.headers` com `sendDefaultPii: false` (a lista de bloqueio `PII_HEADER_SNIPPETS` só tira cabeçalhos de IP; os trechos sensíveis como `token` só filtram atributos de span, não o evento). Prova local (`scratchpad/sentry/prova.mjs`, token falso) com o mesmo `processEvent` e o `limparEvento` do projeto. Saída: `{"asaas-access-token":"TOKEN_FALSO_DE_PROVA_…","content-type":"application/json"}`.
- **Cenário:** um evento autêntico com valor diferente de 9,90 (ex.: juros ou multa configurados no painel, desconto) ou uma falha da fila no `aposCommit` gera um evento no Sentry com o `ASAAS_WEBHOOK_TOKEN` em claro. Quem lê o Sentry (ou um vazamento do Sentry) passa a forjar webhooks: com o id de uma assinatura (a criadora o vê nas telas do Asaas), `PAYMENT_RECEIVED` falso dá Pro sem pagar e `SUBSCRIPTION_DELETED` falso derruba o Pro de quem pagou. Contraria PLA-39 ("não registrar o valor recebido") e o PLA-51 ("Sentry sem dado pessoal" é cumprido, mas o segredo vai junto).
- **Correção:** em `limparEvento`, remover os cabeçalhos por lista de permissão (ou, no mínimo, todo nome com `token`, `key`, `secret`, `auth`, mais `asaas-access-token`), com teste que monte o evento pelo `requestDataIntegration` real e afirme a ausência. Se o Sentry de produção já recebeu algum evento desses, **trocar o `ASAAS_WEBHOOK_TOKEN`** no Worker e no painel do Asaas (apagar o evento no Sentry não basta).

### SEC-002 [MÉDIO] Quem não tem o token esgota o limite do webhook e faz o Asaas pausar a fila

- **Onde:** `backend/api/src/entrada/rotas/webhook-asaas.ts:160` (o `limiteTaxa('LIMITE_WEBHOOK', () => CHAVE_LIMITE_WEBHOOK)` roda **antes** da conferência do token na linha 163, com chave fixa `webhook:asaas`); `wrangler.jsonc:27` (60 por minuto).
- **Evidência:** a requisição sem token gasta a mesma cota global que o Asaas usa; a recusa por token só vem depois.
- **Reprodução (não executada contra a prévia, só por leitura; local seria `wrangler dev`):** mandar 61 `POST /api/webhooks/asaas` sem cabeçalho em menos de 60 s pelo mesmo ponto da Cloudflare do Asaas (São Paulo); a 61ª e as entregas legítimas do Asaas no mesmo minuto recebem 429. O Asaas conta 429 como falha; 15 falhas seguidas pausam a fila (spec, linha 52), e pagamentos confirmados deixam de ativar grupos até alguém reativar a fila (PLA-72).
- **Segundo vetor, com conta:** uma criadora alterna `POST` e `DELETE …/assinatura` (cancelar a pendente libera assinar de novo, AD-115) até o `LIMITE_ESCRITA` (60/min). Cada ciclo cria uma assinatura no Asaas, que dispara `PAYMENT_CREATED`, `PAYMENT_DELETED` e `SUBSCRIPTION_DELETED` legítimos ao webhook (mais de 60 por minuto, o que satura o mesmo limite) e gasta cerca de 3 chamadas da cota de 25 mil em 12 h da conta Asaas do app.
- **Correção:** conferir o token antes do limitador (o custo é um SHA-256) e aplicar o `LIMITE_WEBHOOK` só às requisições autenticadas; recusar as sem token por um limitador por IP próprio (ou filtrar pelos IPs publicados pelo Asaas). Para o segundo vetor: limite próprio de assinar/cancelar por grupo (ex.: 5 por hora) antes de chamar o Asaas.

### SEC-003 [BAIXO] Qualquer sessão `pelada_app` promove o próprio grupo a Pro pelas funções do webhook (defesa em profundidade)

- **Onde:** `1792845720000_planos-webhook-transicoes.sql:28-36` (`plano_exigir_webhook` só exige `app.conta_id` vazio) e `:38-80` (`plano_ativar` aceita qualquer `p_pago_ate`); `1792845600000_planos-assinatura.sql:25-61` (`assinatura_registrar` aceita qualquer `p_valor_centavos`).
- **Evidência (teste local com `ROLLBACK`):** como `pelada_app` com a conta da criadora: `UPDATE grupos SET situacao_comercial` → `permission denied` (correto); `INSERT INTO grupos` → RLS recusa (correto); `plano_ativar` → recusa por ter conta (correto). Em seguida, a **mesma sessão** faz `set_config('app.conta_id','',true)`, chama `asaas_evento_registrar` e `plano_ativar('sub_sec_teste','2099-12-31',…)` → `t`; o grupo fica `ativo` com `pago_ate = 2099-12-31`.
- **Cenário:** "sem conta no contexto" não autentica o webhook: o contexto é um GUC que o próprio chamador define. Hoje não há caminho pela API (todo SQL é parametrizado com o `sql` do Kysely e a conferência do token fica na rota), então só vale com execução de SQL como `pelada_app` (injeção numa rota futura ou vazamento da credencial do Hyperdrive). PLA-13 está cumprido como escrito.
- **Correção:** role própria do webhook (ex.: `pelada_webhook`, com `EXECUTE` só nas 5 funções do webhook e conexão própria) e tirar o `EXECUTE` delas da `pelada_app`; limitar `p_pago_ate` a no máximo `current_date + 2 meses` e fixar `p_valor_centavos = 990` (ou CHECK com o preço vigente) dentro das funções.

### SEC-004 [BAIXO] O cliente do Asaas manda a chave para qualquer `ASAAS_URL`, inclusive `http://`

- **Onde:** `backend/api/src/infraestrutura/asaas/cliente.ts:110` (`base` sem conferência de esquema nem host) e `:122-127` (cabeçalho `access_token`).
- **Evidência:** a trava PLA-38 é só estática (`backend/scripts/checagens/so-previa.ts:39-46`, sobre `wrangler.jsonc` e `deploy.yml`); o e2e já sobe o Worker com `--var ASAAS_URL:http://127.0.0.1…` (`frontend/web/playwright.config.ts:107`). Não é SSRF (o valor não vem do usuário), mas um `--var`/variável trocada no painel da Cloudflare manda a `ASAAS_API_KEY` em claro para outro destino sem nenhuma recusa em tempo de execução.
- **Correção:** em `asaasHttp`, recusar (`sem_configuracao`) base que não seja `https://api-sandbox.asaas.com/v3` enquanto não houver AD de produção, com exceção explícita para `127.0.0.1` só quando `EMAIL_DEV`/modo de teste estiver ligado.

### SEC-005 [BAIXO] Admin convidado lê o link da fatura e o id do cliente Asaas da criadora (LGPD)

- **Onde:** `backend/api/src/entrada/rotas/plano.ts` (`assinatura.faturaUrl` devolvido a todo admin, não só a quem tem `podeAssinar`); policy `assinaturas_ler` (`1792845420000_planos-tabelas.sql:68-69`) deixa todo admin ler `asaas_cliente_id` e `fatura_url`.
- **Cenário:** a fatura do Asaas mostra os dados do pagador (nome e documento, conforme a configuração da conta Asaas; não confirmado no sandbox nesta auditoria). Um admin convidado abre o link pela resposta da API mesmo sem o botão na tela. A spec (PLA-54, PLA-57) só pede o link para a criadora.
- **Correção:** devolver `faturaUrl` só quando `podeAssinar` for verdadeiro; restringir a policy de leitura de `assinaturas` à criadora do grupo (ou expor só por função que filtre).

### SEC-006 [BAIXO] O comentário diz que o token igual à chave da API é recusado, mas o código não faz isso

- **Onde:** `backend/api/src/entrada/rotas/webhook-asaas.ts:29-30` (comentário) e `backend/api/src/infraestrutura/asaas/token-webhook.ts:13-22` (só compara com `ASAAS_WEBHOOK_TOKEN`).
- **Cenário:** só pesa se alguém configurar o token igual à chave (o Asaas proíbe no painel). Hoje o comentário dá uma garantia que não existe.
- **Correção:** recusar (401) quando `ASAAS_WEBHOOK_TOKEN === ASAAS_API_KEY`, ou com menos de 32 caracteres, com teste; ou corrigir o comentário.

## Conferido sem achado

- **Token do webhook:** SHA-256 dos dois lados e XOR dos 32 bytes; ausente, vazio ou `ASAAS_WEBHOOK_TOKEN` sem valor → 401; o log do 401 leva só `comHeader` (`webhook-asaas.ts:164-167`).
- **Replay e idempotência:** `eventos_asaas.id` PK + `ON CONFLICT DO NOTHING` → `repetido` sem efeito; eventos diferentes da mesma assinatura em fila pelo `FOR UPDATE`; `dateCreated` mais antigo que o último aplicado → `fora_de_ordem`; o mesmo `payment.id` não ativa duas vezes (`ja_aplicado`); valor diferente não ativa.
- **IDOR:** assinar e cancelar conferem `criado_por` na API (`assinar.ts:73`, `cancelar.ts:60`) e de novo na função (`42501`); `GET …/plano` responde 404 a quem não é admin (vínculo + `grupos_visiveis()`).
- **Grants e RLS (consulta ao catálogo local):** `pelada_app` sem UPDATE em `situacao_comercial`/`trial_inicio`; `INSERT` em `grupos` barrado pela RLS; `assinaturas` só SELECT; `eventos_asaas` sem grant nenhum; `asaas_data` e `plano_exigir_webhook` sem EXECUTE para a `pelada_app`; FORCE RLS nas duas tabelas novas; `pelada_backup_ro` só SELECT com policy própria. Todas as funções `SECURITY DEFINER` com `search_path = public, pg_temp` e `REVOKE ALL FROM PUBLIC`.
- **CSRF:** a isenção do `X-Pelada` vale só para `POST` no caminho exato `/api/webhooks/asaas` (`cabecalho-pelada.ts:29-31`), e a rota não usa a sessão (`SEM_CONTEXTO`). Assinar e cancelar exigem `X-Pelada`.
- **Entrada:** `assinaturaCorpo` `.strict()` (campo de cartão recusado), CPF com dígito verificador; corpo do webhook tolerante, sem ler `customer`; `fatura_url` com CHECK `^https://` (o `href` não aceita `javascript:`).
- **CPF/LGPD:** o CPF não vai a tabela, auditoria nem log (`cliente.ts` registra só operação, status e motivo; a compensação loga ids). O Sentry tira o corpo da requisição (`limparEvento`).
- **Segredos:** `.env.example` só com nomes; checagens `chave-asaas` e `so-previa` no CI; nada de `$aact_` real no histórico.
- **Observação sem severidade:** `pdfLiberado` (AD-095) e o 403 `plano_pro` do PDF público revelam a qualquer visitante se o grupo está no Free. É decisão registrada; anotar na política de privacidade se isso importar.

## Bloqueia o lançamento?

Não há crítico nem alto. Os dois médios (SEC-001, SEC-002) valem antes de ligar o Asaas de produção: o SEC-001 vaza um segredo de dinheiro a terceiro e o SEC-002 para a cobrança de todos sem precisar de credencial. A severidade é proposta do auditor; aprovar é do usuário.
