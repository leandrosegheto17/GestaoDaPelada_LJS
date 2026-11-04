# Preparação: Gestão da Pelada v2

- **Data**: 2026-11-03 · **Destino**: nuvem gratuita (Cloudflare Workers + Neon via Hyperdrive), prévia `gestaodapelada-v2` sobre a branch `dev` do Neon até a paridade (AD-004)
- **Base**: `.specs/produto/necessidade.md`, `.specs/features/fundacao/tasks.md`, `.specs/STATE.md` (AD-004, AD-005, AD-008, AD-014)
- **Nível 2**: infraestrutura aproveitada do projeto legado `GestaoDaPelada_LJS` (mesmo repositório, mesmo Neon, mesmo Cloudflare); cada item abaixo é conferido contra o que o legado já criou, não recriado (`GestaoDaPelada_LJS/docs/runbook.md`, `.specs/liberacao.md`).

## Nível 1 — síncrono (necessário para /executar)

- [x] Repositório e remoto — `main` é a v2, `legado` guarda a main do LJS (AD-005); evidência: `git ls-remote --heads origin` mostra `main` em `2f8ad25` e `legado` em `e557292`; `git rev-list --count origin/main..main` = 0
- [x] Ambiente local — Node 26.13.0, pnpm 11.23.0, Docker 29.7.2 com o container `gestaodapelada_v2-postgres-1` no ar (healthy); `gh auth status` logado como leandrosegheto17 (T1 da fundação)
- [x] Pré-voo — `python .claude/scripts/preparar-ambiente.py` imprime "Ambiente pronto."
- [x] Hook de commit — `.git/hooks/commit-msg` instalado

## Nível 2 — assíncrono (até o fim da execução)

- [x] Projeto Neon e branches `main` e `dev` — herdados do LJS (Postgres 18, database `pelada`); evidência: o usuário conferiu no console em 2026-11-04 que a `dev` existe e que `pelada_owner`, `pelada_app` e `pelada_backup_ro` existem nela (declaração do usuário; sem acesso de CLI na sessão)
- [x] Hyperdrive — decisão do usuário em 2026-11-04 (AD-032): reaproveitar `e06363bd85874f1eaffc6382da6d394b` (origem `pelada_app`, banco de produção, cache desligado), sem criar recurso novo; evidência: o ID já consta no `wrangler.jsonc` do LJS. Pendência: conferir origem e cache com `wrangler hyperdrive get` quando houver login, e ajustar T77/T78
- [x] Segredos dos GitHub environments — decisão do usuário em 2026-11-04: reusar o environment `producao`, sem criar `previa` (AD-032); evidência: `gh secret list --env producao` = BACKUP_CHAVE, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, NEON_URL_MIGRACAO, URL_PUBLICA; `backup` = BACKUP_CHAVE, NEON_URL_BACKUP. Pendências para a fundação: `URL_PUBLICA` hoje é a do domínio de produção (a prévia usa workers.dev, o `deploy.yml` deve injetar o valor da prévia); o dump pré-deploy da AD-010 pedia `NEON_URL_DEV_BACKUP`, que não existe: como o deploy roda no `producao`, ele precisa de um secret de `pelada_backup_ro` ali (decidir na T-deploy). Nunca no repositório
- [ ] Backup e restauração testada — adiado para o fim do projeto por decisão do usuário em 2026-11-04 (AD-014); `backup.yml` na `main` e secrets no environment `backup` já existem (AD-013); falta a primeira execução manual e a **restauração testada com contagem real** (T15, AD-011, AD-014: o backup da produção é tratado como NÃO confiável até lá)
- [ ] Observabilidade — o LJS nunca teve Sentry nem monitor de uptime (runbook §7); criar projeto Sentry (Worker e front, `SENTRY_DSN` e `VITE_SENTRY_DSN`) e monitor UptimeRobot em `/api/health`. Depende de contas do usuário
- [ ] E-mail transacional (Resend) — domínio `ljssoftware.com.br` já Verified e `RESEND_API_KEY` / `RESEND_REMETENTE` no Worker do LJS; decidir se a prévia `gestaodapelada-v2` usa a mesma chave ou uma nova. Só é necessário a partir da feature `conta-e-acesso`
- [ ] Pipeline de deploy da prévia — `deploy.yml` com alvo único `gestaodapelada-v2` (workers.dev), reversão por `wrangler rollback` testada (T-deploy, Phases 21 e 25 da fundação). A publicação é do `/finalizar`; aqui só se deixa pronto e com teste de fumaça

## Fora do escopo deste projeto

- Esqueleto ponta a ponta, `docker-compose`, `testes.json` e CI — entregues pela própria feature `fundacao` (T2 a T7, T20); a ordem do Nível 1 seria circular, já que o esqueleto é o que a fundação constrói
- Staging separado — o produto não tem homologação (necessidade, "fica de fora"); a prévia sobre a `dev` do Neon faz esse papel (AD-004)
- Produção, domínio `gestaodapelada.ljssoftware.com.br` e troca para a `main` do Neon — passo do runbook com confirmação, do `/finalizar` (AD-004)
