# Fundação — Relatório de verificação

**Data**: 2026-10-25
**Spec**: `.specs/features/fundacao/spec.md`
**Faixa do diff**: `main..feat/fundacao` (HEAD `e20709c`, 370 arquivos, 75 de teste)
**Verificador**: subagente independente (autor ≠ verificador). Nada do código ou dos testes da árvore real foi alterado; a única escrita foi este arquivo.

**Result (atual, rodada 2)**: PASS ✅ (lacunas executáveis fechadas; resta só o pendente de entrega, T47 a T49). Ver "Rodada 2" no fim do arquivo.
**Result (rodada 1, histórico)**: FAIL ❌ (um critério sem entrega ponta a ponta, FUN-35; o restante conforme a spec ou pendente de entrega externa). O texto abaixo é o da rodada 1, preservado; onde diverge da rodada 2, vale a rodada 2.

---

## Resumo executivo

- **Gate completo**: verde. 984 testes vitest (0 falhas, 0 pulados), 11 e2e Playwright e 6 comparações visuais (máx. 0,65%).
- **Sensor de discriminação**: 20 mutações de comportamento injetadas numa cópia isolada, 20 mortas, 0 sobreviveram.
- **Rastreio**: 56 requisitos `FUN-NN`. 40 com asserção localizada e valor esperado conforme a spec; 1 sem entrega ponta a ponta (FUN-35); 15 com parte executável coberta e a parte que depende de GitHub, Cloudflare, Neon ou contas externas **pendente de entrega** (T47 a T49, não é falha).
- **Bloqueio**: FUN-35. A função que decide mostrar a instrução de instalação existe e é testada, mas nenhum código de produção a usa. Nenhuma tela mostra a instrução. Precisa de decisão do usuário (ver "Perguntas para o usuário" no retorno).

---

## Conclusão das tarefas (`tasks.md`)

| Tarefa | Situação | Observação |
| ------ | -------- | ---------- |
| T3 a T46 | ✅ Concluídas | Todas as caixas `[x]`. Desvios (`SPEC_DEVIATION`) registrados no próprio `tasks.md`. |
| T1, T2 | ⚠️ Parcial | Spikes feitos e registrados. Falta a baixa da branch Neon `spike-descartavel` e do Hyperdrive `spike-s1` (ação do usuário, `tasks.md:135` e `:163`). **Pendente de entrega.** |
| T16 | ⚠️ Parcial | Item "origem do Hyperdrive aponta para `pelada_app` e cache desligado" aberto (`tasks.md:514`). É propriedade da Cloudflare, não do `wrangler.jsonc`; a conferência está no `deploy.yml`. **Pendente de entrega.** |
| T47, T48, T49 | ⏳ Não iniciadas | Ações externas (push, deploy, migração de produção, backup real e restauração). **Pendente de entrega.** |

Integridade de testes: a `main` não tinha nenhum teste (projeto novo); nenhum teste foi apagado (`git diff --diff-filter=D` vazio). Não há `.skip`, `.only`, `.todo` nem `xit` (busca em `backend`, `frontend` e `test`). Cobertura de teste copiado do legado: nos componentes base, o código e o CSS Module são idênticos ao legado (conferido por mim com `diff -rq --strip-trailing-cr` contra `C:\Leandro\Projetos\GestaoDaPelada`, só diferem testes); `global.css` e `tokens.css` idênticos ao legado.

---

## Critérios de aceite ancorados na spec

Legenda: ✅ conforme (asserção localizada com o valor da spec) · 🕓 conforme no que é executável localmente, resto **pendente de entrega** · ⚠️ lacuna de precisão da spec · ❌ sem entrega.

### P1: Ambiente local reproduzível

| Critério | Resultado esperado pela spec | `arquivo:linha` + asserção | Resultado |
| -------- | ---------------------------- | -------------------------- | --------- |
| FUN-01 monorepo pnpm 11, Node 24, `type: module`, TS estrito nos 5 pacotes | `engines` `>=24 <25`, `.nvmrc` 24, pnpm 11, `type: module`, `strict` e `extends` da base | `test/repositorio.test.ts:14` `engines.node).toBe('>=24 <25')`; `:18` `.nvmrc ... toBe('24')`; `:23` `toMatch(/^pnpm@11\./)`; `:27` `type).toBe('module')`; `:42` `strict).toBe(true)`; `:45` `extends ... toBe('../../tsconfig.base.json')` | ✅ |
| FUN-02 `pnpm lint/typecheck/test` saem com 0 na base limpa | código 0 em todos os pacotes | `test/repositorio.test.ts:53-55` (scripts); execução do gate: `pnpm lint && format:check && typecheck && test && test:checagens` exit 0 | ✅ |
| FUN-03 compose sobe só Postgres 16 com `pgcrypto` | serviço único `db`, `postgres:16`, `pgcrypto` utilizável | `backend/scripts/test/docker-compose.test.ts:19` `toEqual(['db'])`; `:23` `toBe('postgres:16')`; `:27` `toEqual(['127.0.0.1:5432:5432'])`; `backend/api/test/migracoes/linha-de-base.test.ts:107` `digest('pelada','sha256') ... toBe('cc2760d2...')` | ✅ |
| FUN-04 `pnpm dev`: wrangler com Hyperdrive local e Vite com proxy de `/api` | proxy `/api` → Worker; `localConnectionString` no Postgres local | `frontend/web/test/configuracao-servidor.test.ts:7-12` proxy `http://localhost:8787`; `backend/scripts/test/dev.test.ts:43` `username).toBe('pelada_app')`, `:59` `ALVO_API_DEV ... 'http://localhost:8787'`; `backend/api/test/config/wrangler.test.ts:100`. Rodei `pnpm dev` de verdade: `localhost:5173/api/health` = 200 `{"status":"ok","versao":"dev"}` e `localhost:8787/api/health` = 200; processos encerrados | ✅ |
| FUN-05 `pnpm seed` cria grupo, jogadores, partidas, conta admin e recusa host não local | 1 grupo, 20 jogadores, 4 partidas, 1 vínculo admin; host remoto recusado | `backend/api/test/infraestrutura/seed-local.test.ts:55` `toBe(1)`, `:56` `toBe(20)`, `:66` `toBe(1)`; `:133` `toMatch(/^Host remoto \(/)` e `:135` `stdout).toBe('')` | ✅ |
| FUN-06 `backend/dominio` sem import de I/O, com teste que falha | `fs`, `node:fs`, `http`, `net`, `pg`, `kysely`, `undici`, `import()` dinâmico barrados | `test/lint-dominio.test.ts:29` `violacoes(...).length).toBeGreaterThan(0)` (11 casos); `:33` código puro aceito `toEqual([])` | ✅ |

### P1: Banco reaproveitado com migrations, roles e RLS

