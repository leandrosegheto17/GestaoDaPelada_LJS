# STATE

## Decisions

### AD-001
- **Decision**: O MVP é dividido em 8 features, especificadas e construídas em sequência, cada uma com aprovação própria: `fundacao`, `conta-e-acesso`, `grupos-e-elenco`, `partidas-e-ranking`, `simulador`, `financeiro`, `planos-e-cobranca`, `notificacoes`. O design de `fundacao` é a arquitetura comum, e as features seguintes a seguem.
- **Reason**: O escopo, que soma as cerca de 70 regras do legado e o padrão LJS, numa spec única passaria do orçamento de contexto. Em sequência, o app fica utilizável e publicado a cada entrega.
- **Trade-off**: Mais ciclos de aprovação. Decisões transversais tomadas cedo, na `fundacao`, podem precisar de revisão nas features seguintes.
- **Scope**: projeto inteiro
- **Date**: 2026-10-24
- **Status**: active

### AD-002
- **Decision**: Reaproveitar o máximo do legado (`C:\Leandro\Projetos\GestaoDaPelada`). Infra, ferramentas, checagens, workflows, visual e código de aplicação que já servem são copiados. Testes do legado entram só quando provam um critério da spec nova, com a ligação registrada no `tasks.md`.
- **Reason**: Diretriz do usuário ("se a stack for a mesma pode reaproveitar o máximo possível"). A stack é a mesma.
- **Trade-off**: Junto com o código vêm a dívida e as convenções do legado. O verificador precisa conferir a ligação de cada teste copiado com um critério.
- **Scope**: projeto inteiro
- **Date**: 2026-10-24
- **Status**: active

### AD-003
- **Decision**: O schema é gerido pelo `node-pg-migrate`, a partir de uma linha de base que é a concatenação literal das 13 migrations do legado. Num banco no estado `legado` (verificado pelos 13 nomes em `migracoes_aplicadas` e pela impressão digital do schema), a linha de base é registrada com `--fake`. Cada migration roda na sua própria transação.
- **Reason**: D5, reaproveitar o banco Neon atual sem DDL e sem risco para os dados.
- **Trade-off**: As tabelas `migracoes_aplicadas` e `pgmigrations` convivem. A impressão digital precisa ser mantida.
- **Scope**: banco, `backend/scripts/migrar.ts`, CI e deploy
- **Date**: 2026-10-24
- **Status**: active

### AD-004
- **Decision**: O isolamento é feito pela RLS com `FORCE`, por `grupo_id`. O contexto vem de `set_config('app.conta_id' | 'app.slug_publico', …, true)` numa transação por requisição. A visibilidade é dada por `grupos_visiveis()` (`SECURITY DEFINER`). Escrita só com conta. O runtime usa a role `pelada_app` (`NOBYPASSRLS`).
- **Reason**: D1 e o padrão LJS. A função evita a recursão de policy em `vinculos_admin`.
- **Trade-off**: Depende de o contexto se manter pelo Hyperdrive (spike S1). Tabelas sem `grupo_id` precisam de RLS própria na `conta-e-acesso`.
- **Scope**: todas as features que acessam o banco
- **Date**: 2026-10-24
- **Status**: active

### AD-005
- **Decision**: A verificação do PWA é um teste de instalabilidade com Playwright (manifest, service worker, ícones, offline), em vez do "Lighthouse PWA ≥ 90" do padrão LJS. Não há Lighthouse no CI.
- **Reason**: A categoria PWA foi removida do Lighthouse. Decisão do usuário em 2026-10-24.
- **Trade-off**: Sem métrica automática de desempenho e acessibilidade da página. A acessibilidade continua coberta pelo axe nos testes de componente.
- **Scope**: projeto inteiro (a sugestão é estender aos três apps LJS)
- **Date**: 2026-10-24
- **Status**: active

### AD-006
- **Decision**: Os ADRs 001 a 023 do legado são copiados para `.md/adr/`, e os novos continuam a partir do 024, usando `Supersedes:` quando mudam um anterior.
- **Reason**: Preserva o histórico das decisões que continuam valendo (regras de negócio, PDF, datas e centavos, backup).
- **Trade-off**: Alguns ADRs copiados já nascem substituídos, como o 018 (pool de testes) e o 020 (host workers.dev).
- **Scope**: `.md/adr/`
- **Date**: 2026-10-24
- **Status**: active

