# Conta e acesso — Tarefas

## Protocolo de Execução (OBRIGATÓRIO — não pular)

Implemente estas tarefas com a skill `tlc-spec-driven`: **acione-a pelo nome e siga o fluxo de Execute e as Critical Rules.** Não procure arquivos da skill por caminho. A skill é a fonte da verdade do fluxo completo (ciclo por tarefa, delegação a subagentes, revisão de adequação, Verificador, sensor de discriminação).

**Se a skill não puder ser acionada, PARE e avise o usuário. Não prossiga sem ela.**

---

**Design**: `.specs/features/conta-e-acesso/design.md` (mockup aprovado em `mockup/`)
**Spec**: `.specs/features/conta-e-acesso/spec.md`
**Status**: Approved (usuário, 2026-10-27; execução por subagentes, um lote por vez; ferramentas como estão)

> Premissas desta lista:
> - Caminhos `legado:` são relativos a `C:\Leandro\Projetos\GestaoDaPelada`, somente leitura (AD-002). Teste copiado do legado só entra ligado a um `ACE-NN`.
> - **Cada migration desta feature é um arquivo novo** (T7 a T11), aditivo (G-14). Nenhuma migration já aplicada é editada.
> - Toda rota nova entra em `backend/api/test/isolamento/casos.ts` (G-04) na mesma tarefa que a cria.
> - O banco local (`docker compose up -d`, `pnpm migrar`) precisa estar de pé para os gates full e build. A limpeza de disco de 2026-10-27 apagou os containers: recriar no início da construção.
> - Ações externas (push, criar domínio e chave no Resend, secrets no GitHub, deploy) ficam fora destas tarefas e pedem confirmação específica na fase 11.

> **Registro do lote 2 (2026-10-27, aprovado pelo usuário):** mudanças em testes existentes (`roles.test.ts`: `contas` e `sessoes` saem da lista "não lê" e ganham testes por coluna e de auditoria; `migrar.test.ts`: fixture A passa a exigir o schema do legado contido e igual ao de um banco migrado do zero) aprovadas, com o motivo no código. `convites_admin` lê só com conta (SPEC_DEVIATION do design C1, aprovado). A auditoria de exclusão e de convites é gravada pelas próprias funções; as rotas não gravam de novo.

> **Registro do lote 3 (2026-10-27, aprovado pelo usuário):** função `admins_listar` (migration `1792843680000_conta-admins-listar.sql`, SPEC_DEVIATION do C1) para o ACE-37 sob a RLS de `contas`, com o acréscimo dela em `funcoes-definer.test.ts`.

> **Registro do lote 4 (2026-10-27, aprovado pelo usuário):** rotas T17 a T23. Entrar roda em transação própria (`emTransacaoPropria`) para não perder a contagem de falhas (ACE-13); `@pelada/contrato` entra como dependência da API; `SEED_SENHA_ADMIN` fica só no `.env.example` (SPEC_DEVIATION); apoios de teste novos em `backend/api/test/apoio/` (binding `HYPERDRIVE_OWNER_TESTE` só no teste). Respostas das rotas listadas no relatório do lote, para o front.

---

## Test Coverage Matrix

> Gerada a partir da matriz da fundação (`.specs/features/fundacao/tasks.md`), do `package.json` da raiz, dos testes existentes (`backend/api/test/{rotas,isolamento,migracoes}`, `frontend/web/src/**/*.test.tsx`) e da spec. Guias encontrados: `.md/GUARDRAILS.md` (regra → teste), `CLAUDE.md` da raiz (gate de testes); nenhum limiar de cobertura. Padrão forte aplicado: todo critério ACE e todo caso limite tem teste.

| Camada | Tipo de teste exigido | Expectativa de cobertura | Padrão de local | Comando |
| ------ | --------------------- | ------------------------ | --------------- | ------- |
| Contrato (`backend/contrato`) | unit | Cada schema: aceita o válido, recusa cada limite (ACE-03, ACE-05, ACE-68) e campo extra (`.strict()`); snapshot de compatibilidade | `backend/contrato/test/**/*.test.ts` | `pnpm --filter @pelada/contrato test` |
| Banco: migrations, funções, RLS, grants | integration (Postgres real, como `pelada_app`) | Cada função: todos os ramos de resultado da tabela do C1; cada tabela nova: os cenários de isolamento com duas contas (ACE-45); concorrência de ACE-66 e ACE-67 | `backend/api/test/{migracoes,isolamento}/**/*.test.ts` | `pnpm --filter @pelada/api test` |
| Repositórios e infraestrutura da API | integration (repositórios) e unit (token, cookie, e-mail) | Caminhos de cada função do repositório e erro; cookie com os atributos do G-09; remetente: sucesso, falha e o que vai para o log | `backend/api/test/{infraestrutura,repositorios}/**/*.test.ts` | `pnpm --filter @pelada/api test` |
| Rotas e middlewares da API | e2e no pool workerd | Toda rota da tabela do C4: caminho feliz, cada código de erro da spec e o log sem segredo (ACE-21) | `backend/api/test/rotas/**/*.test.ts` | `pnpm --filter @pelada/api test` |
| Scripts (`backend/scripts`) | unit / integration (banco temporário) | `dono.ts` e seed: caminho feliz, recusa sem `--alvo` e sem variável | `backend/scripts/test/**/*.test.ts` | `pnpm test:checagens` |
| Front: dados, guarda e telas | unit (jsdom + Testing Library + axe) | Cada tela: estados do mockup (vazio, carregando, erro, sucesso), mensagens da spec e axe sem violação; guarda e cliente: todos os ramos | `frontend/web/src/**/*.test.{ts,tsx}` | `pnpm --filter @pelada/web test` |
| Front: fluxos ponta a ponta | e2e (Playwright contra build + Worker local) | Os "Independent Test" da spec de cadastro, entrar, recuperação e convite | `frontend/web/e2e/*.spec.ts` | `pnpm --filter @pelada/web e2e` |
| Front: comparação visual | e2e visual (limite de 1%) | Toda tela do mockup do módulo nos dois viewports | `frontend/web/e2e/visual.mjs` | `pnpm --filter @pelada/web visual` |
| Documentação, `.env.example`, `wrangler.jsonc` | none (gate de build e checagens) | — | — | gate de build |

## Gate Check Commands

> Os mesmos da fundação, confirmados no `package.json` da raiz e no `.specs/projeto/testes.json`.

