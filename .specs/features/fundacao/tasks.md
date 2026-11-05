# Fundação — Tarefas

## Protocolo de Execução (OBRIGATÓRIO — não pular)

Implemente estas tarefas com a skill `tlc-spec-driven`: **acione-a pelo nome e siga o fluxo de Execute e as Critical Rules.** A construção é feita pelo agente `executor` (Sonnet) em lotes de até 6h, com o ciclo de marco do `CLAUDE.md` (gate completo, `verificador`, correções). A sessão principal só orquestra.

**Se a skill não puder ser acionada, PARE e avise o usuário. Não prossiga sem ela.**

---

**Design**: `.specs/features/fundacao/design.md`
**Spec**: `.specs/features/fundacao/spec.md`
**Reuso**: `.specs/features/fundacao/reuso.md`
**Status**: Approved (usuário, 2026-11-03)
**Passada**: rascunho
**Branch pai**: main
**Tamanho**: 82 tarefas em 25 Phases, 110,7h de trabalho humano estimado

> Premissas desta lista:
> - O código nasce na raiz deste repositório. Nomes de pacote: `@pelada/contrato`, `@pelada/dominio`, `@pelada/api`, `@pelada/scripts` (`backend/scripts`) e `@pelada/web`.
> - **Do zero total (AD-002).** Só são copiadas as 23 migrações (R1) e os ativos do mockup (R2 a R4). O `Reuses` de cada tarefa cita a linha do `reuso.md` quando há cópia; o resto é escrito a partir da spec e do mockup. O código do LJS pode ser consultado, nunca copiado.
> - **Teste primeiro.** Os testes nascem dos critérios de aceite. Em tarefa de criticidade crítica, o teste roda uma vez e falha pelo motivo certo antes do código (seção Execução do `CLAUDE.md`). Nome de teste de tarefa de risco alto cita o `FUN-NN`.
> - **Ferramentas (MCP e skills):** nenhuma específica em nenhuma tarefa.
> - **Ações externas exigem confirmação específica na hora**, mesmo com as tarefas aprovadas: `git push`, execução remota de workflow, criar Hyperdrive, environment e secrets, e o primeiro `deploy.yml`. Tarefas de **Ação do usuário** são pausas: a sessão para e espera a confirmação.
> - **Banco:** os testes só conectam em Postgres local ou de serviço do CI (FUN-19). Nunca no Neon. Local e CI migram como o superusuário `postgres` (AD-009).

---

## Conferência spec × design

Pontos em que a spec manda uma coisa e o design ou a realidade do banco faz outra, e a decisão de cada um. As ADs estão em `.specs/STATE.md`.

| # | A spec manda | O design ou o banco faz | Vale | Onde |
|---|---|---|---|---|
| 1 | FUN-11: o banco mantém a role `pelada_owner` | As migrações não criam `pelada_owner`: ela só existe no Neon | Local e CI migram como `postgres`. `pelada_owner` é conferida na paridade com a `dev`. FUN-11 é provada em `pelada_app` e `pelada_backup_ro` | AD-009; T27, T80 |
| 2 | FUN-42: dump cifrado antes da migração | O design usa a URL de migração (owner) | O dump da `dev` usa `pelada_backup_ro` (`NEON_URL_DEV_BACKUP`), porque a `FORCE` RLS esvazia o dump de quem não tem a policy `USING (true)` | AD-010; T70 |
| 3 | FUN-48: o `backup.yml` já está na `main` no mesmo push da troca | A `main` foi trocada antes de o `backup.yml` existir | FUN-48 pede a primeira execução manual no dia em que ele chega à `main` | AD-008, AD-011; T15 |
| 4 | FUN-05: o seed cria conta, grupo e jogadores | `pelada_app` não tem grant nas tabelas de conta e não faz login | O seed roda como a role de migração e define `LOGIN PASSWORD` de `pelada_app` e `pelada_backup_ro` a partir do `.env` | AD-009; T32 |
| 5 | FUN-01: Node 24 | A máquina está com Node 26.13 | Decisão do usuário (2026-11-03): usar Node 26. FUN-01, `engines` e `.nvmrc` mudam para 26 | AD-012; T1, T2 |

---

## Test Coverage Matrix

> Gerada a partir da spec, do design e das regras de teste do `CLAUDE.md`. Diretrizes encontradas: `.claude/CLAUDE.md` (seção Testes) e as regras de criticidade; nenhum `AGENTS.md`, `CONTRIBUTING.md` nem limiar de cobertura. Não há testes no repositório ainda; o padrão forte foi aplicado: todo critério de aceite e todo caso limite da spec tem teste. Confirmar antes do Execute.

| Camada | Tipo de teste exigido | Expectativa de cobertura | Padrão de local | Comando |
|---|---|---|---|---|
| Domínio (`backend/dominio`) | unit | Todos os ramos; 1:1 com os critérios da spec. Na fundação, só a regra FUN-06 (sem I/O) | `backend/dominio/test/**/*.test.ts` | `pnpm --filter @pelada/dominio test` |
| Contrato (`backend/contrato`) | unit | Cada função pura; os casos de FUN-24 | `backend/contrato/test/**/*.test.ts` | `pnpm --filter @pelada/contrato test` |
| Banco: esquema, estado, roles e RLS | integration | Postgres 18 real. Fixtures: banco vazio, banco migrado, divergentes. Matriz política × comando por tabela com `grupo_id` | `backend/api/test/{migracoes,isolamento,apoio}/**/*.test.ts` e `backend/api/src/infraestrutura/db/**` | `pnpm --filter @pelada/api test` |
| Arquivos de migração (cópia, ordem, hash) | unit | Hash dos 23 arquivos e ordem | `backend/api/test/migracoes/*.test.ts` | `pnpm --filter @pelada/api test` |
| Rotas e middlewares da API | e2e | Pool `workerd` com `@cloudflare/vitest-plugin`: toda rota em escopo com caminho feliz, cabeçalhos e erro | `backend/api/test/rotas/**/*.test.ts` | `pnpm --filter @pelada/api test` |
| Scripts, checagens, ops e workflows | unit | Cada checagem: caso que passa e caso que falha. Workflows: o YAML é lido e conferido. Integration quando usam banco ou container | `backend/scripts/**/test/*.test.ts`, `backend/scripts/checagens/test/*.test.ts` | `pnpm test:checagens` e `pnpm --filter @pelada/scripts test` |
| Front: componentes e lógica | unit | jsdom + Testing Library + axe: renderização, eventos e axe sem violações | `frontend/web/src/**/*.test.{ts,tsx}`, `frontend/web/test/*.test.ts` | `pnpm --filter @pelada/web test` |
| Front: ferramentas de e2e (lógica) | unit | Lógica pura do comparador | `frontend/web/e2e/ferramentas/*.test.mjs` | `pnpm --filter @pelada/web test` |
| Front: e2e (Playwright contra o build) | e2e | Cabeçalhos, manifest, service worker, offline e visual | `frontend/web/e2e/*.spec.ts` | `pnpm --filter @pelada/web e2e` |
| Config, docs e ações externas | none | Gate de build. Quando há teste, ele conta como acima do exigido | — | gate de build |

## Gate Check Commands

> Confirmar antes do Execute. O gate de build cresce com a feature; a tabela de evolução diz em que tarefa cada parte entra.

| Nível do gate | Quando usar | Comando |
|---|---|---|
| Quick | Tarefas só com teste unitário, no pacote tocado | `pnpm --filter <pacote> test` (ou `pnpm test:checagens` para as checagens de `backend/scripts`) |
| Full | Tarefas com integration ou e2e. Exige `docker compose up -d --wait` | `pnpm test` + `pnpm test:checagens` + `pnpm --filter @pelada/web e2e` (e2e só depois da T58) |
| Build | Fim de fase e tarefas só de config, workflow ou docs | O comando de `.specs/projeto/testes.json` do momento |

Evolução do comando de `testes.json`:

| A partir de | Comando |
|---|---|
| T6 | `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` |
| T10 | `docker compose up -d --wait && ` + o anterior |
| T24 | + `pnpm test:checagens` |
| T58 | + `pnpm --filter @pelada/web build && pnpm --filter @pelada/web e2e` |
| T62 | + `pnpm --filter @pelada/web visual` |

---

## Execution Plan

As fases rodam em ordem; dentro da fase, as tarefas rodam em sequência. Uma Phase só tem criticidade homogênea quando dá; o lote fecha ao mudar a criticidade depois de 2h.

### Phase 1: Monorepo e ferramentas

Esqueleto do repositório com um teste que roda. Tudo comum, risco baixo. (5,5h, 6 tarefas)

```
T1 → T2 → T3 → T4 → T5 → T6
```

### Phase 2: Banco local e guardas

Postgres local, trava de host e banco de teste descartável. Os testes nunca tocam o Neon. (4,5h, 4 tarefas)

```
T7 → T8 → T9 → T10
```

### Phase 3: Backup da produção (prioridade, AD-008)

A main foi trocada antes de o backup existir. Estas tarefas devolvem o backup diário o quanto antes. Os testes rodam num container `postgres:18` com `age`. (5h, 3 tarefas)

```
T11 → T12 → T13
```

### Phase 4: Backup no ar (pausa para o usuário)

Ações externas. Cada push e cada execução remota exige confirmação específica. (1,8h, 2 tarefas)

```
T14 → T15
```

### Phase 5: Migrações: cópia e execução

As 23 migrações do LJS entram sem alteração (AD-003). (4h, 3 tarefas)

```
T16 → T17 → T18
```

### Phase 6: Impressão digital do schema

Cobre tabelas, funções, policies, grants e roles. A do LJS não cobria (design C2). (5h, 3 tarefas)

```
T19 → T20 → T21
```

### Phase 7: Estado do banco e migrar sobre a produção

Detecção de estado, zero DDL sobre o banco herdado, checagem aditiva e gerador de migração. (5,5h, 4 tarefas)

```
T22 → T23 → T24 → T25
```

### Phase 8: Isolamento no banco: base e leitura

Prova a RLS herdada, no banco, como `pelada_app`, sem passar pela API. (6h, 4 tarefas)

```
T26 → T27 → T28 → T29
```

### Phase 9: Isolamento: escrita, público e seed

Fecha a matriz política × comando e cria o seed local. (5h, 3 tarefas)

```
T30 → T31 → T32
```

### Phase 10: API: Worker, saúde e cabeçalhos

Worker com Hono e a rota de saúde, sem banco. (5h, 4 tarefas)

```
T33 → T34 → T35 → T36
```

### Phase 11: API: contexto de banco por requisição

Uma transação por requisição, com o contexto da RLS definido antes de qualquer consulta. (5,5h, 4 tarefas)

```
T37 → T38 → T39 → T40
```

