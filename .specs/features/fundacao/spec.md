# Fundação — Especificação

> Feature 1 de 8 do roteiro (AD-001). **Spec aprovada pelo usuário em 2026-11-03.** Fluxo 2 (uso próprio), fase 4. Entrada: `.specs/produto/necessidade.md` (aprovado em 2026-11-03). Base de reuso: `GestaoDaPelada_LJS/.specs/features/fundacao/spec.md` (aprovada em 2026-10-24), adaptada ao banco que já está em produção e à troca do repositório.

## Problem Statement

A v2 reimplementa do zero o Gestão da Pelada sobre o **mesmo banco Neon** do LJS, que está em produção com o grupo de teste e as 23 migrações da main do LJS (`e557292`). Antes de qualquer regra de negócio, a v2 precisa de uma base que rode local, teste, publique numa prévia, faça backup e restaure de forma reproduzível, sem tocar o schema nem os dados de produção. Precisa também isolar os dados por grupo já no banco e manter a cara do LJS. A `main` do repositório do LJS passa a ser a v2, então o backup da produção não pode ter um dia de falha na troca.

## Goals

- [ ] Do clone ao app rodando local com `pnpm install`, `docker compose up -d`, `pnpm migrar`, `pnpm seed` e `pnpm dev`, sem passo manual fora do README.
- [ ] Prévia publicada pelo `deploy.yml` no Worker `gestaodapelada-v2` (workers.dev), sobre a branch `dev` do Neon, com `GET /api/health` = 200 e o shell PWA no visual do LJS.
- [ ] `pnpm migrar` sobre uma cópia do banco de produção executa zero DDL e mantém a contagem de linhas idêntica. Do zero, gera o mesmo schema da produção.
- [ ] Backup diário cifrado da produção contínuo na troca da `main`, e uma restauração testada e registrada.

## Out of Scope

| Feature | Reason |
| ----------- | -------------- |
| Assumir o domínio `gestaodapelada.ljssoftware.com.br` e migrar a `main` do Neon | Acontece na paridade, no fim da `grupos-e-elenco` (decisão do usuário em 2026-11-03). Até lá, o Worker `gestaodapelada` do LJS segue intocado |
| Cadastro, login, sessão, recuperação, termos, exclusão de conta, landing | Feature `conta-e-acesso`. Aqui `/` mostra uma página provisória |
| Telas e rotas de grupos, jogadores, partidas, ranking, simulador e financeiro | Features 3 a 6. Aqui entram só o schema herdado e a RLS |
| Planos, Meu plano, Asaas | Feature `planos-e-cobranca` |
| Envio de e-mail (Resend) e Web Push | Features `conta-e-acesso` e `notificacoes`. Aqui entram só os nomes das variáveis em `.env.example` |
| Ambiente de homologação além da prévia | A prévia na branch `dev` cumpre esse papel |
| Criar as contas de Sentry e UptimeRobot | Ação do usuário. O código funciona sem elas (FUN-25) |
| Documentação no formato do LJS (`.md/`, PRD, SDD, THREAT-MODEL) | O usuário pediu seguir do zero o fluxo do Rascunho: decisões em `.specs/STATE.md` e `.specs/decisoes/` |
| As 6 migrações da branch `feat/partidas-e-ranking` do LJS | Não estão na produção. Cada feature da v2 cria as suas |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | --------------- | --------- | ---------- |
| Repositório | O mesmo `leandrosegheto17/GestaoDaPelada_LJS` no GitHub. A main atual do LJS vai para a branch `legado`, e a `main` passa a ser a v2. Cada push dessa troca tem confirmação específica | Decisão do usuário em 2026-11-03. Os secrets e environments do repo continuam servindo | y |
| Quando a v2 vai para a produção | Na paridade, no fim da `grupos-e-elenco`. Até lá, só a prévia `gestaodapelada-v2` sobre a branch `dev` do Neon | Decisão do usuário em 2026-11-03. Sem regressão para o grupo de teste | y |
| Linha de base do schema | O schema da produção na main do LJS (`e557292`, 23 migrações, com roles, RLS e funções). O mecanismo (copiar as 23 migrações ou uma linha de base única marcada como aplicada) fica no Design | `necessidade.md` §5 | y |
| Documentação e decisões | Fluxo do Rascunho: AD-NNN em `.specs/STATE.md`, ADR em `.specs/decisoes/` para o que é difícil de desfazer, README, `docs/runbook.md` e `CLAUDE.md` da raiz | Decisão do usuário em 2026-11-03 | y |
| Stack | A do LJS: monorepo pnpm 11, Node 24, TypeScript estrito, Hono no Worker, Kysely + `pg`, Zod, React + Vite, CSS Modules, Vitest e Playwright, Postgres 18 | `necessidade.md` §4 | y |
| Mockup de referência | `GestaoDaPelada_LJS/.specs/mockup/` copiado para `.specs/mockup/` da v2. A pergunta sobre mockup da fase 4 decide se algo novo é desenhado | `necessidade.md` §4 | y |
| Reuso de código do LJS | **Do zero total** (decisão do usuário em 2026-11-03). Só as 23 migrações da main do LJS são copiadas sem alteração, porque precisam bater com a `pgmigrations` da produção. Componentes, API, scripts, workflows e testes são escritos a partir desta spec e do mockup. O LJS serve só como consulta | "Implementação do zero" pedida pelo usuário | y |
| Ativos visuais | `tokens.css`, fontes e ícones vêm de `.specs/mockup/`, que é o objeto de mockup que o usuário liberou para reaproveitar | Decisão do usuário | y |
| Testes e banco | Os testes só conectam ao Postgres local (Docker) ou ao do CI, nunca ao Neon | Risco "escrita de teste no banco de produção" de `necessidade.md` §6 | y |
| Sentry e UptimeRobot | Opcionais, como no LJS: o Sentry só liga com `SENTRY_DSN`, e o monitor é um passo do runbook | Custo zero e contas não criadas | y |
| Rate Limiting binding no plano Free | Disponível (PREMISSA da pesquisa de 2026-11-03), conferido no Design | O LJS já usa os 4 bindings em produção | n |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Ambiente local reproduzível ⭐ MVP

