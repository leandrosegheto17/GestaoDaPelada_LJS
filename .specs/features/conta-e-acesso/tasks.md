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

> **Registro do lote 5 (2026-10-27, aprovado pelo usuário):** T24 a T29. Mudança em teste existente aprovada: `App.test.tsx` passa a esperar "Página não encontrada" (tela própria exigida pela T29) no lugar de `404|Not Found`. Regra de lint `pelada/sem-escrita-dono` ligada em `backend/api/src/**` (ACE-63). Comando do dono: `pnpm dono -- --email <e-mail> [--alvo producao]`. As telas T30 a T41 sobrescrevem os 12 componentes provisórios "Tela em construção" mantendo o nome exportado. `rodarSeed` dos testes passa `SEED_SENHA_ADMIN` por padrão.

> **Registro do lote 6 (2026-10-27, aprovado pelo usuário):** T30 a T36. `CaixaSelecao` (fora do Where) passa a aceitar `ReactNode` no rótulo e ganha `id`, `aria-describedby` e `aria-invalid`, para os links dos termos no aceite (ACE-59). Apoios novos em `telas/compartilhado/` (`PaginaAcesso`, `PaginaTexto`, `falhas.ts`, `usarTokenDoLink.ts`) e `test/apoio/tela.tsx`. Combinações de URL: `/entrar?aviso=sessao-expirada|senha-alterada` e `?volta=`. 422 em `/conta/confirmar` e `/sessao/nova-senha` vale como link inválido. Pendência resolvida: o e2e `cabecalhos.spec.ts:58` (CSP) falhava desde `1f9679f`. Resolvido no commit `34332b9`: a causa era o Zod chamando `Function` ao montar os schemas no bundle de `/` (desde `1f9679f`); `backend/contrato/src/zod.ts` liga o `jitless` e todo schema importa o `z` de lá (teste `sem-eval.test.ts`).

> **Registro do lote 7 (2026-10-27, aprovado pelo usuário):** T37 a T41. Fora do Where, mudanças compatíveis: `telas/compartilhado/PaginaInterna.tsx` (barra e menu da conta), `app/PaginaProvisoria.tsx` com `?aviso=conta-excluida` e `CampoTexto` com `somenteLeitura`. SPEC_DEVIATION: T37 sem a recorrência do grupo (`GET /api/sessao` não a devolve); T40 com o texto "Você foi convidado para administrar o grupo X" (a rota não devolve quem convidou) e, para conta existente sem sessão, manda entrar e abrir o link de novo, sem levar o token à URL (AD-010). Depois de aceitar o convite a tela vai a `/app/grupos/:id/admins`, a única rota de grupo; ajustar quando a feature de grupos criar a página do grupo.

> **Registro do lote 8 (2026-10-27, T42 a T44):** mudanças aprovadas pelo usuário. (1) `frontend/web/e2e/telas-ativas.test.mjs`: o teste "são exatamente as três do critério" passa a exigir as 3 telas da fundação mais as 36 do mockup do módulo (nenhuma asserção removida; ganha um teste das rotas reais), porque a T42 acrescenta as telas de acesso a `telas-ativas.txt`. (2) SPEC_DEVIATION em `frontend/web/e2e/config-fundacao.mjs` (só `montarMapa`): tela com `"real": true` no `telas.json` é comparada na rota real, com passos, recorte e respostas do próprio mapa. (3) Promoção do mockup: as 36 telas foram para `.specs/mockup/telas/` (10 legadas homônimas sobrescritas) e as respostas novas são `.specs/mockup/respostas/acesso-*.json`. (4) Mockup promovido alinhado ao que o app faz: `botao botao--texto botao--texto-destrutivo` (como o guia), `t31` sem o nome de quem convidou e `t08-grupos--sucesso` sem a recorrência (divergências aprovadas no lote 7), `t32-conta--carregando` em branco (a guarda não mostra nada enquanto a sessão carrega). (5) Recortes na comparação, onde o mockup omite ou simplifica parte da página: `t05-esqueci--erro` (só `.faixa--erro`; o mockup omite o parágrafo de apoio), `t06-nova-senha--sucesso` e `t32-conta--excluida` (só `.faixa--sucesso`; o mockup é uma página simplificada), `t06-nova-senha--erro` (só `#nova` e `#conf`; o resumo "Corrija 1 campo" do mockup contraria o `ResumoErros`, que só aparece com 2 erros ou mais) e `t32-conta--excluir` (só o `alertdialog`; o fundo do mockup é vazio). (6) App: layout das páginas em `estilos/global.css` (faltava), classe `recuo-3`, faixa de convite enviado no topo de `PaginaAdmins`, aviso de conta excluída na largura de conteúdo. (7) T43: `playwright.config.ts` e o job `e2e` do CI (Postgres de serviço, migrations e seed) ajustados como SPEC_DEVIATION mínimo. (8) Registro tardio, achado pelo verificador: `backend/api/test/migracoes/rls.test.ts` mudou na T8 a T11 (`convites_admin` entra em `COM_GRUPO_ID`; `LEGIVEIS_PELO_SLUG` exclui `convites_admin`, com teste próprio de que o slug público não o lê; `DE_CONTA` e o bloco "RLS com FORCE nas tabelas de conta"). Nenhuma asserção removida: a lista trocou de nome e o caso de `convites_admin` ganhou teste.

