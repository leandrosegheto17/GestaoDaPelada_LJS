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

### AD-011
- **Decision**: O `tasks.md` da `conta-e-acesso` segue a regra de tarefas do `CLAUDE.md`: toda tarefa tem `**Estimativa**` (aproximada nas concluídas), nenhuma passa de 2h e não há limite de quantidade. Entram T51 (conta com hash bcrypt gerado fora do `pgcrypto`) e T52 (log sem segredo em `esqueci-senha` e `nova-senha`), e as correções T45 a T52 formam a Phase 10. Ações externas (branch Neon e Hyperdrive do spike, domínio no Resend, secrets, backup) ficam no runbook e neste arquivo, fora do `tasks.md`. As 8 features do roteiro não mudam.
- **Reason**: Meta de até 2h por tarefa; o verificador achou lacunas de teste sem tarefa correspondente.
- **Trade-off**: A Estimativa das tarefas concluídas é aproximada. A `fundacao` não recebe Estimativa.
- **Scope**: `conta-e-acesso` e roteiro
- **Date**: 2026-10-27
- **Status**: active

### AD-012
- **Decision**: Os 4 achados médios da auditoria de segurança da `conta-e-acesso` (`seguranca.md`) não bloqueiam a integração na `main` e são pendência obrigatória antes da liberação (fase 11): SEC-CA-01 (o link de confirmação só confirma o e-mail e leva a `/entrar`, sem abrir sessão; muda o ACE-06), SEC-CA-02 e SEC-CA-04 (Turnstile no cadastro, no "esqueci a senha" e depois de várias falhas, mais teto global de e-mails e chave de bloqueio por /64 de IPv6; mexe nas telas t04, t05 e t29, com mockup e visual novos), SEC-CA-03 (`LIMITE_ENTRAR` e contador de falhas por conta em `/api/conta/senha` e `/api/conta/excluir`). Os baixos SEC-CA-05 a 12 (incluindo contas do legado com senha temporária e remoção entre admins) seguem sem decisão e entram na liberação como itens a decidir.
- **Reason**: Nenhum achado crítico ou alto; os médios são de abuso e disponibilidade e só importam em produção. Integrar agora evita mais voltas de verificação sobre uma feature já validada.
- **Trade-off**: A `main` fica com a brecha de tomada antecipada de conta até a correção. Sem deploy antes do tratamento, não há exposição.
- **Scope**: `conta-e-acesso`, fase 11
- **Date**: 2026-10-27
- **Status**: active

### AD-013
- **Decision**: Reteste de segurança (2026-10-28): SEC-CA-01 e SEC-CA-03 fechados. SEC-CA-02 (cota de e-mail) e SEC-CA-04 (força bruta com vários /64) corrigidos só em parte e tratados sem Turnstile: "esqueci a senha" de conta não confirmada gasta a cota de cadastro e há teto de 20 e-mails por hora por IPv4 ou /48 (ACE-73, T65 e T66); teto suave de 50 falhas por hora por conta no login, com bloqueio de 10 min (ACE-74, T67). O SEC-CA-13 (sem tempo máximo no Resend e na trava da cota) é corrigido já (ACE-75, T68). O SEC-CA-14 e os baixos SEC-CA-05 a 12 entram na liberação como itens a decidir. O ACE-72 passa a dizer "atinge 80%", como o código já faz. Altera o AD-012 no ponto do Turnstile.
- **Reason**: Nenhum achado crítico ou alto, mas o AD-012 exige tratar os médios antes da liberação; o Turnstile mexe em telas e depende da Cloudflare, e as defesas no servidor cobrem o abuso sem isso.
- **Trade-off**: Continuam possíveis a queda diária do cadastro por esgotamento da cota e a força bruta lenta (abaixo de 50 falhas por hora por conta); o THREAT-MODEL registra (T69).
- **Scope**: `conta-e-acesso`, fase 10 (volta à 9 para T65 a T69)
- **Date**: 2026-10-28
- **Status**: active

### AD-014
- **Decision**: A visibilidade do grupo arquivado é decidida no banco: `grupos_visiveis()` só devolve um grupo arquivado à conta que tem vínculo e é a criadora. A escrita no grupo arquivado é barrada pelo middleware `exigirGrupoAtivo` (409 `grupo_arquivado`), exceto a reativação. A criação de grupo passa pela função `grupo_criar` (`SECURITY DEFINER`). ADR-035.
- **Reason**: Escolha do usuário na fase 7 da `grupos-e-elenco`. As features seguintes herdam o filtro sem código, e a RLS impede o `pelada_app` de criar um grupo que ainda não tem vínculo.
- **Trade-off**: A troca da função afeta todas as policies e exige a suíte de isolamento inteira. O sufixo do slug fica em SQL.
- **Scope**: banco e todas as features que leem dados de grupo
- **Date**: 2026-10-29
- **Status**: active

