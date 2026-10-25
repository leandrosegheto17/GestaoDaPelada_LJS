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
- **Fase aprovada**: 9, Construção, lote 1 de 6 concluído e aprovado em 2026-10-24 (T1 a T8, Fases 1 e 2)
- **Próxima fase**: 9, Construção, lote 2 = Fase 3 (T9 a T15: migrations, roles, RLS, isolamento, seed, job de CI), agente `implementador-dominio` — modelo indicado: sonnet
- **Construção** (se no meio): lote 1 de 6 concluído; o tlc retoma pelo `tasks.md` e pelo git. Commits: T1 `41127dc`, T2 `ac9b36c`, T3 `73f62b3`, T4 `a0594db`, T5 `89084f7`, T6 `c4edc68`, T7 `c9fc817`, T8 `d94ee39`. Gate rodado pela sessão (lint, format, typecheck, `pnpm test`, `pnpm test:checagens` com 164 testes): tudo verde. Trabalho no worktree `C:\Leandro\Projetos\GestaoDaPelada_LJS\.worktrees\fundacao`, branch `feat/fundacao` (a `main` só tem o commit inicial e as retomadas). Comandos do worker e do gate rodam dentro do worktree, nunca na raiz.
- **Combinado na conversa e não registrado em artefato**:
  - O usuário **aceitou** executar por subagentes, um lote por vez, e a Fase 9 (T47 a T49, ações externas) inline com confirmação a cada passo. Lotes restantes: F3 (T9 a T15, `implementador-dominio`), F4 (T16 a T20, `implementador-dominio`), F5 (T21 a T28, `implementador`), F6 (T29 a T37, `implementador`), F7+F8 (T38 a T46, `implementador`). O `verificador` roda sozinho depois da última tarefa de código.
  - **Resultado dos spikes** (`.specs/spikes/*/registro.md`, ambos sim com ressalvas, código descartado em 2026-10-24) vira requisito nas tarefas: `neondb_owner` tem `bypassrls` e enxerga tudo mesmo com `FORCE`, então a API nunca conecta como owner (T11, T18, T13). T11 e T18 devem escolher uma forma só de aplicar a role sem bypass (`SET LOCAL ROLE pelada_app` dentro da transação foi a testada) e o teste de T18 cobre a escolhida. T12 cria a policy `USING (true)` para `pelada_backup` em toda tabela com `grupo_id`, porque sem ela o dump com `FORCE` sai vazio com exit 0. T40 testa a contagem restaurada contra a origem, fixa o cliente `pg_dump` na versão principal do servidor (PostgreSQL 16) e T43 e T49 criam as roles antes da restauração.
  - **Pendência do usuário (baixa dos spikes)**: apagar a branch Neon `spike-descartavel` (console do Neon) e o Hyperdrive `spike-s1` (painel do Cloudflare) e avisar na conversa. Depois a sessão apaga `.specs/spikes/.env` (ignorado pelo git; contém a URL da branch) e `.specs/spikes/passo-a-passo-neon.md` (não commitado). Enquanto isso, o item 1 de T1 e o item 4 de T2 ficam abertos no `tasks.md`.
  - O lote 2 precisa de Docker de pé e da imagem `postgres:16` (não estava baixada; a T6 não subiu o compose nem provou `pgcrypto`, o que a migration de T9 prova). Há outro projeto do usuário rodando containers e `wrangler dev` (porta 8788 e outras, `controleemcasa_ljs-banco-1` na 55432): não mexer. Se a 5432 estiver ocupada, parar e perguntar.
  - T1 a T8 deixaram dois desvios aprovados com o lote: `checar-urls-absolutas` também barra `ljssoftware.com.br` (FUN-22) e `backend/scripts/comum/exigir-banco.ts` cria o aviso "Rode `docker compose up -d`" (FUN-53 só completo quando `migrar` T10 e `dev` T20 o usarem).
  - O gate "build" só roda hoje o que existe; web build, e2e e visual entram nas Fases 5 e 6.
  - T47 (criar repositório GitHub e push) e T48 (remover Worker antigo, migrar produção, deploy) são ações externas: cada passo pede confirmação específica.
  - O usuário **não tem** conta no Sentry, no UptimeRobot nem no Asaas. A única conta pronta além de Cloudflare e Neon é a zona `ljssoftware.com.br` na Cloudflare.
  - Ferramentas das tarefas: manter como no `tasks.md` (`context7` em T9, T16, T19 e T30; skills `spike` e `mockup-visual`).
  - Pendências que não bloqueiam: plano do grupo de teste, texto do BK-0020, e se a refatoração `node24-dominio-proprio` do legado fica abandonada (premissa: sim).
- **Gravada em**: 2026-10-24 22:20