| Critério | Resultado esperado pela spec | `arquivo:linha` + asserção | Resultado |
| -------- | ---------------------------- | -------------------------- | --------- |
| FUN-07 `node-pg-migrate`, uma migration por mudança, cada uma em transação | falha numa migration desfaz só ela | `backend/api/test/migracoes/linha-de-base.test.ts:132` `registradas).toEqual(['1000_a'])`, `:133` `tabelas).toEqual(['a'])` (b falha, c não roda) | ✅ |
| FUN-08 banco vazio: schema equivalente às 13 do legado, seguido das novas | mesmas tabelas, colunas, restrições, índices e triggers | `linha-de-base.test.ts:91` `esquemaNovo).toEqual(esquemaLegado)`; `:93` `tabelas).toEqual(TABELAS_LEGADO)` (19 tabelas); `:76` linha de base é a concatenação literal; `backend/api/test/migracoes/migrar.test.ts:94` `migrar(b.url) ... {estado:'vazio', aplicadas: TODAS}` | ✅ |
| FUN-09 banco do legado: linha de base registrada sem DDL nem alterar dados; só as novas rodam | `registradas:[LINHA_DE_BASE]`, `aplicadas:NOVAS`, contagem de linhas e schema iguais | `migrar.test.ts:70` `toEqual({estado:'legado', registradas:[LINHA_DE_BASE], aplicadas:NOVAS})`; `:72` `contarLinhas ... toEqual(antes)`; `:76` `lerEsquema ... toEqual(esquemaAntes)`; `:58` impressão digital igual à da fixture B; `:84` segunda execução `gerenciado`, nada aplicado | ✅ |
| FUN-10 schema parcial: aborta sem alterar nada e informa as diferenças | `EstadoParcial`, mensagem "nada foi alterado", lista de diferenças, schema e linhas intactos | `migrar.test.ts:108` `toBeInstanceOf(EstadoParcial)`, `:110-112` diferenças exatas, `:113` `toContain('nada foi alterado')`, `:116` schema igual ao anterior, `:115` sem `pgmigrations` | ✅ |
| FUN-11 roles `owner`, `app`, `backup_ro`: sem DDL e sem `TRUNCATE`, `DELETE` só onde é regra; backup só lê | `pelada_app` SELECT/INSERT/UPDATE (+DELETE só em 9 tabelas), sem TRUNCATE nem DDL; `pelada_backup` só SELECT | `backend/api/test/migracoes/roles.test.ts:129` `privilegios('pelada_app')).toEqual(esperado)`; `:135-137` DDL → `42501`; `:145` TRUNCATE recusado em cada tabela; `:175` `privilegios('pelada_backup')).toEqual(esperado)`; `:102` ambas `NOLOGIN NOBYPASSRLS`. Os nomes são `pelada_app` e `pelada_backup` (a spec diz `app` e `backup_ro`): desvio documentado em `tasks.md` T11 e T40, spec não atualizada | ✅ (⚠️ nome diverge da spec) |
| FUN-12 RLS com `FORCE` em toda tabela com `grupo_id` | todas ligadas e forçadas (14 tabelas + `grupos`) | `backend/api/test/migracoes/rls.test.ts:62` `rows.filter(r => !r.ligada \|\| !r.forcada)).toEqual([])` e `:61` lista exata das tabelas | ✅ |
| FUN-13 com `app.conta_id`, só linhas de grupos com vínculo | `[GRUPO_A.grupo]` em cada tabela legível; slug ignorado se há conta | `rls.test.ts:69` `vistos).toEqual([GRUPO_A.grupo])` (`it.each` por tabela); `:76` conta + slug de B ainda vê só A | ✅ |
| FUN-14 só `app.slug_publico`: leitura do grupo do slug; escrita recusada | leitura só do slug; INSERT `42501`; UPDATE/DELETE com 0 linhas | `rls.test.ts:90` `vistos).toEqual([GRUPO_A.grupo])`; `:102` `toBe('42501')`; `:106-107` `rowCount).toBe(0)`; `backend/api/test/isolamento/isolamento.test.ts:111`, `:121` | ✅ |
| FUN-15 sem `conta_id` nem `slug_publico`: zero linhas | contagem 0 | `rls.test.ts:120` `expect(n).toBe(0)` (por tabela); `isolamento.test.ts:135` `toBe(caso.acesso === 'negocio' ? 0 : RECUSADO)` | ✅ |
| FUN-16 transação por requisição com `SET LOCAL` antes de qualquer consulta | GET/HEAD `READ ONLY`, POST leitura e escrita; contexto antes da 1ª consulta; COMMIT < 400, ROLLBACK ≥ 400; sem transação aninhada | `backend/api/test/rotas/com-banco.test.ts:187` `somente_leitura:'on'`; `:212` `'off'`; `:224` `conta: GRUPO_A.conta, slug: ''`; `:219` mesma conexão; `:263` status 200/201/204/302/399 gravam, `:270` 400/404/422/500 desfazem; `:279` erro lançado desfaz; `:314` `TransacaoAninhada`; `:247` 10 requisições concorrentes sem vazar contexto; `:180` conexão fechada após a resposta. Usa `set_config(..., true)`, equivalente ao `SET LOCAL` (decisão do spike S1) | ✅ |
| FUN-17 conta B não lê, insere, altera nem apaga linhas de A, por tabela | leitura vazia; INSERT `42501`; UPDATE/DELETE 0 linhas ou recusados; dados de A intactos | `isolamento.test.ts:67` `r.rows).toEqual([])`; `:88` `escrever(...).toBe(RECUSADO)`; `:92-98` UPDATE/DELETE `recusadaOuNenhuma`; `:103` `depois).toBe(antes)` (hash do conteúdo de A); `backend/api/test/isolamento/meta.test.ts:40` `semCaso(tabelas)).toEqual([])` e `:48` tabela nova sem caso é apontada. 15 casos (14 tabelas + `grupos`) | ✅ (ver nota L5) |
| FUN-18 cache do Hyperdrive desligado | `--caching-disabled` conferido no deploy | `backend/scripts/ops/test/deploy-yml.test.mjs:129` `p.run).toContain('consultar-hyperdrive.sh')` (passo estrutural). A propriedade real vive na Cloudflare | 🕓 **pendente de entrega** (conferir no 1º deploy, `tasks.md:514`) |

### P1: Esqueleto publicado no domínio