### AD-015
- **Decision**: A API lê a data só pelo `Relogio` injetado no contexto do Hono (`hoje()` em America/Sao_Paulo, cópia do legado). Regra de data nunca usa `now()` nem `current_date` do SQL, e o domínio recebe `hoje` como parâmetro.
- **Reason**: ADR-012 e GEL-70. Perto da meia-noite, o `now()` do banco em UTC dá o dia errado, e os testes precisam fixar a data.
- **Trade-off**: Mais um item no contexto da requisição. O `now()` continua valendo para carimbos de momento (auditoria, sessão).
- **Scope**: API, a partir da `grupos-e-elenco`
- **Date**: 2026-10-29
- **Status**: active

### AD-016
- **Decision**: Toda rota `/api/publico/:slug/*` passa pelo middleware `contextoPublico`, que apaga a conta e põe o slug: slug malformado, inexistente ou de grupo arquivado responde o mesmo 404. A única escrita pública é a função `evento_publico_registrar` (`SECURITY DEFINER`, `search_path` fixo, `EXECUTE` para o `pelada_app`); a RLS segue sem escrita no contexto do slug, e `eventos_uso` só é lida com conta. ADR-036.
- **Reason**: Escolha do usuário no Design da `partidas-e-ranking`. Com a conta no contexto, o admin logado cairia no ramo com conta de `grupos_visiveis()` e perderia o ranking de outro grupo.
- **Trade-off**: Mais SQL; o contexto público ignora a sessão mesmo de quem é admin daquele grupo.
- **Scope**: API e banco, rotas públicas de todas as features. Complementa o AD-004
- **Date**: 2026-10-30
- **Status**: active

### AD-017
- **Decision**: Ranking, PDF, prévias e auditoria de período leem o grupo por um carregador único (`historico.carregar`) e calculam só pelo domínio, na leitura. As prévias são POST em transação `READ ONLY` (sufixo `/previa`). A CPU (G-12) é medida por bench do domínio no CI e pelo p50/p99 do painel do Worker depois do deploy.
- **Reason**: Escolha do usuário no Design (ADR-006, G-05, G-25): uma única função de acumulado, com os testes do legado portados.
- **Trade-off**: O custo cresce com o histórico do grupo; não há cache de pontos. A leitura da CPU no painel é PREMISSA até o deploy.
- **Scope**: API e domínio, inclusive `simulador` e `financeiro`
- **Date**: 2026-10-30
- **Status**: active

### AD-018
- **Decision**: O nome de outra conta (autor de pesos, partidas e o que vier) sai só da função `contas_nomes_do_grupo` (`SECURITY DEFINER`), para quem tem vínculo e só de contas que aparecem como autoras no grupo, sem e-mail.
- **Reason**: A RLS de `contas` só mostra a própria linha (ACE-43); mesmo padrão do AD-008.
- **Trade-off**: Mais uma consulta nas telas que mostram autor.
- **Scope**: Banco e repositórios
- **Date**: 2026-10-30
- **Status**: active

### AD-019
- **Decision**: Função do banco muda de assinatura por expandir e contrair: a nova nasce ao lado da antiga, que delega a ela até uma migration `-- contrair:` da feature seguinte. Na do `grupo_criar`, a delegação lê a data com `now()` em São Paulo, exceção temporária e única ao AD-015, com teste que falha se outra função usar `now()` para data.
- **Reason**: Escolha do usuário no Design: o `deploy.yml` desfaz o deploy do Worker sem desfazer a migration, e o Worker anterior precisa continuar criando grupo com pesos.
- **Trade-off**: Duas versões da função por um ciclo de feature.
- **Scope**: Migrations
- **Date**: 2026-10-30
- **Status**: active

### AD-020
- **Decision**: Ordem fixa de travas nas escritas: grupo (`FOR KEY SHARE`), depois partida (`FOR UPDATE`), depois jogadores em ordem crescente de id (`FOR UPDATE`, uma consulta). Nenhuma escrita trava jogador antes de partida.
- **Reason**: G-26: impede corrida e deadlock entre lançar, editar ou excluir partida e corrigir período.
- **Trade-off**: Edições do mesmo jogador em paralelo esperam umas pelas outras.
- **Scope**: API, inclusive `simulador` (escalação) e `financeiro`
- **Date**: 2026-10-30
- **Status**: active

## Handoff

