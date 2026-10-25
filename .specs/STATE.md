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

## Handoff

## Retomada

- **Fluxo**: 1, Projeto novo para vender — skill `projeto-novo`. Entrou pela fase 6; as fases 1 a 5 foram substituídas por `.specs/produto/analise-legado.md` e `decisao.md`.
- **Item**: `.specs/features/fundacao/`, feature 1 de 8 (AD-001)
- **Fase aprovada**: 9, Construção, lote 4 concluído e aprovado em 2026-10-25 (T21 a T28, Fase 5)
- **Próxima fase**: 9, Construção, lote 5 = Fase 6 (T29 a T37: shell PWA e verificações do front), agente `implementador` — modelo indicado: sonnet
- **Construção** (se no meio): lotes 1 a 4 de 6 concluídos (restam F6, F7+F8 e T47 a T49); o tlc retoma pelo `tasks.md` e pelo git. Commits: T1 `41127dc`, T2 `ac9b36c`, T3 `73f62b3`, T4 `a0594db`, T5 `89084f7`, T6 `c4edc68`, T7 `c9fc817`, T8 `d94ee39`, T9 `34a81ce`, T10 `af62d86`, T11 `2753114`, T12 `2bd10df`, T13 `6ca4772`, T14 `8e10c0c`, T15 `5100581`, T16 `4328cc4`, T17 `622e101`, T18 `4fae37e`, T19 `6427d67`, T20 `57c6a99`, T21 `a1b7a7c`, T22 `7420fc0`, T23 `7f286ba`, T24 `62967f3`, T25 `328b40f`, T26 `3dee951`, T27 `e368ae8`, T28 `79a23f0`. Gate rodado pela sessão no fim do lote 4 (lint, format, typecheck, `pnpm test`: raiz 20, API 343, contrato 5, dominio 1, web 224; `pnpm test:checagens` 175; build do web; `checar-tokens.py`): tudo verde. Desvios do lote 4 estão no `tasks.md` (Stylelint em `stylelint.config.mjs`; teste de tokens ignora CRLF; dependências mínimas de `limites`, moeda, datas e `recursos.ts`; `main.tsx` vazio só para o build, App, rotas e PWA vêm na Fase 6). O item de T20 sobre abrir `localhost:5173` à mão segue `[ ]`: conferir na Fase 6. Trabalho no worktree `C:\Leandro\Projetos\GestaoDaPelada_LJS\.worktrees\fundacao`, branch `feat/fundacao` (a `main` tem o commit inicial, as retomadas e o `.gitignore` do `.wrangler/`). Comandos do worker e do gate rodam dentro do worktree, nunca na raiz.
- **Combinado na conversa e não registrado em artefato**:
  - O usuário **aceitou** executar por subagentes, um lote por vez, e a Fase 9 (T47 a T49, ações externas) inline com confirmação a cada passo. Lotes restantes: F6 (T29 a T37, `implementador`), F7+F8 (T38 a T46, `implementador`). O `verificador` roda sozinho depois da última tarefa de código.
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
  - Ferramentas das tarefas: manter como no `tasks.md` (`context7` em T16, T19 e T30; skills `spike` e `mockup-visual`).
  - Pendências que não bloqueiam: plano do grupo de teste, texto do BK-0020, e se a refatoração `node24-dominio-proprio` do legado fica abandonada (premissa: sim).
- **Gravada em**: 2026-10-25