> **Registro da reorganização (2026-10-27, aprovada pelo usuário):** regra nova de tarefas (CLAUDE.md, seção Tarefas). Todas as 52 tarefas ganham `**Estimativa**` (aproximada nas concluídas: 2h para T6 a T11, T13, T14, T17, T18, T43 e T44; 1,5h para T27, T42 e T47; 45 min para T48 e T50; 1h nas demais). Nenhuma tarefa passa de 2h e nenhuma foi dividida. Entram T51 (conta com hash bcrypt gerado fora do `pgcrypto`, meta 5 da spec) e T52 (log sem segredo em `esqueci-senha` e `nova-senha`, ACE-21), lacunas não bloqueantes do verificador. T45 a T52 formam a Phase 10. Ações externas (branch Neon e Hyperdrive do spike, domínio no Resend, secrets, backup) ficam no runbook e no `STATE.md`, fora do `tasks.md`.

> **Registro do aceite visual (2026-10-27, aceito pelo usuário):** galeria "Mockup × App" (84 comparações, maior diferença 0,65%, nenhuma acima de 1%). Aceitos sem ressalvas: os alinhamentos do mockup ao app (convite sem o nome de quem convidou, lista de grupos sem a recorrência, Minha conta carregando em branco, classe do botão de texto destrutivo) e as 12 comparações parciais. Verificador: PASS na volta 3. Auditoria de segurança: sem achado crítico ou alto; os 4 médios (SEC-CA-01 a 04) seguem como pendência obrigatória da fase 11.

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

### Phase 10: Correções da validação (mecânica)

Tarefas de correção do verificador (volta 1) e das lacunas que ele apontou sem bloquear. Independentes entre si.

```
T45, T46, T47, T48, T49, T50, T51, T52, T53, T54, T55, T56 (independentes)
```

### Phase 11: Correções da auditoria de segurança (AD-012)

Os 4 médios SEC-CA-01 a 04. T58 e T59 tratam a confirmação sem sessão; T60 e T61, o bcrypt das rotas com sessão; T62, o IPv6; T63, o teto de e-mails.

```
T57 → T58 → T59
T57 → T60 → T61
T57 → T62
T57 → T63
T61 → T64
T63 → T64
```

---

## Task Breakdown

### T1: Zod e primitivos no contrato

**What**: Adicionar `zod >= 4.6.6` ao `@pelada/contrato` (e o override no `pnpm-workspace.yaml`) e criar os primitivos `email` (minúsculas, sem espaços nas pontas, até 254), `senha` (8 a 72 caracteres e até 72 bytes UTF-8) e `nomeConta` (2 a 60).
**Estimativa**: 1h
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
**Estimativa**: 1h
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
**Estimativa**: 1h
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
**Estimativa**: 1h
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
**Estimativa**: 1h
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
**Estimativa**: 2h
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
**Estimativa**: 2h
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
**Estimativa**: 2h
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
**Estimativa**: 2h
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
**Estimativa**: 2h
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
**Estimativa**: 2h
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
**Estimativa**: 1h
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
**Estimativa**: 2h
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
**Estimativa**: 2h
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
**Estimativa**: 1h
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
**Estimativa**: 1h
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
**Estimativa**: 2h
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
**Estimativa**: 2h
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
**Estimativa**: 1h
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
**Estimativa**: 1h
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
**Estimativa**: 1h
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
**Estimativa**: 1h
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
**Estimativa**: 1h
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
**Estimativa**: 1h
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
**Estimativa**: 1h
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
**Estimativa**: 1h
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
**Estimativa**: 1,5h
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
**Estimativa**: 1h
**Where**: `frontend/web/src/dados/fragmento.ts`
**Depends on**: T27
**Reuses**: nada
**Requirement**: AD-010

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Com `#t=abc`, devolve `abc` e a URL fica sem fragmento; sem fragmento, devolve nulo
- [x] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T29: Rotas do app

**What**: As rotas do C7 em `criarRotas()`, carregadas sob demanda, com `/app` sob a guarda; `/` continua a página provisória.
**Estimativa**: 1h
**Where**: `frontend/web/src/app/rotas.tsx`
**Depends on**: T28
**Reuses**: `frontend/web/src/app/rotas.tsx` atual
**Requirement**: ACE-19, ACE-58

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `/termos` e `/privacidade` abrem sem sessão; `/app` sem sessão vai para `/entrar` (ACE-19, ACE-58)
- [x] Rota inexistente mostra a tela de erro do projeto, não a padrão do React Router (achado L8 da fundação)
- [x] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T30: Tela Entrar

**What**: A tela `/entrar` conforme t04 (vazio, carregando, erro, bloqueado, e-mail não confirmado com reenviar, sessão expirada, link "Criar conta").
**Estimativa**: 1h
**Where**: `frontend/web/src/telas/entrar/Entrar.tsx`
**Depends on**: None
**Reuses**: legado: `telas/entrar/Entrar.tsx`; mockup `t04-entrar--*`
**Requirement**: ACE-11, ACE-12, ACE-13, ACE-20, ACE-54

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Cada estado do mockup aparece com o texto da spec; axe sem violação
- [x] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T31: Tela Cadastro