**User Story**: Como desenvolvedor, quero subir o app inteiro na minha máquina com comandos padrão, para desenvolver e testar sem depender da nuvem.

**Why P1**: Toda feature seguinte depende disso.

**Acceptance Criteria**:

1. The repositório SHALL ser um monorepo pnpm 11 com Node 24 (`engines` e `.nvmrc`), `type: module` e TypeScript estrito nos pacotes `backend/contrato`, `backend/dominio`, `backend/api`, `backend/scripts` e `frontend/web`. [FUN-01]
2. WHEN o desenvolvedor roda `pnpm lint`, `pnpm typecheck` ou `pnpm test` na raiz THEN o repositório SHALL executar o comando em todos os pacotes e sair com código 0 na base limpa. [FUN-02]
3. WHEN o desenvolvedor roda `docker compose up -d` THEN o compose SHALL subir só um Postgres 18 com `pgcrypto`, escutando apenas em `127.0.0.1`. [FUN-03]
4. WHEN o desenvolvedor roda `pnpm dev` THEN o repositório SHALL subir o `wrangler dev`, com o Hyperdrive apontando por `localConnectionString` para o Postgres local, e o Vite com proxy de `/api` para o Worker. [FUN-04]
5. WHEN o desenvolvedor roda `pnpm seed` num banco local migrado THEN o script SHALL criar dados de exemplo (uma conta, um grupo com vínculo de admin e jogadores) e SHALL recusar rodar se o host da URL do banco não for `localhost` ou `127.0.0.1`. [FUN-05]
6. The pacote `backend/dominio` SHALL não importar módulo de I/O (rede, banco, `node:fs`), e um teste SHALL falhar se algum import desses aparecer. [FUN-06]

**Independent Test**: num clone limpo, os comandos do README levam a `http://localhost:5173` mostrando o shell, e `GET /api/health` = 200.

---

### P1: Banco herdado com migrações, roles e RLS ⭐ MVP