### AD-007
- **Decision**: A sessão é resolvida numa transação curta própria (`sessao_tocar`), antes do `comBanco`. A transação da rota já abre com `app.conta_id`, e as leituras continuam `READ ONLY`.
- **Reason**: ADR-025 deixou em aberto que a busca da sessão acontece antes de existir conta. A renovação da inatividade (D7) precisa escrever, e o FUN-16 mantém GET e HEAD em `READ ONLY`.
- **Trade-off**: Duas idas ao banco por requisição autenticada. O custo de CPU é medido no deploy (G-12).
- **Scope**: API, todas as rotas com sessão
- **Date**: 2026-10-27
- **Status**: active

### AD-008
- **Decision**: Toda operação que acha uma conta sem sessão (entrar, cadastro, links, convites) passa por função `SECURITY DEFINER` com `search_path` fixo. O `pelada_app` só tem `EXECUTE` nelas e nunca lê a linha de outra conta nem um hash de senha.
- **Reason**: Escolha do usuário na fase 7 da `conta-e-acesso`. Mesmo padrão do `grupos_visiveis()`, com o isolamento no banco.
- **Trade-off**: Mais SQL nas migrations. O `crypt` sai do repositório de contas (G-02 alterado).
- **Scope**: banco e repositórios de conta
- **Date**: 2026-10-27
- **Status**: active

### AD-009
- **Decision**: O `@pelada/contrato` usa zod (`>= 4.6.6`, SEC-007) com schemas `.strict()`, e o snapshot de compatibilidade (G-20) nasce na `conta-e-acesso`.
- **Reason**: O legado usa zod e o web já consome o contrato. Um só lugar para limites e formas.
- **Trade-off**: Dependência nova em produção, no Worker e no web.
- **Scope**: contrato, API e web
- **Date**: 2026-10-27
- **Status**: active

### AD-010
- **Decision**: Tokens de link (confirmação, recuperação, convite) têm 32 bytes, vão no fragmento da URL (`#t=`) e chegam à API no corpo de um POST. O banco guarda só o SHA-256.
- **Reason**: O fragmento não vai ao servidor, a log de acesso nem ao `Referer`.
- **Trade-off**: O front precisa ler e apagar o fragmento. Links abertos sem JavaScript não funcionam.
- **Scope**: e-mails, API e web
- **Date**: 2026-10-27
- **Status**: active

## Handoff

## Retomada