| Nível do gate | Quando usar | Comando |
| ------------- | ----------- | ------- |
| Quick | Tarefas só com testes unitários, no pacote tocado | `pnpm --filter <pacote> test` (ou `pnpm test:checagens` para `backend/scripts`) |
| Full | Tarefas com integration ou e2e. Exige o banco local de pé e `DATABASE_URL_TESTE` | `pnpm test && pnpm test:checagens` (e `pnpm --filter @pelada/web e2e` nas tarefas de e2e do web) |
| Build | Fim de fase e tarefas de config ou docs | `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:checagens && pnpm --filter @pelada/web build && pnpm --filter @pelada/web e2e && pnpm --filter @pelada/web visual` |

---

## Execution Plan

As fases rodam em sequência; dentro da fase, as tarefas rodam em ordem.

### Phase 1: Contrato e infraestrutura (mecânica)

```
T1 → T2 → T3
```

```
T4 → T5
```

```
T6
```

### Phase 2: Banco (domínio)

```
T7 → T8 → T9 → T10 → T11 → T12
```

### Phase 3: Repositórios e middlewares (domínio)

```
T12 → T13 → T14 → T15 → T16
```

### Phase 4: Rotas da API (mecânica)

```
T16 → T17 → T18 → T19 → T20
```

```
T17 → T21
```

```
T17 → T22
```

```
T18 → T23
```

### Phase 5: Scripts (mecânica)

```
T24 → T25
```

### Phase 6: Base do front (mecânica)

```
T26 → T27 → T28 → T29
```

### Phase 7: Telas públicas (mecânica)

Telas independentes entre si (cada uma depende só das fases anteriores): T30, T31, T32, T33, T34, T35, T36.

### Phase 8: Telas com sessão (mecânica)

Telas independentes entre si: T37, T38, T39, T40, T41.

### Phase 9: Visual, ponta a ponta e documentação (mecânica)

```
T42 → T43 → T44
```

---

## Task Breakdown

### T1: Zod e primitivos no contrato

**What**: Adicionar `zod >= 4.6.6` ao `@pelada/contrato` (e o override no `pnpm-workspace.yaml`) e criar os primitivos `email` (minúsculas, sem espaços nas pontas, até 254), `senha` (8 a 72 caracteres e até 72 bytes UTF-8) e `nomeConta` (2 a 60).
**Where**: `backend/contrato/src/primitivos.ts`
**Depends on**: None
**Reuses**: `backend/contrato/src/limites.ts` (`LIMITES`, `bytesUtf8`); legado: `backend/contrato/src/primitivos.ts`
**Requirement**: ACE-03, ACE-05, ACE-68

**Tools**:

- MCP: `context7` (zod 4; sem ele, a documentação instalada no pacote)
- Skill: NONE

**Done when**:

- [x] `email` normaliza `" Leandro@Ex.com "` para `leandro@ex.com` e recusa 255 caracteres (ACE-05, ACE-03)
- [x] `senha` recusa 7 caracteres, aceita 8 e 72, e recusa 20 emojis (mais de 72 bytes) (ACE-68)
- [x] `pnpm audit` não lista `zod < 4.6.6` (SEC-007)
- [x] Gate quick passa: `pnpm --filter @pelada/contrato test`

**Tests**: unit
**Gate**: quick

---

### T2: Schemas das rotas de conta e acesso

**What**: Schemas `.strict()` de corpo e resposta (`cadastroCorpo`, `entrarCorpo`, `emailCorpo`, `tokenCorpo`, `novaSenhaCorpo`, `trocarSenhaCorpo`, `excluirCorpo`, `conviteCorpo`, `conviteCadastroCorpo`, `sessaoEu`, `adminsResposta`) e a constante `TERMOS_VERSAO`.
**Where**: `backend/contrato/src/acesso.ts` (e o export em `index.ts`)
**Depends on**: T1
**Reuses**: legado: `backend/contrato/src/sessao.ts`
**Requirement**: ACE-01, ACE-02, ACE-03, ACE-18, ACE-37

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `cadastroCorpo` recusa `termos: false` e campo extra
- [x] `sessaoEu` e `adminsResposta` têm as formas do design (Data Models)
- [x] Gate quick passa: `pnpm --filter @pelada/contrato test`

**Tests**: unit
**Gate**: quick

---

### T3: Snapshot de compatibilidade do contrato (G-20)

**What**: Script `checar-compatibilidade` que gera a forma JSON de cada schema exportado e falha quando um campo é removido, renomeado ou fica obrigatório sem entrada em `QUEBRAS.md`; snapshot inicial gravado.
**Where**: `backend/contrato/scripts/checar-compatibilidade.ts`
**Depends on**: T2
**Reuses**: `z.toJSONSchema` do zod 4
**Requirement**: ACE-48 (G-20)

**Tools**:

- MCP: `context7`
- Skill: NONE

**Done when**:

- [x] Remover um campo de `sessaoEu` numa cópia faz o script sair com código diferente de 0; acrescentar um campo opcional passa
- [x] `pnpm --filter @pelada/contrato checar-compatibilidade` existe e roda no job `base` do `ci.yml`
- [x] Gate quick passa: `pnpm --filter @pelada/contrato test`

**Tests**: unit
**Gate**: quick

---

### T4: Token e hash

**What**: `gerarToken()` (32 bytes aleatórios em base64url e o SHA-256 em bytes) e `hashIp(ip)` (SHA-256 do `CF-Connecting-IP`).
**Where**: `backend/api/src/infraestrutura/sessao/token.ts`
**Depends on**: None
**Reuses**: Web Crypto do Workers
**Requirement**: ACE-10, AD-010

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Dois tokens seguidos são diferentes; o hash tem 32 bytes e é o SHA-256 do token
- [x] Gate quick passa: `pnpm --filter @pelada/api test`

**Tests**: unit
**Gate**: quick

---

### T5: Cookie de sessão

**What**: `definirCookieSessao`, `limparCookieSessao` e `lerTokenSessao` com `__Host-sessao`.
**Where**: `backend/api/src/infraestrutura/sessao/cookie.ts`
**Depends on**: T4
**Reuses**: legado: `backend/api/src/infraestrutura/sessao/cookie.ts`
**Requirement**: ACE-09, ACE-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] O `Set-Cookie` tem `HttpOnly; Secure; SameSite=Lax; Path=/`, sem `Domain`, e `Max-Age` de 12 h (G-09)
- [x] `limparCookieSessao` envia o cookie vencido
- [x] Gate quick passa: `pnpm --filter @pelada/api test`