**User Story**: Como dono do app, quero que a v2 suba sobre o banco que já está em produção sem alterá-lo, e que cada grupo só enxergue os próprios dados já no Postgres, para não perder dados e não depender só do código da API.

**Why P1**: É o maior risco do roteiro (AD-001). Todas as features escrevem nessas tabelas.

**Acceptance Criteria**:

1. The projeto SHALL gerenciar o schema com `node-pg-migrate`, uma migração por mudança, cada uma em transação. [FUN-07]
2. WHEN `pnpm migrar` roda num banco vazio THEN as migrações SHALL criar um schema idêntico ao da produção na main do LJS (`e557292`): tabelas, colunas, restrições, índices, triggers, funções, policies e grants. Um teste SHALL comparar a impressão digital do schema (`pg_dump --schema-only` normalizado) com o arquivo de referência versionado. [FUN-08]
3. WHEN `pnpm migrar` roda num banco que já tem o schema da produção THEN ele SHALL executar zero DDL, SHALL manter a contagem de linhas de toda tabela, e SHALL executar só as migrações criadas pela v2. [FUN-09]
4. IF o banco tem um schema que não é vazio nem igual ao da produção THEN `pnpm migrar` SHALL abortar sem alterar nada e listar as diferenças encontradas. [FUN-10]
5. The banco SHALL manter as roles herdadas: `pelada_owner` (DDL, usada só nas migrações), `pelada_app` (runtime, sem DDL, sem `TRUNCATE` e sem `BYPASSRLS`) e `pelada_backup_ro` (somente leitura). [FUN-11]
6. The banco SHALL ter RLS habilitada com `FORCE ROW LEVEL SECURITY` em toda tabela de negócio que contenha `grupo_id`, e um teste SHALL falhar se uma tabela com `grupo_id` não tiver. [FUN-12]
7. WHILE uma transação da role `pelada_app` tem o contexto de uma conta THEN o banco SHALL expor nas tabelas de negócio apenas linhas de grupos em que essa conta tem vínculo. [FUN-13]
8. WHILE uma transação da role `pelada_app` tem o contexto público de um slug e nenhuma conta THEN o banco SHALL expor só a leitura das linhas do grupo daquele slug e SHALL recusar qualquer escrita. [FUN-14]
9. IF uma transação da role `pelada_app` não define contexto de conta nem contexto público THEN o banco SHALL retornar zero linhas nas tabelas de negócio. [FUN-15]
10. WHEN a API atende uma requisição que toca o banco THEN ela SHALL abrir uma transação por requisição e definir o contexto com `SET LOCAL` antes de qualquer consulta. [FUN-16]
11. IF a conta B executa SELECT, INSERT, UPDATE ou DELETE sobre uma linha de um grupo da conta A THEN o banco SHALL não retornar a linha no SELECT e SHALL afetar zero linhas ou recusar a escrita nos demais. O teste é obrigatório por tabela de negócio e por comando, incluindo UPDATE e DELETE sem `WHERE`. [FUN-17]
12. The cache do Hyperdrive SHALL estar desligado para as consultas da aplicação. [FUN-18]
13. IF a URL do banco de teste aponta para um host que não é `localhost`, `127.0.0.1` ou o serviço Postgres do CI THEN a suíte SHALL abortar antes de conectar. [FUN-19]

**Independent Test**: no Postgres local e no CI, a suíte de isolamento cria dois grupos com contas diferentes e prova FUN-13 a FUN-17. Um dump da branch `dev` do Neon restaurado localmente e migrado mantém a contagem de linhas idêntica.

---

### P1: Prévia publicada ⭐ MVP

**User Story**: Como dono do app, quero a v2 publicada numa prévia desde a fundação, sem tocar a produção do LJS, para que cada feature já chegue ao ar pelo caminho de deploy definitivo.

**Why P1**: O caminho de deploy precisa existir e estar testado antes de a v2 assumir a produção.

**Acceptance Criteria**:

