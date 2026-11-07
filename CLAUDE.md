# Gestão da Pelada v2

Contexto do projeto. As regras de **como trabalhar** (fluxos, lotes, testes, aprovação) estão em `.claude/CLAUDE.md` e não se repetem aqui. Comandos e passo a passo para pessoas: `README.md`. Operação (deploy, restauração, segredos): `docs/runbook.md`.

## O que é

Aplicativo para organizar a pelada (grupos, elenco, partidas, ranking, financeiro). Reescrita do zero: a versão anterior fica na branch `legado` e nunca é apagada (AD-005). Tudo em português do Brasil; identificadores de código seguem o que o projeto já usa.

## Stack

- Monorepo **pnpm 11** com **Node 26** (`engines >=26 <27`, AD-012)
- API: **Cloudflare Worker** com **Hono**, em `backend/api`; regras puras em `backend/dominio`; esquemas compartilhados em `backend/contrato`
- Front: **React + Vite** (PWA) em `frontend/web`
- Banco: **PostgreSQL 18** com RLS forçada; no ar pelo **Neon** via **Hyperdrive** (cache desligado)
- Testes: **Vitest** (inclusive no runtime do Worker), **Playwright** (e2e e comparação visual)
- CI e deploy: GitHub Actions (`ci`, `deploy`, `backup`)

## Comandos

| Comando                                            | O que faz                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------- |
| `docker compose up -d --wait`                      | Postgres local em `127.0.0.1:5432`                                  |
| `pnpm migrar` / `pnpm seed`                        | Aplica as migrações; cria roles, conta e grupo de teste             |
| `pnpm dev`                                         | API (wrangler) e web (Vite) locais                                  |
| `pnpm lint`, `pnpm format:check`, `pnpm typecheck` | Qualidade                                                           |
| `pnpm test` / `pnpm test:checagens`                | Testes e regras do repositório                                      |
| `pnpm --filter @pelada/web e2e` / `visual`         | Prova de tela e comparação com o mockup                             |
| `pnpm migracao:nova <nome>`                        | Nova migração                                                       |
| `python .claude/scripts/trava-testes.py --rodar`   | Suíte completa registrada (comando de `.specs/projeto/testes.json`) |

## Estrutura

- `backend/api`, `backend/contrato`, `backend/dominio`, `backend/scripts` (executor das migrações, seed, `checagens/`, `ops/`)
- `frontend/web`
- `backend/api/src/infraestrutura/db/migracoes/`: migrações SQL
- `docs/`: runbook e registros de operação
- `.github/workflows` e `.github/actions`: CI, deploy, backup e o dump cifrado
- `.specs/`: planejamento por feature em `features/<slug>/`, roteiro em `projeto/roadmap.md`, decisões em `STATE.md`, preparação em `preparacao.md`

## Regras de banco

- **Migrações só aditivas**; nunca editar uma já aplicada (AD-003, checagem `migracao-aditiva`). O controle é a tabela `pgmigrations` do `node-pg-migrate`.
- **RLS forçada** em toda tabela com dono. Toda policy tem teste por comando (SELECT, INSERT, UPDATE, DELETE). Roles: a da aplicação é `pelada_app`; o backup usa `pelada_backup_ro`, somente leitura (AD-010, AD-016).
- Teste ou ensaio de migração **nunca** roda na `main` do Neon, que é a produção (AD-032, AD-033).
- Segredo nunca é versionado: o `.env.example` lista só nomes (checagem e `gitleaks` no CI).

## Decisões

Cada decisão é uma **AD-NNN** em `.specs/STATE.md` (a mais recente por último). As que mais pesam no dia a dia:

- AD-002: reuso do zero; só migrações e ativos do mockup vêm da versão anterior
- AD-004, AD-032, AD-119, AD-121: o único alvo publicado é a prévia `gestaodapelada-v2` (endereço da Cloudflare e o único domínio próprio da AD-121) sobre a `main` do Neon, com o `deploy.yml` no environment `producao`
- AD-013: o `backup.yml` usa o environment `backup`
- AD-014: o backup da produção não é confiável até a revalidação do fim do projeto
- AD-030: a paridade (domínio e produção) é passo do `/preparar` Nível 2, com confirmação para cada ação externa

Ações externas (push, disparo de workflow, secrets, deploy) pedem confirmação específica, mesmo com a fase aprovada.

## Onde fica o quê

- Spec, design e tarefas de cada feature: `.specs/features/<slug>/` (`spec.md`, `design.md`, `tasks.md`)
- Critérios têm ID `FUN-NN` (fundação) ou o prefixo da feature; os testes de risco alto citam o ID no nome
- Mockup aprovado (tokens, fontes, ícones, telas): `.specs/mockup/`; a interface usa só `tokens.css` e os componentes do guia
