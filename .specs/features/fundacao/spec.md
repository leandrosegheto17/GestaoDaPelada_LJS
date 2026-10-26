# Fundação — Especificação

> Feature 1 de 8 (AD-001). **Spec aprovada pelo usuário em 2026-10-24.** Entrada: `.specs/produto/decisao.md` (entrada do MVP) e `.specs/produto/analise-legado.md` (§8, D1 a D8). O design desta feature é a arquitetura comum do projeto.

## Problem Statement

O Gestão da Pelada vai ser recriado do zero no padrão LJS Software. Antes de qualquer regra de negócio, o projeto precisa de uma base que rode local e em produção com custo zero. Essa base tem que testar, publicar, fazer backup e restaurar de forma reproduzível, e isolar os dados por grupo já no banco. Ela também precisa reaproveitar o banco Neon atual (D5) e o layout do legado (100%). Sem isso, cada feature seguinte reinventaria infraestrutura e correria o risco de quebrar produção ou vazar dados entre grupos.

## Goals

- [ ] Do clone ao app rodando local com `pnpm install`, `docker compose up -d`, `pnpm migrar`, `pnpm seed` e `pnpm dev`, sem nenhum passo manual fora do README.
- [ ] `gestaodapelada.ljssoftware.com.br` publicado pelo `deploy.yml`, com `GET /api/health` respondendo 200 e o shell PWA com o visual do legado.
- [ ] Migrations aplicadas sobre o banco Neon atual sem perder o grupo de teste e aplicadas do zero no CI, com RLS forçada em toda tabela de negócio e o teste de isolamento passando.
- [ ] Backup diário cifrado rodando e uma restauração testada e documentada.

## Out of Scope

| Feature | Reason |
| ----------- | -------------- |
| Cadastro, login, sessão, recuperação, termos, exclusão de conta | Feature `conta-e-acesso` |
| Telas e rotas de grupos, jogadores, partidas, ranking, simulador e financeiro | Features 3 a 6. Aqui entram só as tabelas (linha de base) e a RLS |
| Landing com planos, Meu plano, Asaas | Feature `planos-e-cobranca`. Aqui `/` mostra uma página provisória |
| Envio de e-mail (Resend) e Web Push | Feature `notificacoes`. Aqui entram só os nomes das variáveis em `.env.example` |
| Ambiente de homologação | Padrão LJS: sem homologação; o preview é o `wrangler dev` local |
| Criar as contas de Sentry e UptimeRobot | Ação do usuário. O código funciona sem elas (FUN-23, FUN-25) |
| TWA e Play Store | Despriorizados no legado |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | --------------- | --------- | ---------- |
| Repositório | Repositório novo no GitHub (sugestão `leandrosegheto17/GestaoDaPelada_LJS`, privado). O legado fica intacto para consulta | Decisão do usuário | y |
| Pasta `.md/` | ADRs em `.md/adr/NNN-titulo.md` desde o início. PRD, PRD-TECNICO, SDD, GUARDRAILS e THREAT-MODEL são consolidados a partir de `.specs/` ao fim de cada feature | Decisão do usuário. `.specs/` é o trabalho, `.md/` é a documentação oficial | y |
| Banco | Mesmo projeto Neon e mesmo Hyperdrive do legado. Uma migration de linha de base equivale às 13 do legado; se o schema já existe, ela é registrada como aplicada sem executar DDL | Decisão do usuário (D5). O mecanismo exato fica no Design, com ADR | y |
| Worker antigo | Removido antes da primeira migration nova em produção, com confirmação específica do usuário, por passo do runbook | Decisão do usuário. O legado não tem usuários e compartilha o banco | y |
| Unidade de isolamento | `grupo_id`. A conta da sessão só enxerga grupos onde tem vínculo. O acesso público lê só o grupo do slug pedido | D1 | y |
| Rota de saúde | `GET /api/health`, como no padrão LJS (no legado era `/api/saude`) | O padrão LJS prevalece sobre o nome do legado | y |
| Página provisória em `/` | Página estática com o nome, o visual do legado e "Em breve", até a landing da feature 7 | Permite publicar e testar a instalabilidade já na fundação | y |
| Mockup de referência | O mockup do legado (`.md/mockup/`) é copiado para `.specs/mockup/` e passa a ser a referência visual do projeto | O usuário pediu layout 100% reaproveitado. O mockup bateu 48 de 48 na última comparação | y |
| Sentry e UptimeRobot | As contas ainda não existem. O código só ativa o Sentry com `SENTRY_DSN` presente; o monitor do UptimeRobot é um passo do runbook | O usuário não tem as contas; custo zero | y |
| Ritmo da discussão | Guided | Padrão do tlc | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Ambiente local reproduzível ⭐ MVP

