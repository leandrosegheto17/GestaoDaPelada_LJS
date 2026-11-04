# Gestão da Pelada v2

Aplicativo para organizar a pelada: grupos, elenco, partidas, ranking e financeiro. Esta é a v2, reescrita do zero (a versão anterior fica na branch `legado`).

Stack: monorepo pnpm, front React + Vite (PWA), API em um Cloudflare Worker (Hono) sobre PostgreSQL 18 com RLS, hospedado no Neon via Hyperdrive.

## Requisitos

- Node 26 (`engines`: `>=26 <27`; há um `.nvmrc`)
- pnpm 11 (`packageManager`: `pnpm@11.23.0`)
- Docker (o Postgres local sobe pelo `docker compose`)

## Rodar local

Do clone até o app em `http://localhost:5173`:

```bash
pnpm install
docker compose up -d --wait        # Postgres 18 em 127.0.0.1:5432
cp .env.example .env               # depois preencha as senhas (abaixo)
pnpm migrar                        # aplica as migrações como o superusuário postgres
pnpm seed                          # cria roles, uma conta e um grupo de teste
pnpm dev                           # wrangler dev (API) + Vite (web)
```

Antes de `pnpm seed` e `pnpm dev`, edite o `.env` e defina `PELADA_APP_SENHA` e `PELADA_BACKUP_RO_SENHA` (qualquer texto; ficam só na sua máquina). O seed cria a conta `seed@pelada.local` (senha `senha-local-123`) e o grupo `pelada-local`.

O `pnpm dev` abre o app em `http://localhost:5173`, a API em `http://localhost:8787` (rotas em `/api/*`) e usa o Postgres local pela role `pelada_app`. Para parar o banco: `docker compose down` (os dados ficam no volume; `docker compose down -v` apaga tudo).

## Variáveis de ambiente

O `.env.example` lista todas, com obrigatoriedade, formato e se é segredo. Segredo nunca é versionado.

| Variável                 | Uso                                                                           |
| ------------------------ | ----------------------------------------------------------------------------- |
| `DATABASE_URL`           | Banco da aplicação nos testes e scripts locais (padrão: o banco do compose)   |
| `DATABASE_URL_TESTE`     | Cluster dos testes de banco (padrão: o banco local)                           |
| `DATABASE_URL_MIGRACAO`  | Role de migração, host local; obrigatória em `pnpm migrar` e `pnpm seed`      |
| `PELADA_APP_SENHA`       | Senha da role `pelada_app`; obrigatória em `pnpm seed` e `pnpm dev` (segredo) |
| `PELADA_BACKUP_RO_SENHA` | Senha da role `pelada_backup_ro`; obrigatória em `pnpm seed` (segredo)        |
| `PELADA_DEV_BANCO_PORTA` | Porta do Postgres local usada pelo `pnpm dev` (padrão 5432)                   |
| `PELADA_DEV_PORTA_API`   | Porta do `wrangler dev` (padrão 8787)                                         |
| `PELADA_DEV_PORTA_WEB`   | Porta do Vite (padrão 5173)                                                   |
| `VITE_VITRINE`           | `1` inclui as rotas de vitrine no build (só a comparação visual usa)          |
| `VITE_SENTRY_DSN`        | Sentry do front; vazio desliga (segredo)                                      |
| `VITE_VERSAO`            | SHA do commit publicado, release do Sentry do front                           |
| `SENTRY_DSN`             | Sentry do Worker; vazio desliga (secret do Worker)                            |
| `VERSAO`                 | SHA publicado, injetado por `--var` no deploy                                 |
| `URL_PUBLICA`            | URL https do app, injetada por `--var` no deploy                              |
| `NEON_URL_BACKUP`        | Role somente leitura do Neon, usada pelo `backup.yml` (secret do GitHub)      |
| `BACKUP_CHAVE`           | Chave pública `age` do backup (secret do GitHub)                              |

## Testes e checagens

```bash
pnpm lint                          # eslint em todos os pacotes
pnpm format:check                  # prettier
pnpm typecheck
pnpm test                          # vitest (precisa do banco no ar: docker compose up -d --wait)
pnpm test:checagens                # regras do repositório: migrações aditivas, actions por SHA, .env.example...
pnpm --filter @pelada/web build
pnpm --filter @pelada/web e2e      # Playwright (instale o Chromium na primeira vez)
pnpm --filter @pelada/web visual   # comparação visual das telas com o mockup
```

A suíte inteira, na ordem do CI, é o comando de `.specs/projeto/testes.json`. Para rodar e registrar o resultado: `python .claude/scripts/trava-testes.py --rodar`.

Primeira vez com o Playwright: `pnpm --filter @pelada/web exec playwright install chromium`.

## Estrutura

```
backend/api        Worker (Hono): rotas /api/*, regras e acesso ao banco
backend/contrato   Esquemas e tipos compartilhados entre API e web
backend/dominio    Regras puras, sem I/O
backend/scripts    Executor das migrações, seed, checagens e operações (ops/)
frontend/web       App React + Vite (PWA)
docs/              Runbook e registros de operação
.github/           Workflows: ci, deploy e backup
.specs/            Planejamento (spec, design, tarefas) e decisões (STATE.md)
```

## Banco e migrações

As migrações (SQL) ficam em `backend/api/src/infraestrutura/db/migracoes/` e rodam com `pnpm migrar`. Regras: só mudanças **aditivas** (a checagem `migracao-aditiva` reprova o resto), nunca editar uma migração já aplicada, nova migração com `pnpm migracao:nova <nome>`. O isolamento entre contas é feito por RLS no banco.

## Deploy da prévia

Só o workflow manual `deploy` (Actions > `deploy` > Run workflow, na `main`) publica. Ele faz o build, cria um ponto de volta no Neon, gera um dump cifrado, migra e publica o Worker `gestaodapelada-v2` no endereço padrão da Cloudflare (sem domínio próprio), conferindo `GET /api/health`. Detalhes, falhas e restauração: [`docs/runbook.md`](docs/runbook.md).

## Backup

O workflow `backup` roda todo dia às 07:00 UTC (e à mão): `pg_dump` da produção pela role somente leitura, cifrado com `age`, guardado por 30 dias como artefato. A chave privada fica fora do GitHub. Procedimento de restauração e estado atual da revalidação: [`docs/runbook.md`](docs/runbook.md#restaurar-um-backup).