**Tests**: unit
**Gate**: quick

---

### T6: Remetente de e-mail

**What**: Interface `Remetente`, `remetenteResend` (`fetch` com `Idempotency-Key`, `text` e `html`), `remetenteMemoria` e os modelos de confirmação, recuperação, convite e aviso de cadastro duplicado, com o link montado de `URL_PUBLICA` e o token no fragmento.
**Where**: `backend/api/src/infraestrutura/email/` (um arquivo por peça: `remetente.ts`, `resend.ts`, `memoria.ts`, `modelos.ts`)
**Depends on**: None
**Reuses**: pesquisa do Resend de 2026-10-26 (design, C5)
**Requirement**: ACE-21, ACE-52, AD-010

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Com `fetch` simulado: 200 vira `'enviado'`; 429 `daily_quota_exceeded` e 500 viram `'falhou'`, e o log só traz o status e o código, nunca o corpo nem o link (ACE-52, ACE-21)
- [x] O link do modelo é `${URL_PUBLICA}/confirmar#t=<token>` e não tem URL absoluta fixa (G-18)
- [x] Gate quick passa: `pnpm --filter @pelada/api test`

**Tests**: unit
**Gate**: quick

---

### T7: Migration das tabelas, RLS e grants de conta

**What**: Migration nova com as colunas de `contas` (`email_confirmado_em` com o preenchimento das contas existentes, `termos_versao`, `termos_aceitos_em`, `excluida_em`) e de `tentativas_login` (`ip_hash`), as tabelas `links_conta`, `convites_admin` e `envios_email`, a RLS `FORCE` com as policies e os grants do C1.
**Where**: `backend/api/src/infraestrutura/db/migracoes/<timestamp>_conta-tabelas.sql`
**Depends on**: None
**Reuses**: `1792843320000_rls.sql` (padrão de policies); `backend/api/test/isolamento/casos.ts`
**Requirement**: ACE-43, ACE-44, ACE-45, ACE-46

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Uma conta existente antes da migration fica com `email_confirmado_em = criada_em`
- [x] Como `pelada_app`, a conta A lê só a própria linha de `contas` e as próprias `sessoes`; não lê `senha_hash`; não lê `tentativas_login`, `links_conta`, `envios_email` nem `pedidos_reset` (ACE-43, ACE-44)
- [x] `convites_admin` entra em `casos.ts` e passa nos cenários de isolamento por grupo; `rls.test.ts` e `roles.test.ts` incluem as tabelas novas; `auditoria` aceita `INSERT` e recusa `UPDATE` e `DELETE` (ACE-45, ACE-46)
- [x] `pelada_backup` lê todas as tabelas novas
- [x] Gate full passa

**Tests**: integration
**Gate**: full

---

### T8: Funções de cadastro e links

**What**: Migration nova com `conta_cadastrar`, `link_pedir`, `link_confirmar` e `link_nova_senha`, com o intervalo de 60 s em `envios_email`.
**Where**: `backend/api/src/infraestrutura/db/migracoes/<timestamp>_conta-cadastro-e-links.sql`
**Depends on**: T7
**Reuses**: legado: `repositorios/contas.ts` (`crypt`, `HASH_FIXO`)
**Requirement**: ACE-01, ACE-04, ACE-06, ACE-07, ACE-08, ACE-23, ACE-24, ACE-25, ACE-51

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `conta_cadastrar` com e-mail novo cria a conta não confirmada com `termos_versao`; com e-mail existente devolve `existente` e não altera a conta (ACE-01, ACE-04)
- [x] `link_confirmar` aceita o link dentro de 24 h e cria a sessão; recusa vencido, usado ou inexistente (ACE-06, ACE-07)
- [x] Pedir um novo link invalida o anterior do mesmo tipo; o segundo pedido em menos de 60 s devolve `enviar = false` (ACE-08, ACE-23, ACE-51)
- [x] `link_nova_senha` troca a senha, confirma o e-mail e apaga todas as sessões; o link de 1 h vencido é recusado (ACE-24, ACE-25)
- [x] Gate full passa

**Tests**: integration
**Gate**: full

---

### T9: Funções de entrar e de sessão

**What**: Migration nova com `conta_entrar` (trava por e-mail e IP, bloqueio de 5 falhas em 15 min, hash fixo para e-mail inexistente, criação da sessão) e `sessao_tocar` (15 min de inatividade, 12 h absolutas, renovação).
**Where**: `backend/api/src/infraestrutura/db/migracoes/<timestamp>_conta-entrar-e-sessao.sql`
**Depends on**: T8
**Reuses**: legado: `repositorios/tentativas.ts:58-69` (trava por e-mail), `repositorios/sessoes.ts`
**Requirement**: ACE-11, ACE-12, ACE-13, ACE-14, ACE-15, ACE-16, ACE-66

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] E-mail inexistente e senha errada devolvem o mesmo resultado `invalida`; conta não confirmada com senha certa devolve `nao_confirmado` sem sessão (ACE-11, ACE-12)
- [x] 5 falhas do par e-mail e IP bloqueiam esse par, mesmo com a senha certa, até 15 min depois da quinta; outro IP sem falhas entra (ACE-13, ACE-14)
- [x] Duas falhas simultâneas do mesmo par contam 2 (ACE-66)
- [x] `sessao_tocar` recusa e apaga a sessão parada há 15 min e a criada há 12 h, mesmo em uso (relógio controlado no teste) (ACE-15, ACE-16)
- [x] Gate full passa

**Tests**: integration
**Gate**: full

---

### T10: Funções de troca de senha e exclusão de conta

**What**: Migration nova com `conta_trocar_senha` e `conta_excluir` (recusa de único admin e anonimização).
**Where**: `backend/api/src/infraestrutura/db/migracoes/<timestamp>_conta-senha-e-exclusao.sql`
**Depends on**: T9
**Reuses**: design C1 ("Exclusão como anonimização")
**Requirement**: ACE-26, ACE-27, ACE-28, ACE-29, ACE-30, ACE-69

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] A troca de senha apaga as outras sessões e mantém a atual; senha atual errada não troca (ACE-26, ACE-27)
- [x] A exclusão de conta sem grupo como único admin apaga sessões, vínculos e links, deixa a linha sem nome, e-mail nem senha válidos, e a auditoria passa a mostrar "Conta excluída" (ACE-28)
- [x] A conta que é a única admin de um grupo não arquivado recebe `unico_admin` com a lista dos grupos e nada muda; senha errada não apaga nada (ACE-29, ACE-30)
- [x] Depois da exclusão, `sessao_tocar` com a sessão antiga devolve nulo (ACE-69)
- [x] Gate full passa