**User Story**: Como desenvolvedor da LJS, quero subir o app inteiro na minha máquina com comandos padrão, para desenvolver e testar sem depender da nuvem.

**Why P1**: Toda feature seguinte depende disso.

**Acceptance Criteria**:

1. The repositório SHALL ser um monorepo pnpm 11 com Node 24 (`engines` e `.nvmrc`), `type: module` e TypeScript estrito nos pacotes `backend/contrato`, `backend/dominio`, `backend/api`, `backend/scripts` e `frontend/web`. [FUN-01]
2. WHEN o desenvolvedor roda `pnpm lint`, `pnpm typecheck` ou `pnpm test` na raiz THEN o repositório SHALL executar o comando em todos os pacotes e sair com código 0 na base limpa. [FUN-02]
3. WHEN o desenvolvedor roda `docker compose up -d` THEN o compose SHALL subir só um Postgres 16 com `pgcrypto` disponível. [FUN-03]
4. WHEN o desenvolvedor roda `pnpm dev` THEN o repositório SHALL subir o `wrangler dev`, com o Hyperdrive apontando por `localConnectionString` para o Postgres local, e o Vite com proxy de `/api` para o Worker. [FUN-04]
5. WHEN o desenvolvedor roda `pnpm seed` num banco local migrado THEN o script SHALL criar dados de exemplo (um grupo com jogadores, partidas e uma conta admin) e recusar rodar se a URL do banco não for local. [FUN-05]
6. The pacote `backend/dominio` SHALL não importar nenhum módulo de I/O (rede, banco, `node:fs`), e um teste SHALL falhar se algum import desses aparecer. [FUN-06]

**Independent Test**: num clone limpo, os comandos do README levam a `http://localhost:5173` mostrando o shell e `GET /api/health` = 200.

---

### P1: Banco reaproveitado com migrations, roles e RLS ⭐ MVP

**User Story**: Como dono da LJS, quero que o banco atual seja reaproveitado e que cada grupo só enxergue os próprios dados já no Postgres, para não perder dados e não depender só do código da API.

**Why P1**: D5 e o requisito de isolamento do padrão LJS. Todas as features escrevem nessas tabelas.

**Acceptance Criteria**:

1. The projeto SHALL gerenciar o schema com `node-pg-migrate`, uma migration por mudança, cada uma em transação. [FUN-07]
2. WHEN `pnpm migrar` roda num banco vazio THEN as migrations SHALL criar um schema equivalente ao das 13 migrations do legado (mesmas tabelas, colunas, restrições e triggers), seguido das migrations novas. [FUN-08]
3. WHEN `pnpm migrar` roda num banco que já tem o schema do legado THEN a linha de base SHALL ser registrada como aplicada sem executar DDL nem alterar dados, e só as migrations novas SHALL ser executadas. [FUN-09]
4. IF o banco tiver um schema parcial, que não é vazio nem igual ao legado, THEN `pnpm migrar` SHALL abortar sem alterar nada e informar as diferenças encontradas. [FUN-10]
5. The banco SHALL ter as roles `owner` (DDL, usada só nas migrations), `app` (runtime, sem DDL e sem `TRUNCATE`, com `DELETE` só nas tabelas em que apagar é regra) e `backup_ro` (somente leitura). [FUN-11]
6. The banco SHALL ter RLS habilitada com `FORCE ROW LEVEL SECURITY` em toda tabela de negócio que contenha `grupo_id`. [FUN-12]
7. WHILE uma transação da role `app` tem `app.conta_id` definido THEN o banco SHALL expor nas tabelas de negócio apenas linhas de grupos em que essa conta tem vínculo. [FUN-13]
8. WHILE uma transação da role `app` tem `app.slug_publico` definido e nenhuma conta THEN o banco SHALL expor apenas a leitura das linhas do grupo daquele slug e SHALL recusar qualquer escrita. [FUN-14]
9. IF uma transação da role `app` não define nem `app.conta_id` nem `app.slug_publico` THEN o banco SHALL retornar zero linhas nas tabelas de negócio. [FUN-15]
10. WHEN a API atende uma requisição que toca o banco THEN ela SHALL abrir uma transação por requisição e definir o contexto com `SET LOCAL` antes de qualquer consulta. [FUN-16]
11. IF a conta B tenta ler, inserir, alterar ou apagar uma linha de um grupo da conta A THEN o banco SHALL não retornar a linha na leitura e SHALL afetar zero linhas ou recusar a escrita (teste negativo obrigatório, por tabela de negócio). [FUN-17]
12. The cache do Hyperdrive SHALL estar desligado para as consultas da aplicação. [FUN-18]

