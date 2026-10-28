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

## Handoff

- **Feature**: `conta-e-acesso` (fase 9, Execute do `tlc-spec-driven`)
- **Branch e worktree**: `feat/conta-e-acesso` em `.worktrees/conta-e-acesso` (HEAD `9af777f`, árvore limpa). Gate e trabalhadores rodam dentro do worktree.
- **Concluídas**: T1 a T16 (lotes 1 a 3), cada uma com commit próprio e marcada no `tasks.md` da branch.
- **Próximo**: lote 4 (fase 4, T17 a T23, rotas da API) com o `implementador`; depois os lotes 5 (T24 a T29), 6 (T30 a T36) e 7 (T37 a T44), e então o `verificador`.
- **Gate no fim do lote 3 (rodado pela sessão)**: lint, format e typecheck verdes; `pnpm test` raiz 20, dominio 1, contrato 37, api 554, web 310; `pnpm test:checagens` 415. Build do web, e2e e visual não rodaram nos lotes 2 e 3 (não tocaram o web); no lote 1, build e tokens verdes.
- **Bloqueios**: nenhum. Arquivos não commitados: nenhum.

## Retomada

- **Fluxo**: 1, Projeto novo para vender — skill `projeto-novo`
- **Item**: `.specs/features/conta-e-acesso/` (feature 2 de 8, AD-001). A feature foi integrada na `main` (merge `ee202e2`, sem push); as correções dos médios de segurança (AD-012) estão na branch `fix/conta-e-acesso-seguranca`, no worktree `.worktrees/conta-e-acesso-seguranca` (8 commits, `3bd04d9` a `0f223a5`, a partir da `main` `6402d27`), ainda não integradas na `main`. Abra a sessão nova **dentro desse worktree**. A branch `feat/conta-e-acesso` e o worktree `.worktrees/conta-e-acesso` (já removido do disco) ficam para limpar depois do push.
- **Fase aprovada**: 10, Validação, concluída em 2026-10-28: construção das T57 a T73 (AD-012 e AD-013), validação PASS na volta 7 (T57 a T73) e três retestes de segurança sem achado crítico, alto nem médio em aberto. A trava de testes completa (lint, format, typecheck, testes, checagens, build, e2e e visual) ficou verde no commit `d30c0fc`.
- **Próximo passo**: integrar a branch `fix/conta-e-acesso-seguranca` (23 commits, `6402d27..d30c0fc`) na `main`. A `main` não andou desde o fork, então é fast-forward. O usuário escolheu "merge local na main" e a sessão do worktree não consegue operar no checkout da `main`: rodar, a partir do checkout da raiz (`C:\Leandro\Projetos\GestaoDaPelada_LJS`, árvore limpa, na `main`), `git merge --ff-only fix/conta-e-acesso-seguranca`; depois remover o worktree `.worktrees/conta-e-acesso-seguranca` e a branch (`git worktree remove`, `git branch -d`), e limpar a branch `feat/conta-e-acesso`. Sem push. Em seguida, fase 11 (skill `liberacao`) — modelo indicado: sonnet.
- **Progresso**: Plano: Faltam 7 de 8 features: 12% concluído. Item atual: todas as 73 tarefas concluídas (conferir com `progresso.py`).
- **Combinado na conversa e não registrado em artefato**:
  - Resíduos aceitos pelo usuário e itens a decidir na liberação: SEC-CA-14 (sessão roubada trava troca de senha), SEC-CA-16 (teto de 20 pedidos por hora por IPv4 ou /48 pune origem compartilhada; `LIMITE_EMAILS_IP_HORA` ajusta), o resíduo baixo do SEC-CA-15 (depois da recuperação, um atacante que sonda percebe o 401 e pode bloquear de novo em segundos; recomendado aceitar), o oráculo de "esqueci a senha" na faixa de 80% a 100% da cota (aceito, no THREAT-MODEL) e os baixos SEC-CA-05 a 12.
  - A matriz de rastreio da spec continua toda como Pending (padrão da feature inteira). O teste de tela `App.sessao-expirada.test.tsx` fica perto do limite de 5 s em máquina lenta; elevar o `testTimeout` pede aprovação do usuário. O `dono.test.ts` já estourou o `beforeAll` uma vez logo depois da suíte pesada da API (vale um `hookTimeout` maior, em tarefa à parte).
  - Push e deploy só na liberação, com confirmação específica do comando. Antes do deploy: verificar o domínio no Resend (runbook, seções 9 e 10). Pendências do usuário: apagar a branch Neon `spike-descartavel` e o Hyperdrive `spike-s1`; conferir o backup agendado.
  - Banco local: contêiner `conta-e-acesso-seguranca-db-1` (porta 5432), migrado até `1792844160000`, com seed; o antigo `conta-e-acesso-db-1` está parado e pode ser removido. Não mexer em `controleemcasa_ljs-banco-1` (55432) nem em `evolucao-segura-postgres` (5433). O `.env` do worktree é cópia do da `main` (fora do git).
- **Gravada em**: 2026-10-28 (após a trava verde e a escolha do merge local)

## Modelo

| Data | Fluxo | Item | Fase | Indicado | Usado |
| --- | --- | --- | --- | --- | --- |
| 2026-10-27 | 1, projeto novo | `conta-e-acesso` | 8, Preparação | Sonnet | Opus (escolha do usuário: seguir na mesma sessão) |
| 2026-10-27 | 1, projeto novo | `conta-e-acesso` | 9, Construção | Sonnet | Opus (escolha do usuário: seguir na mesma sessão) |