**Tests**: integration
**Gate**: full

---

### T11: Funções de convite

**What**: Migration nova com `convite_criar`, `convite_ler`, `convite_aceitar` e `convite_cadastrar`.
**Where**: `backend/api/src/infraestrutura/db/migracoes/<timestamp>_conta-convites.sql`
**Depends on**: T10
**Reuses**: `grupos_visiveis()`
**Requirement**: ACE-31, ACE-32, ACE-33, ACE-34, ACE-35, ACE-36, ACE-67

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `convite_criar` só funciona com vínculo no grupo, recusa quem já é admin (`ja_e_admin`) e respeita os 60 s (ACE-31, ACE-32)
- [x] `convite_aceitar` cria o vínculo com `acessa_financeiro` falso; recusa e-mail de outra conta (`convite_de_outro_email`) e convite vencido, usado ou cancelado (ACE-33, ACE-35, ACE-36)
- [x] `convite_cadastrar` cria a conta já confirmada com o e-mail do convite, o vínculo e a sessão (ACE-34)
- [x] Dois aceites simultâneos do mesmo convite criam um vínculo só (ACE-67)
- [x] Gate full passa

**Tests**: integration
**Gate**: full

---

### T12: Proteções das funções do banco

**What**: Teste que lista as funções `SECURITY DEFINER` e falha se alguma não tiver `search_path` fixo ou tiver `EXECUTE` para `PUBLIC`, e checagem que falha com `crypt(` fora das migrations (G-02).
**Where**: `backend/api/test/migracoes/funcoes-definer.test.ts`
**Depends on**: T11
**Reuses**: `backend/api/test/apoio/como-role.ts`
**Requirement**: ACE-43, AD-008

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Uma função de teste sem `SET search_path` faz o teste falhar (provado numa cópia)
- [x] `conta_definir_senha` não tem `EXECUTE` para `pelada_app`
- [x] A checagem do `crypt(` fora de `migracoes/` roda no `pnpm test:checagens` e no job `base`
- [x] Gate full passa

**Tests**: integration
**Gate**: full

---

### T13: Repositórios de contas, sessões e links

**What**: Repositórios finos sobre as funções (cadastrar, entrar, eu, trocar senha, excluir, tocar sessão em transação curta, encerrar sessão, pedir, confirmar e consumir links) e os tipos Kysely das tabelas.
**Where**: `backend/api/src/infraestrutura/db/repositorios/contas.ts` (e `sessoes.ts`, `links.ts`, `tipos.ts` no mesmo commit)
**Depends on**: T12
**Reuses**: `transacao-da-requisicao.ts` (para a transação curta de `sessoes.tocar`)
**Requirement**: ACE-43, ACE-47, AD-007

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `sessoes.tocar` abre e fecha a própria transação e devolve o `conta_id` ou nulo
- [x] Cada função do repositório tem o caminho feliz e um de erro testados no Postgres local
- [x] Gate full passa

**Tests**: integration
**Gate**: full

---

### T14: Repositórios de convites, admins e auditoria

**What**: `convites.*`, `admins.listar` e `admins.remover` (com o `FOR UPDATE` do último admin) e `auditoria.registrar`, todos com `grupoId` como primeiro parâmetro.
**Where**: `backend/api/src/infraestrutura/db/repositorios/admins.ts` (e `convites.ts`, `auditoria.ts` no mesmo commit)
**Depends on**: T13
**Reuses**: legado: `aplicacao/acesso/vinculo.ts`
**Requirement**: ACE-37, ACE-39, ACE-40, ACE-42

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Duas remoções simultâneas dos dois últimos admins deixam um admin (ACE-40)
- [x] A remoção grava uma linha em `auditoria` na mesma transação (ACE-42)
- [x] A checagem `checar-grupo-id` (G-03) nasce aqui e roda no `pnpm test:checagens`
- [x] Gate full passa

> SPEC_DEVIATION (T14): a RLS de `contas` não deixa a `pelada_app` ler o nome e o e-mail dos outros admins (ACE-43), então `admins.listar` usa a função nova `admins_listar(grupo_id)` (`SECURITY DEFINER`, migration `1792843680000_conta-admins-listar.sql`, aditiva). `funcoes-definer.test.ts` ganhou o nome dela na lista esperada (só acréscimo).

**Tests**: integration
**Gate**: full

---

### T15: Middlewares de sessão e ordem da entrada

**What**: `carregarSessao` e `exigirSessao`; em `criarApp`, `exigirCabecalhoPelada` antes dos limitadores, `LIMITE_ENTRAR` nas rotas sem sessão da tabela do C4 e `carregarSessao` antes do `comBanco`.
**Where**: `backend/api/src/entrada/middlewares/sessao.ts` (e a ordem em `app.ts`)
**Depends on**: T14
**Reuses**: legado: `entrada/middlewares/sessao.ts`; `backend/api/test/apoio/cliente.ts` (gancho `preparar` para uma rota de prova)
**Requirement**: ACE-15, ACE-16, ACE-47, ACE-49, ACE-50, ACE-53

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] 11 POST sem `X-Pelada` seguidos de 1 com o cabeçalho: o último não recebe 429 (ACE-49, SEC-005)
- [x] Com cookie válido, a primeira consulta da rota já roda com `app.conta_id` da sessão e em `READ ONLY` num GET (ACE-47)
- [x] Sessão vencida responde 401 `sessao_expirada` e limpa o cookie (ACE-15, ACE-16)
- [x] Gate full passa

> Nota (T15): no pool workerd não há o owner para envelhecer a sessão; o teste de rota usa a sessão apagada, o estado em que `sessao_tocar` deixa a vencida. Os 15 min e as 12 h são provados em `test/repositorios/sessoes.test.ts` (pela mesma `sessoes.tocar` que o middleware chama) e em `test/migracoes/conta-entrar-e-sessao.test.ts`.

**Tests**: e2e
**Gate**: full

---

### T16: Middleware de vínculo e listagem de rotas (G-04)

