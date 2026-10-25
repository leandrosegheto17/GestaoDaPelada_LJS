# Fundação — Tarefas

## Protocolo de Execução (OBRIGATÓRIO — não pular)

Implemente estas tarefas com a skill `tlc-spec-driven`: **acione-a pelo nome e siga o fluxo de Execute e as Critical Rules.** Não procure arquivos da skill por caminho. A skill é a fonte da verdade do fluxo completo (ciclo por tarefa, delegação a subagentes, revisão de adequação, Verificador, sensor de discriminação).

**Se a skill não puder ser acionada, PARE e avise o usuário. Não prossiga sem ela.**

---

**Design**: `.specs/features/fundacao/design.md`
**Spec**: `.specs/features/fundacao/spec.md`
**Status**: Approved (usuário, 2026-10-24; ferramentas: manter como está)

> Premissas desta lista:
> - O código do projeto nasce na raiz deste repositório. Os caminhos `legado:` são relativos a `C:\Leandro\Projetos\GestaoDaPelada` e são somente leitura (AD-002).
> - **Teste copiado do legado só entra ligado a um `FUN-NN`**, indicado em cada tarefa. O verificador recusa ligação sem asserção correspondente.
> - Spikes (T1 e T2) são descartáveis: o código fica em `.specs/spikes/<slug>/codigo/`, fora do git, e nunca é integrado.
> - **Ações externas exigem confirmação específica do usuário no momento**, mesmo com estas tarefas aprovadas: criar branch no Neon (T1, T2), criar o repositório no GitHub e `git push` (T47), remover o Worker antigo, migrar produção e `wrangler deploy` (T48).
> - Nomes de pacote seguem o legado (`@pelada/contrato`, `@pelada/dominio`, `@pelada/api`, `@pelada/web`). `backend/scripts` não tem `package.json` próprio: roda com o Vitest da raiz.

---

## Test Coverage Matrix

> Gerada a partir do mapa do legado (`leitor-codigo`), do design e da spec. Confirmar antes do Execute. Guias encontrados: nenhum `AGENTS.md`, `CONTRIBUTING.md` ou limiar de cobertura. No legado, `.md/GUARDRAILS.md` mapeia regra para teste e `backend/README.md` define `DATABASE_URL_TESTE`. Padrão forte aplicado: todo critério de aceite e todo caso limite da spec tem teste.

| Camada | Tipo de teste exigido | Expectativa de cobertura | Padrão de local | Comando |
| ------ | --------------------- | ------------------------ | --------------- | ------- |
| Domínio (`backend/dominio`) | unit | Todos os ramos; 1:1 com os critérios da spec. Na fundação: só a regra FUN-06 (sem I/O) | `backend/dominio/test/**/*.test.ts` | `pnpm --filter @pelada/dominio test` |
| Contrato (`backend/contrato`) | unit | Esquema e tipos compartilhados; na fundação só o que a API usar | `backend/contrato/test/**/*.test.ts` | `pnpm --filter @pelada/contrato test` |
| Banco: migrations, roles, RLS, repositórios | integration (Postgres real, `DATABASE_URL_TESTE`) | Fixtures A, B e C do C2; cenários de isolamento por tabela com `grupo_id` (A lê só o seu, B não lê/insere/altera/apaga, slug não escreve, sem contexto = zero linhas) | `backend/api/test/{migracoes,isolamento,infraestrutura}/**/*.test.ts` | `pnpm --filter @pelada/api test` |
| Rotas e middlewares da API | e2e no pool workerd (`@cloudflare/vitest-plugin`) | Toda rota em escopo (`/api/health`): caminho feliz, cabeçalhos e erro | `backend/api/test/rotas/**/*.test.ts` | `pnpm --filter @pelada/api test` |
| Scripts e checagens do CI (`backend/scripts`) | unit (repositórios git e bancos temporários) | Cada checagem: caso que passa e caso que falha | `backend/scripts/checagens/test/*.test.*`, `backend/scripts/test/**`, `backend/scripts/ops/test/*` | `pnpm test:checagens` |
| Front: componentes e lógica | unit (jsdom + Testing Library + axe) | Cada componente base: renderização e axe sem violações; cada módulo de lógica: todos os ramos | `frontend/web/src/**/*.test.{ts,tsx}`, `frontend/web/test/*.test.ts` | `pnpm --filter @pelada/web test` |
| Front: PWA, cabeçalhos, instalabilidade | e2e (Playwright contra o build) | Manifest, SW controlando a página, ícones, offline e cabeçalhos de segurança | `frontend/web/e2e/*.spec.ts` | `pnpm --filter @pelada/web e2e` |
| Front: comparação visual | e2e visual (limite de 1% de pixels) | Toda tela ativa em `telas.json` nos dois viewports | `frontend/web/e2e/visual.mjs` | `pnpm --filter @pelada/web visual` |
| Workflows, `.env.example`, docs, ADRs, config de build | none (gate de build e checagens do CI) | — | — | gate de build |

## Gate Check Commands

> Gerados a partir do legado (`ci.yml`, `package.json`). Confirmar antes do Execute. Diferença deliberada do legado: o `testes.json` do legado não rodava `test:checagens`, e2e nem os `checar-*.mjs`. Aqui o gate de build roda tudo isso, para o gate local bater com o CI.

| Nível do gate | Quando usar | Comando |
| ------------- | ----------- | ------- |
| Quick | Tarefas só com testes unitários, no pacote tocado | `pnpm --filter <pacote> test` (ou `pnpm test:checagens` para `backend/scripts`) |
| Full | Tarefas com integration ou e2e. Exige `docker compose up -d` e `DATABASE_URL_TESTE` | `pnpm test` + `pnpm test:checagens` + `pnpm --filter @pelada/web e2e` |
| Build | Fim de fase e tarefas só de config, workflow ou docs | `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:checagens && pnpm --filter @pelada/web build && pnpm --filter @pelada/web e2e && pnpm --filter @pelada/web visual` |

Antes do primeiro commit que pode ser integrado, o comando do gate de build vai para `.specs/projeto/testes.json` (T3), para a trava `trava-testes.py` e para o CI.

---

## Execution Plan

As fases rodam em ordem; dentro da fase, as tarefas rodam em sequência.

### Phase 1: Spikes de risco

Resolvem os riscos S1 e S2 do design antes de escrever o SQL de RLS. Dependem de confirmação do usuário para criar a branch Neon descartável.

```
T1 → T2
```

### Phase 2: Repositório e ferramentas

```
T3 → T4 → T5 → T6 → T7 → T8
```

### Phase 3: Banco, migrations, roles e RLS

```
T9 → T10 → T11 → T12 → T13 → T14 → T15
```

### Phase 4: API (Worker, Hono, contexto de banco)

```
T16 → T17 → T18 → T19 → T20
```

### Phase 5: Front base (visual do legado)

```
T21 → T22 → T23 → T24 → T25 → T26 → T27 → T28
```

### Phase 6: Shell PWA e verificações do front

```
T29 → T30 → T31 → T32 → T33 → T34 → T35 → T36 → T37
```

### Phase 7: CI, deploy e backup

```
T38 → T39 → T40 → T41
```

### Phase 8: Documentação

```
T42 → T43 → T44 → T45 → T46
```

### Phase 9: Entrega (ações externas, cada uma com confirmação)

