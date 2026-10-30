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
- **Item**: `grupos-e-elenco` (feature 3 de 8, AD-001) integrada na `main` (`6b339d1`, push feito) e liberada em produção em 2026-10-30 (`deploy.yml` run 41120055226, `.specs/liberacao.md`). Worktrees e branches locais antigas removidos; a `main` é a única branch local.
- **Fase aprovada**: 11 (Lançamento) da `grupos-e-elenco`: validação PASS (`validation.md`, 51 de 51 mutações mortas), aceite visual, suíte verde no `6b339d1` e liberação em janela única, com confirmação do usuário.
- **Próxima fase**: 6 (Specify) da feature 4, `partidas-e-ranking` (roadmap), herdando os débitos 4 a 6 do THREAT-MODEL (SEC-010, I-1, I-3). Antes ou à parte: teste de fumaça do usuário em produção (criar grupo, cadastrar jogador, inativar e reativar) e o CI vermelho do job `checagens` (`dono.test.ts` sem Postgres no job, vermelho desde antes da feature). Modelo indicado: Opus para as fases 6 e 7.
- **Construção**: concluída (T1 a T83, 100%). Gate: rodar um pacote por vez por falta de memória (`vitest run --dir test && pnpm -r --workspace-concurrency=1 test && pnpm test:checagens`). As migrations da feature (incluindo T76 e T82) estão aplicadas em produção; o banco de dev local ainda não as tem (não rodar `pnpm migrar` nem `pnpm seed` nele sem avisar).
- **Progresso**: Produto: Faltam 6 de 8 features: 25% concluído; Feature atual (grupos-e-elenco): Todas as 83 tarefas concluídas: 100% concluído; Projeto: Faltam 2 de 205 tarefas: 99% concluído; conferida em 2026-10-30.
- **Combinado na conversa e não registrado em artefato**:
  - Decisão do usuário (2026-10-29): arquivar grupo já arquivado responde 200 sem mudança (GEL-29); `exigirGrupoAtivo` libera `POST …/arquivar` e `…/reativar`; SPEC_DEVIATION na T25 e nota na GEL-26 da spec (já na branch). Arquivar e reativar devolvem o `grupoDetalhe`.
  - Testes existentes alterados com aprovação do usuário (motivo no teste e no commit): `roles.test.ts` (T20), `meta.test.ts` (T30), `grupo-ativo-middleware.test.ts` (T25/T31).
  - Desvios do lote 1 (SPEC_DEVIATION em `backend/contrato/src/elenco.ts`): `jogadorCorpo(hoje)` calcula o ano máximo sem importar o domínio; o domínio de períodos devolve `{ok:false, regra, campo, mensagem}` com campo `saida` ou `retorno` (a rota leva ao campo `data`); inativar sem período aberto lança `RangeError` (a rota responde 409 `ja_inativo` antes); `coberturaRetirada`/`avaliarPeriodos` recebem presenças `{data, situacao}[]`.
  - Textos de erro escolhidos pelo trabalhador (GEL-04, GEL-05, GEL-37, GEL-99), horário vazio vs `null` e máscara de telefone: ver relatório do lote 1 nos commits T2 a T13; ajustáveis de forma pontual.
  - Eslint: `backend/api/src/infraestrutura/relogio/**` isenta da G-06; API depende de `@pelada/dominio`.
  - Decisões do usuário nos lotes 3 e 4 (2026-10-29): T57 — testes de `SeusGrupos.test.tsx` (ACE-18, ACE-57) mudados para a t08 nova (motivo no teste e no commit); T52 — seed com 20 jogadores em vez de 4 aceito (teste FUN-05 mantido); e2e `acesso.spec.ts` (ACE-33) ajustado para clicar no grupo e depois em "Admins", com a rota `/app/grupos/:grupoId` ligada antes da T68 (commit `e996ed1`, nota na T68).
  - Desvios dos lotes 3 e 4 (SPEC_DEVIATION no código e no commit): T45 — exceção do `seed-local.ts` na checagem de escritores de período, removida na T52; T57 — duas entradas de t08 em `.specs/mockup/telas.json` apontam para o mockup da feature (`respostas/grupos-leandro.json`, `grupos-vazio.json`); T59 — a t09 mostra só Jogadores, Habilidades, Admins, Dados do grupo e "Dia de jogo"; T60 — botão de arquivar só habilita com o nome exato (contraria o comentário do mockup t20).
  - Decidido (2026-10-30): t09 fora da comparação visual; integrar assim, anotado no roadmap (feature 4) e no `validation.md`. Alteração de `frontend/web/e2e/telas-ativas.test.mjs` aprovada. Decisões do usuário sobre a auditoria: SEC-001 proibir remover a criadora (409 `criadora_nao_removivel`); SEC-002 piso 01/01/2000 na `dataEntrada`; SEC-003 `LIMITE_ESCRITA` por conta em `/api/grupos*`; SEC-004 a SEC-009 corrigir agora. Débitos que seguem para o THREAT-MODEL na T83: SEC-010 (`deepmerge` só no build), I-1 (regra ESLint `sem-escrita-periodo` desligada contra a G-26), I-3 (partidas filtrar grupo arquivado em `grupos_visiveis`).
  - Atribuição: os commits T33 a T45 e T47 a T56 (23 commits, conforme o verificador) saíram com `Co-Authored-By: Claude Opus 5.5` (o padrão é `Claude Sonnet 5.5`); não emendados, decisão do usuário pendente se quer emendar. Regra `sem-escrita-periodo` do ESLint existe e não está ligada no `eslint.config.mjs` (fora de escopo).
  - `POSICAO_PADRAO` `meia` para jogador do legado sem posição (AD-002); resposta 200 com `jogadorDetalhe` em inativar, reativar e `PUT …/inicio`.
  - Limpezas pendentes (pedem confirmação): branch remota `feat/grupos-e-elenco`; contêineres parados `conta-e-acesso-seguranca-db-1` e `conta-e-acesso-db-1`. Pendências do usuário: teste de fumaça do Neon e da `grupos-e-elenco`, revogar a `NEON_API_KEY`, monitor de uptime, alerta da cota de e-mail, apagar a branch Neon `spike-descartavel` e o Hyperdrive `spike-s1`. A correção do `trava-testes.py` (`67a700a`) ainda precisa ir ao Rascunho. `test/lint-dominio.test.ts` falhou uma vez na `main` e não repetiu (investigar à parte).
  - Não mexer em `controleemcasa_ljs-banco-1` (55432) nem em `evolucao-segura-postgres` (5433).
  - Decisões do usuário nos lotes 6 e 7 (2026-10-30): T71 — teste de ACE-40 (`rotas/admins.test.ts`) reescrito (convidada sai de si mesma e a criadora, última admin, recebe 409 `ultimo_admin`); a criadora pode remover a si mesma, só a remoção por outra admin dá 409 `criadora_nao_removivel`. T74 — `wrangler.test.ts` estendido para 4 limitadores; `LIMITE_ESCRITA` fixo em 60 por 60 s. T76 — `grupo-arquivado-rotas-existentes.test.ts` muda para 204 ao cancelar convite de grupo arquivado; `convite_cadastrar` entra na migration. T80 e T81 — auditoria só com ids e nomes de campo fixos (GEL-113 mantida; sem texto de nome); edição sem mudança nos 4 campos do jogador não grava evento.
  - Desvios dos lotes 6 e 7 (SPEC_DEVIATION no código e no commit): T72 — `GET …/admins` devolve `criadoraId` (opcional no contrato, snapshot regravado); T73 — contrato repete o piso `2000-01-01` e a mensagem da GEL-78 (G-01); T79 — `FOR KEY SHARE` em vez de `FOR SHARE` (deadlock em dois `PATCH` simultâneos), teste de concorrência em `repositorios/grupo-ativo-concorrencia.test.ts`; T81 — não grava nome antigo e novo, `grupo_editado` só quando o nome muda, `grupos.editar` lê o nome com `FOR NO KEY UPDATE`.
  - Padronização do Neon (ADR-030 a ADR-034) liberada em 2026-10-29 (`.specs/liberacao.md`). Abertos: teste de fumaça do usuário; `neondb_owner` ainda administra a `pelada_app` e o database `neondb` antigo continua no Neon; revogar a `NEON_API_KEY` no console do Neon.
  - Banco local: `gestaodapelada_ljs-db-1` (PostgreSQL 18, porta 5432), migrado até `1792844220000`, com seed. O `.env` local ganhou `PELADA_BACKUP_RO_SENHA`. Não mexer em `controleemcasa_ljs-banco-1` (55432) nem em `evolucao-segura-postgres` (5433).
- **Gravada em**: 2026-10-30 (fim da liberação da `grupos-e-elenco`)

## Modelo

| Data | Fluxo | Item | Fase | Indicado | Usado |
| --- | --- | --- | --- | --- | --- |
| 2026-10-27 | 1, projeto novo | `conta-e-acesso` | 8, Preparação | Sonnet | Opus (escolha do usuário: seguir na mesma sessão) |
| 2026-10-27 | 1, projeto novo | `conta-e-acesso` | 9, Construção | Sonnet | Opus (escolha do usuário: seguir na mesma sessão) |