**What**: `exigirVinculo` em `/api/grupos/:grupoId/*` (404 sem vínculo) e o meta-teste que lista as rotas registradas no Hono e falha se alguma não tiver caso em `casos.ts`.
**Where**: `backend/api/src/entrada/middlewares/vinculo.ts`
**Depends on**: T15
**Reuses**: `backend/api/test/isolamento/meta.test.ts`
**Requirement**: ACE-41, ACE-48

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Conta sem vínculo com o grupo recebe 404 numa rota de prova do grupo (ACE-41)
- [x] Registrar uma rota sem caso em `casos.ts` faz o meta-teste falhar (ACE-48)
- [x] Gate full passa

**Tests**: e2e
**Gate**: full

---

### T17: Rotas de sessão (entrar, eu, sair)

**What**: `POST /api/sessao/entrar`, `GET /api/sessao` e `POST /api/sessao/sair`, com os casos em `casos.ts`.
**Where**: `backend/api/src/entrada/rotas/sessao.ts`
**Depends on**: T16
**Reuses**: legado: `entrada/rotas/sessao-entrar.ts`, `aplicacao/acesso/sessao-eu.ts`
**Requirement**: ACE-09, ACE-10, ACE-11, ACE-12, ACE-13, ACE-14, ACE-17, ACE-18, ACE-21

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Entrar certo responde 200 com nome e e-mail e o cookie do G-09; o banco guarda só o hash (ACE-09, ACE-10)
- [x] 401 `credenciais_invalidas`, 403 `email_nao_confirmado` e 429 `bloqueado_temporariamente` nos casos da spec (ACE-11 a ACE-14)
- [x] `GET /api/sessao` lista os grupos com vínculo; sem sessão, 401; sair apaga a sessão e responde 204 (ACE-17, ACE-18)
- [x] O log capturado do teste não contém a senha nem o token (ACE-21, G-08)
- [x] Gate full passa

**Tests**: e2e
**Gate**: full

---

### T18: Rotas de cadastro e confirmação

**What**: `POST /api/conta`, `POST /api/conta/confirmar` e `POST /api/conta/reenviar-confirmacao`, com o remetente em memória nos testes.
**Where**: `backend/api/src/entrada/rotas/conta-cadastro.ts`
**Depends on**: T17
**Reuses**: T6, T13
**Requirement**: ACE-01, ACE-02, ACE-03, ACE-04, ACE-06, ACE-07, ACE-08, ACE-51, ACE-52

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Cadastro novo e cadastro com e-mail existente respondem 201 com a mesma mensagem; o segundo manda o aviso ao dono do e-mail (ACE-01, ACE-04)
- [x] 422 `termos_obrigatorios` e 422 com o campo inválido (ACE-02, ACE-03)
- [x] O link capturado confirma e abre sessão; o link inválido responde 410 `link_invalido` (ACE-06, ACE-07)
- [x] Remetente que falha leva a 503 `email_indisponivel`, e pedir de novo envia (ACE-52)
- [x] Gate full passa

**Tests**: e2e
**Gate**: full

---

### T19: Rotas de recuperação de senha

**What**: `POST /api/sessao/esqueci-senha` e `POST /api/sessao/nova-senha`.
**Where**: `backend/api/src/entrada/rotas/sessao-recuperacao.ts`
**Depends on**: T18
**Reuses**: T13
**Requirement**: ACE-22, ACE-23, ACE-24, ACE-25

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] A mesma resposta 200 para e-mail com e sem conta; só a conta existente recebe o e-mail (ACE-22, ACE-23)
- [x] A nova senha com link válido responde 200, encerra as sessões e a senha antiga deixa de entrar; link inválido responde 410 (ACE-24, ACE-25)
- [x] Gate full passa

**Tests**: e2e
**Gate**: full

---

### T20: Rotas de minha conta

**What**: `POST /api/conta/senha` e `POST /api/conta/excluir`.
**Where**: `backend/api/src/entrada/rotas/conta-minha.ts`
**Depends on**: T19
**Reuses**: T13
**Requirement**: ACE-26, ACE-27, ACE-28, ACE-29, ACE-30, ACE-69

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Troca de senha responde 204 e a sessão de outro aparelho passa a 401; senha atual errada responde 401 (ACE-26, ACE-27)
- [x] Exclusão responde 204 e o login seguinte responde 401; único admin responde 409 com os grupos; senha errada responde 401 (ACE-28 a ACE-30)
- [x] Gate full passa

**Tests**: e2e
**Gate**: full

---

### T21: Rotas de convite (aceitar e cadastrar)

**What**: `POST /api/convites/ler`, `POST /api/convites/aceitar` e `POST /api/convites/cadastrar`.
**Where**: `backend/api/src/entrada/rotas/convites.ts`
**Depends on**: T17
**Reuses**: T14
**Requirement**: ACE-33, ACE-34, ACE-35, ACE-36

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Ler devolve o nome do grupo e se a conta existe; aceitar com a conta certa cria o vínculo (ACE-33)
- [x] Cadastrar pelo convite abre sessão com o grupo em `GET /api/sessao` (ACE-34)
- [x] 403 `convite_de_outro_email` e 410 `link_invalido` (ACE-35, ACE-36)
- [x] Gate full passa

**Tests**: e2e
**Gate**: full

---

### T22: Rotas de admins do grupo

**What**: `GET /api/grupos/:grupoId/admins`, `POST …/admins/convites`, `DELETE …/admins/convites/:id` e `DELETE …/admins/:contaId`.
**Where**: `backend/api/src/entrada/rotas/admins.ts`
**Depends on**: T17
**Reuses**: T14, T16; legado: `entrada/rotas/grupos/admins/`
**Requirement**: ACE-31, ACE-32, ACE-37, ACE-38, ACE-39, ACE-40, ACE-41, ACE-42

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Convidar responde 201 e manda o e-mail; já admin responde 409 (ACE-31, ACE-32)
- [x] Listar traz admins e convites pendentes; cancelar e remover respondem 204 e gravam auditoria (ACE-37 a ACE-39, ACE-42)
- [x] Remover o último admin responde 409 `ultimo_admin`; outra conta sem vínculo recebe 404 (ACE-40, ACE-41)
- [x] Gate full passa

**Tests**: e2e
**Gate**: full

---

### T23: Caixa de e-mails de desenvolvimento e variáveis