**What**: A tela `/cadastro` conforme t29, com o aceite dos termos desmarcado.
**Estimativa**: 1h
**Where**: `frontend/web/src/telas/cadastro/Cadastro.tsx`
**Depends on**: None
**Reuses**: `CampoSenha`, `ResumoErros`, `CaixaSelecao`; mockup `t29-cadastro--*`
**Requirement**: ACE-01, ACE-02, ACE-03, ACE-55, ACE-59

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Vazio, carregando, erro com resumo e sucesso "Verifique seu e-mail"; o aceite nasce desmarcado; axe sem violação
- [x] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T32: Tela Confirmar e-mail

**What**: A tela `/confirmar` conforme t30 (confirmando, link inválido com pedir novo, reenviado).
**Estimativa**: 1h
**Where**: `frontend/web/src/telas/confirmar/Confirmar.tsx`
**Depends on**: None
**Reuses**: `lerTokenDoFragmento`; mockup `t30-confirmar--*`
**Requirement**: ACE-06, ACE-07, ACE-08, ACE-55

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Sucesso leva a `/app`; 410 mostra "Link inválido ou vencido" com o pedido de novo link; axe sem violação
- [x] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T33: Tela Esqueci a senha

**What**: A tela `/entrar/esqueci` conforme t05 (vazio, enviado, e-mail indisponível).
**Estimativa**: 1h
**Where**: `frontend/web/src/telas/esqueci/EsqueciSenha.tsx`
**Depends on**: None
**Reuses**: legado: `telas/esqueci/EsqueciSenha.tsx`; mockup `t05-esqueci--*`
**Requirement**: ACE-22, ACE-52, ACE-54

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Os três estados com os textos da spec; axe sem violação
- [x] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T34: Tela Nova senha

**What**: A tela `/entrar/nova-senha` conforme t06 (vazio, erro, link inválido, sucesso indo a `/entrar` com o aviso).
**Estimativa**: 1h
**Where**: `frontend/web/src/telas/nova-senha/NovaSenha.tsx`
**Depends on**: None
**Reuses**: `CamposNovaSenha`, `lerTokenDoFragmento`; mockup `t06-nova-senha--*`
**Requirement**: ACE-24, ACE-25, ACE-54

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Os quatro estados; senhas diferentes mostram "As senhas não conferem."; axe sem violação
- [x] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T35: Página Termos de uso

**What**: A página pública `/termos` conforme t33, com a versão de `TERMOS_VERSAO` e o selo de rascunho.
**Estimativa**: 1h
**Where**: `frontend/web/src/telas/termos/PaginaTermos.tsx`
**Depends on**: None
**Reuses**: mockup `t33-termos--pagina`
**Requirement**: ACE-58, ACE-60

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] A página mostra a versão e o selo "Rascunho para revisão"; axe sem violação
- [x] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T36: Página Privacidade

**What**: A página `/privacidade` conforme o t07 novo (versão, selo de rascunho, e-mails, exclusão pela própria conta).
**Estimativa**: 1h
**Where**: `frontend/web/src/telas/privacidade/PaginaPrivacidade.tsx`
**Depends on**: None
**Reuses**: legado: `telas/privacidade/PaginaPrivacidade.tsx`; mockup `t07-privacidade--pagina`
**Requirement**: ACE-58, ACE-60

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] A página mostra a versão, o selo e as seções do mockup; axe sem violação
- [x] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T37: Tela Seus grupos e menu da conta

**What**: `/app` conforme t08 (vazio e lista) e o menu da conta conforme t09 (Minha conta, Privacidade, Termos, Sair).
**Estimativa**: 1h
**Where**: `frontend/web/src/telas/grupos/SeusGrupos.tsx`
**Depends on**: None
**Reuses**: legado: `telas/grupos/EscolherGrupo.tsx`; mockup `t08-grupos--*`, `t09-inicio--menu-conta`
**Requirement**: ACE-18, ACE-57

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Sem vínculos, o estado vazio do t08; com vínculos, a lista com o selo "Sem acesso ao financeiro"; Sair chama `useSair`; axe sem violação
- [x] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T38: Tela Minha conta

**What**: `/app/conta` conforme t32 (dados, trocar senha, diálogo de exclusão com senha, único admin com a lista de grupos, conta excluída).
**Estimativa**: 1h
**Where**: `frontend/web/src/telas/minha-conta/MinhaConta.tsx`
**Depends on**: None
**Reuses**: `Dialogo`, `Lista`; mockup `t32-conta--*`
**Requirement**: ACE-28, ACE-29, ACE-30, ACE-55

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Os estados do mockup; 409 mostra os grupos; depois de excluir, a tela vai a `/` com "Sua conta foi excluída"; axe sem violação
- [x] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T39: Tela Minha senha

**What**: `/app/conta/senha` conforme t25 (vazio, erro, sucesso "Senha trocada. Outros aparelhos foram desconectados.").
**Estimativa**: 1h
**Where**: `frontend/web/src/telas/minha-senha/MinhaSenha.tsx`
**Depends on**: None
**Reuses**: legado: `telas/minha-senha/MinhaSenha.tsx`; mockup `t25-senha--*`
**Requirement**: ACE-26, ACE-27, ACE-54

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Os três estados; 401 marca o campo "Senha atual"; axe sem violação
- [x] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T40: Tela Convite