```
T47 → T48 → T49
```

---

## Task Breakdown

#### Phase 1: Spikes de risco

### T1: Spike S1 — contexto de RLS pelo Hyperdrive

**What**: Provar se `set_config(..., true)` dentro de uma transação por requisição se mantém e não vaza entre requisições concorrentes pelo Hyperdrive.
**Where**: `.specs/spikes/s1-contexto-rls/`
**Depends on**: None
**Reuses**: Skill `spike`; agente `implementador` em modo spike
**Requirement**: FUN-16, FUN-18 (risco S1 do design)

**Tools**:

- MCP: NONE
- Skill: `spike`

**Done when**:

- [ ] Branch Neon descartável criada **com confirmação específica do usuário** e apagada ao final *(criada e confirmada em 2026-10-24; baixa pendente: o usuário apaga a branch `spike-descartavel` no Neon e o Hyperdrive `spike-s1` no Cloudflare; vale também para T2)*
- [x] Duas requisições concorrentes com contas diferentes pelo Hyperdrive remoto: cada uma vê só o seu contexto
- [x] `registro.md` com veredito e nível de confiança; se reprovar, o fallback (conexão direta sem pooling) fica definido e o design é atualizado
- [x] Código do spike fora do git e nunca integrado

**Tests**: none (spike descartável; exceção do `CLAUDE.md`)
**Gate**: quick

---

### T2: Spike S2 — `neondb_owner`, `FORCE` e `pg_dump` com RLS

**What**: Provar como o owner e a role de backup se comportam sob `FORCE ROW LEVEL SECURITY` e se `pg_dump --enable-row-security` copia tudo.
**Where**: `.specs/spikes/s2-owner-force-dump/`
**Depends on**: T1
**Reuses**: Skill `spike`
**Requirement**: FUN-11, FUN-12, FUN-46 (riscos S2 do design)

**Tools**:

- MCP: NONE
- Skill: `spike`

**Done when**:

- [x] `rolbypassrls` e `relforcerowsecurity` conferidos; o que `neondb_owner` enxerga com `FORCE` ligado está registrado
- [x] `pg_dump --enable-row-security` com policy `USING (true)` para a role de backup copia todas as linhas
- [x] `registro.md` com veredito; o design é ajustado se o resultado mudar roles ou policies
- [ ] Mesma branch descartável de T1 (ou nova, com confirmação), apagada ao final *(mesma baixa pendente de T1)*

**Tests**: none (spike descartável)
**Gate**: quick

---

#### Phase 2: Repositório e ferramentas

### T3: Monorepo pnpm 11 com Node 24 e infraestrutura mínima de teste