**What**: Rota `GET /api/dev/emails` registrada só com `EMAIL_DEV=1`; `RESEND_API_KEY`, `RESEND_REMETENTE`, `EMAIL_DEV` e `SEED_SENHA_ADMIN` no `.env.example`, no `env.ts` e no `.dev.vars` de exemplo; teste de que o `wrangler.jsonc` de produção não define `EMAIL_DEV`.
**Where**: `backend/api/src/entrada/rotas/dev-emails.ts`
**Depends on**: T18
**Reuses**: `backend/scripts/test/env-example.test.ts` (G-28), `backend/api/test/config/wrangler.test.ts`
**Requirement**: ACE-52 (design C5)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Sem `EMAIL_DEV`, a rota responde 404; com ele, lista as mensagens do remetente em memória
- [x] `env-example.test.ts` e `wrangler.test.ts` passam com as variáveis novas
- [x] Gate full passa

**Tests**: e2e
**Gate**: full

---

### T24: Script do dono

**What**: `pnpm dono -- --email <e-mail> [--alvo producao]`, que lê a senha sem eco e chama `conta_definir_senha` como owner.
**Where**: `backend/scripts/dono.ts`
**Depends on**: None
**Reuses**: legado: `backend/scripts/dono.ts`; `infraestrutura/seguranca/trava-host.ts`
**Requirement**: ACE-61, ACE-62, ACE-63

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] No banco temporário, o script cria a conta do dono e uma segunda execução troca a senha (ACE-61)
- [x] Host remoto sem `--alvo` é recusado sem alterar nada (ACE-62)
- [x] O lint `pelada/sem-escrita-dono` continua sem exceção nas rotas (ACE-63)
- [x] Gate quick passa: `pnpm test:checagens`

**Tests**: integration
**Gate**: full

---

### T25: Seed com conta que entra

**What**: O seed passa a criar a conta admin confirmada com a senha de `SEED_SENHA_ADMIN` e recusa rodar sem ela.
**Where**: `backend/api/src/infraestrutura/db/repositorios/seed-local.ts`
**Depends on**: T24
**Reuses**: `conta_definir_senha`
**Requirement**: ACE-64

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Depois do seed, `conta_entrar` com o e-mail do seed e a senha do `.env` devolve `ok`
- [x] Sem `SEED_SENHA_ADMIN`, o seed sai com erro e não grava nada
- [x] Gate full passa

**Tests**: integration
**Gate**: full

---

### T26: Cliente HTTP e provedor de consultas

**What**: `ler`, `escrever` (com `X-Pelada: 1` e `credentials: 'same-origin'`) e o `QueryClientProvider`; 401 `sessao_expirada` limpa o cache e leva a `/entrar` com o aviso.
**Where**: `frontend/web/src/dados/cliente.ts`
**Depends on**: None
**Reuses**: legado: `frontend/web/src/dados/cliente.ts`
**Requirement**: ACE-20, ACE-49

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Toda escrita envia `X-Pelada: 1`; o erro padrão da API vira um erro tipado com `codigo` e `campos`
- [x] 401 `sessao_expirada` navega para `/entrar` com o aviso da spec (ACE-20)
- [x] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T27: Sessão no front e guarda de rota

**What**: `useSessao`, `useSair`, `RotaProtegida` e `decidirRota` (sem sessão vai a `/entrar` e volta depois; com sessão, `/entrar` vai a `/app`).
**Where**: `frontend/web/src/app/guarda/decidir-rota.ts` (e `RotaProtegida.tsx`, `dados/sessao.ts` no mesmo commit)
**Depends on**: T26
**Reuses**: legado: `frontend/web/src/app/guarda/`, `dados/sessao.ts`
**Requirement**: ACE-19, ACE-65

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `decidirRota` cobre: sem sessão em `/app/conta` → `/entrar?volta=/app/conta`; depois do login → `/app/conta`; logado em `/entrar` → `/app` (ACE-19, ACE-65)
- [x] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T28: Leitura do token no fragmento

**What**: `lerTokenDoFragmento()`, que lê `#t=`, apaga o fragmento com `history.replaceState` e devolve o token.
**Where**: `frontend/web/src/dados/fragmento.ts`
**Depends on**: T27
**Reuses**: nada
**Requirement**: AD-010

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Com `#t=abc`, devolve `abc` e a URL fica sem fragmento; sem fragmento, devolve nulo
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T29: Rotas do app

**What**: As rotas do C7 em `criarRotas()`, carregadas sob demanda, com `/app` sob a guarda; `/` continua a página provisória.
**Where**: `frontend/web/src/app/rotas.tsx`
**Depends on**: T28
**Reuses**: `frontend/web/src/app/rotas.tsx` atual
**Requirement**: ACE-19, ACE-58

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `/termos` e `/privacidade` abrem sem sessão; `/app` sem sessão vai para `/entrar` (ACE-19, ACE-58)
- [ ] Rota inexistente mostra a tela de erro do projeto, não a padrão do React Router (achado L8 da fundação)
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T30: Tela Entrar

**What**: A tela `/entrar` conforme t04 (vazio, carregando, erro, bloqueado, e-mail não confirmado com reenviar, sessão expirada, link "Criar conta").
**Where**: `frontend/web/src/telas/entrar/Entrar.tsx`
**Depends on**: None
**Reuses**: legado: `telas/entrar/Entrar.tsx`; mockup `t04-entrar--*`
**Requirement**: ACE-11, ACE-12, ACE-13, ACE-20, ACE-54

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Cada estado do mockup aparece com o texto da spec; axe sem violação
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T31: Tela Cadastro

**What**: A tela `/cadastro` conforme t29, com o aceite dos termos desmarcado.
**Where**: `frontend/web/src/telas/cadastro/Cadastro.tsx`
**Depends on**: None
**Reuses**: `CampoSenha`, `ResumoErros`, `CaixaSelecao`; mockup `t29-cadastro--*`
**Requirement**: ACE-01, ACE-02, ACE-03, ACE-55, ACE-59

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Vazio, carregando, erro com resumo e sucesso "Verifique seu e-mail"; o aceite nasce desmarcado; axe sem violação
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T32: Tela Confirmar e-mail

**What**: A tela `/confirmar` conforme t30 (confirmando, link inválido com pedir novo, reenviado).
**Where**: `frontend/web/src/telas/confirmar/Confirmar.tsx`
**Depends on**: None
**Reuses**: `lerTokenDoFragmento`; mockup `t30-confirmar--*`
**Requirement**: ACE-06, ACE-07, ACE-08, ACE-55

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Sucesso leva a `/app`; 410 mostra "Link inválido ou vencido" com o pedido de novo link; axe sem violação
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T33: Tela Esqueci a senha