**What**: `/convite` conforme t31 (carregando, logado, sem conta com e-mail travado, outro e-mail, inválido).
**Estimativa**: 1h
**Where**: `frontend/web/src/telas/convite/Convite.tsx`
**Depends on**: None
**Reuses**: `lerTokenDoFragmento`; mockup `t31-convite--*`
**Requirement**: ACE-33, ACE-34, ACE-35, ACE-36, ACE-55

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Os cinco estados; no cadastro pelo convite, o e-mail vem preenchido e só leitura; axe sem violação
- [x] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T41: Tela Admins do grupo

**What**: `/app/grupos/:grupoId/admins` conforme t19 novo (lista, convites pendentes, convidar, convite enviado, já admin, remover, último admin, carregando).
**Estimativa**: 1h
**Where**: `frontend/web/src/telas/admins/PaginaAdmins.tsx`
**Depends on**: None
**Reuses**: legado: `telas/admins/PaginaAdmins.tsx`; mockup `t19-admins--*`
**Requirement**: ACE-31, ACE-32, ACE-37, ACE-38, ACE-39, ACE-40, ACE-54

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Os estados do mockup; o diálogo de remoção segue o `t19-admins--remover`; axe sem violação
- [x] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T42: Comparação visual das telas de acesso

**What**: Promover o mockup do módulo para `.specs/mockup/telas/` (caminhos `../../../../mockup/` viram `../`), registrar as telas em `.specs/mockup/telas.json` com rota e respostas de exemplo, e incluí-las em `frontend/web/e2e/telas-ativas.txt`.
**Estimativa**: 1,5h
**Where**: `frontend/web/e2e/telas-ativas.txt` (e as telas e o `telas.json` em `.specs/mockup/`)
**Depends on**: None
**Reuses**: `frontend/web/e2e/visual.mjs`, `.specs/mockup/respostas/`
**Requirement**: ACE-54, ACE-55, ACE-56

**Tools**:

- MCP: NONE
- Skill: `mockup-visual` (promoção do modo módulo)

**Done when**:

- [x] `pnpm --filter @pelada/web visual` compara as 36 telas nos dois viewports, com diferença máxima abaixo de 1%
- [x] `python .claude/scripts/checar-tokens.py frontend/web/src` passa
- [x] Gate build passa

**Tests**: e2e
**Gate**: build

---

### T43: Fluxos ponta a ponta de acesso

**What**: Testes Playwright dos "Independent Test" da spec: cadastro → link da caixa de dev → `/app`; entrar e sair; recuperação; convite entre duas contas.
**Estimativa**: 2h
**Where**: `frontend/web/e2e/acesso.spec.ts`
**Depends on**: T42
**Reuses**: `frontend/web/e2e/playwright.config.ts`; rota `GET /api/dev/emails` (T23)
**Requirement**: ACE-01, ACE-06, ACE-09, ACE-17, ACE-24, ACE-33

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Os quatro fluxos passam contra o build e o Worker local com `EMAIL_DEV=1`
- [x] Gate full passa (com `pnpm --filter @pelada/web e2e`)

**Tests**: e2e
**Gate**: full

---

### T44: Documentação da feature

**What**: GUARDRAILS (G-03, G-04, G-08, G-09, G-11, G-20 passam a "Ativa"), ADR-029 (sessão e funções `SECURITY DEFINER`, AD-007 e AD-008), runbook (verificar o domínio no Resend, secrets `RESEND_API_KEY` e `RESEND_REMETENTE`, uso do `dono.ts`, cota de 100 e-mails por dia), README (variáveis novas e caixa de dev) e THREAT-MODEL (rotas de autenticação).
**Estimativa**: 2h
**Where**: `.md/adr/029-sessao-em-transacao-propria-e-funcoes-de-conta.md` (e os documentos citados no mesmo commit)
**Depends on**: T43
**Reuses**: formato dos ADRs 024 a 028
**Requirement**: ACE-48 (G-04), G-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Cada guardrail citado aponta para o teste que existe agora
- [x] O runbook lista os passos externos da liberação desta feature, cada um com confirmação
- [x] Gate build passa

**Tests**: none
**Gate**: build

---

## Correções da volta 1 do verificador

> Origem: `validation.md` (FAIL, 2026-10-27). Cada tarefa é um commit.

### T45: Escrita sem WHERE de `sessoes` e `contas` provada sozinha

**What**: B executa `DELETE`/`UPDATE` sem `WHERE` e as linhas de A não mudam (mutantes M17 e M18).
**Estimativa**: 1h
**Where**: `backend/api/test/isolamento/contas.test.ts`
**Requirement**: ACE-43, ACE-44
**Done when**:

- [x] M17 (`sessoes_apagar USING (true)`) e M18 (`contas_alterar USING (true)`) passam a falhar; suíte verde
- [x] Gate quick passa

**Tests**: integration
**Gate**: quick

### T46: Sessão expirada leva a `/entrar` com o aviso (ligação do `App`)

**What**: teste do `App` em que 401 `sessao_expirada` estando em `/app/conta` leva a `/entrar` com "Sua sessão expirou. Entre de novo." (mutante F1).
**Estimativa**: 1h
**Where**: `frontend/web/src/app/App.test.tsx` (ou teste novo ao lado)
**Requirement**: ACE-20
**Done when**:

- [x] F1 (`ROTA_SESSAO_EXPIRADA = '/entrar'`) passa a falhar; suíte verde
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick

### T47: Tela t25 (`/conta/senha`) na comparação visual

**What**: ativar `t25-senha--vazio`, `--erro` e `--sucesso` (`"real": true`, rota, passos, respostas, recortes com motivo) e `telas-ativas.txt`.
**Estimativa**: 1,5h
**Where**: `.specs/mockup/telas.json`, `frontend/web/e2e/telas-ativas.txt`
**Requirement**: ACE-54
**Done when**:

- [x] `pnpm --filter @pelada/web visual` compara as t25 nos dois viewports com diferença abaixo de 1%
- [x] Gate build passa

**Registro**: sem recortes. O mockup da t25 foi alinhado ao app (divergência já aprovada nas telas do módulo): nome na barra "Gestão da Pelada" (a página não tem grupo) e botão `botao--bloco`. Resposta nova: `respostas/acesso-erro-senha-atual-incorreta.json` (401 `senha_atual_incorreta`). Teste existente `telas-ativas.test.mjs`: o corte das 36 do módulo virou `slice(3, 39)`, a contagem do mapa passou a 39 e há um teste novo das três t25 (nenhuma asserção removida). Diferença: 0,13% (PC) e 0,40% (celular).

**Tests**: e2e
**Gate**: build

### T48: Borda de 60 s entre e-mails

**What**: 59 s bloqueia e 61 s permite, em `link_pedir` e `conta_cadastrar` (mutante M26).
**Estimativa**: 45 min
**Where**: `backend/api/test/migracoes/conta-cadastro-e-links.test.ts`
**Requirement**: ACE-51
**Done when**:

- [x] M26 (60 s para 10 s) passa a falhar; suíte verde
- [x] Gate quick passa

**Tests**: integration
**Gate**: quick

### T49: Lint barra leitura e escrita de `e_dono` nas rotas

**What**: `pelada/sem-escrita-dono` passa a barrar também a leitura de `e_dono` em `backend/api/src/**` (decisão do usuário).
**Estimativa**: 1h
**Where**: `backend/scripts/test/dono.test.ts` e a regra de lint
**Requirement**: ACE-63
**Done when**:

- [x] Teste do lint falha para ler e para escrever `e_dono` em rota; `pnpm lint` limpo
- [x] Gate quick passa

**Registro**: teste existente `dono.test.ts` "não barra a leitura de eDono" (afirmava o contrário da decisão do usuário) trocado por testes que exigem a barra da leitura (7 formas) e da escrita, em rota e repositório, e por um que prova o código atual limpo; nenhum teste de escrita foi tirado. A regra mantém o nome `sem-escrita-dono` (citado em GUARDRAILS, ADR-029 e config); só a mensagem mudou. Passa a barrar qualquer uso do identificador `e_dono`/`eDono` e SQL ou nome de coluna que o cite; só a declaração em `interface` fica livre. Os handlers antigos de escrita ficaram contidos na regra mais ampla e foram removidos.

**Tests**: unit
**Gate**: quick

### T50: Versão dos termos no formato `AAAA-MM-DD`

**What**: a spec fixa o formato; o teste confere o formato e o valor exibido, sem comparar a tela com a própria constante (decisão do usuário).
**Estimativa**: 45 min
**Where**: `spec.md` (ACE-58, ACE-60) e `frontend/web/src/telas/termos/PaginaTermos.test.tsx`
**Requirement**: ACE-58, ACE-60
**Done when**:

- [x] Spec e teste alinhados; suíte verde
- [x] Gate quick passa

**Registro**: spec: ACE-58 e ACE-60 fixam o formato `AAAA-MM-DD` da versão. Testes existentes alterados por decisão do usuário (mais fortes): `PaginaTermos.test.tsx` e `PaginaPrivacidade.test.tsx` deixam de comparar a tela com `TERMOS_VERSAO` e exigem a data `AAAA-MM-DD` válida no texto exibido; `acesso.test.ts` troca "não vazio" pelo formato e pela data válida. `TERMOS_VERSAO` segue `2026-10-27`, provisório (rascunho).

**Tests**: unit
**Gate**: quick

---

### T51: Conta com hash bcrypt gerado fora do `pgcrypto` entra com a senha atual

**What**: teste de integração com um hash bcrypt de custo 12 literal, gerado fora do Postgres, gravado em uma conta existente; a conta entra com a senha atual e a senha errada é recusada (meta 5 da spec, decisão "Contas que já existem").
**Estimativa**: 1,5h
**Where**: `backend/api/test/migracoes/conta-entrar-hash-externo.test.ts`
**Depends on**: None
**Reuses**: `backend/api/test/migracoes/conta-cadastro-e-links.test.ts`; helpers de banco de `backend/api/test/`
**Requirement**: ACE-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Conta com o hash literal entra com a senha atual e abre sessão (mesma resposta do login normal)
- [x] A mesma conta com senha errada recebe 401 `credenciais_invalidas` e conta uma falha
- [x] Gate full passa

**Tests**: integration
**Gate**: full

---