### Phase 12: Observabilidade do Worker

Sentry opcional, sem dado pessoal. (2h, 2 tarefas)

```
T41 → T42
```

### Phase 13: Front: base, ativos e estilos

Vite, React e os ativos do mockup copiados sem alteração. (5h, 4 tarefas)

```
T43 → T44 → T45 → T46
```

### Phase 14: Componentes: base

Escritos a partir de `base.css` e das telas de vitrine do mockup; sem copiar código do LJS. (4h, 3 tarefas)

```
T47 → T48 → T49
```

### Phase 15: Componentes: carregando, iOS e rotas

Fecha os componentes da fundação e as rotas. (4,5h, 3 tarefas)

```
T50 → T51 → T52
```

### Phase 16: PWA: manifest, service worker e offline

Instalável e com página offline no visual do mockup. (5,5h, 4 tarefas)

```
T53 → T54 → T55 → T56
```

### Phase 17: Cabeçalhos e e2e

Playwright contra o build servido pelo Worker. (5,5h, 4 tarefas)

```
T57 → T58 → T59 → T60
```

### Phase 18: Comparação visual e pnpm dev

A comparação cobre as 3 telas de vitrine, nos dois viewports. (5h, 3 tarefas)

```
T61 → T62 → T63
```

### Phase 19: Checagens e segredos

Checagens do CI e hygiene de segredos. (4h, 3 tarefas)

```
T64 → T65 → T66
```

### Phase 20: Workflow de CI

Roda tudo em push e PR, com Postgres 18 de serviço. (3,5h, 2 tarefas)

```
T67 → T68
```

### Phase 21: Deploy da prévia

Só a prévia. O deploy recusa qualquer outro alvo (AD-004). (6h, 4 tarefas)

```
T69 → T70 → T71 → T72
```

### Phase 22: Runbook

Procedimentos de operação. O usuário os segue nas tarefas de pausa. (4h, 2 tarefas)

```
T73 → T74
```

### Phase 23: README e contexto

Fecha a documentação. (2,5h, 2 tarefas)

```
T75 → T76
```

### Phase 24: Passos do usuário e paridade com a dev

Ações externas. Cada uma pede confirmação específica. (3,8h, 4 tarefas)

```
T77 → T78 → T79 → T80
```

### Phase 25: CI verde e primeiro deploy

Fecha a feature. Push e deploy com confirmação específica. (2,5h, 2 tarefas)

```
T81 → T82
```

---

## Task Breakdown

#### Phase 1: Monorepo e ferramentas

### T1: Ação do usuário: Node 26, pnpm 11 e Docker prontos

**What**: Deixar a máquina com o Node 26 atual, o pnpm 11 e o Docker funcionando (hoje: Node 26.13 instalado e pnpm quebrado pelo corepack). Ação do usuário, com pausa.
**Estimativa**: 30 min
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `máquina do desenvolvedor (sem arquivo)`
**Depends on**: None
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-01
**Status**: rascunhada
**Nota do rascunho**: ação do usuário; nada a escrever. O /executar confere a máquina.

**Done when**:

- [ ] `node -v` imprime v26.x e `pnpm -v` imprime 11.x num terminal novo (o pnpm funciona fora do corepack quebrado)
- [ ] `docker compose version` e `gh auth status` respondem sem erro
- [ ] `python .claude/scripts/preparar-ambiente.py` imprime "Ambiente pronto" depois da T2
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: none
**Gate**: build

---

### T2: Raiz do monorepo

**What**: Criar o `package.json` da raiz (private, `type: module`, `engines` Node `>=26 <27`, `packageManager` pnpm 11, scripts `lint`, `format:check`, `typecheck` e `test` com `pnpm -r`), `pnpm-workspace.yaml` (`backend/*`, `frontend/*`), `.nvmrc` (26) e `.gitattributes` (`* text=auto eol=lf`).
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `package.json`
**Depends on**: T1
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-01
**Status**: rascunhada
**Nota do rascunho**: o `pnpm-lock.yaml` nasce no `pnpm install` do /executar. O `.gitattributes` já existia.

**Done when**:

- [ ] `pnpm install` termina sem erro
- [ ] `git add --renormalize .` não deixa diferença e o git não avisa mais sobre CRLF
- [ ] Commit com o `pnpm-lock.yaml`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: none
**Gate**: build

---

### T3: Cinco pacotes com TypeScript estrito e teste de estrutura

**What**: Criar `backend/contrato`, `backend/dominio`, `backend/api`, `backend/scripts` e `frontend/web` (nomes `@pelada/contrato`, `@pelada/dominio`, `@pelada/api`, `@pelada/scripts`, `@pelada/web`), cada um com `package.json` (`type: module`, scripts `lint`, `typecheck`, `test`), `tsconfig` estrito e um teste de fumaça. O teste de estrutura da raiz é escrito antes.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `test/estrutura.test.ts`
**Depends on**: T2
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-01, FUN-02
**Status**: rascunhada

**Done when**:

- [ ] `test/estrutura.test.ts` (nomes citam FUN-01 e FUN-02) confere nos cinco pacotes: `type: module`, `engines`, `strict: true` e os scripts `lint`, `typecheck` e `test`
- [ ] O teste falha quando se remove `strict` de um `tsconfig` (conferido uma vez e revertido)
- [ ] `pnpm typecheck` e `pnpm test` na raiz saem com código 0, com 5 testes de fumaça mais o de estrutura
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T4: ESLint, Prettier e scripts de qualidade

**What**: Configurar ESLint (`eslint.config.mjs`), Prettier (`.prettierrc.json`) e os scripts `lint` e `format:check` em todos os pacotes. A base inteira é formatada uma vez.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `eslint.config.mjs`
**Depends on**: T3
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-02

**Done when**:

- [ ] `pnpm lint` e `pnpm format:check` saem com código 0 na base limpa
- [ ] Uma linha com `var` no pacote `dominio` faz o lint falhar (conferido uma vez e revertido)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: none
**Gate**: build

---

### T5: Regra: domínio sem I/O

**What**: Proibir imports de I/O em `backend/dominio` com `no-restricted-imports` (`pg`, `node:fs`, `node:net`, `node:http`, `node:child_process`, `hono`). O teste roda o ESLint sobre arquivos de exemplo.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `backend/dominio/test/sem-io.test.ts`
**Depends on**: T4
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-06

**Done when**:

- [ ] Teste `FUN-06` com um arquivo de exemplo que importa `node:fs`: o ESLint reporta o erro
- [ ] Teste `FUN-06` com um arquivo sem I/O: o ESLint não reporta nada
- [ ] `pnpm --filter @pelada/dominio test` passa com 2 testes novos
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T6: Trocar a dispensa pelo comando real da suíte

**What**: Substituir a dispensa temporária de `.specs/projeto/testes.json` pelo comando que roda a suíte de todos os pacotes.
**Estimativa**: 30 min
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `.specs/projeto/testes.json`
**Depends on**: T5
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-54

**Done when**:

- [ ] `testes.json` traz o comando `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`, sem `dispensado`
- [ ] `python .claude/scripts/trava-testes.py --rodar` termina com SUÍTE VERDE e o commit fica registrado
- [ ] Este comando cresce nas tarefas que criam `test:checagens`, build, e2e e visual: cada uma o atualiza (tabela de evolução na seção Gate Check Commands)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: none
**Gate**: build

---

#### Phase 2: Banco local e guardas

### T7: docker-compose do Postgres 18

**What**: Criar o `docker-compose.yml` com só o Postgres 18, escutando em `127.0.0.1:5432`, volume nomeado, healthcheck e `pgcrypto` disponível.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `docker-compose.yml`
**Depends on**: T6
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-03

**Done when**:

- [ ] Teste `FUN-03` lê o YAML: um serviço só, imagem `postgres:18`, porta presa em `127.0.0.1`, sem outro serviço
- [ ] `docker compose up -d --wait` sobe e `psql` consegue `CREATE EXTENSION pgcrypto`
- [ ] `pnpm --filter @pelada/scripts test` passa
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T8: Trava de host do banco

**What**: Escrever `exigirHostPermitido(url, permitidos)`, que aborta antes de conectar quando o host não está na lista, e o `.env.example` com os nomes das variáveis de banco.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/scripts/src/host.ts`
**Depends on**: T7
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-19, FUN-05

**Done when**:

- [ ] Teste `FUN-19`: `localhost`, `127.0.0.1` e `postgres` passam; um host `*.neon.tech` lança erro sem abrir socket
- [ ] Teste `FUN-19`: URL malformada lança erro; usuário e senha da URL nunca aparecem na mensagem
- [ ] `.env.example` lista `DATABASE_URL`, `DATABASE_URL_TESTE`, `DATABASE_URL_MIGRACAO`, `PELADA_APP_SENHA` e `PELADA_BACKUP_RO_SENHA`, sem valores reais
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T9: Mensagem quando o Postgres local está fora do ar

**What**: Escrever `conectar(url)` em `backend/scripts`, que, diante de `ECONNREFUSED`, falha com a mensagem "Rode `docker compose up -d`".
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `backend/scripts/src/conectar.ts`
**Depends on**: T8
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-55

**Done when**:

- [ ] Teste `FUN-55` aponta para uma porta fechada: sai com código 1 e a mensagem cita `docker compose up -d`
- [ ] Teste `FUN-55` com o Postgres de pé: conecta e fecha sem deixar conexão aberta
- [ ] `pnpm --filter @pelada/scripts test` passa
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T10: Banco de teste descartável

**What**: Escrever `bancoDeTeste()` em `backend/api/test/apoio/banco.ts`: cria o database `teste_<aleatório>`, entrega a URL e o remove no `finally`; recusa host fora da lista antes de conectar. O comando de `testes.json` passa a começar por `docker compose up -d --wait &&`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/apoio/banco.ts`
**Depends on**: T9
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-19

**Done when**:

- [ ] Teste `FUN-19`: com `DATABASE_URL_TESTE` apontando para um host remoto, `bancoDeTeste()` lança erro e não abre conexão
- [ ] Teste: cria o banco, grava uma linha, remove, e `pg_database` não tem `teste_*` órfão, mesmo quando o corpo do teste lança erro
- [ ] `DATABASE_URL_TESTE` tem padrão local no `vitest.config.ts` e está documentada no `.env.example`
- [ ] `testes.json` atualizado e `trava-testes.py --rodar` verde
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 3: Backup da produção (prioridade, AD-008)

### T11: Script de dump cifrado

**What**: Escrever `.github/actions/dump-cifrado/dump-cifrado.sh`: `pg_dump -Fc --enable-row-security`, cifra com `age -r`, escreve num arquivo temporário e só renomeia no fim, com `set -euo pipefail`.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `.github/actions/dump-cifrado/dump-cifrado.sh`
**Depends on**: T10
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-47, FUN-49