- **Fluxo**: 1, Projeto novo para vender — skill `projeto-novo`. Entrou pela fase 6; as fases 1 a 5 foram substituídas por `.specs/produto/analise-legado.md` e `decisao.md`.
- **Item**: `.specs/features/fundacao/`, feature 1 de 8 (AD-001)
- **Fase aprovada**: 11, Lançamento (2026-10-26): a fase 10 (verificador rodada 3 PASS, `seguranca.md` sem crítico ou alto) e a 11 (entrada em `.specs/liberacao.md`, commit `9de5016`, suíte verde em `724fed2`) estão concluídas; ver o bullet "Fases 10 e 11" abaixo. Antes: 9, Construção de código (2026-10-25), e a etapa de integração da Entrega em 2026-10-26: checagem final verde, `feat/fundacao` mesclada na `main` (PR #1 e merge local, conflito só no `.gitignore`) e correção do G-18 mesclada pelo PR #2 (`fix/g18-deploy-yml`, HEAD da main `d50f81b`). Repositório GitHub passou a **público** (decisão do usuário, para liberar o Actions).
- **Fases 10 e 11 concluídas em 2026-10-26** (fundação liberada, `d50f81b` no ar). **Próximo passo**: a fundação está entregue; a fase 12 (Operação e aprendizado) ainda não tem peça, e o produto segue com a feature 2 de 8 (`conta-e-acesso`, AD-001), que começa na fase 6 (Specify) no `tlc-spec-driven`, modelo indicado: opus. Perguntar ao usuário qual dos dois. **Pendências**: (a) o commit `9de5016` (`liberacao.md`) está só local, falta o push, com confirmação; (b) o usuário apagar a branch Neon `spike-descartavel` e o Hyperdrive `spike-s1` (mantêm T1 e T2 abertos; depois a sessão apaga `.specs/spikes/.env` e `.specs/spikes/passo-a-passo-neon.md`); (c) conferir o primeiro backup agendado verde (run de 2026-10-27, cerca de 07:00Z); (d) sem monitor de uptime nem Sentry (runbook §7); (e) achado baixo L8: rota inexistente mostra a tela de erro padrão do React Router, tratar na feature de telas; (f) marcar T16 item 3 e T20 item 2 no `tasks.md` (provados pelo verificador, caixas ainda `[ ]`). Conferência manual do usuário: PWA instalou no Chrome desktop e no celular; `/vitrine/*` só existe com `VITE_VITRINE=1` (404 em produção é por desenho).
- **Fase 9 (histórico; a "próxima fase 10" abaixo já foi cumprida) concluída em 2026-10-26** (T1 a T49 prontas; ver o bullet "Entrega, runbook §1 cumprido" abaixo). **Próxima fase**: 10, Validação, em sessão nova: (1) o usuário abre `https://gestaodapelada.ljssoftware.com.br` e confere as telas de vitrine e a instalação do PWA (fecha o item manual de T20); (2) rodada 3 do agente `verificador` sobre `validation.md`, para fechar os 15 critérios FUN-NN que estavam "pendentes de entrega" (agora com evidência: deploy run 40370936469, backups 40365506581 e 40379156441, contagens idênticas antes e depois da migração, health 200); `seguranca.md` sem achado crítico ou alto em aberto; (3) depois, fase 11 com a skill `liberacao`, que cria `.specs/liberacao.md` (a T48 deixou esse registro para lá). Pendências: commitar e enviar (push, com confirmação e trava de testes) as edições locais de STATE.md, tasks.md e runbook.md e o commit `1644a44`; o usuário apagar a branch Neon `spike-descartavel` e o Hyperdrive `spike-s1`. Modelo indicado: sonnet
- **Construção** (se no meio): lotes 1 a 6 de 6 concluídos (T1 a T46 prontas; restam T47 a T49, ações externas); o tlc retoma pelo `tasks.md` e pelo git. Gate do fim do lote 6 rodado pela sessão: lint, format, typecheck, `pnpm test` (raiz 20, dominio 1, contrato 5, API 343, web 305), `test:checagens` 310, build do web e `checar-tokens.py` verdes. Commits anteriores: T1 `41127dc`, T2 `ac9b36c`, T3 `73f62b3`, T4 `a0594db`, T5 `89084f7`, T6 `c4edc68`, T7 `c9fc817`, T8 `d94ee39`, T9 `34a81ce`, T10 `af62d86`, T11 `2753114`, T12 `2bd10df`, T13 `6ca4772`, T14 `8e10c0c`, T15 `5100581`, T16 `4328cc4`, T17 `622e101`, T18 `4fae37e`, T19 `6427d67`, T20 `57c6a99`, T21 `a1b7a7c`, T22 `7420fc0`, T23 `7f286ba`, T24 `62967f3`, T25 `328b40f`, T26 `3dee951`, T27 `e368ae8`, T28 `79a23f0`, T29 `b9615e8`, T30 `f86835b`, T31 `5f7631e`, T32 `7a072ab`, T33 `b87e5d6`, T34 `43e0375`, T35 `767d9cb`, T36 `ce02fbb`, T37 `e523bdc`. Gate rodado pela sessão no fim do lote 5: lint, format, typecheck, `pnpm test` (raiz 20, dominio 1, contrato 5, API 343, web 305), `pnpm test:checagens` 175, build do web e `checar-tokens.py` verdes; e2e (11) e visual (6, maior diferença 0,65%) só relatados pelo agente. Gate rodado pela sessão no fim do lote 4 (lint, format, typecheck, `pnpm test`: raiz 20, API 343, contrato 5, dominio 1, web 224; `pnpm test:checagens` 175; build do web; `checar-tokens.py`): tudo verde. Desvios do lote 4 estão no `tasks.md` (Stylelint em `stylelint.config.mjs`; teste de tokens ignora CRLF; dependências mínimas de `limites`, moeda, datas e `recursos.ts`; `main.tsx` vazio só para o build, App, rotas e PWA vêm na Fase 6). O item de T20 sobre abrir `localhost:5173` à mão segue `[ ]`: conferir na Fase 6. Trabalho no worktree `C:\Leandro\Projetos\GestaoDaPelada_LJS\.worktrees\fundacao`, branch `feat/fundacao` (a `main` tem o commit inicial, as retomadas e o `.gitignore` do `.wrangler/`). Comandos do worker e do gate rodam dentro do worktree, nunca na raiz.
- **Combinado na conversa e não registrado em artefato**:
  - O usuário **aceitou** executar por subagentes, um lote por vez, e a Fase 9 (T47 a T49, ações externas) inline com confirmação a cada passo. Lote restante: F7+F8 (T38 a T46, `implementador`). O `verificador` roda sozinho depois da última tarefa de código.
  - **Ambiente local**: o usuário autorizou parar o container `gestaodapelada-db-1` (app legado, volume intacto; religar com `docker start`) para liberar a 5432. O container `fundacao-db-1` (compose do worktree, volume `fundacao_dados_db`) está na 5432, com o banco `pelada` migrado e semeado. O `.env` do worktree (ignorado pelo git) tem `DATABASE_URL`, `DATABASE_URL_TESTE`, `PELADA_APP_SENHA` e `PELADA_BACKUP_SENHA`. Não mexer nos outros containers (`controleemcasa_ljs-banco-1`, `evolucao-segura-postgres`, supabase etc.).
  - **Decisões do lote 2** (já aplicadas nos documentos): `auditoria` e `eventos_uso` têm `grupo_id`, então entram na RLS com `FORCE` e ficam sem grant até a `conta-e-acesso`; `sessoes` ganha `SELECT` e `DELETE` juntos na `conta-e-acesso`; o legado tem 13 migrations, não 15 (corrigido em design, tasks e AD-003). A API conecta direto como `pelada_app` (`NOLOGIN` na migration; a senha vem do seed no local e do runbook em produção); `SET LOCAL ROLE pelada_app` só nos testes.
  - **Resultado dos spikes** (`.specs/spikes/*/registro.md`) segue valendo: `neondb_owner` tem `bypassrls`, então a API nunca conecta como owner; T40 testa a contagem restaurada contra a origem, fixa o cliente `pg_dump` no PostgreSQL 16 e T43 e T49 criam as roles antes da restauração.
  - **Pendência do usuário (baixa dos spikes)**: apagar a branch Neon `spike-descartavel` (console do Neon) e o Hyperdrive `spike-s1` (painel do Cloudflare) e avisar na conversa. Depois a sessão apaga `.specs/spikes/.env` (ignorado pelo git) e `.specs/spikes/passo-a-passo-neon.md` (não commitado). Enquanto isso, o item 1 de T1 e o item 4 de T2 ficam abertos no `tasks.md`.
  - **O agente do lote 2 não teve o MCP `context7`**: T16, T19 e T30 pedem `context7`; se faltar de novo, o agente usa a documentação instalada no pacote e registra. FUN-53 só fecha quando `dev` (T20) usar o aviso de `exigir-banco`. `checar-migracao-aditiva` (FUN-54) não roda no CI desde T7. As variáveis do `.env` entram no `.env.example` em T41. A impressão digital do schema vem do Postgres 16: outra versão principal em produção faz o `migrar` abortar como `parcial`, sem alterar nada. O job `banco` do CI só roda no GitHub depois do push da T47.
  - O gate "build" só roda hoje o que existe; web build, e2e e visual entram nas Fases 5 e 6.
  - **Decisões do lote 3**: `LIMITE_WEBHOOK` fica em 60/min por IP, provisório (`[A ESCLARECER]` no `wrangler.jsonc`), revisado na feature de pagamentos. Sentry usa `cacheClient: false` (com cache só a primeira requisição do isolate enviava eventos; não confirmado em produção). Itens abertos: T16 item 3 (origem do Hyperdrive em `pelada_app` e cache desligado, conferência na T39) e T20 item 2 (`http://localhost:5173/` dá 404 até o front base, fase 5; `/api/health` deu 200 direto e pelo proxy). A `conta-e-acesso` precisa tratar que `comBanco` abre a transação na primeira consulta (a busca da sessão acontece antes de existir conta). O `context7` não esteve disponível de novo; o agente usou a documentação dos pacotes.
  - **Repositório GitHub já criado** em 2026-10-25 por pedido do usuário: https://github.com/leandrosegheto17/GestaoDaPelada_LJS (privado), com só a `main` enviada (a `feat/fundacao` continua local). Na T47 falta apenas enviar a `feat/fundacao`, com confirmação específica; o job `banco` do CI só roda depois disso.
  - T47 (criar repositório GitHub e push; o repositório já existe, ver acima) e T48 (remover Worker antigo, migrar produção, deploy) são ações externas: cada passo pede confirmação específica.
  - O usuário **não tem** conta no Sentry, no UptimeRobot nem no Asaas. A única conta pronta além de Cloudflare e Neon é a zona `ljssoftware.com.br` na Cloudflare.
  - **Pontos do lote 5 para o lote 6**: T38 (`ci.yml`) instala o Chromium (`playwright install chromium`) e roda o build antes do e2e (o e2e não gera o `dist`) e o visual usa a porta 4183 (`VISUAL_PORTA`); T39 (`deploy.yml`) passa `VITE_VERSAO=$GITHUB_SHA` no build do web (release do Sentry no front); T37 cobre os cabeçalhos só nos assets, e a API responde só `nosniff` (FUN-28 diz "respostas do domínio": CSP, Referrer-Policy e HSTS em `/api/*` ficam sem tarefa, decidir com o usuário); sem `FaixaNovaVersao`, o SW assume a versão nova sem aviso. O agente do lote 5 encerrou o PID 9148 (escutava na 8788, projeto desconhecido, possivelmente do `ci-prova-wt`); o e2e usa a 8798 e o visual a 4183. A 4173 e a 8788 pertencem a outros projetos: não mexer.
  - Ferramentas das tarefas: manter como no `tasks.md` (`context7` em T16, T19 e T30; skills `spike` e `mockup-visual`).
  - Pendências que não bloqueiam: plano do grupo de teste, texto do BK-0020, e se a refatoração `node24-dominio-proprio` do legado fica abandonada (premissa: sim).
  - **Decisões do lote 6**: FUN-28 reescrito para "assets" (API devolve JSON, só `nosniff` em `/api/*`), aplicado em spec, GUARDRAILS G-22 e THREAT-MODEL. Desvios aceitos no `tasks.md`: role de backup `pelada_backup` (spec citava `backup_ro`) e secret `NEON_URL_BACKUP`; cliente do dump fixo em `postgres:16`; health do deploy em `/api/health` com `--var VERSAO:<sha>`; `visual` do CI sem matriz de fatias; consolidado de `.md/` sem CTO-REVIEW, PLANO-COMERCIAL, UX-SPEC e `.md/.seguranca/` do legado. `backup.yml` roda sem `environment`: a T47 cria `NEON_URL_BACKUP` e `BACKUP_CHAVE` como secrets do repositório. O dump sai com `--no-privileges`: no ensaio da T49 conferir a contagem restaurada contra a origem (passo 6 da seção 4 do runbook) e a reaplicação dos grants por `1792843260000_roles.sql`. Worktree em `.worktrees/fundacao` (branch `feat/fundacao`, HEAD `a809954`); a `feat/fundacao` segue só local.
  - **Decisões do fechamento (2026-10-25)**: aceite da T42 achou o build do web faltando no README (corrigido). Usuário decidiu: criar o `AvisoInstalacao` (FUN-35), passar `VITE_SENTRY_DSN` ao build (FUN-23; secret no environment `producao`), ajustar FUN-37 na spec às 3 telas de vitrine, corrigir SEC-001/002/004/009/010/011, ratificar a mudança do caso aceito em `restaurar.test.ts` (ganhou `urlOrigem`, asserção igual), manter `docker-compose.yml` por tag, e não criar ruleset na `main` (sem colaboradores). Achados baixos abertos e registrados em `seguranca.md`: SEC-003, 005, 006, 007, 008. Antes do deploy: criar environments e segredos (inclui `VITE_SENTRY_DSN`); o `fundacao-db-1` está de pé na 5432.
  - **Entrega (2026-10-26)**: `trava-testes.py` agora usa o worktree em que o comando roda (push de branch em worktree). O merge local da branch na raiz da `main` segue bloqueado pelo hook (a extensão para o merge foi negada; a função `worktree_da_branch` ficou sem uso em `trava-testes.py`): mesclar pelo PR no GitHub. Lição: o CI roda os scripts de `backend/scripts/checagens/` sobre o repositório real, o que a suíte local não fazia; o teste `urls-dominio.test.mjs` agora cobre G-18. Pendências do usuário continuam: apagar a branch Neon `spike-descartavel` e o Hyperdrive `spike-s1`. Repositório público: `.md/THREAT-MODEL.md`, `GUARDRAILS.md` e `seguranca.md` estão expostos; `.specs/spikes/passo-a-passo-neon.md` está versionado (sem segredo).
  - **Configuração de secrets (2026-10-26, sessão seguinte)**: o usuário refez a parte de contas e secrets. O banco de produção é o projeto Neon `summer-butterfly-34620705` (Postgres 16, região SP, owner `neondb_owner`), o **mesmo que o app legado usa** (o usuário esclarece que trabalhou desde o início com o Neon antigo; o Hyperdrive existente já aponta para ele, não conferido). Nele foram criadas hoje as roles `pelada_app` e `pelada_backup`, com login e sem `bypassrls` (conferido por `pg_roles`; senhas só no gerenciador de senhas; os `GRANT`s vêm das migrations). Decisão: o app antigo deixa de existir e **não há migração de dados**; o app novo passa a usar esse banco (plano original do runbook: migrar o banco de produção no lugar, com dump antes). Par age gerado fora do repositório (identidade privada em `C:\Users\leand\age-pelada\`, cópia no gerenciador de senhas). Secrets cadastrados: `producao` com `BACKUP_CHAVE`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `NEON_API_KEY`, `NEON_PROJECT_ID`, `NEON_URL_MIGRACAO`; `backup` com `BACKUP_CHAVE` e `NEON_URL_BACKUP`; Repository secrets vazio; branch policy só `main` nos dois. **Falta só `VITE_SENTRY_DSN`**: adiado por decisão do usuário (sem conta no Sentry; o front roda sem ele, `observabilidade.ts:47`). Conferir na T48: a senha de `pelada_app` igual à da origem do Hyperdrive (runbook §1, item 3) e o dump antes de remover o Worker `pelada`. ControleEmCasa_LJS e EvolucaoSegura_LJS receberam a mesma configuração (environments `producao` e `backup`, chaves age próprias em `C:\Users\leand\age-controleemcasa\` e `age-evolucaosegura\`); ControleEmCasa sem `NEON_URL_MIGRACAO` por decisão do usuário; a próxima etapa trata só o GestaoDaPelada.
  - **Entrega, runbook §1 cumprido (2026-10-26, sessão seguinte)**: CI da `main` verde (`d50f81b`). Backup agendado das 14:01Z falhou por secrets vazios (rodou antes do cadastro); `backup.yml` disparado à mão deu sucesso (run 40365506581, artefato `backup-2026-10-26-40365506581`, 106.907 bytes), decifrado com a identidade em `age-pelada` e listado (20 tabelas do schema legado; dump decifrado apagado). Hyperdrive `e06363bd…` conferido e atualizado pelo usuário: origem `pelada_app` em `ep-solitary-snow-b6lcyvun…/neondb`, cache desligado, `modified_on` 2026-10-26T17:34Z (a primeira tentativa falhou por senha com caractere especial passando pelo `cmd.exe`). Worker antigo `pelada` **apagado** com confirmação do usuário (`wrangler delete`), ausência confirmada pela API. **Primeiro deploy feito** (`deploy.yml`, run 40370936469, verde em 1m46s, com confirmação do usuário; SHA publicado `d50f81b`): branch de restauração no Neon, dump pré-deploy, migração, cache do Hyperdrive desligado, deploy e saúde passaram; conferido de fora: `https://gestaodapelada.ljssoftware.com.br/api/health` 200 com a versão `d50f81b`, raiz 200 `text/html`, manifest 200. O commit local `1644a44` (retomada) ainda não foi enviado. **T49 feita (2026-10-26)**: novo `backup.yml` sobre o banco migrado (run 40379156441, artefato `backup-2026-10-26-40379156441`, 146.866 bytes), decifrado e restaurado pelo `pnpm restaurar` com `pg_restore` 16.15 (scoop `postgresql16`, `PG_RESTORE`) no banco local `pelada_restauracao` do `fundacao-db-1`, grants reaplicados por `1792843260000_roles.sql`; contagem das 21 tabelas contra a origem (owner) sem diferença (ex.: jogadores 57, partidas 231, presencas 6342, pgmigrations 3). Dump decifrado e banco de ensaio apagados. Falta: conferências manuais abertas (T20 item 2, T16 item 3), registrar T47 a T49 no `tasks.md`, entrada em `.specs/liberacao.md`, fase 10 final e liberação.
- **Gravada em**: 2026-10-26 (fim da fase 11, fundação liberada; histórico: após o merge da fundação na main e a criação dos environments); atualizada com a configuração de secrets e a decisão sobre o legado e, depois, com o backup, o Hyperdrive e a remoção do Worker `pelada`

## Modelo

| Data | Fluxo | Item | Fase | Indicado | Usado |
| --- | --- | --- | --- | --- | --- |
| 2026-10-27 | 1, projeto novo | `conta-e-acesso` | 8, Preparação | Sonnet | Opus (escolha do usuário: seguir na mesma sessão) |
| 2026-10-27 | 1, projeto novo | `conta-e-acesso` | 9, Construção | Sonnet | Opus (escolha do usuário: seguir na mesma sessão) |