### T52: Log sem segredo em `esqueci-senha` e `nova-senha`

**What**: testes de que `POST /api/sessao/esqueci-senha` e `POST /api/sessao/nova-senha` não gravam no log a senha, o token do link nem o corpo, no sucesso e na falha, como já existe em `sessao.test.ts`.
**Estimativa**: 1h
**Where**: `backend/api/test/rotas/sessao-recuperacao.test.ts`
**Depends on**: None
**Reuses**: o caso de log de `backend/api/test/rotas/sessao.test.ts`
**Requirement**: ACE-21

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Nenhum log de `esqueci-senha` contém o token do link nem o corpo da requisição, no sucesso e na falha
- [x] Nenhum log de `nova-senha` contém o token, a senha nova nem o corpo, no sucesso e na falha
- [x] Gate full passa

**Registro**: `sessao-recuperacao.test.ts` ganhou 2 testes de log (esqueci-senha e nova-senha, sucesso e falha); nenhum vazamento encontrado, sem mudança na rota.

**Tests**: e2e
**Gate**: full

---

### T53: Cadastro grava a versão dos termos e a hora do aceite

**What**: depois de um cadastro com sucesso (`POST /api/conta` e `POST /api/convites/cadastrar`), ler `termos_versao` e `termos_aceitos_em` pelo owner e conferir `TERMOS_VERSAO` e data não nula. Mata os mutantes N7 e N16 (`termosVersao: 'x'`).
**Estimativa**: 1h
**Where**: `backend/api/test/rotas/conta-cadastro.test.ts` e `backend/api/test/rotas/convites.test.ts`
**Depends on**: None
**Reuses**: `backend/api/test/apoio/owner-worker.ts`
**Requirement**: ACE-01, ACE-58

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Os dois cadastros gravam `termos_versao === TERMOS_VERSAO` e `termos_aceitos_em` não nulo
- [x] Os mutantes N7 e N16 passam a falhar (editados, rodados e revertidos)
- [x] Gate full passa

**Registro**: um teste novo em `conta-cadastro.test.ts` e uma asserção a mais no cadastro por convite em `convites.test.ts`. Com N7, falhou o teste novo; com N16, falhou o de convite. Árvore revertida com `git checkout`.

**Tests**: e2e
**Gate**: full

---

### T54: Mockups t25 regravados em UTF-8

**What**: os três mockups `t25-senha--*.html` estavam em Latin-1 (`Gestão`); converter só os bytes inválidos para UTF-8, sem mudar o resto, e provar que o visual das t25 segue abaixo de 1%.
**Estimativa**: 30 min
**Where**: `.specs/mockup/telas/t25-senha--vazio.html`, `t25-senha--erro.html`, `t25-senha--sucesso.html`
**Depends on**: None
**Requirement**: ACE-58

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Os três arquivos decodificam em UTF-8
- [x] Visual das t25 < 1% e visual completo verde
- [x] Gate full passa

**Registro**: só o byte `ã` (`ã`) virou `C3 A3` em cada arquivo (+1 byte). Visual das t25: 0,00% (antes 0,13% e 0,40%); visual completo: 84 linhas OK, nenhuma DIVERGE.

**Tests**: e2e
**Gate**: full

---

### T55: Runbook avisa que só hash `$2a$` funciona no `conta_entrar`

**What**: uma linha no `docs/runbook.md`: o filtro de `conta_entrar` aceita `$2a$`, `$2b$` e `$2y$`, mas só `$2a$` (de `gen_salt('bf', 12)` do pgcrypto) funciona no Postgres 16; `$2b$` ou `$2y$` importado de fora entraria como senha errada.
**Estimativa**: 15 min
**Where**: `docs/runbook.md`
**Depends on**: None
**Requirement**: ACE-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] A linha está no runbook
- [x] `pnpm format:check` e `pnpm test:checagens` passam

**Tests**: none
**Gate**: quick

---

### T56: Allowlist estreito do gitleaks para as fixtures `senhaSecreta`

**What**: o gitleaks (regra `generic-api-key`) acusa a senha fictícia `senhaSecreta` em `backend/api/test/rotas/sessao.test.ts` e `sessao-recuperacao.test.ts` (INF-01 do `seguranca.md`). Acrescentar ao `.gitleaks.toml` um allowlist que exige o caminho dos dois testes e a linha `senhaSecreta = '...'`; migrar o `[allowlist]` antigo para `[[allowlists]]` (o formato antigo não convive com o novo).
**Estimativa**: 30 min
**Where**: `.gitleaks.toml`
**Depends on**: None
**Requirement**: ACE-21

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `gitleaks git` (histórico inteiro e `9085f80..HEAD`) não acusa mais nada
- [x] Nenhuma asserção de teste foi alterada
- [x] `pnpm lint`, `pnpm format:check` e `pnpm test:checagens` passam

**Tests**: none
**Gate**: quick

---

## Correções da auditoria de segurança (AD-012)

Tratam os médios SEC-CA-01 a 04 de `seguranca.md`, decididos pelo usuário em 2026-10-27 (fase 11). O Turnstile fica
fora desta rodada: as defesas abaixo não mexem em telas além do aviso de T59.

### T57: Spec: confirmar o e-mail não abre sessão (ACE-06) e novos critérios de abuso