**Done when**:

- [ ] Teste `FUN-47`: dump de um banco de teste com 2 grupos, decifrado com a chave privada de teste, passa em `pg_restore --list`
- [ ] Teste `FUN-49`: URL inválida faz o script sair com código diferente de 0 e não deixa nenhum `.age`
- [ ] Teste `FUN-49`: chave pública inválida faz o script sair com código diferente de 0 e não deixa arquivo parcial
- [ ] O teste roda dentro de um container `postgres:18` com `age` instalado; o comando fica documentado no teste
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T12: Workflow backup.yml

**What**: Criar `.github/workflows/backup.yml`: `schedule` `0 7 * * *` e `workflow_dispatch`, `environment: backup` (AD-013), `permissions: contents: read`, instala `postgresql-client-18` e `age`, usa `NEON_URL_BACKUP` e `BACKUP_CHAVE`, e envia o artefato com `retention-days: 30` e `if-no-files-found: error`. Actions fixadas por SHA.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `.github/workflows/backup.yml`
**Depends on**: T11
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-47, FUN-49

**Done when**:

- [ ] Teste `FUN-47` lê o YAML: cron `0 7 * * *`, `workflow_dispatch`, `environment: backup` (AD-013), `retention-days: 30`
- [ ] Teste `FUN-49`: o passo do dump não usa `continue-on-error` nem `|| true`, e o upload tem `if-no-files-found: error`
- [ ] Teste: todo `uses:` está fixado por SHA de 40 caracteres
- [ ] Nenhum segredo literal no arquivo (gitleaks local limpo)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T13: Script de restauração

**What**: Escrever `backend/scripts/ops/restaurar-backup.ts`: decifra com a chave privada (arquivo local), restaura com `pg_restore` num banco local vazio e imprime a contagem de linhas por tabela.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/scripts/ops/restaurar-backup.ts`
**Depends on**: T12
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-50

**Done when**:

- [ ] Teste `FUN-50`: dump cifrado de um banco de teste, restaurado num banco vazio, dá contagem de linhas igual por tabela
- [ ] Teste `FUN-50`: recusa restaurar num host fora da lista de permitidos (trava de host)
- [ ] Teste `FUN-50`: recusa restaurar num banco que já tem tabelas
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 4: Backup no ar (pausa para o usuário)

### T14: Ação do usuário: conferir secrets de backup

**What**: Conferir no GitHub que o environment `backup` (AD-013) tem `NEON_URL_BACKUP` (role `pelada_backup_ro`) e `BACKUP_CHAVE` (chave pública `age`), e que a chave privada correspondente está guardada fora do GitHub.
**Estimativa**: 20 min
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `GitHub: environment backup (sem arquivo)`
**Depends on**: T13
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-48

**Done when**:

- [ ] Os dois secrets existem no environment `backup` (conferido na tela do GitHub, sem ler os valores)
- [ ] A chave privada está guardada fora do GitHub (o usuário confirma)
- [ ] O usuário confirma qual é o `age` público em uso, para o runbook
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: none
**Gate**: build
**Registro (2026-11-04)**: secrets conferidos com `gh secret list --env backup` (sem ler valores); o usuário confirmou a chave privada guardada fora do GitHub. Chave pública age em uso: `age13ggkr74x7k05da33zff37knwsqfnrn5lw9y4cdn3ln7cy9jc74uqyn62dc`.

---

### T15: Publicar o backup.yml e rodar à mão

**What**: Com confirmação específica, publicar na `main` (`git push`), disparar `gh workflow run backup.yml`, baixar o artefato e restaurá-lo localmente com o script da T13. Registrar a contagem de linhas em `docs/restauracao-registro.md`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `docs/restauracao-registro.md`
**Depends on**: T14
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-48, FUN-50, FUN-39

**Done when**:

- [ ] `git ls-remote origin legado` mostra `e5572928703779787b93c8ca1d83457e6b452e17` (FUN-39)
- [ ] A execução manual do `backup.yml` termina verde e gera o artefato `.age` (FUN-48)
- [ ] O artefato decifrado e restaurado num banco local vazio tem contagem de linhas por tabela, registrada em `docs/restauracao-registro.md` com data (FUN-50)
- [ ] A próxima execução agendada das 07:00 UTC aparece no histórico do GitHub (conferida no dia seguinte)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: none
**Gate**: build

---

#### Phase 5: Migrações: cópia e execução

### T16: Copiar as 23 migrações

**What**: Copiar as 23 migrações do LJS (`e557292`) para `backend/api/src/infraestrutura/db/migracoes/` com o mesmo nome, e gravar o `migracoes.sha256` com o hash de cada uma, calculado na origem.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/migracoes/`
**Depends on**: T15
**Reuses**: R1 de `reuso.md`: `git -C ../GestaoDaPelada_LJS archive e557292 backend/api/src/infraestrutura/db/migracoes` e extrair só os `.sql`; o hash vem da origem, nunca da cópia
**Requirement**: FUN-08, FUN-09

**Done when**:

- [ ] Teste `FUN-08` calcula o SHA-256 dos 23 arquivos e compara com o `migracoes.sha256`; passa
- [ ] Teste `FUN-08`: alterar um byte de uma migração faz o teste falhar (conferido uma vez e revertido)
- [ ] São exatamente 23 arquivos `.sql` e nenhum a mais
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T17: Executar migrações com node-pg-migrate

**What**: Escrever `migrar(url)` em `backend/api/src/infraestrutura/db/migrar.ts`: `node-pg-migrate` com `migrationsTable: 'pgmigrations'`, `singleTransaction: false`, `checkOrder: true`, lock padrão e só arquivos `.sql`.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/migrar.ts`
**Depends on**: T16
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-07, FUN-08

**Done when**:

- [ ] Teste `FUN-07`: banco vazio, depois `migrar`: `pgmigrations` tem os 23 nomes na ordem dos arquivos
- [ ] Teste `FUN-07`: uma migração de exemplo com um comando que falha no meio não deixa DDL parcial dessa migração
- [ ] Teste `FUN-07`: duas execuções simultâneas de `migrar` terminam com cada migração aplicada uma vez
- [ ] Num banco vazio local, as migrações rodam como superusuário `postgres` (AD-009)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T18: Comando pnpm migrar

**What**: Criar o comando `pnpm migrar` (`backend/scripts/src/migrar.ts`): lê `DATABASE_URL_MIGRACAO`, aplica a trava de host fora do deploy e chama `migrar(url)`; falha com a mensagem de `docker compose up -d` quando o banco está fora do ar.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/scripts/src/migrar.ts`
**Depends on**: T17, T9, T8
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-07, FUN-55, FUN-19

**Done when**:

- [ ] Teste `FUN-19`: com host remoto e sem a variável de permissão do deploy, `pnpm migrar` aborta antes de conectar
- [ ] Teste `FUN-55`: com o Postgres parado, sai com código 1 e a mensagem pede `docker compose up -d`
- [ ] `pnpm migrar` num banco local vazio aplica as 23 migrações
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 6: Impressão digital do schema

### T19: lerEsquema: estrutura

**What**: Escrever `lerEsquema(db)` em `backend/api/src/infraestrutura/db/esquema.ts`: uma linha ordenada por item para tabelas, colunas (tipo, `not null`, default, identity), restrições, índices e triggers, lido do `pg_catalog`. Ignora `pgmigrations`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/esquema.ts`
**Depends on**: T18
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-08

**Done when**:

- [ ] Teste `FUN-08` cria um mini schema à mão (2 tabelas, FK, índice, trigger) e compara com a lista esperada, escrita no teste
- [ ] Teste `FUN-08`: mudar o tipo de uma coluna ou apagar um índice muda a saída
- [ ] A saída é estável: duas leituras seguidas dão a mesma lista
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T20: lerEsquema: funções, policies, grants e roles

**What**: Acrescentar a `lerEsquema` as funções (assinatura, `SECURITY DEFINER`, `search_path`, hash do corpo), policies (comando, roles, `USING`, `WITH CHECK`), `relrowsecurity` e `relforcerowsecurity`, grants de tabela e de coluna por role, atributos das roles `pelada_*` e extensões.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/esquema.ts`
**Depends on**: T19
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-08

**Done when**:

- [ ] Teste `FUN-08` num mini schema: mudar o corpo de uma função, o `search_path`, uma policy, um `GRANT` ou o `FORCE` muda a saída
- [ ] Teste `FUN-08`: mudar um atributo de role (`BYPASSRLS`, `LOGIN`) muda a saída; mudar só a senha da role não muda
- [ ] Cada categoria nova tem um teste que a prova de forma independente
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T21: Referência do schema e teste de igualdade

**What**: Criar o comando `pnpm esquema:gerar`, que grava `migracoes/esquema-producao.txt` num banco vazio migrado só com as 23, e o teste de igualdade com um banco vazio recém-migrado.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/migracoes/esquema.test.ts`
**Depends on**: T20
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-08

**Done when**:

- [ ] Teste `FUN-08`: banco vazio migrado tem `lerEsquema` igual ao arquivo `esquema-producao.txt` versionado
- [ ] O arquivo cobre as 25 tabelas com `FORCE` e as funções `SECURITY DEFINER` herdadas (conferência por contagem no teste)
- [ ] O arquivo é uma referência de uma fonte: a comparação com o banco real (`dev`) está na tarefa de paridade (FUN-08, FUN-09)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 7: Estado do banco e migrar sobre a produção

### T22: detectarEstado

**What**: Escrever `detectarEstado(db)`: `vazio`, `gerenciado` (a `pgmigrations` é prefixo, na ordem, da lista de arquivos) ou `divergente`. `migrar` aborta em `divergente`, antes de qualquer escrita, e lista as diferenças.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/estado.ts`
**Depends on**: T21
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-10

**Done when**:

- [ ] Casos limite e estados listados antes do código: vazio; 23 aplicadas; 20 aplicadas (prefixo); nome desconhecido; ordem trocada; tabelas sem `pgmigrations`; `pgmigrations` vazia com tabelas
- [ ] Teste `FUN-10`: cada caso divergente aborta com a lista de diferenças e o esquema e as contagens ficam idênticos
- [ ] Teste `FUN-10`: vazio e prefixo seguem para a execução
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T23: Migrar sobre banco já migrado: zero DDL