**Independent Test**: no Postgres local e no CI, a suíte de isolamento cria dois grupos com contas diferentes e prova FUN-13 a FUN-17. Uma cópia do banco do legado migrada mantém o grupo de teste intacto (contagem de linhas igual antes e depois).

---

### P1: Esqueleto publicado no domínio ⭐ MVP

**User Story**: Como dono da LJS, quero o app publicado em `gestaodapelada.ljssoftware.com.br` desde a fundação, para que cada feature seguinte já chegue ao ar pelo caminho definitivo.

**Why P1**: A entrega de cada feature é publicar. O caminho de deploy precisa existir e ter sido testado antes.

**Acceptance Criteria**:

1. The Worker SHALL servir os assets de `frontend/web/dist` com `not_found_handling: single-page-application` e as rotas `/api/*` pelo Hono, com `run_worker_first: ["/api/*"]` e `nodejs_compat`. [FUN-19]
2. WHEN alguém faz `GET /api/health` THEN a API SHALL responder 200 com `{"status":"ok","versao":"<sha>"}` sem tocar o banco. [FUN-20]
3. The API SHALL responder toda rota `/api/*` com `Cache-Control: no-store`. [FUN-21]
4. The código e o banco SHALL não conter URL absoluta do app. A única fonte é a variável `URL_PUBLICA`, injetada no deploy, e um teste SHALL falhar se aparecer `ljssoftware.com.br` ou `workers.dev` fora da configuração permitida. [FUN-22]
5. WHERE `SENTRY_DSN` está configurado THEN o Worker (`@sentry/cloudflare`) e o front (`@sentry/react`) SHALL reportar erros com `release` igual ao SHA do commit, removendo do evento corpo, cookies, cabeçalho `Authorization` e e-mails. [FUN-23]
6. IF `SENTRY_DSN` não está configurado THEN o app SHALL funcionar normalmente, sem enviar nada a terceiros. [FUN-24]
7. The runbook SHALL descrever a criação do monitor do UptimeRobot em `GET /api/health`. [FUN-25]
8. The Worker SHALL declarar os bindings de rate limit `LIMITE_ENTRAR` (10/min), `LIMITE_PUBLICO` (60/min) e `LIMITE_WEBHOOK`. [FUN-26]
9. The Worker SHALL publicar a rota `gestaodapelada.ljssoftware.com.br` com `custom_domain: true`. [FUN-27]
10. Os assets estáticos servidos pelo domínio SHALL incluir os cabeçalhos de segurança do legado (CSP, `X-Content-Type-Options`, `Referrer-Policy`, HSTS), conferidos por um teste e2e contra o build; as respostas de `/api/*` (JSON) SHALL incluir `X-Content-Type-Options: nosniff`. [FUN-28]

**Independent Test**: depois do primeiro `deploy.yml`, `curl https://gestaodapelada.ljssoftware.com.br/api/health` = 200 com o SHA publicado, e a página `/` mostra o shell.

---

### P1: Shell PWA com o layout do legado ⭐ MVP

**User Story**: Como jogador ou organizador, quero que o app tenha a mesma cara do Gestão da Pelada atual e possa ser instalado no celular, para reconhecer o app e abri-lo como aplicativo.

**Why P1**: Layout 100% reaproveitado (diretriz do usuário). Todas as telas das features seguintes se apoiam nesses componentes.

**Acceptance Criteria**:

1. The front SHALL usar `tokens.css`, `global.css`, fontes (Barlow e Barlow Condensed) e ícones idênticos byte a byte aos do legado, e um teste SHALL falhar se `frontend/web/src/estilos/tokens.css` divergir de `.specs/mockup/tokens.css`. [FUN-29]
2. The front SHALL ter os componentes base do legado (`basicos/`, `barras/`, `campos/`, `escolhas/`, `dialogos/`, `listas/`) com o mesmo HTML e o mesmo CSS Module, cada um com teste de renderização e de acessibilidade (axe sem violações). [FUN-30]
3. The Stylelint SHALL recusar cor, fonte e sombra literais fora de `tokens.css`. [FUN-31]
4. The build SHALL gerar um manifest com nome "Gestão da Pelada", `display: standalone`, `lang: pt-BR` e ícones 192 e 512, um deles `maskable`. [FUN-32]
5. The service worker SHALL fazer precache do shell e tratar os eventos `push` e `notificationclick`. Os handlers ficam vazios até a feature `notificacoes`, mas registrados. [FUN-33]
6. IF o usuário abre o app sem conexão numa rota que não está em cache THEN o service worker SHALL mostrar a página offline, no visual do legado. [FUN-34]
7. WHEN o app é aberto no Safari do iOS fora do modo standalone THEN o front SHALL mostrar a instrução de instalação do legado (`pwa/instalacao.ts`). [FUN-35]
8. WHEN o CI roda o teste de instalabilidade (Playwright contra o build) THEN ele SHALL confirmar o manifest válido (FUN-32), o service worker ativo controlando a página, os ícones 192 e 512 (um `maskable`) acessíveis e a página offline servida sem rede. Isso substitui o "Lighthouse PWA ≥ 90" do padrão LJS, porque a categoria PWA saiu do Lighthouse (decisão do usuário em 2026-10-24, AD-005). [FUN-36]
9. The comparação visual (porta do `comparar-visual` do legado, limite de 1% de pixels, viewports de 1280×800 e 390×844) SHALL rodar no CI e falhar se uma tela ativa divergir de `.specs/mockup/telas.json`. Na fundação, a lista de telas ativas cobre as 3 telas de vitrine do mockup (erro de rede, carregando em lista e grupo indisponível); a página provisória não é comparada. [FUN-37]

**Independent Test**: instalar o PWA a partir do build local no Chrome do Android e no Safari do iOS, abrir sem rede e ver a página offline. A comparação visual e a instalabilidade ficam verdes no CI.

---

### P1: CI e deploy seguros ⭐ MVP

**User Story**: Como dono da LJS, quero que nada chegue à produção sem passar por testes e que o deploy siga sempre a mesma ordem segura, para não quebrar o banco nem publicar código vermelho.

**Why P1**: Padrão LJS. Pela regra do projeto, a suíte verde é condição para integrar e publicar.

**Acceptance Criteria**:

1. WHEN há push ou PR THEN o `ci.yml` SHALL rodar lint, typecheck, testes, gitleaks, build do web, migrations do zero num Postgres de serviço, teste de isolamento, comparação visual e instalabilidade, e SHALL falhar se qualquer um falhar. [FUN-38]
2. The `deploy.yml` SHALL ser disparável só por `workflow_dispatch` na `main`, no environment `producao`, com `concurrency` sem cancelamento. [FUN-39]
3. WHEN o `deploy.yml` roda THEN ele SHALL executar, nesta ordem e parando no primeiro erro: (1) build do web; (2) branch de restauração no Neon, mantendo só as 2 mais recentes; (3) dump cifrado; (4) migração com `NEON_URL_MIGRACAO` (role `owner`); (5) `wrangler deploy --var URL_PUBLICA:<url>`; (6) `GET /api/health` = 200 com o SHA publicado. [FUN-40]
4. IF o build do web falha THEN o `deploy.yml` SHALL parar antes de tocar o Neon ou o Worker. [FUN-41]
5. IF a migração falha THEN o `deploy.yml` SHALL não executar o `wrangler deploy`, e o runbook SHALL descrever como restaurar pela branch de restauração. [FUN-42]
6. The repositório SHALL ter `wrangler deploy` em um único lugar (o `deploy.yml`), e um teste SHALL falhar se aparecer em outro arquivo. [FUN-43]
7. The repositório SHALL não conter segredo versionado. O gitleaks roda no CI, e o `.env.example` lista cada variável com obrigatoriedade, formato e se é segredo. [FUN-44]
8. WHEN o primeiro deploy do app novo vai migrar o banco de produção THEN o runbook SHALL exigir antes a remoção confirmada do Worker antigo `pelada` e um dump cifrado do banco. [FUN-45]

