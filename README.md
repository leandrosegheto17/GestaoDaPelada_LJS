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

Antes de `pnpm seed` e `pnpm dev`, edite o `.env` e defina `PELADA_APP_SENHA`, `PELADA_BACKUP_RO_SENHA` e `SEED_SENHA_ADMIN` (qualquer texto; a de `SEED_SENHA_ADMIN` com 8 a 72 caracteres; ficam só na sua máquina). Sem `SEED_SENHA_ADMIN`, o `pnpm seed` recusa e não cria nada.

### Entrar local

O seed cria a conta admin `admin@exemplo.test`, já confirmada, com a senha que você pôs em `SEED_SENHA_ADMIN`, e o grupo **Pelada Local** (`pelada-local`) com essa conta como admin. Com o `pnpm dev` no ar, abra `http://localhost:5173/entrar` e entre com esse e-mail e essa senha: o app vai a `/app` e lista o grupo. Rodar o `pnpm seed` de novo redefine a senha para o valor atual de `SEED_SENHA_ADMIN`.

### E-mails em desenvolvimento

Os e-mails de conta (confirmação, recuperação de senha, convite) saem pelo Resend. Em desenvolvimento, `EMAIL_DEV=1` troca o Resend por uma caixa em memória do Worker, que `GET /api/dev/emails` lista (com o link de cada mensagem). Sem `EMAIL_DEV=1`, essa rota responde 404, e a variável nunca vai para o `wrangler.jsonc` (checagem `email-dev`).

- **e2e:** o `playwright.config.ts` já sobe o Worker com `--var EMAIL_DEV:1` e a `URL_PUBLICA` local; as jornadas de acesso leem os links dessa caixa.
- **À mão:** o `pnpm dev` ainda não passa essas duas variáveis ao Worker (os links precisam da `URL_PUBLICA`, que é vazia no `wrangler.jsonc`). Para testar cadastro, recuperação ou convite local, suba a API assim, com o Vite à parte (`pnpm --filter @pelada/web dev`):

```bash
pnpm --filter @pelada/api exec wrangler dev --config ../../wrangler.jsonc --ip 127.0.0.1 --port 8787   --var EMAIL_DEV:1 --var URL_PUBLICA:http://localhost:5173
curl -s http://127.0.0.1:8787/api/dev/emails   # mensagens enviadas desde que o Worker subiu
```

A caixa some quando o Worker reinicia.

### Conta do dono

`pnpm --filter @pelada/scripts dono -- --email <e-mail do dono>` cria a conta do dono ou troca a senha dela. A senha é pedida no terminal duas vezes, sem eco, e nunca aparece na tela nem no log. O alvo padrão é o banco local (`DATABASE_URL_MIGRACAO`); `--alvo previa` e `--alvo producao` usam o Neon, e o de produção só segue depois de você digitar o e-mail do dono e a palavra `producao`. Banco remoto sem `--alvo` explícito é recusado antes de conectar. O e-mail do dono é o que o banco aceita (CHECK `contas_dono_email`); outro falha lá.

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
| `RESEND_API_KEY`         | Chave da API do Resend, secret do Worker (segredo)                            |
| `RESEND_REMETENTE`       | Remetente dos e-mails de conta, de domínio verificado no Resend               |
| `LIMITE_EMAILS_DIA`      | Teto diário de e-mails de conta (padrão 100, o do Resend Free)                |
| `EMAIL_DEV`              | `1` liga a caixa de e-mails em memória e `GET /api/dev/emails` (só local e e2e) |
| `SEED_SENHA_ADMIN`       | Senha da conta admin criada pelo `pnpm seed`; obrigatória nele (segredo)      |
| `NEON_URL_BACKUP`        | Role somente leitura do Neon, usada pelo `backup.yml` (secret do GitHub)      |
| `BACKUP_CHAVE`           | Chave pública `age` do backup (secret do GitHub)                              |
| `DATABASE_URL_RESTAURACAO` | Banco local vazio do `pnpm restaurar`, quando o terceiro argumento falta |
| `NEON_URL_DEV_MIGRACAO` | Role dona da branch `dev` do Neon, só no seu `.env`, para `pnpm esquema:comparar --alvo dev` (segredo) |
| `PELADA_PERMITIR_HOST_REMOTO` | `1` confirma migração ou comparação contra host remoto (o `deploy.yml` define) |
| `WORKER_TESTE_SENHA` | Senha da role dos testes do Worker; vazia, a suíte gera uma aleatória (segredo) |
| `NEON_URL_MIGRACAO` | Role `pelada_owner` da `main` do Neon, no environment `producao` (segredo) |
| `NEON_API_KEY` | Chave da API do Neon para a branch de restauração, no environment `producao` (segredo) |
| `NEON_PROJECT_ID` | Projeto do Neon, no environment `producao` (segredo) |
| `CLOUDFLARE_API_TOKEN` | Token da Cloudflare só com permissão de Workers, no environment `producao` (segredo) |
| `CLOUDFLARE_ACCOUNT_ID` | Conta da Cloudflare, no environment `producao` (segredo) |
| `PELADA_SAUDE_TENTATIVAS` | Tentativas da verificação de saúde pós-deploy (padrão 10) |
| `PELADA_SAUDE_ESPERA_MS` | Espera entre as tentativas da verificação de saúde, em ms (padrão 3000) |

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

Só o workflow manual `deploy` (Actions > `deploy` > Run workflow, na `main`), no environment `producao` do GitHub (AD-119), publica. Ele faz o build, cria um ponto de volta no Neon, gera um dump cifrado, migra e publica o Worker `gestaodapelada-v2` no endereço padrão da Cloudflare (sem domínio próprio), conferindo `GET /api/health`. Detalhes, falhas e restauração: [`docs/runbook.md`](docs/runbook.md).

## Backup

O workflow `backup` roda todo dia às 07:00 UTC (e à mão): `pg_dump` da produção pela role somente leitura, cifrado com `age`, guardado por 30 dias como artefato. A chave privada fica fora do GitHub. Procedimento de restauração e estado atual da revalidação: [`docs/runbook.md`](docs/runbook.md#restaurar-um-backup).