**What**: A tela `/entrar/esqueci` conforme t05 (vazio, enviado, e-mail indisponível).
**Where**: `frontend/web/src/telas/esqueci/EsqueciSenha.tsx`
**Depends on**: None
**Reuses**: legado: `telas/esqueci/EsqueciSenha.tsx`; mockup `t05-esqueci--*`
**Requirement**: ACE-22, ACE-52, ACE-54

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Os três estados com os textos da spec; axe sem violação
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T34: Tela Nova senha

**What**: A tela `/entrar/nova-senha` conforme t06 (vazio, erro, link inválido, sucesso indo a `/entrar` com o aviso).
**Where**: `frontend/web/src/telas/nova-senha/NovaSenha.tsx`
**Depends on**: None
**Reuses**: `CamposNovaSenha`, `lerTokenDoFragmento`; mockup `t06-nova-senha--*`
**Requirement**: ACE-24, ACE-25, ACE-54

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Os quatro estados; senhas diferentes mostram "As senhas não conferem."; axe sem violação
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T35: Página Termos de uso

**What**: A página pública `/termos` conforme t33, com a versão de `TERMOS_VERSAO` e o selo de rascunho.
**Where**: `frontend/web/src/telas/termos/PaginaTermos.tsx`
**Depends on**: None
**Reuses**: mockup `t33-termos--pagina`
**Requirement**: ACE-58, ACE-60

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] A página mostra a versão e o selo "Rascunho para revisão"; axe sem violação
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T36: Página Privacidade

**What**: A página `/privacidade` conforme o t07 novo (versão, selo de rascunho, e-mails, exclusão pela própria conta).
**Where**: `frontend/web/src/telas/privacidade/PaginaPrivacidade.tsx`
**Depends on**: None
**Reuses**: legado: `telas/privacidade/PaginaPrivacidade.tsx`; mockup `t07-privacidade--pagina`
**Requirement**: ACE-58, ACE-60

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] A página mostra a versão, o selo e as seções do mockup; axe sem violação
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T37: Tela Seus grupos e menu da conta

**What**: `/app` conforme t08 (vazio e lista) e o menu da conta conforme t09 (Minha conta, Privacidade, Termos, Sair).
**Where**: `frontend/web/src/telas/grupos/SeusGrupos.tsx`
**Depends on**: None
**Reuses**: legado: `telas/grupos/EscolherGrupo.tsx`; mockup `t08-grupos--*`, `t09-inicio--menu-conta`
**Requirement**: ACE-18, ACE-57

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Sem vínculos, o estado vazio do t08; com vínculos, a lista com o selo "Sem acesso ao financeiro"; Sair chama `useSair`; axe sem violação
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T38: Tela Minha conta

**What**: `/app/conta` conforme t32 (dados, trocar senha, diálogo de exclusão com senha, único admin com a lista de grupos, conta excluída).
**Where**: `frontend/web/src/telas/minha-conta/MinhaConta.tsx`
**Depends on**: None
**Reuses**: `Dialogo`, `Lista`; mockup `t32-conta--*`
**Requirement**: ACE-28, ACE-29, ACE-30, ACE-55

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Os estados do mockup; 409 mostra os grupos; depois de excluir, a tela vai a `/` com "Sua conta foi excluída"; axe sem violação
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T39: Tela Minha senha

**What**: `/app/conta/senha` conforme t25 (vazio, erro, sucesso "Senha trocada. Outros aparelhos foram desconectados.").
**Where**: `frontend/web/src/telas/minha-senha/MinhaSenha.tsx`
**Depends on**: None
**Reuses**: legado: `telas/minha-senha/MinhaSenha.tsx`; mockup `t25-senha--*`
**Requirement**: ACE-26, ACE-27, ACE-54

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Os três estados; 401 marca o campo "Senha atual"; axe sem violação
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T40: Tela Convite

**What**: `/convite` conforme t31 (carregando, logado, sem conta com e-mail travado, outro e-mail, inválido).
**Where**: `frontend/web/src/telas/convite/Convite.tsx`
**Depends on**: None
**Reuses**: `lerTokenDoFragmento`; mockup `t31-convite--*`
**Requirement**: ACE-33, ACE-34, ACE-35, ACE-36, ACE-55

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Os cinco estados; no cadastro pelo convite, o e-mail vem preenchido e só leitura; axe sem violação
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T41: Tela Admins do grupo

**What**: `/app/grupos/:grupoId/admins` conforme t19 novo (lista, convites pendentes, convidar, convite enviado, já admin, remover, último admin, carregando).
**Where**: `frontend/web/src/telas/admins/PaginaAdmins.tsx`
**Depends on**: None
**Reuses**: legado: `telas/admins/PaginaAdmins.tsx`; mockup `t19-admins--*`
**Requirement**: ACE-31, ACE-32, ACE-37, ACE-38, ACE-39, ACE-40, ACE-54

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Os estados do mockup; o diálogo de remoção segue o `t19-admins--remover`; axe sem violação
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T42: Comparação visual das telas de acesso

**What**: Promover o mockup do módulo para `.specs/mockup/telas/` (caminhos `../../../../mockup/` viram `../`), registrar as telas em `.specs/mockup/telas.json` com rota e respostas de exemplo, e incluí-las em `frontend/web/e2e/telas-ativas.txt`.
**Where**: `frontend/web/e2e/telas-ativas.txt` (e as telas e o `telas.json` em `.specs/mockup/`)
**Depends on**: None
**Reuses**: `frontend/web/e2e/visual.mjs`, `.specs/mockup/respostas/`
**Requirement**: ACE-54, ACE-55, ACE-56

**Tools**:

- MCP: NONE
- Skill: `mockup-visual` (promoção do modo módulo)

**Done when**:

- [ ] `pnpm --filter @pelada/web visual` compara as 36 telas nos dois viewports, com diferença máxima abaixo de 1%
- [ ] `python .claude/scripts/checar-tokens.py frontend/web/src` passa
- [ ] Gate build passa

**Tests**: e2e
**Gate**: build

---

### T43: Fluxos ponta a ponta de acesso