**What**: na `spec.md`, trocar o ACE-06 ("abrir uma sessão e levar a pessoa para `/app`") por "marcar o e-mail como confirmado, sem abrir sessão, e levar a pessoa para `/entrar` com o aviso de e-mail confirmado"; acrescentar critérios `ACE-60` (rotas com sessão que rodam bcrypt têm limitador por IP e bloqueio de 15 min por conta após 5 falhas da senha atual), `ACE-61` (no IPv6 a chave do limitador e do `ip_hash` é o prefixo /64) e `ACE-62` (teto global de e-mails por janela, com reserva para recuperação de senha). Atualizar a matriz de rastreio.
**Estimativa**: 30 min
**Where**: `.specs/features/conta-e-acesso/spec.md`
**Depends on**: None
**Requirement**: ACE-06, ACE-60, ACE-61, ACE-62

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] ACE-06 reescrito e ACE-60 a ACE-62 escritos em EARS, com a matriz de rastreio
- [ ] `validate_spec.py` passa

**Tests**: none
**Gate**: quick

---

### T58: `link_confirmar` só confirma o e-mail e não cria sessão (SEC-CA-01)

**What**: migration nova e aditiva que redefine `link_confirmar` para confirmar o e-mail sem criar sessão (a migration `1792843440000` já aplicada não se edita); ajustar o repositório `links.confirmar`. Teste de integração primeiro: confirmar com link válido marca `email_confirmado` e não cria linha em `sessoes`; link vencido, usado ou inexistente segue devolvendo nulo.
**Estimativa**: 1,5h
**Where**: `backend/api/src/infraestrutura/db/migracoes/` (migration nova), `backend/api/src/infraestrutura/db/repositorios/links.ts`, teste de integração do banco
**Depends on**: T57
**Requirement**: ACE-06, ACE-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] O teste falha no código antigo (sessão criada) e passa depois
- [ ] Nenhuma migration aplicada foi editada
- [ ] `pnpm test` (API, com Postgres local) e `pnpm typecheck` passam

**Tests**: integration
**Gate**: quick

---

### T59: Rota e tela de confirmação levam a `/entrar` sem cookie (SEC-CA-01)

**What**: `POST /api/conta/confirmar` responde 204 sem `Set-Cookie`; a tela `Confirmar` envia a pessoa a `/entrar` com o aviso "E-mail confirmado. Entre com a sua senha." (mesma faixa de aviso das outras telas de acesso, sem tela nova). Atualizar os testes que esperavam a sessão aberta (fluxo ponta a ponta de cadastro e `casos.ts` do isolamento), pelo critério ACE-06 novo e não pelo código.
**Estimativa**: 1,5h
**Where**: `backend/api/src/entrada/rotas/conta-cadastro.ts`, `frontend/web/src/telas/confirmar/`, testes da rota, e2e de acesso, `backend/api/test/isolamento/casos.ts`
**Depends on**: T58
**Requirement**: ACE-06, ACE-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Teste da rota prova que confirmar não devolve `Set-Cookie`
- [ ] Teste da tela prova o redirecionamento para `/entrar` com o aviso
- [ ] A alteração de teste existente tem motivo registrado (ACE-06 mudou) e foi aprovada na fase de tarefas
- [ ] `pnpm test`, `pnpm --filter @pelada/web e2e` e `pnpm --filter @pelada/web visual` passam

**Tests**: e2e
**Gate**: full

---

### T60: Limitador por IP em `/api/conta/senha` e `/api/conta/excluir` (SEC-CA-03)

**What**: incluir as duas rotas em `ROTAS_LIMITE_ENTRAR` (`app.ts`). Teste primeiro: com o limitador de teste negando, as duas rotas respondem 429 antes de rodar o bcrypt.
**Estimativa**: 1h
**Where**: `backend/api/src/entrada/app.ts`, teste da rota
**Depends on**: T57
**Requirement**: ACE-60

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] O teste falha sem a inclusão e passa com ela
- [ ] O teste que lista `ROTAS_LIMITE_ENTRAR` contra a tabela do design está atualizado
- [ ] `pnpm test` e `pnpm typecheck` passam

**Tests**: e2e
**Gate**: quick

---

### T61: Bloqueio por conta após falhas da senha atual (SEC-CA-03)

**What**: contar as falhas da senha atual por conta em `/api/conta/senha` e `/api/conta/excluir`, com o mesmo bloqueio de 15 min do login (5 falhas); migration aditiva para a contagem e as funções que a usam. Teste de integração primeiro: a 6ª tentativa em 15 min recebe o erro de bloqueio sem rodar o bcrypt; acerto zera a contagem; passados 15 min, libera.
**Estimativa**: 2h
**Where**: `backend/api/src/infraestrutura/db/migracoes/` (migration nova), `backend/api/src/entrada/rotas/conta-minha.ts`, repositório de contas, testes
**Depends on**: T60
**Requirement**: ACE-60

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Os três cenários do teste (bloqueia, zera no acerto, libera após 15 min) passam e falhariam sem a mudança
- [ ] O bloqueio é por conta, não por IP, e não revela se a conta existe
- [ ] `pnpm test` e `pnpm typecheck` passam

**Tests**: integration
**Gate**: quick

---

### T62: Chave do limitador e `ip_hash` pelo prefixo /64 no IPv6 (SEC-CA-04)