**What**: Criar o monorepo com os cinco pacotes, scripts padrão na raiz, um teste que roda em cada pacote e o `testes.json` do projeto.
**Where**: raiz do repositório (monorepo)
**Depends on**: T2
**Reuses**: legado: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.prettierrc.json`, `.gitattributes`, `.gitignore`; Node 22 vira 24
**Requirement**: FUN-01, FUN-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `engines`, `.nvmrc` e `type: module` conferidos por teste (`test/repositorio.test.ts`), que falha se divergirem
- [x] `pnpm lint`, `pnpm typecheck` e `pnpm test` saem com código 0 na base limpa, executando em todos os pacotes
- [x] `.specs/projeto/testes.json` grava o comando do gate de build desta lista
- [x] Testes passam e a contagem fica registrada (sem apagar teste)

**Tests**: unit
**Gate**: quick

---

### T4: ESLint com o plugin do legado e regra de domínio sem I/O

**What**: Copiar a configuração de ESLint e o plugin próprio, mantendo só as regras que já têm código.
**Where**: `eslint/`
**Depends on**: T3
**Reuses**: legado: `eslint.config.mjs`, `eslint/`
**Requirement**: FUN-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Teste do plugin falha se `backend/dominio` importar módulo de rede, banco ou `node:fs` (FUN-06)
- [x] Regras de telas e rotas que ainda não existem foram retiradas
- [x] `pnpm lint` verde
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick

---

### T5: Checagens do CI copiadas com seus testes

**What**: Copiar as checagens de migração aditiva, URLs absolutas, `wrangler deploy` único, ações fixadas e ids de tarefa.
**Where**: `backend/scripts/checagens/`
**Depends on**: T4
**Reuses**: legado: `backend/scripts/checagens/` (só as cinco checagens listadas e os testes delas)
**Requirement**: FUN-22, FUN-43, FUN-54

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Cada teste copiado está ligado a um FUN: `checar-urls-absolutas` → FUN-22, `checar-wrangler-deploy` → FUN-43, `checar-migracao-aditiva` → FUN-54
- [x] A checagem aditiva reconhece o nome de arquivo do `node-pg-migrate`
- [x] `checar-acoes-fixadas` e `checar-ids-tarefa` entram como regras do CI (sem FUN próprio)
- [x] `pnpm test:checagens` verde

**Tests**: unit
**Gate**: quick

---

### T6: Postgres local por Docker e mensagem de banco fora do ar

**What**: Compose com Postgres 16 e `pgcrypto`, e a verificação que orienta `docker compose up -d` quando o banco não responde.
**Where**: `docker-compose.yml`
**Depends on**: T5
**Reuses**: legado: `docker-compose.yml` (só o serviço de banco)
**Requirement**: FUN-03, FUN-53

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] O compose sobe só o Postgres 16, sem outros serviços, e `pgcrypto` está disponível
- [x] Com o banco fora do ar, `migrar` e `dev` falham com "Rode `docker compose up -d`" (teste)
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick

---

### T7: CI mínimo (lint, typecheck, testes, gitleaks)

**What**: Primeira versão do `ci.yml`, com ações fixadas por SHA, para toda mudança seguinte nascer com CI.
**Where**: `.github/workflows/ci.yml`
**Depends on**: T6
**Reuses**: legado: `.github/workflows/ci.yml` (jobs `base` e `checagens`), `.github/actions/preparar-node`, `.gitleaks.toml`
**Requirement**: FUN-38, FUN-44

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] O workflow roda lint, format, typecheck, testes, checagens e gitleaks, com Node 24
- [x] `checar-acoes-fixadas` aprova o workflow
- [x] Gate de build passa localmente

**Tests**: none (workflow; coberto por `checar-acoes-fixadas`)
**Gate**: build

---

### T8: ADRs do legado e pasta `.md/adr`

**What**: Copiar os ADRs 001 a 023, preservando o histórico.
**Where**: `.md/adr/`
**Depends on**: T7
**Reuses**: legado: `.md/adr/`
**Requirement**: FUN-51

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] 23 ADRs copiados sem alteração de conteúdo
- [x] Os ADRs 018 e 020 ficam marcados para `Supersedes:` nos ADRs novos (T44) *(ADR aceito não se edita: 018 e 020 ficam intactos; a marca é esta nota, e o `Supersedes: 018` e o `Supersedes: 020` entram nos ADRs novos em T44)*
- [x] Gate de build passa

**Tests**: none (documentação)
**Gate**: build

---

#### Phase 3: Banco, migrations, roles e RLS

### T9: Linha de base do schema com `node-pg-migrate`

**What**: Concatenar as 13 migrations do legado na linha de base e configurar o runner, com apoio de teste de banco temporário.
**Where**: `backend/api/src/infraestrutura/db/migracoes/`
**Depends on**: T8
**Reuses**: legado: as 13 migrations SQL, `backend/api/test/apoio/` (`banco-migracao.ts`, `db-teste.ts`, `setup-global.ts`)
**Requirement**: FUN-07, FUN-08

**Tools**:

- MCP: `context7` (API do `node-pg-migrate` 9)
- Skill: NONE

**Done when**:

- [x] A linha de base é a concatenação literal das 13 migrations, sem alteração *(o legado tem 13 em todas as branches, como diz a spec em FUN-08; o "15" anterior era erro de contagem, corrigido em 2026-10-24)*
- [x] Cada migration roda na própria transação (`--no-single-transaction`) e há uma migration por mudança
- [x] Teste: banco vazio migrado tem as mesmas tabelas, colunas, restrições e triggers do legado
- [x] Gate full passa *(o "full" roda hoje lint, format, typecheck, `pnpm test` e `pnpm test:checagens`; e2e do web entra nas Fases 5 e 6)*

**Tests**: integration
**Gate**: full

---

### T10: `migrar` com detecção de estado, impressão digital e `--fake`

**What**: Implementar `detectarEstado` e `impressaoDigital`, registrar a linha de base com `--fake` no estado `legado` e abortar no estado `parcial`.
**Where**: `backend/scripts/migrar.ts`
**Depends on**: T9
**Reuses**: legado: `backend/scripts/migrar.ts`; `exigirHostPermitido`
**Requirement**: FUN-09, FUN-10, FUN-53

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Fixture A (13 migrations pelo runner antigo): `migrar` registra a linha de base sem DDL e sem alterar dados (contagem de linhas igual antes e depois); a impressão digital bate com a da fixture B
- [x] Fixture B (banco vazio): aplica tudo
- [x] Fixture C (schema parcial): aborta sem alterar nada e lista as diferenças
- [x] Gate full passa

**Tests**: integration
**Gate**: full

---

### T11: Roles `pelada_app` e `pelada_backup` e seus grants

**What**: Migration que cria as roles e os grants mínimos.
**Where**: `backend/api/src/infraestrutura/db/migracoes/`
**Depends on**: T10
**Reuses**: Resultado do spike S2 (T2)
**Requirement**: FUN-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `pelada_app` é `NOLOGIN NOBYPASSRLS`, sem DDL e sem `TRUNCATE`, e com `DELETE` só nas tabelas listadas no design *(`sessoes` fica sem grant até a `conta-e-acesso`, como o design manda para as tabelas sem `grupo_id`; SPEC_DEVIATION anotado na migration)*
- [x] `pelada_backup` só lê
- [x] Teste cobre cada limite (tentativa de DDL, de `TRUNCATE` e de `DELETE` fora da lista falha)
- [x] Gate full passa

**Tests**: integration
**Gate**: full

---

### T12: RLS com `FORCE`, `grupos_visiveis()` e policies

**What**: Migration com as funções de contexto, a função `SECURITY DEFINER` e as policies em toda tabela com `grupo_id`.
**Where**: `backend/api/src/infraestrutura/db/migracoes/`
**Depends on**: T11
**Reuses**: Resultados de T1 e T2
**Requirement**: FUN-12, FUN-13, FUN-14, FUN-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `ENABLE` e `FORCE ROW LEVEL SECURITY` em toda tabela com `grupo_id` (teste lê o catálogo) *(14 tabelas mais `grupos`; inclui `auditoria` e `eventos_uso`, que o design dava como sem `grupo_id` mas têm a coluna: SPEC_DEVIATION anotado na migration; a policy `USING (true)` de `pelada_backup` vai em todas)*
- [x] Com `app.conta_id`, só grupos com vínculo; com `app.slug_publico`, só leitura do grupo do slug e escrita recusada; sem contexto, zero linhas *(pelo slug, `INSERT` é recusado e `UPDATE`/`DELETE` afetam zero linhas; com conta e slug juntos vale a conta, como FUN-13)*
- [x] `grupos_visiveis()` com `search_path` fixo, `REVOKE` de `PUBLIC` e `GRANT` só a `pelada_app`
- [x] Gate full passa

**Tests**: integration
**Gate**: full

---

### T13: Suíte de isolamento no banco e meta-teste

**What**: Cenários de isolamento por tabela com `grupo_id`, rodando como `pelada_app` direto no banco.
**Where**: `backend/api/test/isolamento/`
**Depends on**: T12
**Reuses**: legado: `test/apoio/cenario-acesso.ts`, `isolamento/meta.test.ts`
**Requirement**: FUN-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Para cada tabela de negócio: A lê só o seu; B não lê, não insere, não altera e não apaga nada de A *(15 casos: as 14 tabelas com `grupo_id` e `grupos`. Em `auditoria` e `eventos_uso`, sem grant para `pelada_app` na fundação, "A lê só o seu" não se aplica: o caso prova que ninguém lê e que B não escreve)*
- [x] O slug não escreve e sem contexto o resultado é zero linhas *(nas duas tabelas sem grant, sem contexto a leitura é recusada por privilégio)*
- [x] Meta-teste falha se surgir tabela com `grupo_id` sem caso de isolamento
- [x] Gate full passa

**Tests**: integration
**Gate**: full

---

### T14: Seed local com trava de host

**What**: Seed de dados de exemplo (grupo, jogadores, partidas, conta admin) que recusa URL de banco não local.
**Where**: `backend/scripts/seed-local.ts`
**Depends on**: T13
**Reuses**: legado: `backend/scripts/seed-local.ts` e `seed-local/`, `exigirHostPermitido`
**Requirement**: FUN-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Banco local migrado ganha um grupo com jogadores, partidas e uma conta admin *(a conta admin fica sem senha de login válida até a `conta-e-acesso`, que define o formato do hash)*
- [x] Teste: URL do Neon ou de qualquer host não local é recusada antes de qualquer escrita
- [x] O seed também define a senha de login das roles locais a partir do `.env` *(`PELADA_APP_SENHA` e `PELADA_BACKUP_SENHA`; entram no `.env.example` na T41. A API conecta direto como `pelada_app`, forma coberta pelo teste do seed)*
- [x] Gate full passa

**Tests**: integration
**Gate**: full

---

### T15: Job de migrations do zero e de isolamento no CI

**What**: Acrescentar ao `ci.yml` o job que roda as três fixtures de migração e a suíte de isolamento num Postgres de serviço.
**Where**: `.github/workflows/ci.yml`
**Depends on**: T14
**Reuses**: legado: job `api` do `ci.yml`
**Requirement**: FUN-38

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] O job roda migrations do zero e a suíte de isolamento, e falha se qualquer uma falhar *(job `banco`, com Postgres 16 de serviço; roda também os demais testes da API, que saíram do job `base` por precisarem de banco. Passos conferidos localmente contra o Postgres do compose; a primeira execução no GitHub fica para o push da T47)*
- [x] `checar-acoes-fixadas` aprova o workflow
- [x] Gate de build passa localmente *(lint, format, typecheck, `pnpm test`, `pnpm test:checagens` e as cinco checagens; build, e2e e visual do web entram nas Fases 5 e 6)*

**Tests**: none (workflow; exercita os testes de T10 e T13)
**Gate**: build

---

#### Phase 4: API

### T16: `wrangler.jsonc` com assets, bindings, rate limit e domínio

**What**: Configurar o Worker `gestaodapelada` com assets SPA, `run_worker_first`, `nodejs_compat`, Hyperdrive, rate limits e a rota do domínio.
**Where**: `wrangler.jsonc`
**Depends on**: T15
**Reuses**: legado: `wrangler.jsonc`; teste `backend/api/test/wrangler.test.ts` (lista fechada de chaves)
**Requirement**: FUN-19, FUN-26, FUN-27, FUN-18

**Tools**:

- MCP: `context7` (Wrangler, `@cloudflare/vitest-plugin`)
- Skill: NONE

**Done when**:

- [x] Teste de config confere `single-page-application`, `run_worker_first: ["/api/*"]`, `nodejs_compat`, bindings `LIMITE_ENTRAR` (10/min), `LIMITE_PUBLICO` (60/min) e `LIMITE_WEBHOOK`, e a rota com `custom_domain: true` *(`backend/api/test/config/wrangler.test.ts`, com a lista fechada de chaves do legado mais `routes`. O número do `LIMITE_WEBHOOK` não está na spec: 60/min provisório, marcado `[A ESCLARECER]` no `wrangler.jsonc`; o teste só exige o binding)*
- [x] Testes de API migrados para `@cloudflare/vitest-plugin` (codemod oficial), com `compatibility_date` conforme o ADR a escrever na T44 *(o worktree não tinha testes de workerd: o vitest da API ganhou os projetos `node` e `workers` com `cloudflareTest` do `@cloudflare/vitest-plugin` 1.4.7, que é o que o codemod troca no import do legado; nenhum teste existente mudou. `compatibility_date` = `2026-10-19`, a data do workerd 1.20261019.1 do plugin, conferida por teste)*
- [ ] A origem do Hyperdrive aponta para `pelada_app` e o cache fica desligado (conferência fica no deploy, T39) *(em aberto: são propriedades da config do Hyperdrive na Cloudflare, não do `wrangler.jsonc`; o arquivo só documenta e o local usa `pelada_app`)*
- [x] Gate full passa *(lint, format, typecheck, `pnpm test`, `pnpm test:checagens`; o e2e do web só existe a partir da Fase 6)*

**Tests**: unit
**Gate**: full

---

### T17: App Hono com middlewares e `GET /api/health`

**What**: Montar o app com `semCache`, `semSniff`, limite de taxa, `X-Pelada` e `bodyLimit`, e a rota de saúde sem banco.
**Where**: `backend/api/src/entrada/app.ts`
**Depends on**: T16
**Reuses**: legado: `backend/api/src/entrada/app.ts:43-66`, `middlewares/`, `limite-taxa.ts`
**Requirement**: FUN-20, FUN-21

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `GET /api/health` → 200 com `{"status":"ok","versao":"<sha>"}` sem tocar o banco *(o teste espia o binding `HYPERDRIVE`: zero leituras. `VERSAO` tem valor `dev` no `wrangler.jsonc`; o deploy injeta o SHA)*
- [x] Toda rota `/api/*`, inclusive a de erro e a inexistente, responde `Cache-Control: no-store` *(e `nosniff`; casos 200, 403, 404, 413, 429 e 500)*
- [x] Testes de rota no pool workerd passam *(`test/rotas/`: health, middlewares e limite de taxa. O `LIMITE_WEBHOOK` fica sem rota até a feature de pagamentos)*
- [x] Gate full passa *(lint, format, typecheck, `pnpm test`, `pnpm test:checagens`; o e2e do web só existe a partir da Fase 6)*

**Tests**: e2e
**Gate**: full

---

### T18: Middleware `comBanco` — transação por requisição com contexto de RLS

**What**: Abrir a transação na primeira consulta, definir `app.conta_id` e `app.slug_publico` com `set_config` e fechar com `COMMIT` ou `ROLLBACK`.
**Where**: `backend/api/src/entrada/middlewares/com-banco.ts`
**Depends on**: T17
**Reuses**: legado: `backend/api/src/infraestrutura/db/cliente.ts`; resultado do spike S1
**Requirement**: FUN-16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `BEGIN` (`READ ONLY` em GET e HEAD) e `set_config(..., true)` com parâmetros antes de qualquer consulta *(a conexão só abre na primeira consulta; `contaId` e `slugPublico` saem das variáveis do contexto do Hono, lidas nesse momento, e quem as define chega com as features. Forma escolhida: a API conecta direto como `pelada_app`, sem `SET LOCAL ROLE`; o teste confere `current_user` e `session_user` = `pelada_app` sem bypass e a RLS por conta, por slug e sem contexto, inclusive em requisições concorrentes)*
- [x] `COMMIT` se a resposta for menor que 400, `ROLLBACK` caso contrário; conexão fechada no `waitUntil` *(o `COMMIT` roda antes de responder; erro lançado também desfaz. Testes com 200, 201, 204, 302 e 399 gravando e 400, 404, 422, 500 e erro lançado desfazendo; a sessão some do `pg_stat_activity` depois da resposta)*
- [x] Abrir outra transação dentro da requisição é proibido (teste) *(`db.transaction()`, `db.startTransaction()` e SQL de `BEGIN`, `START TRANSACTION`, `COMMIT`, `END`, `ROLLBACK`, `ABORT`, `SAVEPOINT`, `RELEASE`, inclusive atrás de comentário, dão `TransacaoAninhada`; várias instruções numa consulta são recusadas pelo protocolo estendido)*
- [x] Gate full passa *(lint, format, typecheck, `pnpm test`, `pnpm test:checagens`; o e2e do web só existe a partir da Fase 6)*

**Tests**: integration
**Gate**: full

---

### T19: Sentry no Worker, ativo só com DSN

**What**: Integrar `@sentry/hono/cloudflare` com `release` igual ao SHA e remoção de dados sensíveis.
**Where**: `backend/api/src/entrada/sentry.ts`
**Depends on**: T18
**Reuses**: Nenhum código do legado (decisão nova)
**Requirement**: FUN-23, FUN-24

**Tools**:

- MCP: `context7` (confirmar o hook `beforeSend`, `PREMISSA` do design)
- Skill: NONE

**Done when**:

- [x] Sem `SENTRY_DSN`, o app funciona e nada é enviado *(DSN ausente ou vazio: `enabled: false`; o teste espia o `fetch` global e não vê nenhuma chamada, nem com erro na rota)*
- [x] Com DSN, o evento sai com `release` = SHA e sem corpo, cookies, `Authorization` e e-mails (teste do `beforeSend`) *(o `beforeSend` existe na 11.9, conferido nos tipos instalados de `@sentry/core`: a `PREMISSA` do design se confirma. Teste unitário do `limparEvento` e teste de ponta a ponta no workerd que lê o envelope enviado. Na 11.x o `sendDefaultPii` deu lugar a `dataCollection`, configurado sem usuário, cookies, corpos, query e SQL. Cliente por requisição (`cacheClient: false`): com o cliente em cache por isolate, só a primeira requisição descarregava os eventos)*
- [x] Gate full passa *(lint, format, typecheck, `pnpm test`, `pnpm test:checagens`; o e2e do web só existe a partir da Fase 6)*

**Tests**: unit
**Gate**: full

---

### T20: `pnpm dev` com Wrangler, Vite e proxy

**What**: Script `dev` na raiz que sobe o `wrangler dev` (Hyperdrive local) e o Vite com proxy de `/api`.
**Where**: `frontend/web/vite.config.ts`
**Depends on**: T19
**Reuses**: legado: `frontend/web/vite.config.ts` (declarar `vitest` no `package.json` do web)
**Requirement**: FUN-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Teste confere o proxy `/api` → Worker e `localConnectionString` apontando para o Postgres local *(`frontend/web/test/configuracao-servidor.test.ts` e `backend/scripts/test/dev.test.ts`: o `localConnectionString` bate com a porta e o banco do `docker-compose.yml`, e o `pnpm dev` troca a string pela de `pelada_app` com a senha do `.env` via `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`. Com o banco fora do ar, o `pnpm dev` falha com o aviso do `exigir-banco` antes de subir qualquer coisa: FUN-53 fecha aqui. O `vitest` e o `vite` entram no `package.json` do web)*
- [ ] Com o compose de pé, `http://localhost:5173` abre e `GET /api/health` = 200 (conferido à mão e registrado) *(em parte, 2026-10-25: com o `fundacao-db-1` de pé, `pnpm dev` subiu os dois; `curl http://localhost:8787/api/health` e `curl http://localhost:5173/api/health` (pelo proxy) deram 200 com `{"status":"ok","versao":"dev"}`, `no-store` e `nosniff`. `http://localhost:5173/` dá 404 porque o web ainda não tem `index.html`: abre com o front base, Fase 5)*
- [x] Gate quick passa *(`pnpm test:checagens`, `pnpm --filter @pelada/web test`; rodados também lint, format, typecheck e `pnpm test`)*

**Tests**: unit
**Gate**: quick

---

#### Phase 5: Front base

### T21: Tokens, estilos globais, fontes e ícones do legado

**What**: Copiar `tokens.css`, `global.css`, fontes Barlow e ícones, byte a byte.
**Where**: `frontend/web/src/estilos/`
**Depends on**: T20
**Reuses**: legado: `frontend/web/src/estilos/`, `public/fontes`, `public/icones`, `config/tokens.ts`
**Requirement**: FUN-29

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Teste falha se `frontend/web/src/estilos/tokens.css` divergir de `.specs/mockup/tokens.css` *(`frontend/web/test/estilos.test.ts`, ligado a FUN-29, compara também as fontes; conferido que acrescentar uma linha ao `tokens.css` o faz falhar. Texto compara sem a diferença CRLF/LF do Windows, binário byte a byte. `global.css`, `tokens.css`, fontes, ícones e `config/tokens.ts` vieram do legado sem mudança; `tokens.css` e `fontes.css` entram no `.prettierignore` por serem cópia)*
- [x] `python .claude/scripts/checar-tokens.py frontend/web/src` entra no CI *(passo no job `base` de `.github/workflows/ci.yml`, depois do `pnpm lint`; rodou local: OK)*
- [x] Gate quick passa *(lint, format, typecheck, `pnpm test`, `pnpm test:checagens` verdes)*

**Tests**: unit
**Gate**: quick

---

### T22: Stylelint recusando valores literais

**What**: Configurar o Stylelint para recusar cor, fonte e sombra literais fora de `tokens.css`.
**Where**: `frontend/web/.stylelintrc.json`
**Depends on**: T21
**Reuses**: legado: configuração de Stylelint do web
**Requirement**: FUN-31

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Teste com CSS de exemplo: cor, fonte e sombra literais falham; tokens passam *(`frontend/web/test/stylelint.test.ts`, ligado a FUN-31, copiado do legado: 12 CSS recusados, 9 aceitos e o `global.css` real passa. Desvio: a configuração é `frontend/web/stylelint.config.mjs`, como no legado, e não `.stylelintrc.json`; um `.d.ts` de apoio tipa o import no teste)*
- [x] `pnpm lint` (inclui `lint:css`) verde *(script `lint:css` no `package.json` do web)*
- [x] Gate quick passa *(lint, format, typecheck, `pnpm test`, `pnpm test:checagens` verdes)*

**Tests**: unit
**Gate**: quick

---

### T23: Componentes base — `basicos/`

**What**: Copiar os componentes básicos com HTML e CSS Module idênticos e seus testes.
**Where**: `frontend/web/src/componentes/basicos/`
**Depends on**: T22
**Reuses**: legado: `frontend/web/src/componentes/basicos/` e testes
**Requirement**: FUN-30

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Cada componente tem teste de renderização e axe sem violações *(13 componentes cobertos: `botoes`, `mensagens`, `voltar-erro-envio` e `Esqueleto` copiados do legado, mais `complementares.test.tsx` para Icone, SeloSalvo, ValorDestaque e Esqueleto, que não tinham axe próprio; 77 testes do web verdes)*
- [x] Os testes copiados estão ligados a FUN-30 *(cabeçalho `Critério: FUN-30` nos 4 arquivos copiados e no complementar. Infraestrutura do web criada aqui: React, Testing Library, jsdom, axe-core, plugin React e setup no Vitest)*
- [x] Gate quick passa *(lint, format, typecheck, `pnpm test` e `pnpm test:checagens` verdes)*

**Tests**: unit
**Gate**: quick

---

### T24: Componentes base — `barras/`

**What**: Copiar os componentes de barras.
**Where**: `frontend/web/src/componentes/barras/`
**Depends on**: T23
**Reuses**: legado: `frontend/web/src/componentes/barras/`
**Requirement**: FUN-30

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Cada componente tem teste de renderização e axe sem violações *(9 componentes: `barras.test.tsx` copiado do legado (BarraAcao, BarraAdmin, BarraDono, BarraSuperior, PularConteudo) e `complementares.test.tsx` para BarraCarregando, BarraTitulo, BotaoIcone e BarraInterna; ligados a FUN-30. Vieram também `config/recursos.ts` e seu teste, que `BarraSuperior` usa)*
- [x] Gate quick passa *(lint, format, typecheck, `pnpm test` (web 104) e `pnpm test:checagens` verdes)*

**Tests**: unit
**Gate**: quick

---

### T25: Componentes base — `campos/`

**What**: Copiar os componentes de campos.
**Where**: `frontend/web/src/componentes/campos/`
**Depends on**: T24
**Reuses**: legado: `frontend/web/src/componentes/campos/`
**Requirement**: FUN-30

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Cada componente tem teste de renderização e axe sem violações *(12 componentes: `campos.test.tsx` e `CamposNovaSenha.test.tsx` copiados do legado, mais `CampoBusca.test.tsx` (sem teste no legado); ligados a FUN-30. SPEC_DEVIATION: os campos usam `LIMITES` e a formatação de moeda e datas, que ainda não existiam; entraram só `LIMITES`, `bytesUtf8` e `DIAS_DA_SEMANA` em `@pelada/contrato`, `formatacao/{moeda,datas}` com testes e `rotulos` reduzido a `ROTULO_DIA_SEMANA`)*
- [x] Gate quick passa *(lint, format, typecheck, `pnpm test` (web 183, contrato 5) e `pnpm test:checagens` verdes)*

**Tests**: unit
**Gate**: quick

---

### T26: Componentes base — `escolhas/`

**What**: Copiar os componentes de escolhas.
**Where**: `frontend/web/src/componentes/escolhas/`
**Depends on**: T25
**Reuses**: legado: `frontend/web/src/componentes/escolhas/`
**Requirement**: FUN-30

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Cada componente tem teste de renderização e axe sem violações *(3 componentes (Segmentado, Interruptor, CaixaSelecao) em `escolhas.test.tsx`, copiado do legado, ligado a FUN-30; o teste de axe cobre os três)*
- [x] Gate quick passa *(lint, format, typecheck, `pnpm test` (web 211) e `pnpm test:checagens` verdes)*

**Tests**: unit
**Gate**: quick

---

### T27: Componentes base — `dialogos/`

**What**: Copiar os componentes de diálogos.
**Where**: `frontend/web/src/componentes/dialogos/`
**Depends on**: T26
**Reuses**: legado: `frontend/web/src/componentes/dialogos/`
**Requirement**: FUN-30

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Cada componente tem teste de renderização e axe sem violações *(Dialogo, Folha e OpcaoFolha em `dialogos.test.tsx`, copiado do legado, ligado a FUN-30; axe no diálogo e na folha (a `OpcaoFolha` é coberta dentro da folha))*
- [x] Gate quick passa *(lint, format, typecheck, `pnpm test` (web 211) e `pnpm test:checagens` verdes)*

**Tests**: unit
**Gate**: quick

---

### T28: Componentes base — `listas/`

**What**: Copiar os componentes de listas.
**Where**: `frontend/web/src/componentes/listas/`
**Depends on**: T27
**Reuses**: legado: `frontend/web/src/componentes/listas/`
**Requirement**: FUN-30

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Cada componente tem teste de renderização e axe sem violações *(6 componentes: `listas.test.tsx` copiado do legado (Lista, Item, NavegadorMes, TabelaSemanas, TabelaSimples; caminho do mockup trocado de `.md/mockup` para `.specs/mockup`) e `Indicadores.test.tsx` (sem teste no legado); ligados a FUN-30)*
- [x] Gate de build passa (fecha a fase) *(lint, format, typecheck, `pnpm test` (web 224, api 343, contrato 5), `pnpm test:checagens` (175) e `pnpm --filter @pelada/web build` verdes; `e2e` e `visual` do web ainda não existem (Fase 6) e ficam fora. SPEC_DEVIATION: para o build ter o que empacotar entraram o `index.html` do legado, um `main.tsx` sem o `<App />` e o script `build`; o App e o shell PWA chegam na Fase 6. Teste do `index.html` (sem script/estilo inline nem URL externa) copiado do legado em `estilos.test.ts`)*

**Tests**: unit
**Gate**: build

---

#### Phase 6: Shell PWA e verificações do front

### T29: Manifest do PWA

**What**: Gerar o manifest com nome, `standalone`, `pt-BR` e ícones 192 e 512, um `maskable`.
**Where**: `frontend/web/src/config/manifesto.ts`
**Depends on**: T28
**Reuses**: legado: `frontend/web/src/config/manifesto.ts`, `frontend/web/test/pwa-config.test.ts`
**Requirement**: FUN-32

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Teste confere nome "Gestão da Pelada", `display: standalone`, `lang: pt-BR` e os dois ícones, um deles `maskable` *(`test/manifesto.test.ts`, FUN-32; confere também as cores vindas dos tokens e os PNGs idênticos aos do mockup; `criarOpcoesPwa` fica para a T30)*
- [x] Gate quick passa *(web 228)*

**Tests**: unit
**Gate**: quick

---

### T30: Service worker com precache e handlers de push

**What**: Configurar o `vite-plugin-pwa` (`injectManifest`) com precache do shell e os handlers `push` e `notificationclick` vazios.
**Where**: `frontend/web/src/sw.ts`
**Depends on**: T29
**Reuses**: legado: `frontend/web/src/pwa/` (regras do SW)
**Requirement**: FUN-33

**Tools**:

- MCP: `context7` (vite-plugin-pwa 2, Workbox 7)
- Skill: NONE

**Done when**:

- [x] Teste confere o precache do shell e os dois handlers registrados *(`src/sw.test.ts` carrega o SW com `self` e o Workbox simulados, FUN-33; `test/pwa-config.test.ts` confere as opções do plugin. `context7` indisponível: usada a documentação dos pacotes e o build real, que gerou `dist/sw.js` com 27 entradas de precache. SPEC_DEVIATION: o SW fica em `src/sw.ts`, como manda a tarefa (o legado usa `src/pwa/sw.ts`), e a versão nova assume sem faixa de aviso (`skipWaiting` + `clientsClaim`), porque a fundação não leva a `FaixaNovaVersao`)*
- [x] `tsc` do SW (`tsconfig.sw.json`) verde *(inclui também `sw.test.ts`; o `tsconfig.json` do app os exclui por causa da lib DOM; o `typecheck` roda os dois)*
- [x] Gate quick passa *(web 232; `vite build` gera o SW; as dependências do PWA entraram junto com a T29)*

**Tests**: unit
**Gate**: quick

---

### T31: Página offline e fallback de navegação

**What**: Página `offline.html` no visual do legado, servida pelo SW quando a rota não está em cache.
**Where**: `frontend/web/public/offline.html`
**Depends on**: T30
**Reuses**: Casca de `t03-indisponivel` do mockup
**Requirement**: FUN-34

**Tools**:

- MCP: NONE
- Skill: `mockup-visual` (modo módulo, só se faltar estado no mockup)

**Done when**:

- [x] Teste da regra do SW: navegação sem cache e sem rede devolve `offline.html` *(`regras-sw.test.ts` e `sw.test.ts` (FUN-34). SPEC_DEVIATION: em vez de `public/offline.html` estático, `offline.html` é uma segunda entrada do Vite (`frontend/web/offline.html` + `src/offline/`) que reaproveita `BarraTitulo` e `TelaMensagem` (a casca de `t03-indisponivel`); assim o CSS sai com hash, entra no precache e não duplica `tokens.css`. O build gera `dist/offline.html` e o precache passa a 31 entradas; `mockup-visual` não foi preciso, o estado existe no mockup)*
- [x] A página usa só tokens do guia (checagem de tokens verde) *(`checar-tokens.py frontend/web/src` OK; a página só usa componentes e CSS modules com variáveis)*
- [x] Gate quick passa *(web 241, typecheck, lint, format e build verdes)*

**Tests**: unit
**Gate**: quick

---

### T32: Instruções de instalação no Safari do iOS

**What**: Mostrar a instrução de instalação fora do modo standalone no iOS.
**Where**: `frontend/web/src/pwa/instalacao.ts`
**Depends on**: T31
**Reuses**: legado: `frontend/web/src/pwa/instalacao.ts` e testes
**Requirement**: FUN-35

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Teste: Safari iOS fora de standalone mostra a instrução; em standalone ou em outro navegador, não *(`instalacao.ts` e o teste copiados do legado, mais testes de `lerAmbienteEDecidir` (FUN-35); o componente de aviso do legado fica com a tela que o usa)*
- [x] Gate quick passa *(web 264)*

**Tests**: unit
**Gate**: quick

---

### T33: Observabilidade no front, ativa só com DSN

**What**: `@sentry/react` com `VITE_SENTRY_DSN`, `release` igual ao SHA e remoção de dados sensíveis.
**Where**: `frontend/web/src/app/observabilidade.ts`
**Depends on**: T32
**Reuses**: Padrão de `beforeSend` da T19
**Requirement**: FUN-23, FUN-24

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Sem `VITE_SENTRY_DSN`, o Sentry não inicializa e nada é enviado *(`observabilidade.test.ts`, FUN-24; `iniciarObservabilidade` é ligada no `main.tsx` na T34. `VITE_VERSAO` (SHA) é a variável do `release`; quem a define no build é o deploy (T39))*
- [x] Com DSN, o `beforeSend` remove corpo, cookies, `authorization` e e-mails *(FUN-23; mesmo padrão da T19; `dataCollection` no lugar de `sendDefaultPii`, que não existe nas opções do navegador da 11.9)*
- [x] Gate quick passa *(web 271; `@sentry/react` 11.9)*

**Tests**: unit
**Gate**: quick

---

### T34: Página provisória e rotas de vitrine do build de teste

**What**: Página `/` com nome, visual do legado e "Em breve", e as rotas de vitrine só quando `VITE_VITRINE=1`.
**Where**: `frontend/web/src/app/App.tsx`
**Depends on**: T33
**Reuses**: legado: `frontend/web/src/app/App.tsx`; mockup `t03-indisponivel`
**Requirement**: FUN-37

**Tools**:

- MCP: NONE
- Skill: `mockup-visual` (modo módulo, se faltar estado no mockup)

**Done when**:

- [ ] Teste: `/` renderiza a página provisória; as rotas de vitrine só existem com `VITE_VITRINE=1` e nunca no build de produção
- [ ] Gate quick passa

**Tests**: unit
**Gate**: quick

---

### T35: Comparação visual no CI

**What**: Portar o `comparar-visual` do legado e a lista de telas ativas da fundação.
**Where**: `frontend/web/e2e/visual.mjs`
**Depends on**: T34
**Reuses**: legado: `frontend/web/e2e/visual.mjs`, `e2e/telas-ativas.mjs`, `e2e/ferramentas/comparar-visual*.mjs`; `.specs/mockup/telas.json`
**Requirement**: FUN-37

**Tools**:

- MCP: NONE
- Skill: `mockup-visual` (etapa de comparação)

**Done when**:

- [ ] Telas ativas: `padrao--erro-rede`, `padrao--carregando-lista`, `t03-indisponivel--erro`, em 1280×800 e 390×844, limite de 1% de pixels
- [ ] Uma divergência injetada faz a comparação falhar (teste do comparador)
- [ ] Gate full passa

**Tests**: e2e
**Gate**: full

---

### T36: Teste de instalabilidade com Playwright

**What**: Teste e2e contra o build que confirma manifest, service worker, ícones e página offline.
**Where**: `frontend/web/e2e/pwa.spec.ts`
**Depends on**: T35
**Reuses**: legado: `frontend/web/e2e/pwa.spec.ts`, `e2e/playwright.config.ts`
**Requirement**: FUN-36

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Manifest válido (FUN-32), service worker ativo controlando a página, ícones 192 e 512 (um `maskable`) acessíveis e página offline servida sem rede
- [ ] Sem Lighthouse no CI (AD-005)
- [ ] Gate full passa

**Tests**: e2e
**Gate**: full

---

### T37: Cabeçalhos de segurança conferidos por e2e

**What**: Copiar `public/_headers` e o teste e2e que confere CSP, `X-Content-Type-Options`, `Referrer-Policy` e HSTS no build.
**Where**: `frontend/web/e2e/cabecalhos.spec.ts`
**Depends on**: T36
**Reuses**: legado: `frontend/web/public/_headers`, `e2e/cabecalhos.spec.ts`
**Requirement**: FUN-28

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Teste confere os quatro cabeçalhos nas respostas do domínio
- [ ] CSP ajustada ao Sentry só quando houver DSN
- [ ] Gate de build passa (fecha a fase)

**Tests**: e2e
**Gate**: build

---

#### Phase 7: CI, deploy e backup

### T38: `ci.yml` completo

**What**: Completar o CI com build do web, migrations do zero, isolamento, comparação visual, instalabilidade e e2e.
**Where**: `.github/workflows/ci.yml`
**Depends on**: T37
**Reuses**: legado: jobs `e2e` e `visual` do `ci.yml`
**Requirement**: FUN-38

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Todos os jobs da spec (FUN-38) existem e o CI falha se qualquer um falhar
- [ ] O job de Lighthouse não existe
- [ ] `checar-acoes-fixadas` aprova o workflow
- [ ] Gate de build passa localmente

**Tests**: none (workflow; exercita os testes das tarefas anteriores)
**Gate**: build

---

### T39: `deploy.yml` seguro e ordenado

**What**: Workflow `workflow_dispatch` na `main`, no environment `producao`, com a ordem de passos e as paradas da spec.
**Where**: `.github/workflows/deploy.yml`
**Depends on**: T38
**Reuses**: legado: `.github/workflows/deploy.yml`; `backend/scripts/ops/restauracao-neon*.ts`, `verificar-cache-hyperdrive*.ts`
**Requirement**: FUN-39, FUN-40, FUN-41, FUN-42, FUN-55, FUN-56, FUN-18

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Teste de estrutura do YAML: ordem build, branch de restauração (mantém 2), dump cifrado, migração com `NEON_URL_MIGRACAO`, `wrangler deploy --var URL_PUBLICA`, health com `versao == github.sha`
- [ ] Teste: build que falha para antes de tocar o Neon; migração que falha impede o `wrangler deploy`; `URL_PUBLICA` vazia falha antes do deploy
- [ ] `concurrency` com `cancel-in-progress: false`; `rollback` sem `|| true`; confere o cache do Hyperdrive desligado
- [ ] `wrangler deploy` só neste arquivo (`checar-wrangler-deploy`)
- [ ] Gate de build passa

**Tests**: unit
**Gate**: build

---

### T40: `backup.yml` e `dump-cifrado`

**What**: Backup diário às 07:00 UTC com `pg_dump -Fc` pela role de backup, cifrado com `age`, artefato por 30 dias.
**Where**: `.github/workflows/backup.yml`
**Depends on**: T39
**Reuses**: legado: `.github/workflows/backup.yml`, `.github/actions/dump-cifrado/`; testes de `backend/scripts/ops/test/`
**Requirement**: FUN-46, FUN-47

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Teste do script: dump com `--enable-row-security`; falha de `pg_dump` ou de `age` faz o job falhar e não publica artefato parcial
- [ ] Agendamento 07:00 UTC, disparo manual e retenção de 30 dias conferidos por teste do YAML
- [ ] Gate de build passa

**Tests**: unit
**Gate**: build

---

### T41: `.env.example` completo e conferido

**What**: Listar cada variável com obrigatoriedade, formato e se é segredo.
**Where**: `.env.example`
**Depends on**: T40
**Reuses**: legado: `.env.example`
**Requirement**: FUN-44

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Teste falha se uma variável usada em código, `wrangler.jsonc` ou workflows não estiver no arquivo
- [ ] Sem segredo versionado; gitleaks verde
- [ ] Constam `SENTRY_DSN`, `URL_PUBLICA` e os nomes reservados das features futuras (Resend, Web Push), sem valor
- [ ] Gate de build passa (fecha a fase)

**Tests**: unit
**Gate**: build

---

#### Phase 8: Documentação

### T42: README

**What**: Escrever o README: rodar local, variáveis, deploy e testes.
**Where**: `README.md`
**Depends on**: T41
**Reuses**: legado: `backend/README.md`
**Requirement**: FUN-49

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Os comandos do README levam do clone ao app em `localhost:5173` com health 200
- [ ] Um agente sem contexto segue o README num worktree limpo e chega ao app rodando (teste de aceite da P2)
- [ ] Gate de build passa

**Tests**: none (documentação; aceite pelo agente sem contexto)
**Gate**: build

---

### T43: Runbook

**What**: Escrever o runbook de deploy, falha de migração, restauração, rotação de segredos, remoção do Worker antigo e monitor de uptime.
**Where**: `docs/runbook.md`
**Depends on**: T42
**Reuses**: legado: `backend/DEPLOY.md`
**Requirement**: FUN-50, FUN-25, FUN-42, FUN-45, FUN-48

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Cobre deploy, falha de migração com restauração pela branch, restauração do backup, rotação de segredos, monitor do UptimeRobot em `/api/health` e remoção do Worker antigo
- [ ] Exige, antes do primeiro deploy, a remoção confirmada do Worker `pelada` e um dump cifrado
- [ ] Gate de build passa

**Tests**: none (documentação)
**Gate**: build

---

### T44: ADRs novos da fundação

**What**: Um ADR por decisão da fundação, a partir do 024.
**Where**: `.md/adr/`
**Depends on**: T43
**Reuses**: AD-001 a AD-006 de `.specs/STATE.md`
**Requirement**: FUN-51

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] ADRs para: migrations e linha de base, modelo de RLS, instalabilidade no lugar do Lighthouse, `@cloudflare/vitest-plugin` com `Supersedes: 018` e host próprio com `Supersedes: 020`
- [ ] Cada ADR tem `Supersedes:` quando substitui outro
- [ ] Gate de build passa

**Tests**: none (documentação)
**Gate**: build

---

### T45: `CLAUDE.md` da raiz

**What**: Descrever o contexto do projeto: stack, comandos e onde ficam regras e artefatos.
**Where**: `CLAUDE.md`
**Depends on**: T44
**Reuses**: legado: `CLAUDE.md`
**Requirement**: FUN-52

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Descreve a stack, os comandos `pnpm`, o gate de testes e onde ficam `.specs/`, `.md/` e `docs/`
- [ ] Não altera `.claude/CLAUDE.md`
- [ ] Gate de build passa

**Tests**: none (documentação)
**Gate**: build

---

### T46: Consolidar a documentação oficial em `.md/`

**What**: Consolidar PRD, PRD-TECNICO, SDD, GUARDRAILS e THREAT-MODEL a partir de `.specs/` e do legado.
**Where**: `.md/`
**Depends on**: T45
**Reuses**: legado: `.md/` (PRD, SDD, GUARDRAILS, THREAT-MODEL)
**Requirement**: FUN-51

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Os cinco documentos existem e refletem a stack nova
- [ ] O GUARDRAILS mapeia cada regra para o teste ou a checagem que a protege
- [ ] Gate de build passa (fecha a fase)

**Tests**: none (documentação)
**Gate**: build

---

#### Phase 9: Entrega (ações externas)

### T47: Repositório no GitHub, environment e secrets (ação externa)

**What**: Criar o repositório privado, o environment `producao` e os secrets, e publicar a `main`.
**Where**: GitHub (repositório novo)
**Depends on**: T46
**Reuses**: Nomes dos secrets do legado (`NEON_*`, `BACKUP_CHAVE`, `CLOUDFLARE_*`)
**Requirement**: FUN-39, FUN-44

**Tools**:

- MCP: NONE
- Skill: `finishing-a-development-branch`

**Done when**:

- [ ] **Confirmação específica do usuário** para criar o repositório e para o `git push`
- [ ] Checagem final: `python .claude/scripts/trava-testes.py --rodar` verde, resultado mostrado
- [ ] O CI roda no primeiro push e fica verde

**Tests**: none (ação externa; o CI roda a suíte)
**Gate**: build

---

### T48: Primeiro deploy em produção (ação externa)

**What**: Executar o runbook da primeira publicação: remover o Worker antigo, dump cifrado, migrar o banco de produção, publicar e conferir.
**Where**: Cloudflare e Neon (produção)
**Depends on**: T47
**Reuses**: `docs/runbook.md` (T43)
**Requirement**: FUN-45, FUN-40, FUN-27

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] **Confirmação específica do usuário em cada passo**: remover o Worker `pelada`, migrar produção e `wrangler deploy`
- [ ] `curl https://gestaodapelada.ljssoftware.com.br/api/health` = 200 com o SHA do deploy
- [ ] Contagem de linhas do grupo de teste idêntica antes e depois da migração
- [ ] Resultado registrado em `.specs/liberacao.md` (skill `liberacao`)

**Tests**: none (ação externa; verificação por `curl` e contagem de linhas registradas)
**Gate**: build

---

### T49: Backup manual e restauração testada (ação externa)

**What**: Disparar o `backup.yml` manualmente e restaurar o artefato, registrando o resultado.
**Where**: `docs/runbook.md`
**Depends on**: T48
**Reuses**: Procedimento de restauração do runbook
**Requirement**: FUN-46, FUN-48

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Artefato cifrado baixado e decifrado com a chave privada guardada fora do GitHub
- [ ] `pg_restore` no Postgres local; contagem de linhas por tabela conferida contra a produção
- [ ] Data e contagens registradas no runbook

**Tests**: none (ação operacional; evidência registrada no runbook)
**Gate**: build

---

## Rastreabilidade: requisito → tarefa

| Requisito | Tarefas | Requisito | Tarefas |
| --------- | ------- | --------- | ------- |
| FUN-01, 02 | T3 | FUN-29 | T21 |
| FUN-03 | T6 | FUN-30 | T23–T28 |
| FUN-04 | T20 | FUN-31 | T22 |
| FUN-05 | T14 | FUN-32 | T29 |
| FUN-06 | T4 | FUN-33 | T30 |
| FUN-07, 08 | T9 | FUN-34 | T31 |
| FUN-09, 10 | T10 | FUN-35 | T32 |
| FUN-11 | T11 | FUN-36 | T36 |
| FUN-12 a 15 | T12 | FUN-37 | T34, T35 |
| FUN-16 | T18 | FUN-38 | T7, T15, T38 |
| FUN-17 | T13 | FUN-39 | T39, T47 |
| FUN-18 | T16, T39 | FUN-40 a 42 | T39 |
| FUN-19, 26, 27 | T16 | FUN-43 | T5, T39 |
| FUN-20, 21 | T17 | FUN-44 | T7, T41, T47 |
| FUN-22 | T5 | FUN-45 | T43, T48 |
| FUN-23, 24 | T19, T33 | FUN-46, 47 | T40, T49 |
| FUN-25 | T43 | FUN-48 | T43, T49 |
| FUN-28 | T37 | FUN-49 | T42 |
| FUN-50 | T43 | FUN-51 | T8, T44, T46 |
| FUN-52 | T45 | FUN-53 | T6, T10, T20 |
| FUN-54 | T5 | FUN-55, 56 | T39 |

**Cobertura:** 56 requisitos, 56 mapeados a tarefas, 0 sem tarefa.
