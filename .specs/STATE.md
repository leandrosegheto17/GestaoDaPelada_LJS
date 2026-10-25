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
- **Decision**: O schema é gerido pelo `node-pg-migrate`, a partir de uma linha de base que é a concatenação literal das 15 migrations do legado. Num banco no estado `legado` (verificado pelos 15 nomes em `migracoes_aplicadas` e pela impressão digital do schema), a linha de base é registrada com `--fake`. Cada migration roda na sua própria transação.
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
- **Fase aprovada**: 8, Preparação (`tasks.md` da fundação aprovado: 49 tarefas em 9 fases, matriz de testes e comandos de gate; `validate_tasks.py` com 0 erros) em 2026-10-24
- **Próxima fase**: 9, Construção (`tlc-spec-driven`, Execute, isolado por `using-git-worktrees`) — modelo indicado: sonnet
- **Construção** (se no meio): preparada, mas nenhum lote despachado e nenhuma tarefa concluída. Isolamento pronto: commit inicial `275f44a` na `main` (a branch padrão era `master` e foi renomeada) e worktree `.worktrees/fundacao` na branch `feat/fundacao` (`.worktrees/`, `.env` e `.specs/spikes/*/codigo/` estão no `.gitignore`). A sessão nova deve trabalhar a partir do worktree.
- **Combinado na conversa e não registrado em artefato**:
  - O usuário **aceitou** executar por subagentes, um lote por vez, e a Fase 9 (T47 a T49, ações externas) inline com confirmação a cada passo. Lotes: F1+F2 (T1 a T8, `implementador`), F3 (T9 a T15, `implementador-dominio`), F4 (T16 a T20, `implementador-dominio`), F5 (T21 a T28, `implementador`), F6 (T29 a T37, `implementador`), F7+F8 (T38 a T46, `implementador`). Verificador (`verificador`) roda sozinho depois da última tarefa.
  - **Bloqueio atual (T1 e T2, spikes S1 e S2):** o Hyperdrive `spike-s1` já foi criado pelo usuário (ID gravado em `.specs/spikes/.env`, `HYPERDRIVE_ID`). **Falta** a URL direta da branch Neon descartável `spike-descartavel` (`NEON_BRANCH_URL_DIRETA`, linha comentada no `.env`); sem ela o Hyperdrive não aponta para nenhuma branch confirmada. O passo a passo está em `.specs/spikes/passo-a-passo-neon.md` no worktree (arquivo não commitado). O acesso vai em `.specs/spikes/.env` (chaves `NEON_BRANCH_URL_DIRETA` e `HYPERDRIVE_ID`, ignorado pelo git; não colar URL no chat). Confirmar as chaves sem mostrar os valores antes de despachar o lote 1.
  - O `wrangler hyperdrive create` falhou porque o login OAuth atual do `wrangler` não tem permissão de Hyperdrive (`wrangler whoami` não lista). Caminho recomendado: criar o Hyperdrive pelo painel do Cloudflare (cache desligado) e copiar o ID. Alternativa: token com Account > Hyperdrive > Edit. Publicar Worker de teste e apagar a branch e o Hyperdrive no fim pedem confirmação específica.
  - Opção aberta se o acesso demorar: fazer T3 a T8 antes dos spikes (não dependem de Neon), mas os spikes continuam obrigatórios antes da F3 (T12). Muda a ordem do `tasks.md`; registrar aqui se for adotada.
  - O legado (`C:\Leandro\Projetos\GestaoDaPelada`) não tem `.env` com valores (só `.env.example`); a produção não é usada nos spikes.
  - As tarefas T1 e T2 são os spikes S1 e S2, numa branch Neon descartável. Criar a branch exige confirmação específica do usuário.
  - T47 (criar repositório GitHub e push) e T48 (remover Worker antigo, migrar produção, deploy) são ações externas: cada passo pede confirmação específica.
  - O usuário **não tem** conta no Sentry, no UptimeRobot nem no Asaas. A única conta pronta além de Cloudflare e Neon é a zona `ljssoftware.com.br` na Cloudflare.
  - Ferramentas das tarefas: manter como no `tasks.md` (`context7` em T9, T16, T19 e T30; skills `spike` e `mockup-visual`).
  - Pendências que não bloqueiam: plano do grupo de teste, texto do BK-0020, e se a refatoração `node24-dominio-proprio` do legado fica abandonada (premissa: sim).
- **Gravada em**: 2026-10-24