| Critério | Resultado esperado pela spec | `arquivo:linha` + asserção | Resultado |
| -------- | ---------------------------- | -------------------------- | --------- |
| FUN-19 assets SPA, `/api/*` pelo Hono, `run_worker_first`, `nodejs_compat` | config exata | `backend/api/test/config/wrangler.test.ts:72` `not_found_handling:'single-page-application'`; `:75` `toContain('nodejs_compat')`; `:70-74` `run_worker_first:['/api/*']`; `backend/api/test/rotas/bindings.test.ts:12` limitadores utilizáveis no workerd; e2e `pwa.spec.ts:21` serve os assets pelo Worker | 🕓 (config e execução local ✅; publicação em produção **pendente de entrega**) |
| FUN-20 `GET /api/health` 200 `{"status":"ok","versao":"<sha>"}` sem banco | corpo exato; banco não lido | `backend/api/test/rotas/health.test.ts:10` `toEqual({status:'ok', versao:'abc123def'})`; `:28` `acessos).toBe(0)` (binding `HYPERDRIVE` nunca lido) | ✅ |
| FUN-21 toda `/api/*` com `Cache-Control: no-store` | em 200, 403, 404, 413, 429 e 500 | `backend/api/test/rotas/app.test.ts:34` e `:46` `toBe('no-store')`; `:35` `nosniff` | ✅ |
| FUN-22 sem URL absoluta; só `URL_PUBLICA`; teste falha com `ljssoftware.com.br` ou `workers.dev` fora da configuração | falha em código, migration SQL e `workers.dev` sem esquema; passa só no `wrangler.jsonc` | `backend/scripts/checagens/test/urls-dominio.test.mjs:34` `r.status).toBe(1)` (3 casos); `:38` passa com o domínio só no `wrangler.jsonc`; `checar-wrangler-deploy.test.mjs:127` e busca no repositório: o domínio aparece só em `wrangler.jsonc:33` | ✅ |
| FUN-23 Sentry (Worker e front) só com DSN, `release` = SHA, sem corpo, cookies, `Authorization` e e-mails | `release` igual ao SHA; campos removidos | Worker: `backend/api/test/rotas/sentry-com-dsn.test.ts:23` `evento.release).toBe('sha-do-commit')`, `:24` `not.toContain(EMAIL)` (envelope real lido no workerd); `sentry.test.ts:69` `headers ... toEqual({'X-Pelada':'1'})`. Front: `frontend/web/src/app/observabilidade.test.ts:31` `release:'abc123'`, `:59` `headers).toEqual({'X-Pelada':'1'})` | ✅ no código (⚠️ ver L2: o deploy não entrega `VITE_SENTRY_DSN` ao build do front) |
| FUN-24 sem `SENTRY_DSN` o app funciona e nada sai | sem chamadas de rede; SDK desligado | `backend/api/test/rotas/sentry.test.ts:24` `chamadas).toEqual([])` (500 e health 200); `:28` `enabled:false`; `frontend/web/src/app/observabilidade.test.ts:16-17` `init).not.toHaveBeenCalled()` | ✅ |
| FUN-25 runbook descreve o monitor do UptimeRobot em `/api/health` | seção com os passos | `docs/runbook.md:131-140` (seção 7, URL `https://<host>/api/health`). Documento, sem teste (Test Coverage Matrix: "none") | ✅ (criar a conta e o monitor é ação do usuário) |
| FUN-26 bindings `LIMITE_ENTRAR` 10/min, `LIMITE_PUBLICO` 60/min, `LIMITE_WEBHOOK` | 10/60, 60/60, binding presente | `wrangler.test.ts:80` `{limit:10, period:60}`; `:81` `{limit:60, period:60}`; `:82-83` `LIMITE_WEBHOOK` com período 60 e limite > 0. O número do webhook não está na spec (60/min provisório) | ✅ (⚠️ L4, lacuna de precisão da spec) |
| FUN-27 rota `gestaodapelada.ljssoftware.com.br` com `custom_domain: true` | `routes` exata | `wrangler.test.ts:90` `routes).toEqual([{pattern:'gestaodapelada.ljssoftware.com.br', custom_domain:true}])` | 🕓 (config ✅; domínio publicado **pendente de entrega**, T48) |
| FUN-28 assets com CSP, `nosniff`, `Referrer-Policy`, HSTS (e2e contra o build); `/api/*` com `nosniff` | quatro cabeçalhos nos assets; `nosniff` na API | `frontend/web/e2e/cabecalhos.spec.ts:47` `frame-ancestors ... "'none'"`, `:52` `x-content-type-options).toBe('nosniff')`, `:53` `referrer-policy ... 'same-origin'`, `:54` `strict-transport-security ... /^max-age=\d{7,}/`; API: `app.test.ts:35` | ✅ |

### P1: Shell PWA com o layout do legado