1. The Worker SHALL servir os assets de `frontend/web/dist` com `not_found_handling: single-page-application` e as rotas `/api/*` pelo Hono, com `run_worker_first: ["/api/*"]` e `nodejs_compat`. [FUN-20]
2. WHEN alguém faz `GET /api/health` THEN a API SHALL responder 200 com `{"status":"ok","versao":"<sha>"}` sem tocar o banco. [FUN-21]
3. The API SHALL responder toda rota `/api/*` com `Cache-Control: no-store` e `X-Content-Type-Options: nosniff`. [FUN-22]
4. The código e o banco SHALL não conter URL absoluta do app. A única fonte é a variável `URL_PUBLICA`, injetada no deploy, e um teste SHALL falhar se aparecer `ljssoftware.com.br` ou `workers.dev` fora da configuração permitida. [FUN-23]
5. WHERE `SENTRY_DSN` está configurado THEN o Worker (`@sentry/cloudflare`) e o front (`@sentry/react`) SHALL reportar erros com `release` igual ao SHA do commit, removendo do evento corpo, cookies, cabeçalho `Authorization` e e-mails. [FUN-24]
6. IF `SENTRY_DSN` não está configurado THEN o app SHALL funcionar normalmente, sem enviar nada a terceiros. [FUN-25]
7. The Worker SHALL declarar os bindings de rate limit `LIMITE_ENTRAR` (10/min), `LIMITE_PUBLICO` (60/min), `LIMITE_WEBHOOK` (60/min) e `LIMITE_ESCRITA` (60/min). [FUN-26]
8. The prévia SHALL ser o Worker `gestaodapelada-v2` em `workers.dev`, com uma configuração de Hyperdrive própria apontando para a branch `dev` do Neon. [FUN-27]
9. WHILE a v2 não assumiu a produção THEN o `deploy.yml` SHALL recusar qualquer alvo que não seja a prévia, sem tocar o Worker `gestaodapelada` nem a branch `main` do Neon. [FUN-28]
10. The assets estáticos SHALL incluir os cabeçalhos de segurança do LJS (CSP, `X-Content-Type-Options`, `Referrer-Policy`, HSTS), conferidos por um teste e2e contra o build, e a prévia SHALL responder só por HTTPS. [FUN-29]

**Independent Test**: depois do primeiro `deploy.yml`, `curl https://gestaodapelada-v2.<conta>.workers.dev/api/health` = 200 com o SHA publicado, e `/` mostra o shell.

---

### P1: Shell PWA com o layout do LJS ⭐ MVP

**User Story**: Como jogador ou organizador, quero que o app tenha a mesma cara do Gestão da Pelada atual e possa ser instalado no celular, para reconhecê-lo e abri-lo como aplicativo.

**Why P1**: A interface da v2 é a do LJS (decisão do usuário). Todas as telas seguintes se apoiam nesses componentes.

**Acceptance Criteria**:

1. The front SHALL usar `tokens.css`, fontes (Barlow e Barlow Condensed) e ícones idênticos byte a byte aos de `.specs/mockup/`, e um teste SHALL falhar se `frontend/web/src/estilos/tokens.css` ou algum desses arquivos divergir da cópia do mockup. [FUN-30]
2. The front SHALL ter os componentes base usados pelas telas da fundação, escritos do zero a partir do HTML e do CSS de `.specs/mockup/` (sem copiar código do `frontend/web` do LJS), cada um com teste de renderização e de acessibilidade (axe sem violações). [FUN-31]
3. The Stylelint SHALL recusar cor, fonte e sombra literais fora de `tokens.css`. [FUN-32]
4. The build SHALL gerar um manifest com nome "Gestão da Pelada", `display: standalone`, `lang: pt-BR` e ícones 192 e 512, um deles `maskable`. [FUN-33]
5. The service worker SHALL fazer precache do shell e registrar os handlers dos eventos `push` e `notificationclick`, vazios até a feature `notificacoes`. [FUN-34]
6. IF o usuário abre o app sem conexão numa rota fora do cache THEN o service worker SHALL mostrar a página offline no visual do mockup. [FUN-35]
7. WHEN o app é aberto no Safari do iOS fora do modo standalone THEN o front SHALL mostrar a instrução de instalação do mockup. [FUN-36]
8. WHEN o CI roda o teste de instalabilidade (Playwright contra o build) THEN ele SHALL confirmar o manifest válido (FUN-33), o service worker controlando a página, os ícones 192 e 512 acessíveis e a página offline servida sem rede. [FUN-37]
9. The comparação visual (limite de 1% de pixels, viewports de 1280×800 e 390×844) SHALL rodar no CI e falhar se uma tela ativa divergir de `.specs/mockup/telas.json`. Na fundação, as telas ativas são as 3 de vitrine do mockup (erro de rede, carregando em lista e grupo indisponível); a página provisória não é comparada. [FUN-38]

