# STATE

## Decisions

- **AD-001** (2026-11-03): roteiro em 8 features, na mesma quebra e ordem do `GestaoDaPelada_LJS`: fundacao → conta-e-acesso → grupos-e-elenco → partidas-e-ranking → simulador → financeiro → planos-e-cobranca → notificacoes (`.specs/projeto/roadmap.md`). Cada uma é uma fatia vertical que se valida e libera sozinha. A fundação vem primeiro porque concentra o maior risco: subir sobre o schema atual do banco compartilhado como linha de base. Conta, grupos e partidas destravam o resto. Simulador e financeiro vêm depois do ranking (o simulador depende dele). Cobrança e notificações ficam por último, porque dependem das features pagas. **Descartadas**: (a) uma feature única com o produto inteiro, sem aprovação no meio (anti-padrão "Geral"); (b) adiantar o simulador para medir cedo o CPU de 10 ms, descartada porque ele depende do ranking. A medição entra como spike na fundação, se o desenho achar necessário.
- **AD-002** (2026-11-03): reuso **do zero total**. Do `GestaoDaPelada_LJS` só se copiam, sem alteração, as 23 migrações (AD-003) e os ativos de `.specs/mockup/` (tokens, fontes, ícones). Componentes, API, scripts, workflows e testes são escritos a partir das specs e do mockup, e o LJS é só consulta. Decisão do usuário. Descartadas: reuso dirigido e reuso máximo (que transformaria a v2 num fork do LJS).
- **AD-003** (2026-11-03): as 23 migrações da main do LJS (`e557292`) são copiadas com o mesmo nome. O controle é a `pgmigrations` do `node-pg-migrate`, com `checkOrder`, sem `--fake`. Na produção, `migrar` executa zero DDL. Migrações novas da v2 têm timestamp maior que `1792844520000`. Descartada: linha de base única, que exigiria reescrever a `pgmigrations` da produção.
- **AD-004** (2026-11-03): até a paridade (fim da `grupos-e-elenco`), o único alvo publicado é a prévia `gestaodapelada-v2` (workers.dev) sobre a branch `dev` do Neon. O `deploy.yml` recusa outro alvo. A troca para o domínio e para a `main` do Neon é um passo do runbook, com confirmação. Decisão do usuário.
- **AD-005** (2026-11-03): o repositório é o mesmo `GestaoDaPelada_LJS`. A main atual vai para a branch `legado` (nunca apagada), e a `main` passa a ser a v2 por push com `--force-with-lease` e confirmação específica. O `backup.yml` da v2 vai no mesmo push. Decisão do usuário.
- **AD-006** (2026-11-03): a documentação segue o fluxo do Rascunho. Decisões em AD-NNN neste arquivo, ADR em `.specs/decisoes/` para o que é difícil de desfazer, e README, `docs/runbook.md` e `CLAUDE.md` da raiz. Sem `.md/`, PRD, SDD nem THREAT-MODEL consolidados. Decisão do usuário.
- **AD-007** (2026-11-03): a página offline e a página provisória usam a casca de `t03-indisponivel--erro` do mockup, com texto próprio, porque o mockup não tem tela offline.
- **AD-008** (2026-11-03): a `main` do repo foi trocada pela v2 **antes** do `backup.yml` da v2 existir, por decisão do usuário. Isso substitui, só no momento da troca, a ordem da AD-005 e de FUN-48. Consequência aceita: o backup diário agendado da produção (o `backup.yml` do LJS, que só roda na branch padrão) fica parado até o `backup.yml` da v2 chegar à `main`. O último backup é o do LJS antes da troca. A branch `legado` (= `e557292`) foi criada pelo usuário e conferida por `git ls-remote` antes do push. Mitigação: a tarefa do `backup.yml` sobe de prioridade na fundação, e FUN-48 passa a exigir a primeira execução manual no dia em que ele chegar à `main`.
- **AD-009** (2026-11-03): roles no ambiente local e no CI. As migrações rodam como o superusuário `postgres`, que passa a ser o dono das tabelas. `pelada_owner` não é criada por nenhuma das 23 migrações e só existe no Neon, então é conferida apenas na paridade com a `dev`. FUN-11 é provada em `pelada_app` e `pelada_backup_ro`. O `seed` roda como a role de migração e define `LOGIN PASSWORD` das duas roles a partir do `.env`.
- **AD-010** (2026-11-03): o dump pré-deploy da `dev` usa `pelada_backup_ro` (secret `NEON_URL_DEV_BACKUP`), não a role de migração, porque a `FORCE` RLS deixa o dump vazio para quem não tem a policy `USING (true)` (spike S2 do LJS). Corrige o design C7, que usava a URL de migração.
- **AD-011** (2026-11-03): FUN-48 reescrito. Pede a primeira execução manual do `backup.yml` no dia em que ele chega à `main`, em vez de exigi-lo no mesmo push da troca (consequência da AD-008).

## Retomada

- **Fluxo**: 2, uso próprio — skill `uso-proprio`
- **Item**: `.specs/features/fundacao/` (feature 1 de 8 do roteiro)
- **Fase aprovada**: 4, desenho enxuto (spec, design e mapa de reuso da `fundacao`) em 2026-11-03
- **Próxima fase**: 5, preparação — `tasks.md` da `fundacao` escrito (82 tarefas, 25 Phases, 23 lotes) e aguardando aprovação; depois, fase 6, construção — modelo indicado: sonnet
- **Construção**: não iniciada
- **Verificador do marco**: n/a
- **Serviços no ar**: nenhum
- **Progresso**: "Produto: Faltam 8 de 8 features: 0% concluído", "Em andamento: 1 fundacao", "Projeto: Sem tarefas ainda", conferida em 2026-11-03
- **Combinado na conversa e não registrado em artefato**:
  - Ações externas exigem confirmação específica na hora: push da branch `legado`, troca da `main` remota do repo `leandrosegheto17/GestaoDaPelada_LJS` (`--force-with-lease`), criação do Hyperdrive `gestaodapelada-v2-dev`, do environment `previa` e dos secrets, e o primeiro `deploy.yml`.
  - Os passos que só o usuário faz (console do Neon: recriar a `dev` a partir da `main` e gerar a `NEON_API_KEY`; Cloudflare: token; GitHub: environment `previa`) entram como tarefas de runbook com pausa para o usuário.
  - O `.gitattributes` com `* text=auto eol=lf` entra na primeira tarefa (no Windows, `core.autocrlf=true` quebraria FUN-30).
  - A pasta `.claude/` e o `.gitignore` foram commitados em `824455f`. O repositório ainda não tem remoto: a troca da `main` do repo do LJS (AD-005) é uma tarefa da construção.
- **Gravada em**: 2026-11-03