- **Feature**: `conta-e-acesso` (fase 9, Execute do `tlc-spec-driven`)
- **Branch e worktree**: `feat/conta-e-acesso` em `.worktrees/conta-e-acesso` (HEAD `9af777f`, árvore limpa). Gate e trabalhadores rodam dentro do worktree.
- **Concluídas**: T1 a T16 (lotes 1 a 3), cada uma com commit próprio e marcada no `tasks.md` da branch.
- **Próximo**: lote 4 (fase 4, T17 a T23, rotas da API) com o `implementador`; depois os lotes 5 (T24 a T29), 6 (T30 a T36) e 7 (T37 a T44), e então o `verificador`.
- **Gate no fim do lote 3 (rodado pela sessão)**: lint, format e typecheck verdes; `pnpm test` raiz 20, dominio 1, contrato 37, api 554, web 310; `pnpm test:checagens` 415. Build do web, e2e e visual não rodaram nos lotes 2 e 3 (não tocaram o web); no lote 1, build e tokens verdes.
- **Bloqueios**: nenhum. Arquivos não commitados: nenhum.

## Retomada

- **Fluxo**: 1, Projeto novo para vender — skill `projeto-novo`
- **Item**: `.specs/features/partidas-e-ranking/` (feature 4 de 8, AD-001), na `main`, sem branch nem worktree ainda
- **Fase aprovada**: 7 (Desenho) em 2026-10-30. Spec aprovada (fase 6, `541f134` e `fe802b6`, PAR-01 a PAR-161, `context.md` P1 a P12); desenho aprovado (`c7c10b2`, AD-016 a AD-020 e ADR-036); mockup do módulo aprovado (`439113c`, t09, t11 `nova`, t16 com prévias)
- **Próxima fase**: 8 (Preparação: `tasks.md` pelo `tlc-spec-driven`, fase Tasks) — modelo indicado: sonnet. Tarefas de até 2h com **Estimativa** e **Risco**; o design lista os componentes C1 a C9 e a seção "Mockup do módulo"
- **Progresso**: Produto: Faltam 5 de 8 features: 38% concluído (em andamento: 4 partidas-e-ranking); Feature atual: sem tarefas ainda; Projeto: Faltam 2 de 205 tarefas: 99% concluído; conferida em 2026-10-30
- **Combinado na conversa e não registrado em artefato**:
  - Mudar testes existentes, já aprovado pelo usuário (motivo no teste e no commit): `frontend/web/src/telas/jogador/PeriodosJogador.test.tsx:136`, pelo texto novo do reativar (P6, PAR-159), e o mockup t16 do projeto na promoção.
  - Na promoção do mockup (integração), os links das telas do módulo apontam também para `../../../grupos-e-elenco/mockup/telas/`; a galeria registra como reescrevê-los. A galeria não foi publicada como Artifact (exigiria ler 28 arquivos do mockup do projeto); a revisão foi local.
  - Lição de ferramenta: no Git Bash desta máquina, `sed -i` com texto acentuado não casa e falha calado; editar artefatos com Python em UTF-8 (`newline=''`).
  - Pendências de antes, ainda abertas: teste de fumaça do usuário em produção (Neon e `grupos-e-elenco`); CI vermelho do job `checagens` (`dono.test.ts` sem Postgres no job); revogar a `NEON_API_KEY`; `neondb_owner` ainda administra a `pelada_app` e o database `neondb` antigo continua no Neon; monitor de uptime; alerta da cota de e-mail; apagar a branch Neon `spike-descartavel` e o Hyperdrive `spike-s1`; branch remota `feat/grupos-e-elenco` e contêineres parados `conta-e-acesso-seguranca-db-1` e `conta-e-acesso-db-1` (limpezas pedem confirmação); a correção do `trava-testes.py` (`67a700a`) ainda precisa ir ao Rascunho; `test/lint-dominio.test.ts` falhou uma vez e não repetiu; decisão pendente sobre emendar a atribuição `Claude Opus 5.5` dos commits T33 a T56 da `grupos-e-elenco`.
  - Gate: rodar um pacote por vez por falta de memória (`vitest run --dir test && pnpm -r --workspace-concurrency=1 test && pnpm test:checagens`).
  - Banco local: `gestaodapelada_ljs-db-1` (PostgreSQL 18, porta 5432), migrado até `1792844220000`, com seed; sem as migrations da `grupos-e-elenco` (não rodar `pnpm migrar` nem `pnpm seed` nele sem avisar). Não mexer em `controleemcasa_ljs-banco-1` (55432) nem em `evolucao-segura-postgres` (5433).
- **Gravada em**: 2026-10-30 (fim da fase 7 da `partidas-e-ranking`)

## Modelo

| Data | Fluxo | Item | Fase | Indicado | Usado |
| --- | --- | --- | --- | --- | --- |
| 2026-10-27 | 1, projeto novo | `conta-e-acesso` | 8, Preparação | Sonnet | Opus (escolha do usuário: seguir na mesma sessão) |
| 2026-10-27 | 1, projeto novo | `conta-e-acesso` | 9, Construção | Sonnet | Opus (escolha do usuário: seguir na mesma sessão) |
