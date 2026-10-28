# Gestão da Pelada

Aplicativo para organizar peladas: grupos, elenco, partidas, ranking e, nas features seguintes, simulador, financeiro,
cobrança e notificações. Este repositório é o app novo, construído em features (`.specs/STATE.md`, AD-001). A primeira
é a `fundacao`: esqueleto publicado, banco com isolamento por grupo, CI, deploy e backup. Idioma: português do Brasil
em conversa, artefatos e commits; identificadores de código seguem as convenções abaixo.

## Stack

- Monorepo pnpm 11, Node 24 (`.nvmrc`), TypeScript estrito, `type: module`.
- `backend/api`: Hono num Cloudflare Worker (`wrangler.jsonc` na raiz), Postgres pelo Hyperdrive, Kysely.
- `backend/contrato` (schemas), `backend/dominio` (regras puras, sem I/O nem relógio), `backend/scripts` (dev, migração,
  seed, checagens e operação).
- `frontend/web`: React 19, Vite 8, React Router 8, PWA com service worker (Workbox, `injectManifest`).
- Banco: PostgreSQL 18 (Neon em produção, `docker compose` no local), migrations com `node-pg-migrate`, RLS com `FORCE`
  por `grupo_id` (ADR-024 e ADR-025). O runtime conecta como `pelada_app`, nunca como o owner.
- Produção: um Worker `gestaodapelada` com os assets e a API em `/api/*`, em `gestaodapelada.ljssoftware.com.br` (ADR-028).

## Comandos (na raiz do repositório)

```bash
docker compose up -d          # Postgres 18 local
pnpm migrar                   # migrations (linha de base, roles, RLS)
pnpm seed                     # dados de exemplo
pnpm dev                      # Worker :8787 e app :5173
pnpm lint                     # ESLint e Stylelint
pnpm format:check             # Prettier
pnpm typecheck
pnpm test                     # raiz, dominio, contrato, API (precisa do Postgres local) e web
pnpm test:checagens           # checagens do repositório e dos scripts
pnpm --filter @pelada/web build
pnpm --filter @pelada/web e2e      # instalabilidade do PWA e cabeçalhos (precisa do build)
pnpm --filter @pelada/web visual   # comparação visual com o mockup
python .claude/scripts/checar-tokens.py frontend/web/src
```

## Gate de testes

Nenhuma tarefa termina com teste vermelho. Antes de integrar ou implantar, com tudo commitado, rode
`python .claude/scripts/trava-testes.py --rodar` (usa `.specs/projeto/testes.json`: lint, format, typecheck,
`pnpm test`, `pnpm test:checagens`, build do web, e2e e visual). O CI roda a mesma suíte mais gitleaks, o banco de
serviço e as checagens de ações fixadas por SHA. Mudança de comportamento tem teste automatizado que falharia sem ela.
Nunca apague, pule ou enfraqueça um teste para fazê-lo passar.

## Regras que valem em todo o código

- Cor, fonte e sombra só pelas variáveis de `tokens.css` (Stylelint e `checar-tokens.py`). Telas seguem `.specs/mockup/`.
- Nenhuma URL absoluta no código ou no banco: o endereço público vem de `URL_PUBLICA`.
- `wrangler deploy` só existe em `.github/workflows/deploy.yml` (`checar-wrangler-deploy`).
- Ações do GitHub fixadas por SHA (`checar-acoes-fixadas`). Nada de segredo versionado: variáveis em `.env.example`.
- Migration nova é aditiva e nunca se edita uma já aplicada. Toda rota nova entra em `backend/api/test/isolamento/casos.ts`.
- Datas no fuso de São Paulo e dinheiro em centavos (ADR-012).

## Onde ficam as coisas

- `.specs/`: artefatos dos fluxos. `STATE.md` (decisões `AD-NNN` e retomada), `features/<feature>/` (spec, design,
  tasks), `produto/`, `projeto/` (inventário, `testes.json`), `mockup/` (referência visual), `spikes/`.
- `.md/`: documentação oficial (PRD, PRD-TECNICO, SDD, GUARDRAILS, THREAT-MODEL) e `adr/` (001 a 023 do legado, novos a
  partir do 024; use `Supersedes:` quando mudar um anterior).
- `docs/`: `runbook.md` (deploy, restauração, rotação de segredos, monitor de uptime).
- `.claude/`: fluxos de trabalho, agentes, regras e scripts do assistente. Suas regras ficam em `.claude/CLAUDE.md`
  (não edite por aqui).
- `README.md`: como rodar local, variáveis, testes e deploy. `.env.example`: cada variável com formato e se é segredo.

## Ações que pedem confirmação

Push, criação de repositório ou PR, deploy, qualquer comando em banco de produção ou na conta Cloudflare e a remoção
do Worker antigo `pelada` pedem confirmação específica, mesmo com a fase aprovada (runbook, seções 1 e 6).