**Independent Test**: um PR com um teste quebrado fica vermelho. Um `deploy.yml` com um erro de build injetado para no passo 1 sem criar branch no Neon.

---

### P1: Backup e restauração ⭐ MVP

**User Story**: Como dono da LJS, quero backup diário cifrado e uma restauração testada, para recuperar os dados se algo der errado.

**Why P1**: Perder dados é o risco principal. Padrão LJS.

**Acceptance Criteria**:

1. The `backup.yml` SHALL rodar todo dia às 04:00 de Brasília (07:00 UTC) e manualmente, fazendo `pg_dump -Fc` com a role `backup_ro`, cifrando com `age` (chave pública em secret) e guardando o artefato por 30 dias. [FUN-46]
2. IF o dump ou a cifragem falha THEN o `backup.yml` SHALL falhar visivelmente (job vermelho) e não publicar artefato parcial. [FUN-47]
3. The runbook SHALL ter o procedimento de restauração (baixar o artefato, decifrar com a chave privada guardada fora do GitHub, `pg_restore` numa branch Neon nova ou no Postgres local), executado uma vez e registrado com data e contagem de linhas conferida. [FUN-48]

**Independent Test**: rodar o `backup.yml` manualmente, restaurar o artefato no Postgres local e conferir a contagem de linhas por tabela contra a produção.

---

### P2: Documentação e decisões

**User Story**: Como dono da LJS, quero README, runbook e a pasta `.md/` no padrão, para que qualquer pessoa (ou IA) opere o projeto sem depender da memória.

**Why P2**: Não bloqueia o código, mas o padrão exige.

**Acceptance Criteria**:

1. The README SHALL cobrir rodar local, variáveis, deploy e testes. [FUN-49]
2. The `docs/runbook.md` SHALL cobrir deploy, falha de migração, restauração de backup, rotação de segredos e remoção do Worker antigo. Os itens de webhook, pagamento e reativação entram nas features seguintes. [FUN-50]
3. The `.md/adr/` SHALL ter um ADR por decisão de arquitetura da fundação, com `Supersedes:` quando substituir outro. [FUN-51]
4. The `CLAUDE.md` da raiz SHALL descrever o contexto do projeto (stack, comandos, onde ficam regras e artefatos). [FUN-52]

**Independent Test**: um agente sem contexto segue o README num worktree limpo e chega ao app rodando.

---

## Edge Cases

- IF o Postgres local não está de pé THEN `pnpm dev` e `pnpm migrar` SHALL falhar com uma mensagem que diz para rodar `docker compose up -d`. [FUN-53]
- IF uma migration nova não é aditiva (apaga coluna ou tabela com dados) THEN o CI SHALL falhar, a menos que a migration declare a exceção com um ADR. [FUN-54]
- WHEN duas execuções do `deploy.yml` são disparadas juntas THEN a segunda SHALL esperar a primeira terminar, sem cancelá-la. [FUN-55]
- IF `URL_PUBLICA` não está definida no deploy THEN o `deploy.yml` SHALL falhar antes do `wrangler deploy`. [FUN-56]

---

## Implicit-requirement sweep