| Critério | Resultado esperado pela spec | `arquivo:linha` + asserção | Resultado |
| -------- | ---------------------------- | -------------------------- | --------- |
| FUN-29 tokens, global.css, fontes e ícones idênticos; teste falha se `tokens.css` divergir do mockup | `tokens.css` = `.specs/mockup/tokens.css`; fontes e ícones iguais | `frontend/web/test/estilos.test.ts:21` `igual(app, mockup, 'tokens.css')).toBe(true)`; `:32` `doApp).toEqual(doMockup)` (fontes byte a byte); `frontend/web/test/manifesto.test.ts` ícones byte a byte; `global.css` conferido por mim contra o legado (idêntico), mas sem teste próprio | ✅ |
| FUN-30 componentes base (`basicos`, `barras`, `campos`, `escolhas`, `dialogos`, `listas`) com mesmo HTML/CSS, teste de renderização e axe | 46 componentes com teste e axe sem violação | `frontend/web/src/componentes/*/**.test.tsx` (14 arquivos de teste, `violacoes(container)).toEqual([])`, p.ex. `campos/campos.test.tsx:266`); varredura por componente: todos os 46 aparecem em teste que usa axe; código e CSS idênticos ao legado (`diff -rq`) | ✅ |
| FUN-31 Stylelint recusa cor, fonte e sombra literais fora de `tokens.css` | literais falham, tokens passam | `frontend/web/test/stylelint.test.ts:29` `avisos(css)).toBeGreaterThan(0)` (12 casos); `:43` `toBe(0)` (9 casos); `:48` `global.css` real passa. Mutação M17 morta | ✅ (⚠️ L6: arquivo sem marca `FUN-31`) |
| FUN-32 manifest "Gestão da Pelada", `standalone`, `pt-BR`, ícones 192 e 512, um `maskable` | valores exatos | `frontend/web/test/manifesto.test.ts:16` `display).toBe('standalone')`; `:20` `name).toBe('Gestão da Pelada')`; `:33` ícone `purpose:'maskable'`; e2e `frontend/web/e2e/pwa.spec.ts:32` `display:'standalone'`, `:37` `'192x192:any'` | ✅ |
| FUN-33 SW com precache do shell e handlers `push` e `notificationclick` vazios | precache chamado com o manifesto do build; dois handlers registrados | `frontend/web/src/sw.test.ts:41` `precacheAndRoute ... toHaveBeenCalledWith(manifestoDoBuild)`; `:45` `ouvintes.has('push')).toBe(true)`; `:46` `ouvintes.has('notificationclick')).toBe(true)`; e2e `pwa.spec.ts:52` `estado).toBe('activated')` | ✅ |
| FUN-34 offline sem cache: página offline no visual do legado | navegação sem cache e sem rede mostra "Sem conexão" | `sw.test.ts:76` `resposta.text()).toBe('pagina offline')`, `:77` `matchPrecache ... '/offline.html'`; `frontend/web/src/pwa/regras-sw.test.ts:16`; e2e `pwa.spec.ts:89` `heading ... name:'Sem conexão'` toBeVisible (sem rede e sem shell no cache) | ✅ |
| FUN-35 Safari iOS fora de standalone: o front mostra a instrução de instalação | a instrução aparece para o usuário | `frontend/web/src/pwa/instalacao.test.ts:70-72` `lerAmbienteEDecidir()).toBe(true)`. **Só testa a decisão.** `instalacao.ts` não é importado por nenhum código de produção (busca em `frontend/web/src`: só o próprio teste o referencia). Nenhuma tela mostra a instrução. No legado a UI é `telas/ranking/AvisoInstalacao.tsx`, não trazida (`tasks.md` T32 registra o adiamento, a spec não foi ajustada) | ❌ **Lacuna** (ver L1) |
| FUN-36 teste de instalabilidade (Playwright contra o build) | manifest válido, SW controlando a página, ícones 192/512 (um maskable) acessíveis, offline sem rede | `frontend/web/e2e/pwa.spec.ts:16` `serviceWorker.controller !== null` → `true`; `:37-39` ícones `192x192:any`, `512x512:any`, `512x512:maskable`; `:61` `installabilityErrors).toEqual([])`; `:72` e `:89` página offline sem rede. Rodei: 11 passam | ✅ |
| FUN-37 comparação visual no CI, limite 1%, 1280×800 e 390×844 | falha acima de 1%; telas ativas na lista | `frontend/web/e2e/comparador.spec.ts:26` iguais `toBeLessThanOrEqual(LIMITE)`, `:34` divergência `toBeGreaterThan(LIMITE)`; `frontend/web/e2e/telas-ativas.test.mjs:35` três telas ativas, `:40` `viewports ... {1280×800, 390×844}`. Rodei `visual`: 6 comparações, máx. 0,65% | ✅ (⚠️ L3: a spec fala em "página provisória e guia de componentes"; o implementado são 3 telas de vitrine do mockup) |

### P1: CI e deploy seguros

| Critério | Resultado esperado pela spec | `arquivo:linha` + asserção | Resultado |
| -------- | ---------------------------- | -------------------------- | --------- |
| FUN-38 `ci.yml` roda lint, typecheck, testes, gitleaks, build, migrations do zero, isolamento, visual e instalabilidade, e falha se algum falhar | todos os jobs presentes, sem `continue-on-error` | `.github/workflows/ci.yml:23-35` (jobs `base`), `:62-67` (`banco`: migrations e isolamento), `:76` (`checagens`), `:87-91` (`e2e`: build + instalabilidade), `:107-109` (`visual`); sem Lighthouse. Não há teste automatizado do `ci.yml` (matriz: "none"); `checar-acoes-fixadas` aprova o YAML | 🕓 **pendente de entrega** (1ª execução no GitHub, T47) |
| FUN-39 `deploy.yml` só `workflow_dispatch` na `main`, environment `producao`, `concurrency` sem cancelar | gatilho único, `if` com `refs/heads/main`, `cancel-in-progress:false` | `backend/scripts/ops/test/deploy-yml.test.mjs:22` `toEqual(['workflow_dispatch'])`; `:26` `job.if).toContain('refs/heads/main')`; `:25` `environment).toBe('producao')`; `:29` `cancel-in-progress ... toBe(false)` | 🕓 (estrutura ✅; execução real **pendente de entrega**) |
| FUN-40 ordem: build, branch de restauração (2 mais recentes), dump cifrado, migração com `NEON_URL_MIGRACAO`, `wrangler deploy --var URL_PUBLICA`, health = SHA | ordem estrita | `deploy-yml.test.mjs:53` `[...ordem].sort(...)).toEqual(ordem)`; `:60-63` mantém 2; `:68-69` `NEON_URL_MIGRACAO`; `:79` `--var "URL_PUBLICA:${URL_PUBLICA}"`; `:87` `"$versao" = "$SHA"`. Mutação M11 morta | 🕓 (estrutura ✅; execução real **pendente de entrega**) |
| FUN-41 build falha: para antes de tocar Neon ou Worker | build antes de qualquer passo que toca Neon/Worker | `deploy-yml.test.mjs:96` `indice(t)).toBeGreaterThan(build)` (restauração, dump, migração, publicação) | 🕓 (idem) |
| FUN-42 migração falha: sem `wrangler deploy`; runbook descreve a restauração | migração antes da publicação, sem `if` que a libere; runbook com restauração | `deploy-yml.test.mjs:100` `migrar ... toBeLessThan(indice(PUBLICAR))`, `:101` `passo(PUBLICAR).if).toBeUndefined()`; `docs/runbook.md:46-66` | 🕓 (idem) |
| FUN-43 `wrangler deploy` em um só lugar; teste falha se aparecer em outro arquivo | só `deploy.yml` | `backend/scripts/checagens/test/checar-wrangler-deploy.test.mjs:28-110` (casos que falham e passam) e `:127` repositório real verde; `git grep` fora de docs e testes: só `.github/workflows/deploy.yml:107` | ✅ |
| FUN-44 sem segredo versionado; gitleaks no CI; `.env.example` com obrigatoriedade, formato e segredo | `.env.example` completo e vazio; gitleaks limpo | `backend/scripts/test/env-example.test.ts:91` `faltando).toEqual([])`, `:107` `incompletas).toEqual([])`, `:111` valores vazios `toEqual([])`; `gitleaks dir .`: "no leaks found" (rodei); passo gitleaks em `ci.yml:35` | ✅ (CI do gitleaks 🕓) |
| FUN-45 1º deploy: runbook exige antes remoção confirmada do Worker `pelada` e dump cifrado | seção "Antes do primeiro deploy" | `docs/runbook.md:11-24` (seção 1: dump, remoção confirmada e roles, nessa ordem), `:120-129` (seção 6) | 🕓 (texto ✅; execução **pendente de entrega**, T48) |

### P1: Backup e restauração