**Independent Test**: instalar o PWA a partir da prévia no Chrome do Android e no Safari do iOS, abrir sem rede e ver a página offline. A comparação visual e a instalabilidade ficam verdes no CI.

---

### P1: Repositório, CI e deploy seguros ⭐ MVP

**User Story**: Como dono do app, quero trocar a `main` do repositório pela v2 sem perder o LJS e quero que nada chegue ao ar sem passar pelos testes, para não quebrar o banco nem publicar código vermelho.

**Why P1**: Regra de testes do projeto. A troca da `main` mexe num repositório que já tem deploy e backup de produção.

**Acceptance Criteria**:

1. WHEN a `main` do repositório é trocada pela v2 THEN a branch `legado` SHALL existir antes no remoto, apontando para o commit da main do LJS (`e557292` ou o mais recente dela), e SHALL nunca ser apagada nem reescrita. [FUN-39]
2. WHEN há push ou PR THEN o `ci.yml` SHALL rodar lint, format, typecheck, testes, gitleaks, build do web, migrações do zero num Postgres 18 de serviço, impressão digital do schema (FUN-08), teste de isolamento, comparação visual e instalabilidade, e SHALL falhar se qualquer um falhar. [FUN-40]
3. The `deploy.yml` SHALL ser disparável só por `workflow_dispatch` na `main`, no environment `previa`, com `concurrency` sem cancelamento. [FUN-41]
4. WHEN o `deploy.yml` roda THEN ele SHALL executar, nesta ordem e parando no primeiro erro: (1) build do web; (2) branch de restauração da `dev` no Neon, mantendo só as 2 mais recentes; (3) dump cifrado da `dev`; (4) migração com a role `pelada_owner`; (5) `wrangler deploy` do Worker `gestaodapelada-v2` com `URL_PUBLICA`; (6) `GET /api/health` = 200 com o SHA publicado. [FUN-42]
5. IF o build do web falha THEN o `deploy.yml` SHALL parar antes de tocar o Neon ou o Worker. [FUN-43]
6. IF a migração falha THEN o `deploy.yml` SHALL não executar o `wrangler deploy`, e o runbook SHALL descrever como restaurar pela branch de restauração. [FUN-44]
7. The repositório SHALL ter `wrangler deploy` só no `deploy.yml`, e um teste SHALL falhar se aparecer em outro arquivo. [FUN-45]
8. The repositório SHALL não conter segredo versionado. O gitleaks roda no CI, e o `.env.example` lista cada variável com obrigatoriedade, formato e se é segredo. [FUN-46]

**Independent Test**: um PR com um teste quebrado fica vermelho. Um `deploy.yml` com erro de build injetado para no passo 1 sem criar branch no Neon. A branch `legado` no remoto aponta para a main do LJS.

---

### P1: Backup e restauração ⭐ MVP

**User Story**: Como dono do app, quero backup diário cifrado da produção sem interrupção na troca da `main`, e uma restauração testada, para recuperar os dados se algo der errado.

**Why P1**: Perder os dados é o risco principal (`necessidade.md` §5). O GitHub só agenda workflows da branch padrão, então o backup do LJS para quando a `main` vira a v2.

**Acceptance Criteria**:

