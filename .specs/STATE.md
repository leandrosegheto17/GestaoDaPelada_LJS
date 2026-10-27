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

- **Feature**: `conta-e-acesso` (fase 9, Execute do `tlc-spec-driven`)
- **Branch e worktree**: `feat/conta-e-acesso` em `.worktrees/conta-e-acesso` (HEAD `9af777f`, árvore limpa). Gate e trabalhadores rodam dentro do worktree.
- **Concluídas**: T1 a T16 (lotes 1 a 3), cada uma com commit próprio e marcada no `tasks.md` da branch.
- **Próximo**: lote 4 (fase 4, T17 a T23, rotas da API) com o `implementador`; depois os lotes 5 (T24 a T29), 6 (T30 a T36) e 7 (T37 a T44), e então o `verificador`.
- **Gate no fim do lote 3 (rodado pela sessão)**: lint, format e typecheck verdes; `pnpm test` raiz 20, dominio 1, contrato 37, api 554, web 310; `pnpm test:checagens` 415. Build do web, e2e e visual não rodaram nos lotes 2 e 3 (não tocaram o web); no lote 1, build e tokens verdes.
- **Bloqueios**: nenhum. Arquivos não commitados: nenhum.

## Retomada

- **Fluxo**: 1, Projeto novo para vender — skill `projeto-novo`
- **Item**: `.specs/features/conta-e-acesso/` (feature 2 de 8, AD-001). Os artefatos atualizados estão na branch `feat/conta-e-acesso` (worktree `.worktrees/conta-e-acesso`); a `main` tem spec, design, mockup e tasks até `9085f80`.
- **Fase aprovada**: 8, Preparação, em 2026-10-27 (tarefas aprovadas; execução por subagentes, um lote por vez). Antes: 6 (spec, `bc4ed57`) e 7 (desenho `1012c79` e mockup `0b7535d`, galeria https://claude.ai/artifact/UqN3tUswVizPSCVAd7NfX7).
- **Próxima fase**: 9, Construção, em andamento — modelo indicado: sonnet
- **Construção**: lote 7 de 8 concluído (T1 a T41); próximo: lote 8 = Fase 9, visual, ponta a ponta e documentação, T42 a T44 (`implementador`). O tlc retoma pelo `tasks.md` da branch; os registros de aprovação dos lotes 2 a 7 estão no topo dele. Depois do T44: verificador independente, auditor de segurança, aceite visual, `trava-testes.py --rodar` e `finishing-a-development-branch` (fase 10).
- **Progresso**: Plano: Faltam 7 de 8 features: 12% concluído. Projeto: Faltam 5 de 93 tarefas: 95% concluído (item atual: faltam 3 de 44), conferida em 2026-10-27 (o `progresso.py` ainda aponta o item errado; os números vêm da contagem do `tasks.md`).
- **Combinado na conversa e não registrado em artefato**:
  - Banco local: a limpeza de disco de 2026-10-27 apagou os containers; o `conta-e-acesso-db-1` (compose do worktree, porta 5432) foi recriado, migrado e com seed. O `.env` do worktree veio do worktree da fundação. Não mexer em `controleemcasa_ljs-banco-1` (55432) nem em `evolucao-segura-postgres` (5433).
  - Na `main`, `0b7535d`, `9085f80` e as retomadas estão sem push; na `feat/conta-e-acesso` (HEAD `500c1cd`), nada foi enviado. Push só com confirmação e a trava de testes.
  - Para o front (lotes 6 e 7), o que o lote 5 entregou: cliente em `dados/cliente.ts` (`ler`, `escrever`, `semCorpo`; escrita leva `X-Pelada: 1`); erros em `dados/erros.ts` (`ErroApi` com `status`, `codigo`, `campos`, `extras`; `unico_admin` traz `extras.grupos`); 401 `sessao_expirada` leva a `/entrar?aviso=sessao-expirada` (a T30 mostra "Sua sessão expirou. Entre de novo."); `useSessao`, `useSair`, `chaveSessao = ['sessao','eu']` (invalidar depois de entrar ou cadastrar); `destinoAposEntrar(volta)` em `app/guarda/decidir-rota.ts`; `lerTokenDoFragmento()` em `dados/fragmento.ts`. Respostas das rotas: entrar 200 {nome,email}; cadastro 201 {mensagem}; confirmar 204 com cookie; reenviar e esqueci-senha 200 {mensagem}; nova-senha 200 {mensagem}; aceitar convite 200 {grupoId}; cadastrar por convite 201 {grupoId} com cookie; ler convite {email, grupoNome, contaExiste}; 409 `unico_admin` com `erro.grupos`; 409 `conta_existente`; 422 `dados_invalidos` com `campos` (ou `termos_obrigatorios` quando só termos). Rodar a API e o resto do `pnpm test` em paralelo no mesmo banco de teste dá falha falsa: rodar em sequência.
  - Lotes 6 e 7: o e2e de CSP (`cabecalhos.spec.ts:58`) quebrou em `1f9679f` porque o Zod chamava `Function`; corrigido em `34332b9` (`backend/contrato/src/zod.ts` liga o `jitless`; todo schema novo importa o `z` de lá). SPEC_DEVIATION aprovados: T37 sem a recorrência do grupo; T40 sem o nome de quem convidou e, com conta existente sem sessão, sem levar o token à URL. O convite aceito leva a `/app/grupos/:id/admins` até a feature de grupos criar a página do grupo. A T42 deve incluir as telas dos lotes 6 e 7 na comparação visual (hoje compara 6 telas).
  - `TERMOS_VERSAO` provisório
  - Pendências do usuário: apagar a branch Neon `spike-descartavel` e o Hyperdrive `spike-s1`; conferir o backup agendado; antes do deploy desta feature, verificar o domínio no Resend.
  - Fases 8 e 9 (lotes 1 a 3) rodaram em Opus por escolha do usuário (seção Modelo); a partir do lote 4, Sonnet.
- **Gravada em**: 2026-10-27 (após o lote 7)

## Modelo

| Data | Fluxo | Item | Fase | Indicado | Usado |
| --- | --- | --- | --- | --- | --- |
| 2026-10-27 | 1, projeto novo | `conta-e-acesso` | 8, Preparação | Sonnet | Opus (escolha do usuário: seguir na mesma sessão) |
| 2026-10-27 | 1, projeto novo | `conta-e-acesso` | 9, Construção | Sonnet | Opus (escolha do usuário: seguir na mesma sessão) |