| Critério | Resultado esperado pela spec | `arquivo:linha` + asserção | Resultado |
| -------- | ---------------------------- | -------------------------- | --------- |
| FUN-46 `backup.yml` 07:00 UTC e manual, `pg_dump -Fc` com role de backup, `age`, 30 dias | cron `0 7 * * *`, `workflow_dispatch`, `pg_dump --format=custom --enable-row-security`, retenção 30 | `backend/scripts/ops/test/backup.test.mjs:107` `schedule).toEqual([{cron:'0 7 * * *'}])`; `:108` `workflow_dispatch`; `:57-63` `--format=custom`, `--enable-row-security`, `postgres:16`; `:113` `NEON_URL_BACKUP`; `:115` `retencao).toBe('30')`. Mutação M12 morta | 🕓 (estrutura ✅; 1º backup real **pendente de entrega**, T49) |
| FUN-47 dump ou cifragem falha: job vermelho, sem artefato parcial | saída ≠ 0, nenhum arquivo | `backup.test.mjs:68-71` falha de `pg_dump`, `:74-78` falha de `age`, `:81-85` dump vazio: `r.status).not.toBe(0)` e `r.arquivos).toEqual([])`; `:120` `if-no-files-found ... 'error'` | ✅ |
| FUN-48 runbook tem a restauração, executada uma vez e registrada com data e contagem | procedimento no runbook + registro da execução | procedimento: `docs/runbook.md:68-104`. Registro da execução com data e contagem: inexistente | 🕓 procedimento ✅; execução e registro **pendente de entrega** (T49) |

### P2: Documentação e decisões

| Critério | Resultado esperado pela spec | Evidência | Resultado |
| -------- | ---------------------------- | --------- | --------- |
| FUN-49 README cobre rodar local, variáveis, deploy e testes | quatro seções | `README.md:20` (Rodar local), `:58` (Variáveis de ambiente), `:64` (Testes e checagens), `:82` (Deploy). Aceite do agente sem contexto registrado em `tasks.md` T42: o agente falhou no `pnpm dev` por faltar o build, o README foi corrigido, e o passo corrigido não teve nova rodada do zero | ✅ (⚠️ L7) |
| FUN-50 `docs/runbook.md` cobre deploy, falha de migração, restauração, rotação de segredos e remoção do Worker antigo | cinco temas | `docs/runbook.md:26` (2. Deploy), `:46` (3), `:68` (4), `:106` (5), `:120` (6) | ✅ |
| FUN-51 ADR por decisão, com `Supersedes:` quando substitui | ADRs 024 a 028 | `.md/adr/024-…` a `028-…`; `Supersedes: 018` no 027 e `Supersedes: 020` no 028 (`tasks.md` T44); 001 a 023 intactos | ✅ |
| FUN-52 `CLAUDE.md` da raiz descreve stack, comandos e onde ficam regras e artefatos | três blocos | `CLAUDE.md:8` (Stack), `:19` (Comandos), `:37` (Gate de testes), `:54` (Onde ficam as coisas) | ✅ |

### Casos limite

| Critério | Resultado esperado pela spec | `arquivo:linha` + asserção | Resultado |
| -------- | ---------------------------- | -------------------------- | --------- |
| FUN-53 Postgres local fora do ar: `dev` e `migrar` dizem para rodar `docker compose up -d` | mensagem exata | `backend/scripts/test/migrar.test.ts:26` `stderr).toContain('Rode \`docker compose up -d\`')`; `backend/scripts/test/dev.test.ts:102` idem; `exigir-banco.test.ts:25` | ✅ |
| FUN-54 migration não aditiva falha no CI, salvo exceção com ADR | `DROP` sem exceção falha; com a linha de exceção passa | `backend/scripts/checagens/test/migracao-aditiva.test.mjs:84` `stderr).toContain('1761300000000_remove-coluna.sql:2')`; `:87-92` passa com `-- contrair:`. Ligada ao CI em `ci.yml:32`. Mutação M20 morta | ✅ (⚠️ L5b: a exceção aceita qualquer texto após `-- contrair:`, não exige um ADR existente) |
| FUN-55 dois `deploy.yml` juntos: o segundo espera | `cancel-in-progress:false` | `deploy-yml.test.mjs:29` | 🕓 (config ✅; comportamento do GitHub **pendente de entrega**) |
| FUN-56 `URL_PUBLICA` ausente falha antes do deploy | vazia, `http`, com caminho e inválida saem 1; `https` válida sai 0 | `deploy-yml.test.mjs:110` `rodarConferencia(url).status).toBe(1)` (4 casos); `:115` `https://gestaodapelada.ljssoftware.com.br ... toBe(0)` (o passo roda em bash de verdade) | ✅ |

**Status**: ❌ Uma lacuna (FUN-35). ⚠️ Seis lacunas de precisão ou rastreio de menor gravidade (abaixo). Itens externos marcados 🕓 não são falhas.

### Requisitos que só fecham na entrega (T47 a T49) — separados de falha

FUN-18 (cache do Hyperdrive na Cloudflare), FUN-19 e FUN-27 (publicação e domínio), FUN-38 (1ª execução do CI no GitHub), FUN-39 a FUN-42 e FUN-55 (execução real do `deploy.yml`), FUN-45 (execução do runbook de entrada), FUN-46 e FUN-48 (backup real e restauração registrada), FUN-25 (conta e monitor do UptimeRobot, ação do usuário), baixa das branches e do Hyperdrive dos spikes (T1 e T2). Critérios de sucesso da spec que dependem disso: `https://gestaodapelada.ljssoftware.com.br/api/health` = 200 com SHA, banco de produção migrado com a mesma contagem de linhas, restauração registrada, CI verde.

---

## Sensor de discriminação

Cópia isolada: `git worktree add --detach` em pasta temporária, `pnpm install --frozen-lockfile --offline`, `.env` local copiado. Linha de base `git status --porcelain` da árvore real: vazia, vazia depois. Cópia removida (`git worktree remove` e limpeza da pasta) e `git worktree list` voltou a ter só `main` e `feat/fundacao`. Antes das mutações, confirmei que os arquivos de teste alvo passam na cópia sem mutação (api 342, web 35, raiz 80). Os bancos temporários dos testes foram apagados (`pg_database` só com `pelada`, `postgres`, `template0` e `template1`).