**What**: Testes Playwright dos "Independent Test" da spec: cadastro → link da caixa de dev → `/app`; entrar e sair; recuperação; convite entre duas contas.
**Where**: `frontend/web/e2e/acesso.spec.ts`
**Depends on**: T42
**Reuses**: `frontend/web/e2e/playwright.config.ts`; rota `GET /api/dev/emails` (T23)
**Requirement**: ACE-01, ACE-06, ACE-09, ACE-17, ACE-24, ACE-33

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Os quatro fluxos passam contra o build e o Worker local com `EMAIL_DEV=1`
- [ ] Gate full passa (com `pnpm --filter @pelada/web e2e`)

**Tests**: e2e
**Gate**: full

---

### T44: Documentação da feature

**What**: GUARDRAILS (G-03, G-04, G-08, G-09, G-11, G-20 passam a "Ativa"), ADR-029 (sessão e funções `SECURITY DEFINER`, AD-007 e AD-008), runbook (verificar o domínio no Resend, secrets `RESEND_API_KEY` e `RESEND_REMETENTE`, uso do `dono.ts`, cota de 100 e-mails por dia), README (variáveis novas e caixa de dev) e THREAT-MODEL (rotas de autenticação).
**Where**: `.md/adr/029-sessao-em-transacao-propria-e-funcoes-de-conta.md` (e os documentos citados no mesmo commit)
**Depends on**: T43
**Reuses**: formato dos ADRs 024 a 028
**Requirement**: ACE-48 (G-04), G-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Cada guardrail citado aponta para o teste que existe agora
- [ ] O runbook lista os passos externos da liberação desta feature, cada um com confirmação
- [ ] Gate build passa

**Tests**: none
**Gate**: build

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8 → Phase 9

Phase 1:  T1 → T2 → T3
          T4 → T5
          T6
Phase 2:  T7 → T8 → T9 → T10 → T11 → T12
Phase 3:  T12 → T13 → T14 → T15 → T16
Phase 4:  T16 → T17 → T18 → T19 → T20
          T17 → T21
          T17 → T22
          T18 → T23
Phase 5:  T24 → T25
Phase 6:  T26 → T27 → T28 → T29
Phase 7:  T30, T31, T32, T33, T34, T35, T36 (independentes)
Phase 8:  T37, T38, T39, T40, T41 (independentes)
Phase 9:  T42 → T43 → T44
```

Execução estritamente sequencial: um trabalhador faz uma tarefa por vez, em ordem.

**Lotes sugeridos (~7 tarefas, fases inteiras):**

| Lote | Fases | Tarefas | Trabalhador |
| --- | --- | --- | --- |
| 1 | 1 | T1 a T6 | `implementador` |
| 2 | 2 | T7 a T12 | `implementador-dominio` |
| 3 | 3 | T13 a T16 | `implementador-dominio` |
| 4 | 4 | T17 a T23 | `implementador` |
| 5 | 5 e 6 | T24 a T29 | `implementador` |
| 6 | 7 | T30 a T36 | `implementador` |
| 7 | 8 e 9 | T37 a T44 | `implementador` |

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 a T6 | um módulo cada (primitivos, schemas, script, token, cookie, remetente com 4 arquivos coesos de uma interface) | ✅ (T6 ⚠️ coeso: uma interface e suas duas implementações) |
| T7 a T11 | uma migration cada | ✅ |
| T12 | um teste de proteção | ✅ |
| T13, T14 | repositórios de um mesmo grupo de funções | ⚠️ coeso (tipos e repositórios irmãos no mesmo commit) |
| T15, T16 | um middleware cada (T15 inclui a ordem em `app.ts`) | ✅ |
| T17 a T23 | um arquivo de rotas cada | ✅ |
| T24, T25 | um script cada | ✅ |
| T26 a T29 | um módulo cada (T27 ⚠️ coeso: guarda e hook de sessão) | ✅ |
| T30 a T41 | uma tela cada | ✅ |
| T42 | registro das telas na comparação visual | ✅ |
| T43 | um arquivo de e2e | ✅ |
| T44 | documentação da feature | ⚠️ coeso (docs do mesmo fechamento) |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | — | ✅ |
| T2 | T1 | T1 → T2 | ✅ |
| T3 | T2 | T2 → T3 | ✅ |
| T4 | None | — | ✅ |
| T5 | T4 | T4 → T5 | ✅ |
| T6 | None | — | ✅ |
| T7 | None | — | ✅ |
| T8 | T7 | T7 → T8 | ✅ |
| T9 | T8 | T8 → T9 | ✅ |
| T10 | T9 | T9 → T10 | ✅ |
| T11 | T10 | T10 → T11 | ✅ |
| T12 | T11 | T11 → T12 | ✅ |
| T13 | T12 | fase anterior (Phase 2) | ✅ |
| T14 | T13 | T13 → T14 | ✅ |
| T15 | T14 | T14 → T15 | ✅ |
| T16 | T15 | T15 → T16 | ✅ |
| T17 | T16 | fase anterior (Phase 3) | ✅ |
| T18 | T17 | T17 → T18 | ✅ |
| T19 | T18 | T18 → T19 | ✅ |
| T20 | T19 | T19 → T20 | ✅ |
| T21 | T17 | T17 → T21 | ✅ |
| T22 | T17 | T17 → T22 | ✅ |
| T23 | T18 | T18 → T23 | ✅ |
| T24 | None | — | ✅ |
| T25 | T24 | T24 → T25 | ✅ |
| T26 | None | — | ✅ |
| T27 | T26 | T26 → T27 | ✅ |
| T28 | T27 | T27 → T28 | ✅ |
| T29 | T28 | T28 → T29 | ✅ |
| T30 a T41 | None | — | ✅ |
| T42 | None | — | ✅ |
| T43 | T42 | T42 → T43 | ✅ |
| T44 | T43 | T43 → T44 | ✅ |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 a T3 | Contrato | unit | unit | ✅ |
| T4 a T6 | Infraestrutura da API (token, cookie, e-mail) | unit | unit | ✅ |
| T7 a T12 | Banco | integration | integration | ✅ |
| T13, T14 | Repositórios | integration | integration | ✅ |
| T15, T16 | Middlewares da API | e2e | e2e | ✅ |
| T17 a T23 | Rotas da API | e2e | e2e | ✅ |
| T24, T25 | Scripts com banco | integration | integration | ✅ |
| T26 a T41 | Front: dados, guarda e telas | unit | unit | ✅ |
| T42 | Front: comparação visual | e2e visual | e2e | ✅ |
| T43 | Front: fluxos ponta a ponta | e2e | e2e | ✅ |
| T44 | Documentação | none | none | ✅ |