**What**: função pura que normaliza o IP (IPv4 inteiro; IPv6 reduzido ao prefixo /64) usada como chave do `criarLimiteTaxa` e do `ip_hash` do bloqueio por e-mail e IP. Teste unitário primeiro: dois endereços do mesmo /64 dão a mesma chave, /64 diferentes dão chaves diferentes, IPv4 não muda, ausência de IP segue em `sem-ip`.
**Estimativa**: 1h
**Where**: `backend/api/src/entrada/middlewares/limite-taxa.ts`, `backend/api/src/entrada/rotas/sessao.ts`, função nova e teste
**Depends on**: T57
**Requirement**: ACE-61

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Os casos do teste unitário passam e falhariam sem a normalização
- [ ] Limitador e `ip_hash` usam a mesma função
- [ ] `pnpm test` e `pnpm typecheck` passam

**Tests**: unit
**Gate**: quick

---

### T63: Teto global de e-mails por janela, com reserva para recuperação de senha (SEC-CA-02)

**What**: contador global de envios por janela no banco (migration aditiva), consultado antes de enviar. Cadastro, reenvio e convite param ao passar de 80% da cota diária (`LIMITE_EMAILS_DIA`, padrão 100, em `.env.example`); "esqueci a senha" usa a cota inteira. Acima do teto, a rota responde 503 `email_indisponivel` (ACE-52). Teste de integração primeiro com o contador simulado.
**Estimativa**: 2h
**Where**: `backend/api/src/infraestrutura/db/migracoes/` (migration nova), `backend/api/src/entrada/enviar-email.ts`, `.env.example`, testes
**Depends on**: T57
**Requirement**: ACE-62, ACE-52

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Teste prova que cadastro é recusado acima de 80% e "esqueci a senha" ainda envia até 100%
- [ ] O contador zera na virada do dia no fuso de São Paulo (ADR-012)
- [ ] `pnpm test`, `pnpm typecheck` e `pnpm test:checagens` passam

**Tests**: integration
**Gate**: quick

---

### T64: Runbook e THREAT-MODEL: cota, suspensão do Resend e Turnstile adiado

**What**: no `docs/runbook.md`, o que fazer se a cota ou o domínio do Resend esgotar ou for suspenso, e como conferir o consumo (alerta manual aos 50%); no THREAT-MODEL 1a, linha D, citar as rotas `/api/conta/senha` e `/api/conta/excluir` e registrar o Turnstile como adiado, com o risco residual de *password spraying* distribuído.
**Estimativa**: 30 min
**Where**: `docs/runbook.md`, `.md/THREAT-MODEL.md`
**Depends on**: T61, T63
**Requirement**: ACE-62

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Os dois documentos têm as seções
- [ ] `pnpm format:check` e `pnpm test:checagens` passam

**Tests**: none
**Gate**: quick

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8 → Phase 9 → Phase 10

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
Phase 10: T45, T46, T47, T48, T49, T50, T51, T52, T53, T54, T55, T56 (independentes)
Phase 11: T57 → T58 → T59
          T57 → T60 → T61
          T57 → T62
          T57 → T63
          T61 → T64
          T63 → T64
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
| 8 | 10 | T45 a T56 (T45 a T50 feitas na volta 1 do verificador; T51 a T55 na volta 2; T56 na auditoria de segurança) | `implementador` |
| 9 | 11 | T57 a T64 (correções dos 4 médios da auditoria, AD-012) | `implementador-dominio` (T58, T61, T63) e `implementador` (as demais) |

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
| T45 a T56 | uma correção ou prova cada (T47 e T50 tocam dois arquivos do mesmo assunto) | ✅ |
| T57 a T64 | uma correção de segurança cada (T59, T62 e T64 tocam arquivos do mesmo assunto) | ✅ |

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
| T45 a T56 | None | — | ✅ |
| T57 | None | — | ✅ |
| T58 | T57 | T57 → T58 | ✅ |
| T59 | T58 | T58 → T59 | ✅ |
| T60 | T57 | T57 → T60 | ✅ |
| T61 | T60 | T60 → T61 | ✅ |
| T62, T63 | T57 | T57 → T62, T57 → T63 | ✅ |
| T64 | T61, T63 | T61 → T64, T63 → T64 | ✅ |

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
| T45, T48, T51 | Banco e conta (testes de integração) | integration | integration | ✅ |
| T53 | Rotas da API (versão dos termos gravada) | e2e | e2e | ✅ |
| T54 | Mockup (codificação dos arquivos) | e2e visual | e2e | ✅ |
| T55 | Documentação | none | none | ✅ |
| T56 | Configuração do gitleaks | none | none | ✅ |
| T46, T50 | Front: App e termos | unit | unit | ✅ |
| T47 | Front: comparação visual | e2e visual | e2e | ✅ |
| T49 | Lint das rotas | unit | unit | ✅ |
| T52 | Rotas da API | e2e | e2e | ✅ |
| T57, T64 | Documentação | none | none | ✅ |
| T58, T61, T63 | Banco e repositórios | integration | integration | ✅ |
| T59, T60 | Rotas da API e telas | e2e | e2e | ✅ |
| T62 | Middleware do limitador | unit | unit | ✅ |