**What**: Provar que `migrar` sobre um banco com as 23 aplicadas não executa DDL, não muda nenhuma linha e roda só as migrações novas da v2 (uma migração de exemplo no teste).
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/migracoes/zero-ddl.test.ts`
**Depends on**: T22
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-09

**Done when**:

- [ ] Teste `FUN-09`: um event trigger `ddl_command_start` conta zero DDL na segunda execução de `migrar`
- [ ] Teste `FUN-09`: contagem de linhas por tabela e `pgmigrations` iguais antes e depois
- [ ] Teste `FUN-09`: com uma migração nova de exemplo, só ela executa
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T24: Checagem de migração aditiva

**What**: Escrever a checagem que reprova migração nova com `DROP TABLE`, `DROP COLUMN`, `ALTER ... TYPE` ou `RENAME`, salvo a linha `-- excecao-aditiva: AD-NNN`. As 23 migrações copiadas ficam numa lista fechada por hash.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/scripts/checagens/migracao-aditiva.ts`
**Depends on**: T23
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-56

**Done when**:

- [ ] Teste `FUN-56`: cada comando destrutivo reprova numa migração de exemplo
- [ ] Teste `FUN-56`: com a linha de exceção e uma AD existente em `STATE.md`, passa
- [ ] Teste `FUN-56`: as 23 copiadas passam pela lista fechada; um 24º arquivo com `DROP` reprova
- [ ] Cria o script `test:checagens` na raiz e o acrescenta ao `testes.json`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T25: Gerador de migração nova

**What**: Criar `pnpm migracao:nova <nome>`, que cria o `.sql` com timestamp maior que o da última migração, e o teste de ordem.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/scripts/src/migracao-nova.ts`
**Depends on**: T24
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-07

**Done when**:

- [ ] Teste `FUN-07`: o arquivo novo tem timestamp maior que `1792844520000` e maior que o último arquivo existente
- [ ] Teste `FUN-07`: o nome é normalizado (minúsculas, hifens) e o cabeçalho `-- Up Migration` é criado
- [ ] Teste `FUN-07`: dois geradores no mesmo milissegundo não colidem
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 8: Isolamento no banco: base e leitura

### T26: Apoio de isolamento

**What**: Escrever `comoApp(db, contexto, fn)` (`SET LOCAL ROLE pelada_app` e `set_config` de `app.conta_id` e `app.slug_publico`) e a fábrica de cenário com duas contas, dois grupos e linhas em toda tabela com `grupo_id`. A lista de tabelas vem do catálogo.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/isolamento/apoio.ts`
**Depends on**: T25, T17
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-13, FUN-15, FUN-17

**Done when**:

- [ ] Teste: `comoApp` com conta A enxerga o grupo de A e não o de B em `grupos`
- [ ] Teste: o cenário cria ao menos uma linha por tabela com `grupo_id` do catálogo (incluindo as de conta, ex. `convites_admin`), conferido por contagem
- [ ] Teste: o banco de teste é removido no `finally`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T27: Roles do banco

**What**: Provar as roles: `pelada_app` sem `BYPASSRLS`, sem `CREATE`, sem `TRUNCATE` e sem DDL; `pelada_backup_ro` só com `SELECT`; `pelada_owner` só na paridade (AD-009).
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/isolamento/roles.test.ts`
**Depends on**: T26
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-11

**Done when**:

- [ ] Teste `FUN-11`: `pelada_app` tentando `TRUNCATE`, `CREATE TABLE` e `DROP TABLE` recebe erro de permissão
- [ ] Teste `FUN-11`: `rolbypassrls` é falso para `pelada_app`; `pelada_backup_ro` não tem `INSERT`, `UPDATE` nem `DELETE` em nenhuma tabela
- [ ] Teste `FUN-11`: `pelada_backup_ro` enxerga todas as linhas de todas as tabelas de negócio (policy `USING (true)`)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T28: Meta-teste: FORCE e cobertura da matriz

**What**: Escrever o meta-teste que descobre pelo catálogo toda tabela com `grupo_id` (e `grupos`) e reprova se alguma não tem `ENABLE` e `FORCE ROW LEVEL SECURITY` ou não tem caso na matriz.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/isolamento/meta.test.ts`
**Depends on**: T27
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-12

**Done when**:

- [ ] Teste `FUN-12`: todas as tabelas com `grupo_id` do catálogo têm `relforcerowsecurity`
- [ ] Teste `FUN-12`: criar uma tabela de exemplo com `grupo_id` sem RLS ou sem caso na matriz faz o meta-teste falhar (conferido num banco descartável)
- [ ] O meta-teste lê a lista de casos da matriz, para o teste de leitura e o de escrita usarem a mesma fonte
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T29: Matriz de leitura por conta

**What**: Escrever, para cada tabela com `grupo_id` e para `grupos`, o caso de `SELECT` com o contexto da conta A, da conta B e de uma conta sem vínculo.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/isolamento/leitura.test.ts`
**Depends on**: T28
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-13

**Done when**:

- [ ] Teste `FUN-13`, por tabela: a conta A lê só as linhas do grupo A; a conta B lê só as do grupo B; a conta sem vínculo lê zero linhas
- [ ] Tabela sem `GRANT SELECT` para `pelada_app` (ex. `eventos_uso`): o caso espera erro de permissão e o teste confere o motivo
- [ ] Um `USING (true)` colocado de propósito numa policy faz o teste falhar (conferido uma vez e revertido)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 9: Isolamento: escrita, público e seed

### T30: Matriz de escrita por conta

**What**: Escrever, para cada tabela com `grupo_id` e para `grupos`, os casos de `INSERT`, `UPDATE` e `DELETE` da conta B sobre o grupo da conta A, incluindo `UPDATE` e `DELETE` sem `WHERE`.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/isolamento/escrita.test.ts`
**Depends on**: T29
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-17

**Done when**:

- [ ] Teste `FUN-17`, por tabela e comando: a conta B afeta zero linhas do grupo A ou recebe erro; o conteúdo do grupo A fica idêntico
- [ ] Teste `FUN-17`: `UPDATE` e `DELETE` sem `WHERE` da conta B não alteram nenhuma linha do grupo A
- [ ] Um `WITH CHECK` removido de propósito faz o teste falhar (conferido uma vez e revertido)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T31: Contexto público e sem contexto

**What**: Provar o contexto de slug público (só leitura do grupo do slug) e o sem contexto (zero linhas) nas tabelas com `grupo_id`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/isolamento/publico.test.ts`
**Depends on**: T30
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-14, FUN-15

**Done when**:

- [ ] Teste `FUN-14`: com `app.slug_publico` do grupo A e sem conta, `SELECT` devolve só linhas do grupo A
- [ ] Teste `FUN-14`: `INSERT`, `UPDATE` e `DELETE` com só o slug são recusados ou afetam zero linhas
- [ ] Teste `FUN-15`: sem nenhum contexto, toda tabela de negócio devolve zero linhas
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T32: Seed local

**What**: Escrever `pnpm seed`: roda como a role de migração, cria uma conta (senha com `crypt`), um grupo com vínculo de admin e jogadores, e define `LOGIN PASSWORD` de `pelada_app` e `pelada_backup_ro` a partir do `.env`. Recusa host fora da lista.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/scripts/src/seed.ts`
**Depends on**: T31
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-05

**Done when**:

- [ ] Teste `FUN-05`: num banco migrado, cria 1 conta, 1 grupo com vínculo e jogadores, e `comoApp` com essa conta enxerga o grupo
- [ ] Teste `FUN-05`: com host remoto, sai antes de conectar
- [ ] Teste `FUN-05`: rodar duas vezes não duplica nem falha
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 10: API: Worker, saúde e cabeçalhos

### T33: wrangler.jsonc da prévia

**What**: Criar o `wrangler.jsonc`: nome `gestaodapelada-v2`, `workers_dev: true`, `nodejs_compat`, assets de `frontend/web/dist` com SPA e `run_worker_first: ["/api/*"]`, os 4 bindings de rate limit, o Hyperdrive com `localConnectionString` e `vars` (`VERSAO`, `URL_PUBLICA`). Sem `routes`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `wrangler.jsonc`
**Depends on**: T32
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-20, FUN-26, FUN-27

**Done when**:

- [ ] Teste `FUN-20`: assets, `not_found_handling` e `run_worker_first` conforme a spec
- [ ] Teste `FUN-26`: os 4 bindings com os limites de 10, 60, 60 e 60 por minuto
- [ ] Teste `FUN-27`: nome `gestaodapelada-v2`, `workers_dev` verdadeiro, nenhuma chave `routes` nem `custom_domain`
- [ ] O `id` do Hyperdrive fica com o marcador `PREENCHER` até a tarefa de ID real (o teste de ID real é dela)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T34: App Hono e GET /api/health

**What**: Criar o app Hono (`backend/api/src/entrada/app.ts` e `worker.ts`), a configuração de teste no pool do `workerd` e a rota `GET /api/health`, que responde `{"status":"ok","versao":env.VERSAO}` sem tocar o banco.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `backend/api/src/entrada/app.ts`
**Depends on**: T33
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-21, FUN-20

**Done when**:

- [ ] Teste `FUN-21`: `GET /api/health` responde 200 com `status` `ok` e `versao` igual à variável do teste
- [ ] Teste `FUN-21`: a rota funciona com o banco parado (sem `HYPERDRIVE` alcançável)
- [ ] Teste `FUN-20`: `GET /` entrega o `index.html` do build e `GET /rota-qualquer` cai na SPA
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T35: Cabeçalhos das rotas /api

**What**: Criar os middlewares `semCache` e `semSniff` e aplicá-los em `/api/*`, inclusive em 404 e em erro.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `backend/api/src/entrada/middlewares/cabecalhos.ts`
**Depends on**: T34
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-22

**Done when**:

- [ ] Teste `FUN-22`: respostas 200, 404 e 500 de `/api/*` têm `Cache-Control: no-store` e `X-Content-Type-Options: nosniff`
- [ ] Teste `FUN-22`: a rota de saúde também
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T36: Middleware de limite de taxa

**What**: Criar o middleware `limiteTaxa(binding)`: responde 429 com `Retry-After` quando o binding nega, usando um binding falso no teste.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/middlewares/limite-taxa.ts`
**Depends on**: T35
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-26

**Done when**:

- [ ] Teste `FUN-26`: binding que nega gera 429 com `Retry-After` e corpo sem detalhe interno
- [ ] Teste `FUN-26`: binding que permite deixa a requisição passar
- [ ] Teste `FUN-26`: a chave do limite é o IP do cabeçalho `cf-connecting-ip`; sem ele, usa um valor fixo
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 11: API: contexto de banco por requisição

### T37: Cliente pg por requisição

**What**: Escrever o cliente `pg` que abre só na primeira consulta, pela `HYPERDRIVE.connectionString`, e fecha no `waitUntil`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/cliente.ts`
**Depends on**: T36
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-16

**Done when**:

- [ ] Teste `FUN-16`: requisição que não consulta o banco não abre conexão
- [ ] Teste `FUN-16`: depois da resposta, a conexão fecha (`pg_stat_activity` sem a sessão)
- [ ] Teste `FUN-16`: erro de conexão vira 503 sem vazar a URL
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T38: comBanco: transação e contexto

**What**: Escrever o middleware `comBanco`: `BEGIN` (`READ ONLY` em GET e HEAD), `set_config('app.conta_id')` e `set_config('app.slug_publico')` com parâmetros e `true`, depois `COMMIT` se o status for menor que 400, senão `ROLLBACK`. Entrega `c.var.db` (Kysely).
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/middlewares/com-banco.ts`
**Depends on**: T37, T26
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-16

**Done when**:

- [ ] Casos limite e estados listados antes do código: GET e HEAD somente leitura; POST commit; status 4xx e 5xx rollback; exceção rollback; duas requisições simultâneas de contas diferentes; requisição sem contexto
- [ ] Teste `FUN-16`: o `SET LOCAL` ocorre antes da primeira consulta da rota
- [ ] Teste `FUN-16`: duas requisições concorrentes (conta A e conta B) nunca enxergam o contexto uma da outra, em 100 repetições
- [ ] Teste `FUN-16`: escrita numa rota GET falha; erro 500 desfaz a escrita
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T39: Checagem do Hyperdrive sem cache

**What**: Escrever `conferirSemCache(json)` (função pura) e o comando que lê `wrangler hyperdrive get --json` e falha se o cache estiver ligado.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/scripts/ops/hyperdrive.ts`
**Depends on**: T38
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-18

**Done when**:

- [ ] Teste `FUN-18`: JSON com `caching.disabled: true` passa; ausente ou `false` reprova com mensagem clara
- [ ] Teste `FUN-18`: JSON inválido reprova, sem lançar erro sem tratamento
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T40: Checagem de URL absoluta

**What**: Escrever a checagem que reprova `ljssoftware.com.br` ou `workers.dev` no código e nas migrações, fora de uma lista permitida (`wrangler.jsonc`, `docs/`, `.specs/`, `.env.example`).
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `backend/scripts/checagens/sem-url-absoluta.ts`
**Depends on**: T39
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-23

**Done when**:

- [ ] Teste `FUN-23`: arquivo de exemplo com `ljssoftware.com.br` reprova; em `docs/` passa
- [ ] Teste `FUN-23`: um `workers.dev` em um `.ts` reprova
- [ ] A checagem roda na base atual e passa
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 12: Observabilidade do Worker

### T41: Função que limpa o evento do Sentry

**What**: Escrever `limparEvento(evento)` em `backend/contrato/src/sentry.ts`: remove corpo, cookies, os cabeçalhos `cookie` e `authorization`, e e-mails (regex) em mensagens, breadcrumbs e valores.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/contrato/src/sentry.ts`
**Depends on**: T40
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-24

**Done when**:

- [ ] Teste `FUN-24`: evento com corpo, cookie, `authorization` e um e-mail na mensagem sai sem nenhum deles
- [ ] Teste `FUN-24`: o evento sem esses campos não muda
- [ ] Teste `FUN-24`: e-mail dentro de breadcrumb e de `extra` também é removido
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T42: Sentry no Worker, só com DSN

**What**: Ligar `@sentry/cloudflare` no `worker.ts` só quando `SENTRY_DSN` existe, com `release` igual a `VERSAO` e `beforeSend` usando `limparEvento`.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `backend/api/src/entrada/observabilidade.ts`
**Depends on**: T41
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-24, FUN-25

**Done when**:

- [ ] Teste `FUN-25`: sem `SENTRY_DSN`, o Worker responde normalmente e nenhuma chamada de rede sai (fetch espiado)
- [ ] Teste `FUN-24`: com DSN falso, a configuração tem `release` igual a `VERSAO` e o `beforeSend` é o de `limparEvento`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 13: Front: base, ativos e estilos

### T43: Esqueleto Vite + React

**What**: Criar `frontend/web` com Vite, React 19, React Router, TanStack Query, Vitest com jsdom e Testing Library, e um `App` que renderiza.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/main.tsx`
**Depends on**: T42
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-31

**Done when**:

- [ ] `pnpm --filter @pelada/web build` gera `dist/index.html`
- [ ] Teste: o `App` renderiza sem erro no jsdom
- [ ] `pnpm --filter @pelada/web typecheck` passa
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T44: Ativos do mockup