| Dimensão | Cobertura |
|---|---|
| Validação de entrada e limites | FUN-10 (schema parcial), FUN-56. Validação de payload de API: N/A because a fundação não expõe rota de negócio |
| Falha e falha parcial | FUN-41, FUN-42, FUN-47, FUN-53 |
| Idempotência e repetição | FUN-09 (linha de base reaplicável), FUN-55 |
| Fronteiras de auth e rate limit | FUN-13 a FUN-17, FUN-26 |
| Concorrência e ordem | FUN-40, FUN-55 |
| Ciclo de vida dos dados | FUN-46 (retenção de 30 dias), FUN-40 (2 branches de restauração) |
| Observabilidade | FUN-20, FUN-23, FUN-25 |
| Falha de dependência externa | FUN-24 (Sentry ausente), FUN-42 (Neon) |
| Integridade de transições de estado | N/A because a fundação não tem máquina de estados de negócio |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----------- | ------ | ------- |
| FUN-01 | P1: Ambiente local | Design | Implementing |
| FUN-02 | P1: Ambiente local | Design | Implementing |
| FUN-03 | P1: Ambiente local | Design | Implementing |
| FUN-04 | P1: Ambiente local | Design | Implementing |
| FUN-05 | P1: Ambiente local | Design | Implementing |
| FUN-06 | P1: Ambiente local | Design | Implementing |
| FUN-07 | P1: Banco | Design | Implementing |
| FUN-08 | P1: Banco | Design | Implementing |
| FUN-09 | P1: Banco | Design | Implementing |
| FUN-10 | P1: Banco | Design | Implementing |
| FUN-11 | P1: Banco | Design | Implementing |
| FUN-12 | P1: Banco | Design | Implementing |
| FUN-13 | P1: Banco | Design | Implementing |
| FUN-14 | P1: Banco | Design | Implementing |
| FUN-15 | P1: Banco | Design | Implementing |
| FUN-16 | P1: Banco | Design | Implementing |
| FUN-17 | P1: Banco | Design | Implementing |
| FUN-18 | P1: Banco | Design | Implementing |
| FUN-19 | P1: Esqueleto publicado | Design | Implementing |
| FUN-20 | P1: Esqueleto publicado | Design | Implementing |
| FUN-21 | P1: Esqueleto publicado | Design | Implementing |
| FUN-22 | P1: Esqueleto publicado | Design | Implementing |
| FUN-23 | P1: Esqueleto publicado | Design | Implementing |
| FUN-24 | P1: Esqueleto publicado | Design | Implementing |
| FUN-25 | P1: Esqueleto publicado | Design | Pending |
| FUN-26 | P1: Esqueleto publicado | Design | Implementing |
| FUN-27 | P1: Esqueleto publicado | Design | Implementing |
| FUN-28 | P1: Esqueleto publicado | Design | Pending |
| FUN-29 | P1: Shell PWA | Design | Pending |
| FUN-30 | P1: Shell PWA | Design | Pending |
| FUN-31 | P1: Shell PWA | Design | Pending |
| FUN-32 | P1: Shell PWA | Design | Pending |
| FUN-33 | P1: Shell PWA | Design | Pending |
| FUN-34 | P1: Shell PWA | Design | Pending |
| FUN-35 | P1: Shell PWA | Design | Pending |
| FUN-36 | P1: Shell PWA | Design | Pending |
| FUN-37 | P1: Shell PWA | Design | Pending |
| FUN-38 | P1: CI e deploy | Design | Implementing |
| FUN-39 | P1: CI e deploy | Design | Pending |
| FUN-40 | P1: CI e deploy | Design | Pending |
| FUN-41 | P1: CI e deploy | Design | Pending |
| FUN-42 | P1: CI e deploy | Design | Pending |
| FUN-43 | P1: CI e deploy | Design | Implementing |
| FUN-44 | P1: CI e deploy | Design | Implementing |
| FUN-45 | P1: CI e deploy | Design | Pending |
| FUN-46 | P1: Backup | Design | Pending |
| FUN-47 | P1: Backup | Design | Pending |
| FUN-48 | P1: Backup | Design | Pending |
| FUN-49 | P2: Documentação | Design | Pending |
| FUN-50 | P2: Documentação | Design | Pending |
| FUN-51 | P2: Documentação | Design | Implementing |
| FUN-52 | P2: Documentação | Design | Pending |
| FUN-53 | Edge Cases | Design | Implementing |
| FUN-54 | Edge Cases | Design | Implementing |
| FUN-55 | Edge Cases | Design | Pending |
| FUN-56 | Edge Cases | Design | Pending |

**Coverage:** 56 total, 0 mapped to tasks, 56 unmapped ⚠️ (mapeamento na fase Tasks)

---

## Success Criteria

- [ ] Clone limpo até o app rodando local seguindo só o README.
- [ ] `https://gestaodapelada.ljssoftware.com.br/api/health` = 200 com o SHA do último deploy.
- [ ] Suíte de isolamento verde no CI, com o teste negativo para cada tabela de negócio.
- [ ] Banco de produção migrado com a contagem de linhas do grupo de teste idêntica antes e depois.
- [ ] Restauração do backup executada e registrada no runbook.
- [ ] Teste de instalabilidade e comparação visual sem divergência no CI.