1. The `backup.yml` da v2 SHALL rodar todo dia às 07:00 UTC e manualmente, fazendo `pg_dump -Fc` da branch `main` do Neon (produção) com a role `pelada_backup_ro`, cifrando com `age` (chave pública em secret) e guardando o artefato por 30 dias. [FUN-47]
2. WHEN o `backup.yml` da v2 chega à `main` THEN uma execução manual dele SHALL ser feita e o artefato conferido no mesmo dia. A `main` foi trocada antes de ele existir (AD-008, AD-011), então o backup agendado da produção fica parado até esse dia. [FUN-48]
3. IF o dump ou a cifragem falha THEN o `backup.yml` SHALL falhar visivelmente (job vermelho) e não publicar artefato parcial. [FUN-49]
4. The runbook SHALL ter o procedimento de restauração (baixar o artefato, decifrar com a chave privada guardada fora do GitHub, `pg_restore` no Postgres local a partir de um banco limpo), executado uma vez e registrado com data e contagem de linhas por tabela conferida contra a produção. [FUN-50]

**Independent Test**: rodar o `backup.yml` manualmente, restaurar o artefato num Postgres local recém-criado e conferir a contagem de linhas por tabela.

---

### P2: Documentação e contexto

**User Story**: Como dono do app, quero README, runbook e contexto para IA, para operar o projeto sem depender da memória.

**Why P2**: Não bloqueia o código, mas a validação da fase 7 e as features seguintes dependem disso.

**Acceptance Criteria**:

1. The README SHALL cobrir rodar local, variáveis, testes, deploy da prévia e backup. [FUN-51]
2. The `docs/runbook.md` SHALL cobrir deploy da prévia, falha de migração, restauração de backup, rotação de segredos, monitor do UptimeRobot e o passo de assumir a produção na paridade (desligar o Worker do LJS, dump cifrado e branch de restauração da `main` antes). [FUN-52]
3. The `CLAUDE.md` da raiz SHALL descrever o contexto do projeto (stack, comandos, onde ficam regras e artefatos). [FUN-53]
4. The `.specs/projeto/testes.json` SHALL ter o comando que roda a suíte de todos os pacotes, usado pela trava de testes. [FUN-54]

**Independent Test**: um agente sem contexto segue o README num worktree limpo e chega ao app rodando.

---

## Edge Cases

- IF o Postgres local não está de pé THEN `pnpm dev` e `pnpm migrar` SHALL falhar com uma mensagem que diz para rodar `docker compose up -d`. [FUN-55]
- IF uma migração nova não é aditiva (apaga coluna ou tabela, ou muda tipo) THEN o CI SHALL falhar, a menos que a migração declare a exceção com uma AD em `.specs/STATE.md`. [FUN-56]
- WHEN duas execuções do `deploy.yml` são disparadas juntas THEN a segunda SHALL esperar a primeira terminar, sem cancelá-la. [FUN-57]
- IF `URL_PUBLICA` não está definida no deploy THEN o `deploy.yml` SHALL falhar antes do `wrangler deploy`. [FUN-58]

---

## Implicit-requirement sweep