**What**: Copiar `tokens.css`, as fontes (Barlow e Barlow Condensed, mais `OFL.txt`) e os ícones de `.specs/mockup/` para o front, e escrever o teste de igualdade byte a byte.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/test/ativos.test.ts`
**Depends on**: T43
**Reuses**: R2, R3 e R4 de `reuso.md`: `cp .specs/mockup/tokens.css frontend/web/src/estilos/tokens.css`; `cp .specs/mockup/fontes/*.woff2 .specs/mockup/fontes/OFL.txt frontend/web/public/fontes/`; `cp .specs/mockup/icones/*.png .specs/mockup/icones/icone.svg frontend/web/public/icones/`
**Requirement**: FUN-30

**Done when**:

- [ ] Teste `FUN-30`: `tokens.css`, cada fonte e cada ícone do front têm SHA-256 igual ao do arquivo em `.specs/mockup/`
- [ ] Teste `FUN-30`: alterar um byte do `tokens.css` do front faz o teste falhar (conferido uma vez e revertido)
- [ ] O manifest ainda não existe: só os arquivos entram
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T45: Stylelint: só tokens

**What**: Configurar o Stylelint para recusar cor, fonte e sombra literais fora de `tokens.css`, com o script `lint` do front chamando ESLint e Stylelint.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/.stylelintrc.json`
**Depends on**: T44
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-32

**Done when**:

- [ ] Teste `FUN-32`: um CSS de exemplo com `#fff`, `rgb(...)`, `font-family: Arial` e `box-shadow: 0 0 4px #000` reprova
- [ ] Teste `FUN-32`: um CSS com `var(--...)` passa; o próprio `tokens.css` passa
- [ ] `pnpm lint` na raiz inclui o Stylelint
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T46: global.css

**What**: Escrever o `global.css` (reset, `@font-face` a partir de `.specs/mockup/fontes/fontes.css`, `body` com tokens) e importá-lo no `main.tsx`.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/estilos/global.css`
**Depends on**: T45
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-30, FUN-32

**Done when**:

- [ ] Passa no Stylelint de FUN-32 sem exceção
- [ ] O build embute as fontes locais e nenhuma requisição externa de fonte é feita
- [ ] `pnpm --filter @pelada/web build` passa
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: none
**Gate**: build

---

#### Phase 14: Componentes: base

### T47: Componentes Casca e Marca

**What**: Escrever `Casca` (layout da página e da barra) e `Marca`, com CSS Module, só tokens, teste de renderização e axe.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/componentes/Casca.tsx`
**Depends on**: T46
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-31

**Done when**:

- [ ] Teste `FUN-31`: renderiza com e sem título e entrega a landmark `main`
- [ ] Teste `FUN-31`: axe sem violações
- [ ] CSS Module sem cor, fonte nem sombra literal (Stylelint verde)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T48: Componente Botao

**What**: Escrever `Botao` (primário, secundário, desabilitado, carregando) com CSS Module, teste de renderização e axe.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/componentes/Botao.tsx`
**Depends on**: T47
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-31

**Done when**:

- [ ] Teste `FUN-31`: cada variante renderiza com a classe esperada e o clique dispara `onClick`
- [ ] Teste `FUN-31`: `disabled` e `carregando` não disparam o clique
- [ ] Teste `FUN-31`: axe sem violações
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T49: Componente EstadoErro

**What**: Escrever `EstadoErro` (mensagem, ícone e botão Tentar de novo) a partir de `padrao--erro-rede` e `t03-indisponivel--erro` do mockup.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/componentes/EstadoErro.tsx`
**Depends on**: T48
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-31

**Done when**:

- [ ] Teste `FUN-31`: mostra o texto da mensagem e chama `aoTentarDeNovo` ao clicar
- [ ] Teste `FUN-31`: foco inicial no título ou no botão, conforme o mockup, e axe sem violações
- [ ] A marcação segue as classes do mockup, conferida lendo `.specs/mockup/telas/padrao--erro-rede.html`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 15: Componentes: carregando, iOS e rotas

### T50: Componente EsqueletoLista

**What**: Escrever `EsqueletoLista` a partir de `padrao--carregando-lista`, com `aria-busy` e respeito a `prefers-reduced-motion`.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/componentes/EsqueletoLista.tsx`
**Depends on**: T49
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-31

**Done when**:

- [ ] Teste `FUN-31`: renderiza o número de linhas pedido e `aria-busy="true"`
- [ ] Teste `FUN-31`: axe sem violações
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T51: Aviso de instalação no iPhone

**What**: Escrever `AvisoInstalarIphone` e o hook `useModoInstalacao` (detecta Safari iOS fora do `standalone`) a partir de `t01-ranking--instalar-iphone`.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/pwa/AvisoInstalarIphone.tsx`
**Depends on**: T50
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-36, FUN-31

**Done when**:

- [ ] Teste `FUN-36`: com user agent de iPhone e `standalone` falso, o aviso aparece
- [ ] Teste `FUN-36`: em `standalone`, em Android e no desktop, o aviso não aparece
- [ ] Teste `FUN-36`: dispensar o aviso grava a escolha e ele não volta; axe sem violações
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T52: Rotas, página provisória e vitrine

**What**: Criar o roteador: `/` com a página provisória (casca de `t03-indisponivel--erro` com o texto "Em breve", AD-007), `*` com o 404, e `/_vitrine/:id`, que só existe com `VITE_VITRINE=1`.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/app/rotas.tsx`
**Depends on**: T51
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-38, FUN-31

**Done when**:

- [ ] Teste: `/` mostra a página provisória e `/qualquer` mostra o 404
- [ ] Teste `FUN-38`: com `VITE_VITRINE=1`, `/_vitrine/erro-rede`, `/_vitrine/carregando-lista` e `/_vitrine/indisponivel` renderizam; sem a variável, caem no 404
- [ ] O build de produção não contém as rotas de vitrine (busca no `dist`)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 16: PWA: manifest, service worker e offline

### T53: Manifest

**What**: Configurar o `vite-plugin-pwa` (`injectManifest`) e o manifest: nome "Gestão da Pelada", `display: standalone`, `lang: pt-BR`, ícones 192 e 512, um `maskable`.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/config/manifesto.ts`
**Depends on**: T52
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-33

**Done when**:

- [ ] Teste `FUN-33` lê o objeto do manifest: nome, `display`, `lang`, `start_url` e `theme_color` do token
- [ ] Teste `FUN-33`: os ícones 192 e 512 existem em `public/icones` e um é `maskable`
- [ ] O build gera `manifest.webmanifest` com os mesmos valores
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T54: Service worker

**What**: Escrever `sw.ts`: precache do shell, fallback de navegação para `offline.html` e handlers vazios de `push` e `notificationclick`.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/pwa/sw.ts`
**Depends on**: T53
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-34, FUN-35

**Done when**:

- [ ] Teste `FUN-34`: o SW registra listeners de `push` e `notificationclick`, que não lançam erro com evento vazio
- [ ] Teste `FUN-35`: navegação sem rede numa rota fora do cache responde `offline.html`
- [ ] Teste `FUN-34`: a lista de precache inclui o shell e `offline.html`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T55: Página offline

**What**: Criar `public/offline.html` usando a casca de `t03-indisponivel--erro` (AD-007), com texto próprio, tokens e fontes locais, sem script externo.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/public/offline.html`
**Depends on**: T54
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-35

**Done when**:

- [ ] Teste `FUN-35`: o HTML não referencia nenhuma URL externa e só usa `var(--...)` de tokens ou o CSS do build
- [ ] Teste `FUN-35`: tem `lang="pt-BR"`, título e uma landmark `main`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T56: Sentry no front

**What**: Escrever `observabilidade.ts` do front: liga `@sentry/react` só com `VITE_SENTRY_DSN`, `release` igual ao SHA e `beforeSend` com `limparEvento`.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/app/observabilidade.ts`
**Depends on**: T55, T41
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-24, FUN-25

**Done when**:

- [ ] Teste `FUN-25`: sem DSN, nada é inicializado e nenhuma requisição sai
- [ ] Teste `FUN-24`: com DSN falso, a configuração usa `release` e `limparEvento`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 17: Cabeçalhos e e2e

### T57: Arquivo _headers

**What**: Criar `public/_headers` com CSP (`default-src 'self'`, sem `unsafe-inline` em script), `X-Content-Type-Options`, `Referrer-Policy` e `Strict-Transport-Security`.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `frontend/web/public/_headers`
**Depends on**: T56
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-29

**Done when**:

- [ ] Teste `FUN-29` lê o arquivo: cada cabeçalho presente com o valor esperado
- [ ] Teste `FUN-29`: a CSP não contém `unsafe-inline` nem `unsafe-eval` em `script-src`
- [ ] O build copia o arquivo para o `dist`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T58: Playwright e servidor de e2e

**What**: Configurar o Playwright (`playwright.config.ts`) para subir o build servido pelo `wrangler dev` com o banco local e escrever o primeiro teste (a página `/` carrega). O `testes.json` passa a incluir o build do web e o e2e.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/playwright.config.ts`
**Depends on**: T57
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-37

**Done when**:

- [ ] Teste e2e: `/` mostra a página provisória e `/api/health` responde 200 pelo mesmo servidor
- [ ] `pnpm --filter @pelada/web e2e` passa em máquina limpa com `docker compose up -d` e `playwright install`
- [ ] `testes.json` atualizado e `trava-testes.py --rodar` verde
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T59: e2e dos cabeçalhos

**What**: Escrever o e2e que lê os cabeçalhos de segurança dos assets e das respostas de `/api/*` no servidor do Playwright.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `frontend/web/e2e/cabecalhos.spec.ts`
**Depends on**: T58
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-29, FUN-22

**Done when**:

- [ ] Teste `FUN-29`: `GET /` traz CSP, `nosniff`, `Referrer-Policy` e `Strict-Transport-Security`
- [ ] Teste `FUN-22`: `GET /api/health` traz `no-store` e `nosniff`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T60: e2e de instalabilidade

**What**: Escrever o e2e de instalabilidade: manifest válido, service worker controlando a página, ícones 192 e 512 acessíveis e `offline.html` servida sem rede.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/e2e/instalabilidade.spec.ts`
**Depends on**: T59
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-37, FUN-33, FUN-35

**Done when**:

- [ ] Teste `FUN-37`: o manifest parseado tem os campos de FUN-33
- [ ] Teste `FUN-37`: depois do registro, `navigator.serviceWorker.controller` existe na página
- [ ] Teste `FUN-37`: com `context.setOffline(true)`, uma rota fora do cache mostra o conteúdo da página offline
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 18: Comparação visual e pnpm dev

### T61: Comparador de imagens

**What**: Escrever o comparador pixel a pixel (`pixelmatch` e `pngjs`), com limite de 1%, e o teste dele com imagens de exemplo.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/e2e/ferramentas/comparar.mjs`
**Depends on**: T60
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-38

**Done when**:

- [ ] Teste `FUN-38`: duas imagens idênticas dão 0% de diferença e passam
- [ ] Teste `FUN-38`: diferença de 2% reprova e de 0,5% passa
- [ ] Teste `FUN-38`: imagens de tamanhos diferentes reprovam com mensagem clara
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T62: Comparação visual das telas de vitrine

**What**: Escrever o runner visual: abre as 3 rotas de vitrine e os HTML do mockup (`telas.json`) nos viewports 1280×800 e 390×844 e compara. Ajustar CSS e componentes até ficar em até 1%. O `testes.json` passa a incluir `visual`.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/e2e/visual.mjs`
**Depends on**: T61, T49, T50, T52
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-38

**Done when**:

- [ ] Teste `FUN-38`: as 3 telas × 2 viewports ficam em até 1% de pixels diferentes
- [ ] Um componente deformado de propósito faz a comparação falhar (conferido uma vez e revertido)
- [ ] `testes.json` atualizado e `trava-testes.py --rodar` verde
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T63: pnpm dev

**What**: Criar o comando `pnpm dev`: sobe o `wrangler dev` com o Hyperdrive local (usuário `pelada_app`) e o Vite com proxy de `/api` para o Worker.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `scripts/dev.mjs`
**Depends on**: T62, T32, T34
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-04

**Done when**:

- [ ] Teste e2e `FUN-04`: com `pnpm dev` no ar, `GET http://localhost:5173/api/health` responde 200 pelo proxy
- [ ] Teste `FUN-04`: com o Postgres parado, `pnpm dev` sai com a mensagem de `docker compose up -d` (FUN-55)
- [ ] `localConnectionString` não contém senha no arquivo versionado: vem do `.env`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 19: Checagens e segredos

### T64: Checagem de actions fixadas por SHA

**What**: Escrever a checagem que reprova `uses:` de workflow sem SHA de 40 caracteres, no pacote `backend/scripts`.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/scripts/checagens/actions-por-sha.ts`
**Depends on**: T63
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-40

**Done when**:

- [ ] Teste `FUN-40`: `uses: actions/checkout@v4` reprova; com SHA de 40 caracteres passa
- [ ] Teste `FUN-40`: `uses: ./.github/actions/x` (local) passa
- [ ] A checagem roda nos workflows existentes (`backup.yml`) e passa
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T65: Checagem: wrangler deploy só no deploy.yml

**What**: Escrever a checagem que reprova `wrangler deploy` (ou `wrangler publish`) fora de `.github/workflows/deploy.yml`.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/scripts/checagens/wrangler-unico.ts`
**Depends on**: T64
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-45

**Done when**:

- [ ] Teste `FUN-45`: `wrangler deploy` em `package.json`, num script `.mjs` ou em outro workflow reprova
- [ ] Teste `FUN-45`: o único lugar permitido é o `deploy.yml`
- [ ] Menção em documentação (`docs/`, `README.md`) não reprova
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T66: Checagem do .env.example e gitleaks

**What**: Escrever a checagem que exige que toda variável usada no código e nos workflows esteja no `.env.example` com obrigatoriedade, formato e se é segredo, e criar o `.gitleaks.toml`.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `.env.example`
**Depends on**: T65
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-46

**Done when**:

- [ ] Teste `FUN-46`: variável usada e ausente do `.env.example` reprova
- [ ] Teste `FUN-46`: variável sem a marcação de obrigatoriedade, formato ou segredo reprova
- [ ] `gitleaks detect` local na base atual não encontra segredo
- [ ] Nenhum valor real no `.env.example`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 20: Workflow de CI

### T67: ci.yml: qualidade, testes e banco

**What**: Criar `.github/workflows/ci.yml` com os jobs `qualidade` (lint, format, typecheck, checagens, gitleaks), `testes` e `banco` (serviço `postgres:18`: migrar do zero, impressão digital, isolamento, zero DDL, estado).
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `.github/workflows/ci.yml`
**Depends on**: T66
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-40

**Done when**:

- [ ] Teste `FUN-40` lê o YAML: gatilhos `push` e `pull_request`, serviço `postgres:18`, e os passos de lint, format, typecheck, checagens, gitleaks, testes e migrar do zero
- [ ] Teste `FUN-40`: nenhum passo usa `continue-on-error`
- [ ] Passa na checagem de SHA (T64)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T68: ci.yml: front

**What**: Acrescentar ao `ci.yml` o job `web` (build, e2e de instalabilidade e cabeçalhos, comparação visual) com Playwright e artefatos de falha.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `.github/workflows/ci.yml`
**Depends on**: T67
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-40

**Done when**:

- [ ] Teste `FUN-40`: o job `web` tem build, e2e e visual, e envia o relatório do Playwright em caso de falha
- [ ] Teste `FUN-40`: o workflow completo passa nas checagens de SHA e de `wrangler deploy` único
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 21: Deploy da prévia

### T69: Branch de restauração no Neon

**What**: Escrever `restauracao-neon.ts`: cria a branch de restauração a partir da `main` pela API do Neon (AD-119) e mantém só as 2 mais recentes.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/scripts/ops/restauracao-neon.ts`
**Depends on**: T68
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-42

**Done when**:

- [ ] Teste `FUN-42` com `fetch` simulado: cria a branch com o pai `main` e o nome do `run_id`
- [ ] Teste `FUN-42`: com 4 branches de restauração, apaga as 2 mais antigas e nunca apaga `main`, `dev` nem outra que não seja de restauração
- [ ] Teste `FUN-42`: erro da API interrompe com código diferente de 0
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T70: Workflow deploy.yml

**What**: Criar `.github/workflows/deploy.yml`: só `workflow_dispatch`, `if` na `main`, `environment: producao` (AD-119), `concurrency` sem cancelamento, e os passos na ordem da spec (build, branch de restauração da `main`, dump cifrado da `main`, migração, `wrangler deploy` com `URL_PUBLICA` e `VERSAO`, saúde). O dump usa `pelada_backup_ro` (AD-010, secret `NEON_URL_BACKUP`).
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `.github/workflows/deploy.yml`
**Depends on**: T69
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-41, FUN-42, FUN-43, FUN-44, FUN-57, FUN-58

**Done when**:

- [ ] Teste `FUN-41`: só `workflow_dispatch`, condição de `main`, `environment: producao` (AD-119)
- [ ] Teste `FUN-57`: `concurrency` com `cancel-in-progress: false`
- [ ] Teste `FUN-42`: a ordem dos passos é build, restauração, dump, migração, deploy, saúde
- [ ] Teste `FUN-43`: o build vem antes de qualquer passo que use secrets do Neon ou da Cloudflare
- [ ] Teste `FUN-44`: o `wrangler deploy` depende do passo de migração (sem `continue-on-error`)
- [ ] Teste `FUN-58`: `URL_PUBLICA` vazia faz um passo anterior ao deploy falhar
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T71: Guarda: só a prévia

**What**: Escrever a checagem que reprova qualquer menção a `gestaodapelada` sem `-v2`, e `routes` ou `custom_domain`, no `wrangler.jsonc` e no `deploy.yml` (AD-119: o environment `producao` deixa de ser reprovado).
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/scripts/checagens/so-previa.ts`
**Depends on**: T70
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-28

**Done when**:

- [ ] Teste `FUN-28`: `name: gestaodapelada` reprova; `gestaodapelada-v2` passa
- [ ] Teste `FUN-28`: `routes` e `custom_domain` no `wrangler.jsonc` e no `deploy.yml` reprovam, e `environment: producao` passa (AD-119)
- [ ] A checagem passa nos arquivos reais
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T72: Verificação de saúde pós-deploy

**What**: Escrever `verificar-saude.mjs`: consulta `GET /api/health` com tentativas e falha se a `versao` for diferente do SHA do commit.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/scripts/ops/verificar-saude.mjs`
**Depends on**: T71
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-42

**Done when**:

- [ ] Teste `FUN-42` com um servidor local: `versao` igual ao SHA passa
- [ ] Teste `FUN-42`: `versao` diferente ou resposta 500 depois das tentativas reprova
- [ ] Teste `FUN-42`: servidor que responde na 3ª tentativa passa
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 22: Runbook

### T73: Runbook: deploy, migração e restauração

**What**: Escrever em `docs/runbook.md` o deploy da prévia, a falha de migração com restauração pela branch de restauração, e a restauração de backup (com link para `docs/restauracao-registro.md`).
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `docs/runbook.md`
**Depends on**: T72
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-52, FUN-44, FUN-50

**Done when**:

- [ ] Cada procedimento tem comandos exatos e o resultado esperado
- [ ] Um agente sem contexto consegue seguir o procedimento de restauração (conferido na validação da fase 7)
- [ ] `pnpm format:check` passa
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: none
**Gate**: build

---

### T74: Runbook: segredos, monitor e passo de produção

**What**: Escrever no runbook a criação do Hyperdrive de `dev` e do environment `previa` com os secrets, a rotação de segredos, o monitor do UptimeRobot e o procedimento de assumir a produção na paridade.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `docs/runbook.md`
**Depends on**: T73
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-52

**Done when**:

- [ ] Lista cada secret do environment `previa` e do `producao`, sem valores
- [ ] O passo de produção traz: desligar o Worker do LJS, dump cifrado e branch de restauração da `main` antes, domínio, Hyperdrive de produção
- [ ] Descreve o monitor do UptimeRobot em `GET /api/health`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: none
**Gate**: build

---

#### Phase 23: README e contexto

### T75: README

**What**: Escrever o `README.md`: rodar local, variáveis, testes, deploy da prévia e backup.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `README.md`
**Depends on**: T74
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-51

**Done when**:

- [ ] Os comandos do README levam do clone ao app em `http://localhost:5173` (conferido seguindo-o na validação)
- [ ] Cada variável do `.env.example` é citada
- [ ] `pnpm format:check` passa
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: none
**Gate**: build

---

### T76: CLAUDE.md da raiz

**What**: Escrever o `CLAUDE.md` da raiz com o contexto do projeto: stack, comandos, onde ficam regras, artefatos e a AD de cada decisão.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `CLAUDE.md`
**Depends on**: T75
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-53

**Done when**:

- [ ] Descreve stack, comandos, estrutura de pastas, regras de banco (migrações aditivas) e onde ficam as ADs
- [ ] Não duplica o conteúdo de `.claude/CLAUDE.md`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: none
**Gate**: build

---

#### Phase 24: Passos do usuário e paridade com a dev

### T77: Ação do usuário: branch dev do Neon

**What**: Recriar a branch `dev` do Neon a partir da `main`, ter as URLs de `pelada_owner` (migração), `pelada_app` (runtime) e `pelada_backup_ro` (backup) e gerar a `NEON_API_KEY`, seguindo o runbook.
**Estimativa**: 40 min
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `console do Neon (sem arquivo)`
**Depends on**: T76
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-27

**Done when**:

- [ ] A branch `dev` existe, criada da `main` depois da data de hoje
- [ ] As três URLs funcionam com `psql -c 'select 1'` (o usuário confirma, sem colar valores)
- [ ] A chave de API tem o menor escopo possível
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: none
**Gate**: build

---

### T78: Ação do usuário: Hyperdrive, token e environment previa

**What**: Seguindo a AD-119: usar o Hyperdrive existente `e06363bd…` (cache desligado, `main` do Neon, `pelada_app`), ter o token da Cloudflare e completar o environment `producao` no GitHub com os secrets do runbook.
**Estimativa**: 40 min
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `Cloudflare e GitHub (sem arquivo)`
**Depends on**: T77
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-27, FUN-18

**Done when**:

- [ ] O Hyperdrive existe e `wrangler hyperdrive get` mostra o cache desligado (AD-119)
- [ ] O environment `producao` tem `NEON_URL_MIGRACAO`, `NEON_URL_BACKUP`, `BACKUP_CHAVE`, `NEON_API_KEY`, `NEON_PROJECT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` e `URL_PUBLICA` (AD-119)
- [ ] O usuário informa o ID do Hyperdrive (não é segredo)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: none
**Gate**: build

---

### T79: ID real do Hyperdrive no wrangler

**What**: Trocar o marcador `PREENCHER` do `wrangler.jsonc` pelo ID real do Hyperdrive de `dev`, e o teste de config reprovar o marcador.
**Estimativa**: 30 min
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `wrangler.jsonc`
**Depends on**: T78
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-27

**Done when**:

- [ ] Teste `FUN-27`: o `id` do Hyperdrive é um hex de 32 caracteres, não o marcador
- [ ] `wrangler.jsonc` sem outra mudança
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T80: Paridade e zero DDL na dev

**What**: Escrever o comando de leitura `pnpm esquema:comparar --alvo dev`, que compara `lerEsquema` da `dev` (por `pelada_owner`) com `esquema-producao.txt`, e rodar `pnpm migrar` na `dev` conferindo zero DDL e a mesma contagem de linhas. Confirmação específica antes de tocar a `dev`.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/scripts/src/esquema-comparar.ts`
**Depends on**: T79, T21, T23, T18
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-08, FUN-09, FUN-11

**Done when**:

- [ ] Teste `FUN-08` do comparador com dois bancos locais: igual dá 0 diferenças, e uma diferença é listada
- [ ] Execução na `dev`: as diferenças da `dev` contra a referência são zero, ou a lista é registrada em `STATE.md` e decidida
- [ ] Execução na `dev`: `migrar` com zero DDL e contagem de linhas por tabela idêntica antes e depois (FUN-09)
- [ ] `pelada_owner` existe na `dev` e é conferida (AD-009), e `pelada_app` e `pelada_backup_ro` batem com FUN-11
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 25: CI verde e primeiro deploy

### T81: CI verde na main

**What**: Com confirmação, publicar na `main` e conferir o `ci.yml` verde (`gh run watch`). O `testes.json` fica com o comando completo igual ao do CI.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `.specs/projeto/testes.json`
**Depends on**: T80
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-40, FUN-54

**Done when**:

- [ ] `ci.yml` verde no último commit da `main`
- [ ] `testes.json` roda lint, format, typecheck, testes, checagens, build, e2e e visual
- [ ] `trava-testes.py --rodar` verde
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: none
**Gate**: build

---

### T82: Primeiro deploy da prévia

**What**: Com confirmação específica, disparar o `deploy.yml` da prévia, conferir `GET /api/health` com o SHA e instalar o PWA no celular. Registrar o resultado no runbook.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `docs/runbook.md`
**Depends on**: T81
**Reuses**: Nada do LJS (do zero, AD-002)
**Requirement**: FUN-41, FUN-42, FUN-27, FUN-37

**Done when**:

- [ ] `deploy.yml` verde, com a branch de restauração criada e só 2 mantidas
- [ ] `curl https://gestaodapelada-v2.<conta>.workers.dev/api/health` = 200 com o SHA do commit
- [ ] O PWA instala no celular e abre sem rede na página offline
- [ ] Registrado no runbook: data, SHA e URL da prévia
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: none
**Gate**: build

---

## Diagram-Definition Cross-Check

O diagrama de cada Phase tem só a cadeia sequencial. As dependências entre Phases não têm seta e estão em `Depends on`.

| Tarefa | Depends on (corpo) | Seta do diagrama | Status |
|---|---|---|---|
| T1 | — | — | ✅ |
| T2 | T1 | T1 | ✅ |
| T3 | T2 | T2 | ✅ |
| T4 | T3 | T3 | ✅ |
| T5 | T4 | T4 | ✅ |
| T6 | T5 | T5 | ✅ |
| T7 | — | — | ✅ |
| T8 | T7 | T7 | ✅ |
| T9 | T8 | T8 | ✅ |
| T10 | T9 | T9 | ✅ |
| T11 | — | — | ✅ |
| T12 | T11 | T11 | ✅ |
| T13 | T12 | T12 | ✅ |
| T14 | — | — | ✅ |
| T15 | T14 | T14 | ✅ |
| T16 | — | — | ✅ |
| T17 | T16 | T16 | ✅ |
| T18 | T17 | T17 | ✅ |
| T19 | — | — | ✅ |
| T20 | T19 | T19 | ✅ |
| T21 | T20 | T20 | ✅ |
| T22 | — | — | ✅ |
| T23 | T22 | T22 | ✅ |
| T24 | T23 | T23 | ✅ |
| T25 | T24 | T24 | ✅ |
| T26 | — | — | ✅ |
| T27 | T26 | T26 | ✅ |
| T28 | T27 | T27 | ✅ |
| T29 | T28 | T28 | ✅ |
| T30 | — | — | ✅ |
| T31 | T30 | T30 | ✅ |
| T32 | T31 | T31 | ✅ |
| T33 | — | — | ✅ |
| T34 | T33 | T33 | ✅ |
| T35 | T34 | T34 | ✅ |
| T36 | T35 | T35 | ✅ |
| T37 | — | — | ✅ |
| T38 | T37 | T37 | ✅ |
| T39 | T38 | T38 | ✅ |
| T40 | T39 | T39 | ✅ |
| T41 | — | — | ✅ |
| T42 | T41 | T41 | ✅ |
| T43 | — | — | ✅ |
| T44 | T43 | T43 | ✅ |
| T45 | T44 | T44 | ✅ |
| T46 | T45 | T45 | ✅ |
| T47 | — | — | ✅ |
| T48 | T47 | T47 | ✅ |
| T49 | T48 | T48 | ✅ |
| T50 | — | — | ✅ |
| T51 | T50 | T50 | ✅ |
| T52 | T51 | T51 | ✅ |
| T53 | — | — | ✅ |
| T54 | T53 | T53 | ✅ |
| T55 | T54 | T54 | ✅ |
| T56 | T55 | T55 | ✅ |
| T57 | — | — | ✅ |
| T58 | T57 | T57 | ✅ |
| T59 | T58 | T58 | ✅ |
| T60 | T59 | T59 | ✅ |
| T61 | — | — | ✅ |
| T62 | T61 | T61 | ✅ |
| T63 | T62 | T62 | ✅ |
| T64 | — | — | ✅ |
| T65 | T64 | T64 | ✅ |
| T66 | T65 | T65 | ✅ |
| T67 | — | — | ✅ |
| T68 | T67 | T67 | ✅ |
| T69 | — | — | ✅ |
| T70 | T69 | T69 | ✅ |
| T71 | T70 | T70 | ✅ |
| T72 | T71 | T71 | ✅ |
| T73 | — | — | ✅ |
| T74 | T73 | T73 | ✅ |
| T75 | — | — | ✅ |
| T76 | T75 | T75 | ✅ |
| T77 | — | — | ✅ |
| T78 | T77 | T77 | ✅ |
| T79 | T78 | T78 | ✅ |
| T80 | T79 | T79 | ✅ |
| T81 | — | — | ✅ |
| T82 | T81 | T81 | ✅ |

## Test Co-location Validation

| Tarefa | Camada | A matriz exige | A tarefa diz | Status |
|---|---|---|---|---|
| T1: Ação do usuário: Node 26, pnpm 11 e Docker prontos | Config, docs e ações externas | none | none | ✅ |
| T2: Raiz do monorepo | Config, docs e ações externas | none | none | ✅ |
| T3: Cinco pacotes com TypeScript estrito e teste de estrutura | Scripts, checagens, ops e workflows | unit | unit | ✅ |
| T4: ESLint, Prettier e scripts de qualidade | Config, docs e ações externas | none | none | ✅ |
| T5: Regra: domínio sem I/O | Domínio (`backend/dominio`) | unit | unit | ✅ |
| T6: Trocar a dispensa pelo comando real da suíte | Config, docs e ações externas | none | none | ✅ |
| T7: docker-compose do Postgres 18 | Config, docs e ações externas | none | unit | ✅ |
| T8: Trava de host do banco | Scripts, checagens, ops e workflows | unit | unit | ✅ |
| T9: Mensagem quando o Postgres local está fora do ar | Scripts, checagens, ops e workflows | unit | integration | ✅ |
| T10: Banco de teste descartável | Banco: esquema, estado, roles e RLS | integration | integration | ✅ |
| T11: Script de dump cifrado | Scripts, checagens, ops e workflows | unit | integration | ✅ |
| T12: Workflow backup.yml | Scripts, checagens, ops e workflows | unit | unit | ✅ |
| T13: Script de restauração | Scripts, checagens, ops e workflows | unit | integration | ✅ |
| T14: Ação do usuário: conferir secrets de backup | Config, docs e ações externas | none | none | ✅ |
| T15: Publicar o backup.yml e rodar à mão | Config, docs e ações externas | none | none | ✅ |
| T16: Copiar as 23 migrações | Arquivos de migração (cópia, ordem, hash) | unit | unit | ✅ |
| T17: Executar migrações com node-pg-migrate | Banco: esquema, estado, roles e RLS | integration | integration | ✅ |
| T18: Comando pnpm migrar | Scripts, checagens, ops e workflows | unit | integration | ✅ |
| T19: lerEsquema: estrutura | Banco: esquema, estado, roles e RLS | integration | integration | ✅ |
| T20: lerEsquema: funções, policies, grants e roles | Banco: esquema, estado, roles e RLS | integration | integration | ✅ |
| T21: Referência do schema e teste de igualdade | Banco: esquema, estado, roles e RLS | integration | integration | ✅ |
| T22: detectarEstado | Banco: esquema, estado, roles e RLS | integration | integration | ✅ |
| T23: Migrar sobre banco já migrado: zero DDL | Banco: esquema, estado, roles e RLS | integration | integration | ✅ |
| T24: Checagem de migração aditiva | Scripts, checagens, ops e workflows | unit | unit | ✅ |
| T25: Gerador de migração nova | Scripts, checagens, ops e workflows | unit | unit | ✅ |
| T26: Apoio de isolamento | Banco: esquema, estado, roles e RLS | integration | integration | ✅ |
| T27: Roles do banco | Banco: esquema, estado, roles e RLS | integration | integration | ✅ |
| T28: Meta-teste: FORCE e cobertura da matriz | Banco: esquema, estado, roles e RLS | integration | integration | ✅ |
| T29: Matriz de leitura por conta | Banco: esquema, estado, roles e RLS | integration | integration | ✅ |
| T30: Matriz de escrita por conta | Banco: esquema, estado, roles e RLS | integration | integration | ✅ |
| T31: Contexto público e sem contexto | Banco: esquema, estado, roles e RLS | integration | integration | ✅ |
| T32: Seed local | Scripts, checagens, ops e workflows | unit | integration | ✅ |
| T33: wrangler.jsonc da prévia | Config, docs e ações externas | none | unit | ✅ |
| T34: App Hono e GET /api/health | Rotas e middlewares da API | e2e | e2e | ✅ |
| T35: Cabeçalhos das rotas /api | Rotas e middlewares da API | e2e | e2e | ✅ |
| T36: Middleware de limite de taxa | Rotas e middlewares da API | e2e | e2e | ✅ |
| T37: Cliente pg por requisição | Banco: esquema, estado, roles e RLS | integration | integration | ✅ |
| T38: comBanco: transação e contexto | Rotas e middlewares da API | e2e | e2e | ✅ |
| T39: Checagem do Hyperdrive sem cache | Scripts, checagens, ops e workflows | unit | unit | ✅ |
| T40: Checagem de URL absoluta | Scripts, checagens, ops e workflows | unit | unit | ✅ |
| T41: Função que limpa o evento do Sentry | Contrato (`backend/contrato`) | unit | unit | ✅ |
| T42: Sentry no Worker, só com DSN | Rotas e middlewares da API | e2e | e2e | ✅ |
| T43: Esqueleto Vite + React | Front: componentes e lógica | unit | unit | ✅ |
| T44: Ativos do mockup | Front: componentes e lógica | unit | unit | ✅ |
| T45: Stylelint: só tokens | Front: componentes e lógica | unit | unit | ✅ |
| T46: global.css | Config, docs e ações externas | none | none | ✅ |
| T47: Componentes Casca e Marca | Front: componentes e lógica | unit | unit | ✅ |
| T48: Componente Botao | Front: componentes e lógica | unit | unit | ✅ |
| T49: Componente EstadoErro | Front: componentes e lógica | unit | unit | ✅ |
| T50: Componente EsqueletoLista | Front: componentes e lógica | unit | unit | ✅ |
| T51: Aviso de instalação no iPhone | Front: componentes e lógica | unit | unit | ✅ |
| T52: Rotas, página provisória e vitrine | Front: componentes e lógica | unit | unit | ✅ |
| T53: Manifest | Front: componentes e lógica | unit | unit | ✅ |
| T54: Service worker | Front: componentes e lógica | unit | unit | ✅ |
| T55: Página offline | Front: componentes e lógica | unit | unit | ✅ |
| T56: Sentry no front | Front: componentes e lógica | unit | unit | ✅ |
| T57: Arquivo _headers | Front: componentes e lógica | unit | unit | ✅ |
| T58: Playwright e servidor de e2e | Front: e2e (Playwright contra o build) | e2e | e2e | ✅ |
| T59: e2e dos cabeçalhos | Front: e2e (Playwright contra o build) | e2e | e2e | ✅ |
| T60: e2e de instalabilidade | Front: e2e (Playwright contra o build) | e2e | e2e | ✅ |
| T61: Comparador de imagens | Front: ferramentas de e2e (lógica) | unit | unit | ✅ |
| T62: Comparação visual das telas de vitrine | Front: e2e (Playwright contra o build) | e2e | e2e | ✅ |
| T63: pnpm dev | Config, docs e ações externas | none | e2e | ✅ |
| T64: Checagem de actions fixadas por SHA | Scripts, checagens, ops e workflows | unit | unit | ✅ |
| T65: Checagem: wrangler deploy só no deploy.yml | Scripts, checagens, ops e workflows | unit | unit | ✅ |
| T66: Checagem do .env.example e gitleaks | Config, docs e ações externas | none | unit | ✅ |
| T67: ci.yml: qualidade, testes e banco | Scripts, checagens, ops e workflows | unit | unit | ✅ |
| T68: ci.yml: front | Scripts, checagens, ops e workflows | unit | unit | ✅ |
| T69: Branch de restauração no Neon | Scripts, checagens, ops e workflows | unit | unit | ✅ |
| T70: Workflow deploy.yml | Scripts, checagens, ops e workflows | unit | unit | ✅ |
| T71: Guarda: só a prévia | Scripts, checagens, ops e workflows | unit | unit | ✅ |
| T72: Verificação de saúde pós-deploy | Scripts, checagens, ops e workflows | unit | unit | ✅ |
| T73: Runbook: deploy, migração e restauração | Config, docs e ações externas | none | none | ✅ |
| T74: Runbook: segredos, monitor e passo de produção | Config, docs e ações externas | none | none | ✅ |
| T75: README | Config, docs e ações externas | none | none | ✅ |
| T76: CLAUDE.md da raiz | Config, docs e ações externas | none | none | ✅ |
| T77: Ação do usuário: branch dev do Neon | Config, docs e ações externas | none | none | ✅ |
| T78: Ação do usuário: Hyperdrive, token e environment previa | Config, docs e ações externas | none | none | ✅ |
| T79: ID real do Hyperdrive no wrangler | Config, docs e ações externas | none | unit | ✅ |
| T80: Paridade e zero DDL na dev | Scripts, checagens, ops e workflows | unit | integration | ✅ |
| T81: CI verde na main | Config, docs e ações externas | none | none | ✅ |
| T82: Primeiro deploy da prévia | Config, docs e ações externas | none | none | ✅ |