| Mutação | Arquivo | Descrição | Morta? |
| ------- | ------- | --------- | ------ |
| M1 | `backend/api/src/infraestrutura/db/migracoes/1792843320000_rls.sql` | Removeu `app_conta_id() IS NOT NULL AND` da escrita (slug passa a escrever) | ✅ morta (14 testes falharam) |
| M2 | idem | Removeu `FORCE ROW LEVEL SECURITY` | ✅ morta |
| M3 | idem | `grupos_visiveis()`: removeu `app_conta_id() IS NULL AND` (slug vale junto com conta) | ✅ morta |
| M4 | `backend/api/src/entrada/middlewares/com-banco.ts` | `status < 400` → `status < 500` (400 passa a dar COMMIT) | ✅ morta |
| M5 | `backend/api/src/infraestrutura/db/migracoes/1792843260000_roles.sql` | Concedeu `TRUNCATE` ao `pelada_app` | ✅ morta (14) |
| M6 | `backend/api/src/entrada/rotas/health.ts` | `versao: c.env.VERSAO` → `'fixo'` | ✅ morta |
| M7 | `backend/api/src/entrada/middlewares/cache.ts` | `no-store` → `no-cache` | ✅ morta (6) |
| M8 | `backend/api/src/infraestrutura/db/migracoes/migrar.ts` | Tirou o `fake` da linha de base no estado `legado` (executaria DDL) | ✅ morta |
| M9 | `frontend/web/config/manifesto.ts` | `display: 'standalone'` → `'browser'` | ✅ morta |
| M10 | `frontend/web/src/sw.ts` | Removeu o handler `push` | ✅ morta |
| M11 | `.github/workflows/deploy.yml` | `cancel-in-progress: false` → `true` | ✅ morta |
| M12 | `.github/actions/dump-cifrado/dump-cifrado.sh` | Removeu `--enable-row-security` | ✅ morta |
| M13 | `backend/scripts/checagens/checar-urls-absolutas.mjs` | Tirou `workers.dev` da expressão proibida | ✅ morta |
| M14 | `backend/api/src/entrada/sentry.ts` | Parou de remover o cabeçalho `authorization` | ✅ morta |
| M15 | `wrangler.jsonc` | `LIMITE_ENTRAR` 10 → 11 | ✅ morta |
| M16 | `eslint.config.mjs` | Tirou `node:fs` da lista de I/O proibida no domínio | ✅ morta (3) |
| M17 | `frontend/web/stylelint.config.mjs` | `color-no-hex: true` → `false` | ✅ morta (5) |
| M18 | `frontend/web/src/estilos/tokens.css` | Alterou um nome de token (`--cor-verde:`) | ✅ morta |
| M19 | `backend/api/src/infraestrutura/seguranca/trava-host.ts` | Host remoto passa na trava (`\|\| true`) | ✅ morta (14) |
| M20 | `backend/scripts/checagens/checar-migracao-aditiva.mjs` | `drop` deixa de ser barrado | ✅ morta (6) |

**Profundidade**: completa (caminho crítico de dados e isolamento: mais de 5 mutações cobrindo RLS, contexto, roles, transação, linha de base, trava de host).
**Resultado**: 20/20 mortas, 0 sobreviveram — ✅.

---

## Gate (Build do `tasks.md` / `testes.json`)