| Dimensão | Cobertura |
|---|---|
| Validação de entrada e limites | FUN-10 (schema divergente), FUN-19 (host do banco de teste), FUN-58. Payload de API: N/A because a fundação não expõe rota de negócio |
| Falha e falha parcial | FUN-43, FUN-44, FUN-49, FUN-55 |
| Idempotência e repetição | FUN-09 (migrar sobre a produção é reaplicável), FUN-57 |
| Fronteiras de auth e rate limit | FUN-13 a FUN-17, FUN-26, FUN-28 |
| Concorrência e ordem | FUN-42, FUN-57 |
| Ciclo de vida dos dados | FUN-47 (retenção de 30 dias), FUN-42 (2 branches de restauração), FUN-39 (branch `legado` preservada) |
| Observabilidade | FUN-21, FUN-24, FUN-52 (UptimeRobot) |
| Falha de dependência externa | FUN-25 (Sentry ausente), FUN-44 (Neon) |
| Integridade de transições de estado | N/A because a fundação não tem máquina de estados de negócio |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----------- | ------ | ------- |
| FUN-01 | P1: Ambiente local | Design | Pending |
| FUN-02 | P1: Ambiente local | Design | Pending |
| FUN-03 | P1: Ambiente local | Design | Pending |
| FUN-04 | P1: Ambiente local | Design | Pending |
| FUN-05 | P1: Ambiente local | Design | Pending |
| FUN-06 | P1: Ambiente local | Design | Pending |
| FUN-07 | P1: Banco | Design | Pending |
| FUN-08 | P1: Banco | Design | Pending |
| FUN-09 | P1: Banco | Design | Pending |
| FUN-10 | P1: Banco | Design | Pending |
| FUN-11 | P1: Banco | Design | Pending |
| FUN-12 | P1: Banco | Design | Pending |
| FUN-13 | P1: Banco | Design | Pending |
| FUN-14 | P1: Banco | Design | Pending |
| FUN-15 | P1: Banco | Design | Pending |
| FUN-16 | P1: Banco | Design | Pending |
| FUN-17 | P1: Banco | Design | Pending |
| FUN-18 | P1: Banco | Design | Pending |
| FUN-19 | P1: Banco | Design | Pending |
| FUN-20 | P1: Prévia | Design | Pending |
| FUN-21 | P1: Prévia | Design | Pending |
| FUN-22 | P1: Prévia | Design | Pending |
| FUN-23 | P1: Prévia | Design | Pending |
| FUN-24 | P1: Prévia | Design | Pending |
| FUN-25 | P1: Prévia | Design | Pending |
| FUN-26 | P1: Prévia | Design | Pending |
| FUN-27 | P1: Prévia | Design | Pending |
| FUN-28 | P1: Prévia | Design | Pending |
| FUN-29 | P1: Prévia | Design | Pending |
| FUN-30 | P1: Shell PWA | Design | Pending |
| FUN-31 | P1: Shell PWA | Design | Pending |
| FUN-32 | P1: Shell PWA | Design | Pending |
| FUN-33 | P1: Shell PWA | Design | Pending |
| FUN-34 | P1: Shell PWA | Design | Pending |
| FUN-35 | P1: Shell PWA | Design | Pending |
| FUN-36 | P1: Shell PWA | Design | Pending |
| FUN-37 | P1: Shell PWA | Design | Pending |
| FUN-38 | P1: Shell PWA | Design | Pending |
| FUN-39 | P1: Repositório, CI e deploy | Design | Pending |
| FUN-40 | P1: Repositório, CI e deploy | Design | Pending |
| FUN-41 | P1: Repositório, CI e deploy | Design | Pending |
| FUN-42 | P1: Repositório, CI e deploy | Design | Pending |
| FUN-43 | P1: Repositório, CI e deploy | Design | Pending |
| FUN-44 | P1: Repositório, CI e deploy | Design | Pending |
| FUN-45 | P1: Repositório, CI e deploy | Design | Pending |
| FUN-46 | P1: Repositório, CI e deploy | Design | Pending |
| FUN-47 | P1: Backup | Design | Pending |
| FUN-48 | P1: Backup | Design | Pending |
| FUN-49 | P1: Backup | Design | Pending |
| FUN-50 | P1: Backup | Design | Pending |
| FUN-51 | P2: Documentação | Design | Pending |
| FUN-52 | P2: Documentação | Design | Pending |
| FUN-53 | P2: Documentação | Design | Pending |
| FUN-54 | P2: Documentação | Design | Pending |
| FUN-55 | Edge Cases | Design | Pending |
| FUN-56 | Edge Cases | Design | Pending |
| FUN-57 | Edge Cases | Design | Pending |
| FUN-58 | Edge Cases | Design | Pending |

**Coverage:** 58 total, 0 mapped to tasks, 58 unmapped ⚠️ (mapeamento na fase Tasks)

---

## Success Criteria

- [ ] Clone limpo até o app rodando local seguindo só o README.
- [ ] `GET /api/health` da prévia = 200 com o SHA do último deploy.
- [ ] Suíte de isolamento verde no CI, com o teste negativo por tabela de negócio e por comando.
- [ ] Cópia da produção migrada com zero DDL e contagem de linhas idêntica.
- [ ] Branch `legado` no remoto e backup da produção sem dia de falha na troca da `main`.
- [ ] Restauração do backup executada a partir de banco limpo e registrada no runbook.
- [ ] Teste de instalabilidade e comparação visual sem divergência no CI.
