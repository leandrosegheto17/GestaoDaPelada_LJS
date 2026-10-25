# Gestão da Pelada

Aplicativo para organizar peladas: grupos, elenco, partidas e ranking. Esta é a fundação: o esqueleto publicado
(Worker da Cloudflare com a API em `/api/*` e o app React como arquivos estáticos), o banco com isolamento por grupo,
o CI, o deploy e o backup. As regras de negócio chegam nas features seguintes (`.specs/features/`).

## Stack

- Front: React 19, Vite 8, PWA (service worker em `frontend/web/src/pwa`).
- API: Hono num Cloudflare Worker (`backend/api`), Postgres pelo Hyperdrive, Kysely.
- Banco: PostgreSQL 16 (Neon em produção, Docker no seu computador), migrations com `node-pg-migrate`, isolamento por RLS.
- Pacotes: `backend/contrato` (schemas), `backend/dominio` (regras puras), `backend/scripts` (dev, migração, seed, checagens).

## Pré-requisitos

- Node 24 (`.nvmrc`) e pnpm 11 (`corepack enable`)
- Docker (para o Postgres local)
- Python 3 (só para `python .claude/scripts/checar-tokens.py`)

## Rodar local

Do clone ao app em `http://localhost:5173`:

```bash
pnpm install
cp .env.example .env
```

Abra o `.env` e preencha quatro variáveis (as outras ficam vazias no uso local):

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/pelada
DATABASE_URL_TESTE=postgres://postgres:postgres@localhost:5432/pelada_teste
PELADA_APP_SENHA=troque-por-um-texto-sem-espacos-com-24-ou-mais-caracteres
PELADA_BACKUP_SENHA=troque-por-outro-texto-do-mesmo-tipo
```

Os valores acima são exemplos literais (sem `<` nem `>`): troque as duas senhas por textos seus. Para gerar um texto
de 24 caracteres, use `openssl rand -hex 12` (no Windows, o `openssl` vem com o Git Bash).
No `.env.example` as quatro variáveis vêm em branco.

A senha do `postgres` (`postgres`) é a fictícia do `docker-compose.yml`; vale só para a sua máquina.

```bash
docker compose up -d      # Postgres 16 local, porta 5432 (espere ficar healthy: docker compose ps)
pnpm migrar               # aplica as migrations (linha de base, roles, RLS)
pnpm seed                 # dados de exemplo e senha das roles locais
pnpm --filter @pelada/web build   # gera frontend/web/dist, que o Worker exige para subir
pnpm dev                  # Worker em :8787 e app em :5173 (Ctrl+C encerra os dois)
```

Confira: `curl http://localhost:5173/api/health` devolve `{"status":"ok","versao":"dev"}` com status 200 e
`http://localhost:5173` abre o app.

Se o Postgres não estiver de pé, `pnpm dev` e `pnpm migrar` avisam e mandam rodar `docker compose up -d`.
`pnpm dev` só roda com banco local e recusa host remoto. As portas 5432, 5173 e 8787 precisam estar livres.

## Variáveis de ambiente

Todas estão no [`.env.example`](.env.example), cada uma com obrigatoriedade, formato e se é segredo. O arquivo `.env`
é ignorado pelo git e nenhum segredo entra no repositório (o gitleaks roda no CI). Um teste falha se uma variável usada
no código, no `wrangler.jsonc` ou nos workflows não estiver listada lá.

## Testes e checagens

```bash
pnpm lint                              # ESLint e Stylelint
pnpm format:check                      # Prettier
pnpm typecheck
pnpm test                              # raiz, dominio, contrato, API (precisa do Postgres local) e web
pnpm test:checagens                    # checagens do repositório e dos scripts
pnpm --filter @pelada/web build        # build do web
pnpm --filter @pelada/web exec playwright install chromium   # uma vez
pnpm --filter @pelada/web e2e          # instalabilidade do PWA e cabeçalhos (precisa do build)
pnpm --filter @pelada/web visual       # comparação visual com o mockup
python .claude/scripts/checar-tokens.py frontend/web/src
```

Os testes de banco usam `DATABASE_URL_TESTE` e criam o que precisam nesse servidor. A checagem final antes de integrar
é `python .claude/scripts/trava-testes.py --rodar`.

## Deploy

O deploy só roda pelo workflow `deploy.yml`, disparado à mão na `main` (Actions, Run workflow, ou
`gh workflow run deploy.yml --ref main`). A ordem é fixa e para no primeiro erro: conferir `URL_PUBLICA`, build do
web, branch de restauração no Neon (mantém as 2 mais recentes), dump cifrado, migração, conferência do cache do
Hyperdrive desligado, `wrangler deploy` e `GET /api/health` com o SHA publicado. Se algo falhar depois da migração, o
workflow desfaz o deploy (`wrangler rollback`) e diz como restaurar o banco.

Nenhum outro arquivo pode chamar `wrangler deploy` (`node backend/scripts/checagens/checar-wrangler-deploy.mjs`).
Passo a passo, restauração, rotação de segredos e a remoção do Worker antigo: [`docs/runbook.md`](docs/runbook.md).

O backup roda todo dia às 07:00 UTC (`backup.yml`): `pg_dump` pela role de leitura, cifrado com `age`, artefato por 30 dias.

## Onde fica o quê

- `.specs/`: especificações, desenho e tarefas de cada feature, decisões (`STATE.md`) e o mockup visual.
- `.md/`: documentação oficial (PRD, SDD, guardrails, modelo de ameaças) e os ADRs em `.md/adr/`.
- `docs/`: runbook de operação.
- `CLAUDE.md`: contexto do projeto para o assistente de código.