- **Comando**: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:checagens && pnpm --filter @pelada/web build && pnpm --filter @pelada/web e2e && pnpm --filter @pelada/web visual`
- **Resultado**: tudo com código 0 (executado por mim em duas partes; Postgres local `fundacao-db-1`).
- **Vitest**: raiz 20 (2 arquivos), dominio 1, contrato 5, API 343 (17 arquivos), web 305 (34 arquivos), `test:checagens` 310 (16 arquivos): **984 aprovados, 0 falhas, 0 pulados**.
- **Playwright e2e**: 11 aprovados (`pwa.spec.ts`, `cabecalhos.spec.ts`, `comparador.spec.ts`).
- **Comparação visual**: 6 comparações dentro de 1%: erro de rede 0,00%/0,00%, carregando lista 0,53%/0,65%, grupo indisponível 0,00%/0,00%.
- **Antes da feature**: 0 testes na `main`. **Depois**: 984 vitest + 11 e2e. **Delta**: +995.
- **Pulados**: nenhum. **Falhas**: nenhuma.
- `gitleaks dir .`: nenhum vazamento. `pnpm dev` real: health 200 pelo proxy.

---

## Qualidade do código

| Princípio | Situação |
| --------- | -------- |
| Mínimo de código, sem abstração de uso único | ✅ (reuso do legado; telas de negócio ficaram de fora) |
| Mudanças cirúrgicas, só o necessário | ✅ |
| Sem excesso de escopo | ✅ (`auditoria` e `eventos_uso` entraram na RLS por exigência de FUN-12, desvio documentado) |
| Segue os padrões existentes | ✅ |
| Asserção confere o valor da spec (spot-check: história "Banco") | ✅ — 1:1 com FUN-07 a FUN-17 |
| Cobertura por camada | ✅ — banco: 3 fixtures e 15 casos de isolamento; rotas: health, cabeçalhos, transação; front: 46 componentes com axe |
| Todo teste mapeia a um critério | ⚠️ — 5 arquivos sem marca `FUN-NN` (L6); todos têm critério correspondente |
| Diretrizes documentadas | `.md/GUARDRAILS.md` (coluna "Protegida por") e `.claude/CLAUDE.md` seguidos |

---

## Lacunas, em ordem de gravidade

1. **L1 — Maior — FUN-35**: nenhum código de produção mostra a instrução de instalação do Safari iOS. `frontend/web/src/pwa/instalacao.ts` só é referenciado por `frontend/web/src/pwa/instalacao.test.ts`; `App.tsx`, `PaginaProvisoria.tsx` e `main.tsx` não o usam. Teste de aceite sozinho (`instalacao.test.ts:70-72`) prova a decisão, não a exibição. Adiamento registrado só em `tasks.md` T32, sem ajuste da spec. Correção: criar o aviso (no legado, `telas/ranking/AvisoInstalacao.tsx`) e exibi-lo na página provisória com teste de renderização, ou reescrever FUN-35 para "o front SHALL ter a lógica de detecção" com aprovação do usuário.
2. **L2 — Menor — FUN-23 (front)**: `.github/workflows/deploy.yml:43-46` faz o build do web só com `VITE_VERSAO`; `VITE_SENTRY_DSN` não chega ao bundle. Depois de criar a conta do Sentry, o front continuaria sem reportar mesmo com o secret do Worker configurado. O runbook (`docs/runbook.md:118`) só cita o `SENTRY_DSN` do Worker. Sem conta ainda, sem impacto hoje.
3. **L3 — Menor — FUN-37 (precisão da spec)**: a spec manda cobrir "só a página provisória e o guia de componentes"; o design e a implementação cobrem três telas de vitrine do mockup (`frontend/web/e2e/telas-ativas.txt`). A página provisória em si não é comparada visualmente. Alinhar o texto da spec ao implementado ou acrescentar a comparação da página provisória.
4. **L4 — Menor — FUN-26 (precisão da spec)**: a spec não fixa o limite de `LIMITE_WEBHOOK`; o teste só exige `limit > 0` e período 60 (`wrangler.test.ts:82-83`), com 60/min provisório marcado `[A ESCLARECER]` em `wrangler.jsonc:26`.
5. **L5 — Menor — FUN-17 e FUN-54**: (a) em `auditoria` e `eventos_uso`, sem grant para `pelada_app`, o erro de privilégio chega antes da RLS: as policies dessas duas tabelas não são exercitadas, só os sinalizadores de FUN-12 e o `42501` (`isolamento.test.ts:80`); (b) a exceção de FUN-54 aceita qualquer texto depois de `-- contrair:`; a spec pede "um ADR" e a checagem não confere se ele existe.
6. **L6 — Cosmético — rastreio e codificação**: `stylelint.test.ts` (FUN-31), `consultar-hyperdrive.test.mjs`, `restauracao-neon.test.ts`, `verificar-cache-hyperdrive.test.ts` (FUN-18/FUN-40) e `checar-acoes-fixadas.test.mjs` (regra de CI sem FUN, T5) não trazem `FUN-NN` no arquivo, embora o `tasks.md` os ligue. Quinze arquivos de teste têm o comentário de cabeçalho em Latin-1 (byte `0xE9` em "Critério"), inválido em UTF-8: `backend/contrato/test/limites.test.ts` e 14 em `frontend/web/src` (`componentes/*/…test.tsx`, `config/recursos.test.ts`, `formatacao/*.test.ts`). O gate passa, mas editores e diffs mostram caracteres quebrados.
7. **L7 — Cosmético — FUN-49**: o teste de aceite do README (agente sem contexto) falhou na primeira rodada; o README foi corrigido e o passo novo foi executado, mas não houve segunda rodada completa do zero (`tasks.md` T42).

Itens informativos, sem ação: o nome das roles (`pelada_app`, `pelada_backup`) difere do texto da spec (`app`, `backup_ro`); `global.css` não tem teste próprio de igualdade com o legado (eu conferi, é idêntico); `visual.mjs` sai com 0 se a lista de telas ativas estiver vazia, mas `telas-ativas.test.mjs:35` fixa as três telas.

---

## Atualização da rastreabilidade (`spec.md`)

Proposta; não editei a spec (fora do meu escopo).

| Requisito | Estado anterior | Novo estado |
| --------- | --------------- | ----------- |
| FUN-01 a FUN-17, FUN-20 a FUN-24, FUN-25, FUN-26, FUN-28 a FUN-34, FUN-36, FUN-37, FUN-43, FUN-44, FUN-47, FUN-49 a FUN-54, FUN-56 | Implementing / Pending | ✅ Verificado |
| FUN-18, FUN-19, FUN-27, FUN-38 a FUN-42, FUN-45, FUN-46, FUN-48, FUN-55 | Implementing / Pending | 🕓 Verificado no código; pendente de entrega (T47 a T49) |
| FUN-35 | Pending | ❌ Precisa de correção (L1) |

---

## Resumo

**Geral**: ❌ Não pronto (um critério sem entrega) — o restante está sólido.

**Verificação ancorada na spec**: 55 de 56 requisitos com asserção localizada; FUN-35 sem entrega ponta a ponta; 4 lacunas de precisão da spec (L3, L4, L5b e nome das roles).
**Sensor**: 20/20 mutações mortas.
**Gate**: 984 vitest + 11 e2e + 6 comparações visuais, 0 falhas.

**O que funciona**: monorepo, banco com linha de base, `--fake`, parcial abortando, roles e RLS com `FORCE`, isolamento por tabela com meta-teste, transação por requisição, health sem banco, cabeçalhos, PWA instalável (manifest, SW, offline, instalabilidade), componentes idênticos ao legado, comparação visual, estrutura do `deploy.yml` e do `backup.yml`, checagens do CI, `.env.example` conferido, documentação.

**Próximos passos**: decidir L1 (criar o aviso de instalação ou ajustar a spec); corrigir L2 quando houver conta do Sentry (ou agora, passando `VITE_SENTRY_DSN` ao build); depois T47 a T49 para fechar os requisitos pendentes de entrega.


---

# Rodada 2 — reteste (faixa `e20709c..e9d5925`)

**Data**: 2026-10-25
**HEAD**: `e9d5925` (commits novos: `dcab1e6`, `70e4a05`, `0e13e8e`, `e9d5925`). Verificador independente; nenhum código ou teste foi alterado, só este arquivo foi escrito.

**Result**: PASS ✅

## Resumo

- **FUN-35**: fechado. O aviso de instalação é exibido na página provisória (rota `/` de produção) e os testes provam a exibição.
- **FUN-23 (L2)**: fechado. O `deploy.yml` passa `VITE_SENTRY_DSN` ao build do web e o teste exige.
- **FUN-37 (L3)**: fechado. A spec foi ajustada às 3 telas de vitrine e o texto bate com `telas-ativas.txt`.
- **L6 (cosmético)**: fechado. Arquivos em UTF-8 válido; 4 testes ganharam a marca `FUN`; o quinto (`checar-acoes-fixadas`) está correto sem `FUN` próprio.
- **Gate**: 990 vitest + 11 e2e + 6 comparações visuais, 0 falhas.
- **Sensor**: 7 mutações, 7 mortas, 0 sobreviveram.

## FUN-35: agora com entrega ponta a ponta

| Elo | `arquivo:linha` + asserção | Resultado |
| --- | -------------------------- | --------- |
| Componente | `frontend/web/src/pwa/AvisoInstalacao.tsx:6-15`: `useState(lerAmbienteEDecidir)`; `if (!aberto) return null`; `Faixa tipo="info" papel="note"` com "Adicionar à Tela de Início" e botão de fechar | ✅ |
| Ligação em produção | `frontend/web/src/app/PaginaProvisoria.tsx:11` renderiza `<AvisoInstalacao />`; `frontend/web/src/app/rotas.tsx:19` `{ path: '/', Component: PaginaProvisoria }` (fora da vitrine); `App.tsx` usa `criarRotas()` | ✅ |
| Aparece no Safari iOS fora de standalone | `AvisoInstalacao.test.tsx:21-25` `getByRole('note')).toHaveTextContent(TEXTO)` | ✅ |
| Some quando instalado | `AvisoInstalacao.test.tsx:27-31` (`standalone` e `navigator.standalone` verdadeiros) `queryByText(TEXTO)).toBeNull()` | ✅ |
| Não aparece em outro navegador | `AvisoInstalacao.test.tsx:33-37` (Chrome Android) `toBeNull()` | ✅ |
| Dispensável | `AvisoInstalacao.test.tsx:39-44` clique em "Fechar aviso de instalação" e `toBeNull()` | ✅ |
| Exibido na página real | `AvisoInstalacao.test.tsx:46-50` `render(<PaginaProvisoria />)` e `getByText(TEXTO)).toBeVisible()` | ✅ |
| Decisão (rodada 1) | `instalacao.test.ts:70-72` `lerAmbienteEDecidir()).toBe(true)` | ✅ |

Os testes novos têm a marca `// FUN-35` (`AvisoInstalacao.test.tsx:19`). O teste de página usa o `PaginaProvisoria` real, não um dublê.

## FUN-23: DSN do Sentry no build do front

- `.github/workflows/deploy.yml:47` `VITE_SENTRY_DSN: ${{ secrets.VITE_SENTRY_DSN }}` no passo `pnpm --filter @pelada/web build`.
- `backend/scripts/ops/test/deploy-yml.test.mjs:59-61` `passo('@pelada/web build').env.VITE_SENTRY_DSN).toMatch(/^\$\{\{ (secrets|vars)\.[A-Z_]+ \}\}$/)`: exige secret ou variável e recusa literal.
- `docs/runbook.md:119` documenta o secret `VITE_SENTRY_DSN`.
- Criar o secret no GitHub é ação do usuário na entrega (**pendente de entrega**). Sem conta Sentry o front continua desligado por desenho (FUN-24).

## FUN-37: spec alinhada à implementação

O critério 9 da spec agora diz: "a lista de telas ativas cobre as 3 telas de vitrine do mockup (erro de rede, carregando em lista e grupo indisponível); a página provisória não é comparada". `frontend/web/e2e/telas-ativas.txt` lista exatamente `padrao--erro-rede`, `padrao--carregando-lista` e `t03-indisponivel--erro`, e `telas-ativas.test.mjs:35` fixa as três. O visual rodou: 6 comparações, 0,00%/0,00%, 0,53%/0,65%, 0,00%/0,00% (limite 1%). Texto e implementação batem.

## Cosmético (L6)

- UTF-8: todos os arquivos versionados de texto (`ts`, `tsx`, `mjs`, `md`, `yml`, `json`, `css`, `sh`) decodificam como UTF-8: **0 inválidos**. Os 15 arquivos da rodada 1 (`backend/contrato/test/limites.test.ts` e 14 em `frontend/web/src`) estão entre eles; cada diff é de 1 linha (cabeçalho).
- Marca `FUN`: `stylelint.test.ts` (FUN-31), `consultar-hyperdrive.test.mjs` e `verificar-cache-hyperdrive.test.ts` (FUN-18), `restauracao-neon.test.ts` (FUN-40). `checar-acoes-fixadas.test.mjs` recebeu "regra de CI sem FUN próprio (T5)", conforme `tasks.md` (T5, linha 239): correto.

## Sensor de discriminação (rodada 2)

Cópia isolada: `git worktree add --detach` na pasta temporária da sessão, `pnpm install --frozen-lockfile --offline`. Linha de base na cópia: `src/pwa` com 35 testes passando. Cópia descartada ao fim; `git worktree list` voltou a ter só `main` e `feat/fundacao`; `git status --porcelain` da árvore real ficou igual ao de antes (só este arquivo, não rastreado).

| Mutação | Arquivo | Descrição | Morta? |
| ------- | ------- | --------- | ------ |
| N1 | `frontend/web/src/app/PaginaProvisoria.tsx` | Removeu `<AvisoInstalacao />` (a ligação em produção) | ✅ morta (`a página provisória exibe o aviso no Safari do iOS`) |
| N2 | `frontend/web/src/pwa/AvisoInstalacao.tsx` | `if (!aberto) return null` para `if (aberto) return null` | ✅ morta (5 falhas) |
| N3 | idem | `useState(lerAmbienteEDecidir)` para `useState(true)` (ignora o ambiente) | ✅ morta (2) |
| N4 | idem | `aoFechar` passa a manter aberto | ✅ morta (1) |
| N5 | `frontend/web/src/pwa/instalacao.ts` | `return !standalone && navigatorStandalone !== true` para `return true` | ✅ morta (4) |
| N6 | `.github/workflows/deploy.yml` | Removeu `VITE_SENTRY_DSN` do build do web | ✅ morta (`deploy-yml.test.mjs`) |
| N7 | idem | DSN literal no lugar do secret | ✅ morta (mesmo teste) |

Observação: a primeira tentativa de N1 (por `sed`) não aplicou a mutação e os testes passaram; refiz com Python e a mutação morreu. A primeira não conta como sobrevivente, porque não alterou o arquivo.

**Resultado**: 7/7 mortas, 0 sobreviveram.

## Gate completo (rodada 2)

Comando de `.specs/projeto/testes.json`, mais `checar-tokens`, na árvore real. O Postgres local `fundacao-db-1` já estava ativo; nenhum container foi parado; as portas 4173 e 8788 não foram tocadas (o visual usou a 4183).

- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`: código 0.
- `pnpm test`: raiz 20, domínio 1, contrato 5, API 343, web 310. `pnpm test:checagens`: 311 (16 arquivos). **990 aprovados, 0 falhas, 0 pulados** (rodada 1: 984; +6 = 5 de `AvisoInstalacao.test.tsx` e 1 de `deploy-yml.test.mjs`).
- Build do web, Playwright e2e (11 aprovados) e `visual` (6 comparações, máx. 0,65%): código 0.
- `python .claude/scripts/checar-tokens.py frontend/web/src --permitir tokens.css`: "OK: nenhuma cor ou fonte fora do tokens.css".

## Estado dos critérios após a rodada 2

| Requisito | Rodada 1 | Rodada 2 |
| --------- | -------- | -------- |
| FUN-35 | ❌ sem entrega | ✅ verificado |
| FUN-23 (front) | ✅ com ressalva L2 | ✅ (criar o secret no GitHub: pendente de entrega) |
| FUN-37 | ✅ com ressalva L3 | ✅ (spec e implementação alinhadas) |
| L6 (UTF-8 e marcas FUN) | ⚠️ cosmético | ✅ fechado |
| FUN-18, FUN-19, FUN-27, FUN-38 a FUN-42, FUN-45, FUN-46, FUN-48, FUN-55, FUN-25, T1, T2, T16 (item da Cloudflare) | 🕓 | 🕓 **pendente de entrega** (T47 a T49), sem mudança; não é falha |

Lacunas que permanecem, sem bloquear o veredito (todas já registradas na rodada 1): L4 (limite de `LIMITE_WEBHOOK` não fixado na spec), L5 (policies de `auditoria` e `eventos_uso` não exercitadas por falta de grant, e exceção `-- contrair:` que não confere se o ADR existe), L7 (README sem segunda rodada do zero) e o nome das roles (`pelada_app`, `pelada_backup`) diferente da spec.

**Geral**: ✅ Pronto para a entrega. Falta só T47 a T49: push, deploy, migração de produção, backup real com restauração registrada, criação do secret `VITE_SENTRY_DSN` e das contas externas.
