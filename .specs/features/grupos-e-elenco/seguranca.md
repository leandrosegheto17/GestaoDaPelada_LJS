# Grupos e elenco — Auditoria de segurança

**Data**: 2026-10-30
**Alvo**: feature `grupos-e-elenco`, worktree `.worktrees/grupos-e-elenco`, branch `feat/grupos-e-elenco-2` (`main..7989f05`)
**Auditor**: `auditor-seguranca` (subagente; não alterou código)
**Resultado**: **0 críticos, 0 altos, 3 médios, 7 baixos** (mais 5 observações informativas)
**Bloqueia a integração?** Não há crítico nem alto. Os 3 médios pedem decisão do usuário antes da liberação (ver "Perguntas para o usuário").
**Reteste (2026-10-30)**: SEC-001 a SEC-009 corrigidos (Phases 13 e 14); SEC-010 como débito no THREAT-MODEL. Ver "Reteste".

---

## Escopo e método

- Lidos: `spec.md`, `design.md`, `validation.md` da feature; `.md/THREAT-MODEL.md`, `.md/GUARDRAILS.md`, ADR-024 e ADR-025.
- Revisão manual de todo o código novo da API (`backend/api/src/entrada/{app.ts,middlewares/grupo-ativo.ts,rotas/{grupos,jogadores,periodos,habilidades,notas}.ts}`), dos repositórios (`infraestrutura/db/repositorios/{grupos,jogadores,habilidades,notas,auditoria}.ts`), das 3 migrations da feature, dos contratos (`backend/contrato/src/{grupo,elenco,periodos,habilidades}.ts`), do domínio de datas e períodos, das checagens novas e do front (montagem de URLs, armazenamento, cache).
- Varredura automática: `python .claude/scripts/varredura-seguranca.py ferramentas` (saídas brutas fora do repositório, no scratchpad da sessão).
- Teste ativo **só no Postgres local** (`gestaodapelada_ljs-db-1`), num banco temporário próprio (`auditoria_<hex>`) criado, migrado do zero e apagado ao fim. O banco `pelada` (dev) não foi tocado; `pnpm migrar` e `pnpm seed` não foram rodados. A API rodou em processo (`criarApp`) conectando como `pelada_app` (`current_user = pelada_app`, `rolbypassrls = false`, conferido na sonda). Script da sonda: `C:\Users\leand\AppData\Local\Temp\claude\c--Leandro-Projetos-GestaoDaPelada-LJS\062fe05b-f635-4446-b02a-6233679bb011\scratchpad\sondas\sondas.mjs` (fora do git).
- Nenhuma suíte de testes do projeto foi rodada nesta auditoria (a validação já registrou a suíte verde); só a sonda acima, um processo por vez.

### Ferramentas

| Ferramenta | Situação | Resultado |
|---|---|---|
| `pnpm audit --prod` | rodou | 0 vulnerabilidades |
| `pnpm audit` (com dev) | rodou | 1 baixa, só de build: `deepmerge` (GHSA-gcqx-w48m-w2h4), via `vite-plugin-pwa > workbox-build`, sem versão corrigida (SEC-010) |
| gitleaks (histórico inteiro) | rodou | 0 segredos |
| Busca embutida de segredos (histórico) | rodou | 120 ocorrências, todas falsos positivos: senhas de teste em fixtures (`*.test.ts`, `e2e/*.spec.ts`, ex.: `SENH****` em `frontend/web/e2e/grupos-elenco.spec.ts:7`), URLs `postgres://usuario:****@localhost` de desenvolvimento e modelos com `****` no `.env.example`/README/runbook |
| osv-scanner | não executado | não instalado (instalar é decisão do usuário) |
| semgrep | não executado | não instalado (instalar é decisão do usuário) |

---

## Controles conferidos e que se sustentaram

| Controle | Evidência |
|---|---|
| Isolamento entre grupos (RLS com `FORCE`, `pelada_app` sem bypass) | Sonda S6: admin de outro grupo usando o id de um jogador do grupo alheio sob o próprio `:grupoId` em GET, PATCH, `inativar` e DELETE → `404` nas quatro. Repositórios filtram sempre por `grupo_id` e as FKs são compostas (`linha-de-base.sql:118,129,139,149,150`) |
| Toda rota nova em `casos.ts` | `backend/api/test/isolamento/casos.ts:247-273` (21 rotas, `POST`/`GET /api/grupos` como `nao_se_aplica` com motivo) |
| Vínculo e grupo ativo em `/api/grupos/:grupoId` e filhos | `backend/api/src/entrada/app.ts:118`; o middleware cobre também `PATCH /api/grupos/:grupoId` (teste `api/test/rotas/grupos.test.ts:386-388`, 409 no arquivado) |
| Arquivado escondido no banco | `migracoes/1792844280000_grupos-visiveis-arquivado.sql:13-17` |
| `criado_por`, `situacao_comercial`, `trial_inicio` fora do alcance do runtime | `migracoes/1792844400000_grupos-grants-coluna.sql:6-7` |
| Exceção do `exigirGrupoAtivo` não contornável | `middlewares/grupo-ativo.ts:155,166-168`: comparação exata do resto do caminho com `arquivar`/`reativar`; caminho com barra final ou codificado cai na checagem (falha fechada) |
| CSRF e sessão | Sonda S7: escrita sem `X-Pelada` → `403`; sem cookie → `401` |
| Injeção SQL | Todo SQL é Kysely parametrizado ou `sql` com placeholders (`repositorios/grupos.ts:46-49`); sonda S8: nome `x'); drop table notas;--` gravado como texto (201) e a tabela continua; id com aspas → `404` (`UUID` em `rotas/jogadores.ts:112`) |
| Corpo estrito e limite de tamanho | `z.strictObject` em todos os corpos (`contrato/src/grupo.ts:31,38`, `elenco.ts:82,97`, `periodos.ts:9-17`, `habilidades.ts:16,19`); `bodyLimit` 16 KB (`app.ts:34,106`) |
| Trava de período (`FOR UPDATE`) e auditoria na mesma transação | `repositorios/jogadores.ts:250-258,372-374`; validação com mutantes mortos (`validation.md`, mutações 6 e 7) |
| Dado pessoal fora da auditoria e dos logs | Sonda S9: 0 linhas de `auditoria` com telefone ou ano; `onError` loga só o nome do erro (`app.ts:137-141`); a lista de jogadores não traz telefone nem ano (`rotas/jogadores.ts:114-124`) |
| Respostas sem cache, front sem persistência | `middlewares/cache.ts` (`no-store`); o front não usa `localStorage`/`sessionStorage`, limpa o cache do TanStack Query ao sair (`frontend/web/src/dados/sessao.ts:27`) e codifica todo parâmetro de caminho (`dados/{grupos,elenco,habilidades,notas}.ts`, `encodeURIComponent`) |
| E-mail de convite escapado em HTML | `infraestrutura/email/modelos.ts:8-9,18` |

---

## Achados

### Médio

#### SEC-001 [MÉDIO] Admin convidada remove a criadora e toma o grupo; ninguém mais arquiva nem reativa

- **Onde**: `backend/api/src/infraestrutura/db/repositorios/admins.ts:42-54` (qualquer admin remove qualquer outra, só barra o último); `backend/api/src/entrada/rotas/admins.ts:52-61`; `backend/api/src/infraestrutura/db/repositorios/grupos.ts:158-166,176` (sem vínculo → 404; não criadora → 403).
- **O que acontece**: esta feature fez de `grupos.criado_por` a raiz de autoridade (arquivar e reativar, C3/C4), mas a remoção de admin (herdada da `conta-e-acesso`, ACE-39) não protege a criadora. Uma admin convidada remove a criadora, que perde o acesso ao grupo (404 em tudo, inclusive no próprio grupo que criou); e, como a remoção é permanente, o grupo nunca mais pode ser arquivado nem reativado pelo app (a nova dona recebe `403 so_quem_criou`). O caso "criadora que deixou de ser admin" está na spec como raro e "fica com o suporte"; a forma **hostil** (uma convidada expulsando a criadora) não foi tratada.
- **Reprodução (sonda S3/S4, banco temporário)**: criadora cria o grupo e convida a conta "outra", que aceita → `DELETE /api/grupos/<G>/admins/<id da criadora>` com o cookie da "outra" → `204`; em seguida a criadora recebe `404` em `GET /api/grupos/<G>` e em `POST …/arquivar`; a "outra" recebe `403 so_quem_criou` em `POST …/arquivar`. A "outra" continua lendo a ficha com telefone e ano de todos os jogadores.
- **Impacto**: tomada de controle do grupo e dos dados pessoais do elenco pela pessoa convidada; a criadora fica sem meio de reagir no app.
- **Correção recomendada**: decisão do usuário (ver Perguntas). Opções: proibir remover a conta de `criado_por` (409 `so_quem_criou` ou código próprio), feito no `admins.remover` com teste de rota; ou permitir só à criadora remover admins; ou registrar como risco aceito no THREAT-MODEL.
- **Situação**: corrigido na T71 e na T72 (`d812d91`, `a6ce56e`); ver Reteste.

#### SEC-002 [MÉDIO] Data de entrada do jogador sem piso: `0000-01-01` dá 500 e datas antes de 2000 contornam o `PISO_INICIO`

- **Onde**: `backend/contrato/src/elenco.ts:59-63` (`dataAteHoje` só confere formato, calendário e "não futura") e `:88` (`dataEntrada`); `backend/api/src/infraestrutura/db/repositorios/jogadores.ts:216,228,241` (grava `inicio_pontuacao` e o primeiro período com essa data). O piso existe só em `backend/dominio/src/atividade/alterar-inicio.ts:6,51` (GEL-78), que o cadastro não chama.
- **O que acontece**: é a mesma falha que a auditoria anterior fechou na rota de início (RTP-0185, THREAT-MODEL §3: "`0000-01-01`, `0001-01-01` e `1900-01-01` agora 422"), reaberta pelo cadastro. O ano 0000 passa no zod (`setUTCFullYear(0)` existe em JS) e o Postgres o recusa, virando 500. Anos 0001 a 1999 são gravados: o jogador nasce com `inicio_pontuacao` antes do piso que a rota própria de início exige, e a regra GEL-83/G-25 (início só pela criação e pela rota de início, com o piso) fica com duas regras diferentes.
- **Reprodução (sonda S1)**: `POST /api/grupos/<G>/jogadores` com `{"apelido":"J0000","anoNascimento":1990,"posicao":"meia","dataEntrada":"0000-01-01"}` → `500 erro_interno`; com `"0001-01-01"` → `201`, `inicioPontuacao: "0001-01-01"`, período `["0001-01-01", null]`; com `"1899-12-31"` → `201`. Conferido também no banco: `SELECT '0000-01-01'::date` → `date/time field value out of range`.
- **Impacto**: hoje, 500 com ruído no Sentry e dado incoerente. Na `partidas-e-ranking`, qualquer cálculo que percorra meses ou rodadas a partir de `inicio_pontuacao` passa a correr dois mil anos de calendário, risco direto para o orçamento de 10 ms de CPU (G-12).
- **Correção recomendada**: aplicar o mesmo piso `2000-01-01` (e a mesma mensagem do GEL-78) à `dataEntrada`, no contrato ou chamando a regra do domínio no repositório; teste de rota com `0000-01-01`, `0001-01-01` e `1999-12-31` → 422.
- **Situação**: corrigido na T73 (`51687f9`); ver Reteste.

#### SEC-003 [MÉDIO] Criação de grupo (e as demais escritas autenticadas) sem limite de taxa nem cota por conta

- **Onde**: `backend/api/src/entrada/app.ts:37-49,100-105` (o `LIMITE_ENTRAR` cobre só as rotas sem sessão e duas de senha; nenhuma rota de grupo tem limitador); `backend/api/src/entrada/rotas/grupos.ts:56-61`; `backend/api/src/infraestrutura/db/migracoes/1792844340000_grupo-criar.sql:38-46` (sufixo do slug achado por um laço `WHILE EXISTS`, uma consulta por sufixo já ocupado).
- **O que acontece**: com a D1, qualquer conta recém-cadastrada cria grupos sem limite. Cada criação grava grupo, vínculo, 6 habilidades e auditoria; jogadores e habilidades por grupo também não têm teto (spec: "Nenhum limite"). Com o mesmo nome, o laço do slug cresce linearmente (a criação N faz N consultas), então o custo total é quadrático.
- **Reprodução (sonda S5)**: 25 `POST /api/grupos` seguidos com o nome `AB!` pela mesma conta → 25 × `201` em ~1,4 s, o último com slug `grupo-25`; nenhum `429`.
- **Impacto**: uma conta automatizada enche o armazenamento do Neon gratuito (0,5 GB) ou consome a cota diária de requisições do Worker gratuito, derrubando o app para todos os grupos (custo zero, G-13, é premissa do projeto). Os limites do plano Free estão fora do escopo por decisão (C2), mas um limite **de taxa** é outra coisa e não foi decidido.
- **Correção recomendada**: decisão do usuário (ver Perguntas). Opções: um binding de Rate Limiting por conta nas escritas de `/api/grupos*` (como o `LIMITE_ENTRAR`); um teto simples de grupos criados por conta por dia dentro da `grupo_criar`; ou registrar como risco aceito até a `planos-e-cobranca`.
- **Situação**: corrigido na T74 e na T75 (`04a01cf`, `10bc439`); ver Reteste.

### Baixo

#### SEC-004 [BAIXO] Convite pendente continua valendo no grupo arquivado, e a criadora não consegue cancelá-lo

- **Onde**: `backend/api/src/infraestrutura/db/migracoes/1792843620000_conta-convites.sql:64-74,83-113,123-160` (`convite_ler`, `convite_aceitar` e `convite_cadastrar` não olham `arquivado_em`); `backend/api/src/entrada/app.ts:118` (o `exigirGrupoAtivo` só cobre `/api/grupos/:grupoId/*`, e `/api/convites/*` fica fora); `middlewares/grupo-ativo.ts:169-176` (o `DELETE …/admins/convites/:id` da criadora recebe 409).
- **Reprodução (sonda S3)**: criadora convida "tardia" e arquiva o grupo → `DELETE /api/grupos/<G>/admins/convites/<id>` → `409 grupo_arquivado`; `POST /api/convites/ler` sem sessão → `200` com o nome do grupo arquivado; `POST /api/convites/aceitar` da "tardia" → `200`, um vínculo novo no grupo arquivado e a auditoria `aceitar_convite` gravada. É uma escrita no grupo arquivado que a GEL-26 pretendia barrar.
- **Impacto**: baixo. A pessoa só passa a ver o grupo quando a criadora reativar, mas a criadora não tem como revogar o convite enquanto o grupo está arquivado.
- **Correção recomendada**: nas três funções de convite, tratar grupo arquivado como `link_invalido`; ou cancelar os convites pendentes no `grupos.arquivar`. Teste de rota.
- **Situação**: corrigido na T76 (`99c9c67`); ver Reteste.

#### SEC-005 [BAIXO] Caracteres de controle e invisíveis aceitos em nome de grupo, apelido e habilidade (NUL dá 500)

- **Onde**: `backend/contrato/src/grupo.ts:8-12`, `elenco.ts:18-22`, `habilidades.ts:9-13` (só `trim` e tamanho); CHECKs do banco só de tamanho (`linha-de-base.sql:67,109,138`).
- **Reprodução (sonda S2)**: nome do grupo `"Grupo\u0000Nulo"` → `500`; apelido `"Ze\u0000ca"` → `500` (o Postgres recusa o byte 0x00 em `text`). `"Beto"` e `"Beto\u200b"` (espaço de largura zero) → `201` e `201`, dois jogadores com o mesmo apelido na tela (contorna a GEL-35 a olho). Habilidade `"\u200b\u200b"` → `201` com nome invisível. Nome com U+202E (inversão de direção) → `201`.
- **Impacto**: 500 com ruído no Sentry; confusão e falsificação visual de apelidos (o apelido vai para o ranking público e o PDF da próxima feature) e do nome do grupo no e-mail de convite (SEC-006). O React escapa o texto: não há XSS.
- **Correção recomendada**: no contrato, recusar `\p{Cc}` (controle) e os formatadores `\p{Cf}` (U+200B a U+200F, U+202A a U+202E, U+2066 a U+2069, U+FEFF) e normalizar para NFC antes do tamanho e da unicidade. Testes de contrato.
- **Situação**: corrigido na T77 (`58d01dd`); ver Reteste.

#### SEC-006 [BAIXO] Texto livre do nome do grupo vai, pelo domínio do app, a qualquer e-mail convidado

- **Onde**: `backend/api/src/infraestrutura/email/modelos.ts:43-50` (o nome do grupo no assunto e no corpo); `backend/api/src/entrada/rotas/admins.ts:26-45`.
- **O que acontece**: antes, só o dono criava grupo. Agora qualquer conta cria um grupo com um nome de até 60 caracteres (ex.: "Confirme seu Pix em <site>") e convida qualquer endereço; o e-mail sai do remetente verificado do app. O HTML é escapado, mas clientes de e-mail costumam transformar endereços do texto em link.
- **Impacto**: baixo. O teto de `LIMITE_EMAILS_IP_HORA` (20/h por origem) e os 80% da cota diária limitam o volume; o efeito é sobre a reputação do domínio no Resend e um vetor pequeno de phishing. Esgotar a cota de e-mails já é risco aceito (SEC-CA-16).
- **Correção recomendada**: no convite, citar o grupo entre aspas e com o nome de quem convidou, recusar no nome do grupo texto com cara de URL (`://`, `www.`), ou exigir conta com e-mail confirmado há algum tempo para convidar. Decisão de produto; pode ficar como risco aceito.
- **Situação**: corrigido na T78 (`9001de8`); ver Reteste.

#### SEC-007 [BAIXO] Corrida entre o `exigirGrupoAtivo` e o arquivamento: escrita aceita em grupo recém-arquivado

- **Onde**: `backend/api/src/entrada/middlewares/grupo-ativo.ts:169-176` (lê `arquivado_em` sem trava) e `backend/api/src/infraestrutura/db/repositorios/grupos.ts:150-156,179-183` (o arquivar trava com `FOR UPDATE`, mas as outras escritas não pegam trava compartilhada no grupo).
- **Cenário**: uma escrita (ex.: `PATCH …/jogadores/:id`) passa pelo middleware, o arquivamento confirma em seguida, e a escrita confirma depois, num grupo já arquivado. Só por revisão de código, sem reprodução (exigiria duas conexões sincronizadas).
- **Impacto**: baixo. Uma escrita legítima de admin cai no grupo logo depois de arquivado; nada vaza.
- **Correção recomendada**: no middleware, `SELECT arquivado_em … FOR SHARE` (ou `FOR KEY SHARE`, que o `FOR UPDATE` do arquivar espera), com teste de concorrência como o de períodos.
- **Situação**: corrigido na T79 (`3cc2259`); ver Reteste.

#### SEC-008 [BAIXO] Lacunas de auditoria: dados pessoais e renomeações não deixam rastro

- **Onde**: `repositorios/jogadores.ts:265-301` (a edição audita só a pontuação inicial; telefone, ano de nascimento, posição e apelido mudam sem evento); `repositorios/grupos.ts:131-138` (renomear o grupo); `repositorios/habilidades.ts:55-94` (criar e renomear habilidade); `repositorios/notas.ts` (nota, por decisão do design).
- **Reprodução (sonda S9)**: depois de editar telefone, ano e posição de um jogador e renomear o grupo, a auditoria do grupo tem só `grupo_criado`, `jogador_criado`, `convidar_admin`, `aceitar_convite`, `grupo_arquivado`, `grupo_reativado` e `remover_admin`. Não há `jogador_editado` nem `grupo_editado`.
- **Impacto**: repúdio. Com várias admins (e com o SEC-001), não há como saber quem trocou o telefone de um jogador (dado pessoal, LGPD) ou o nome do grupo. A spec não pede esses eventos, então não é desvio dela.
- **Correção recomendada**: auditar `jogador_editado` só com os **nomes** dos campos alterados (sem os valores, para manter a GEL-113) e `grupo_editado`. Decisão de produto.
- **Situação**: corrigido na T80 e na T81 (`57536ab`, `a901803`); ver Reteste.

#### SEC-009 [BAIXO] Autoridade da criadora só na aplicação: o banco deixa qualquer admin mudar `arquivado_em`

- **Onde**: `backend/api/src/infraestrutura/db/migracoes/1792844400000_grupos-grants-coluna.sql:7` (`UPDATE (…, arquivado_em)` para `pelada_app`) com a policy `grupos_alterar` (`1792843320000_rls.sql:54`), que só exige vínculo.
- **Impacto**: hoje nenhum caminho explora isso: só `grupos.arquivar`/`reativar` escrevem a coluna, e conferem `criado_por` (`repositorios/grupos.ts:176,192`). Um bug futuro numa rota de grupo deixaria uma admin não criadora arquivar, e o grupo sumiria para todas as outras. Diferente do isolamento entre grupos, a regra "só quem criou" não tem a segunda barreira no banco.
- **Correção recomendada**: tirar `arquivado_em` do grant e mover arquivar/reativar para uma função `SECURITY DEFINER` que confere `criado_por = app_conta_id()` e o vínculo; ou uma trigger `BEFORE UPDATE OF arquivado_em` com essa condição. Teste de migração como `pelada_app`.
- **Situação**: corrigido na T82 (`061eaaf`); ver Reteste.

#### SEC-010 [BAIXO] Dependência de build com aviso sem correção (`deepmerge`)

- **Onde**: `pnpm-lock.yaml`, caminho `frontend__web > vite-plugin-pwa > workbox-build > @rollup/plugin-node-resolve > deepmerge` (GHSA-gcqx-w48m-w2h4, poluição de protótipo).
- **Impacto**: só no build (não vai para o bundle nem para o Worker); sem versão corrigida. Mesma natureza do `braces` já monitorado no THREAT-MODEL.
- **Correção recomendada**: monitorar; registrar ao lado do débito do `braces`.

### Observações informativas (sem severidade)

- **I-1. Regra ESLint `pelada/sem-escrita-periodo` não ligada.** Está em `eslint/plugin-pelada.mjs:128`, mas nenhuma configuração de `eslint.config.mjs` a liga; o `GUARDRAILS.md` (G-26) a descreve como "Regra de lint ativa". A proteção efetiva vem de `backend/scripts/checagens/checar-escritores-periodo.mjs`, que está no CI (`.github/workflows/ci.yml`, passo novo). Corrigir o texto do G-26 ou ligar a regra.
- **I-2. O sufixo do slug revela a existência de outros grupos.** Criar "Pelada de Quinta" e receber `pelada-de-quinta-2` mostra que o slug base existe; com o ranking público da próxima feature, ajuda a achar slugs. Faz parte do T-13 (enumeração de slug), risco já aceito.
- **I-3. Para a `partidas-e-ranking`:** o ramo público de `grupos_visiveis()` (`1792844280000_grupos-visiveis-arquivado.sql:19`) continua mostrando o grupo arquivado pelo slug, como o design previu ("Grupo indisponível" é da próxima feature). A próxima feature precisa filtrar `arquivado_em` no ramo público, com teste.
- **I-4. Escape manual no seed local.** `repositorios/seed-local.ts:168-169,182` monta `ALTER ROLE … PASSWORD '<valor>'` dobrando aspas. Com `standard_conforming_strings` ligado (padrão) é suficiente, e o valor vem do `.env` do operador, só no banco local. `pg.Client#escapeLiteral` (já usado em `test/apoio/setup-worker.ts`) seria mais robusto.
- **I-5. O banco não impede sobreposição de períodos.** Só o domínio e a trava garantem (design, Risks). O `pelada_app` tem `UPDATE` em `periodos_ativos`; a checagem GEL-111 cobre o código versionado, mas não um SQL manual. Uma `EXCLUDE USING gist (jogador_id WITH =, daterange(inicio, fim) WITH &&)` daria a segunda barreira, numa migration futura.
- **Situação**: débito aberto no `.md/THREAT-MODEL.md` (débito 4), com dono na `partidas-e-ranking`.

---

## Reteste (2026-10-30)

Correções das Phases 13 e 14 (decisão do usuário de 2026-10-30), cada uma com o teste que falhava antes dela. Suíte
completa verde no fim da T83 (lint, format, typecheck, `pnpm test`, checagens, build, e2e e visual).

| Achado | Situação | Correção | Evidência (teste que prova) |
|---|---|---|---|
| SEC-001 | corrigido | T71 (`d812d91`): outra admin não remove a criadora (409 `criadora_nao_removivel`); T72 (`a6ce56e`): a tela não oferece a ação | `backend/api/test/rotas/admins.test.ts:204` (`expect(r.status).toBe(409)`) e `:205` (`criadora_nao_removivel`) |
| SEC-002 | corrigido | T73 (`51687f9`): piso 01/01/2000 na `dataEntrada`, com a mensagem da GEL-78 | `backend/api/test/rotas/jogadores.test.ts:101` (`0000-01-01`, `0001-01-01` e `1999-12-31` → 422, não 500); `backend/contrato/test/elenco.test.ts:124` |
| SEC-003 | corrigido | T74 (`04a01cf`): `LIMITE_ESCRITA` (60 por 60 s, por conta) nas escritas de `/api/grupos*`; T75 (`10bc439`): documentado e checado | `backend/api/test/rotas/limite-escrita.test.ts:60` (`expect(r.status).toBe(429)`); `backend/scripts/checagens/test/checar-limitadores.test.mjs` |
| SEC-004 | corrigido | T76 (`99c9c67`): migration `1792844460000_convites-grupo-arquivado.sql` (ler, aceitar e cadastrar recusam convite de grupo arquivado) e exceção do `exigirGrupoAtivo` para `DELETE …/admins/convites/:id` | `backend/api/test/rotas/convites.test.ts:204` e `:207` (ler e aceitar → 410), `:232` (cancelar → 204); `backend/api/test/migracoes/convites-grupo-arquivado.test.ts:160` (`link_invalido`, sem vínculo) e `:255` (falha sem a migration, passa com ela) |
| SEC-005 | corrigido | T77 (`58d01dd`): `textoVisivel` no contrato (NFC, sem `\p{Cc}` e `\p{Cf}`) para nome do grupo, apelido e habilidade | `backend/contrato/test/texto-visivel.test.ts:52` (cada caractere, por campo); `backend/api/test/rotas/texto-visivel.test.ts:37` (NUL no nome do grupo → 422) e `:70` (NUL no apelido → 422) |
| SEC-006 | corrigido | T78 (`9001de8`): `nomeDoGrupoNoEmail` (uma linha, até 60 caracteres, separadores de link cercados de espaço) | `backend/api/test/infraestrutura/email.test.ts:202` (URL, `www.`, domínio e e-mail não viram link) e `:213` (sem quebra de linha no assunto) |
| SEC-007 | corrigido | T79 (`3cc2259`): `exigirGrupoAtivo` lê `arquivado_em` com `FOR KEY SHARE` (desvio registrado: `FOR SHARE` dava deadlock) | `backend/api/test/repositorios/grupo-ativo-concorrencia.test.ts:120` (o arquivar espera a escrita em curso) e `:177` (dois PATCH do mesmo grupo sem deadlock) |
| SEC-008 | corrigido | T80 (`57536ab`): `jogador_editado` com os nomes dos campos; T81 (`a901803`): `grupo_editado`, `habilidade_criada` e `habilidade_renomeada` (só ids e `campos`, GEL-113; desvio registrado) | `backend/api/test/repositorios/jogadores.test.ts:1000` (evento com `campos`) e `:1015` (sem telefone nem ano); `backend/api/test/repositorios/grupos.test.ts:295`; `backend/api/test/repositorios/habilidades.test.ts:302` e `:313` |
| SEC-009 | corrigido | T82 (`061eaaf`): migration `1792844520000_grupos-arquivar-so-criadora.sql` (trigger `BEFORE UPDATE OF arquivado_em` para a `pelada_app`) | `backend/api/test/migracoes/grupos-arquivar-so-criadora.test.ts:55` (admin que não criou → 42501), `:89` (a criadora arquiva e reativa) e `:138` (falha sem a migration, passa com ela) |
| SEC-010 | débito | Sem versão corrigida do `deepmerge`; monitorado | `.md/THREAT-MODEL.md`, "Débitos de segurança abertos", item 4 (dono: `partidas-e-ranking`) |

As observações I-1 (regra `pelada/sem-escrita-periodo` não ligada) e I-3 (filtro de arquivado no ramo público de
`grupos_visiveis()`) ficam como débitos 5 e 6 do THREAT-MODEL, com dono na `partidas-e-ranking`; o texto da G-26 no
`.md/GUARDRAILS.md` passa a dizer que a regra de lint não está ligada.

---

## Indícios de invasão ou vazamento

Nenhum. Os achados de segredo da varredura são fixtures de teste e modelos com `****`; gitleaks não achou nada no histórico.

## Perguntas para o usuário

1. **SEC-001: a criadora pode ser removida por outra admin?**
   - *Proibir remover a criadora (Recomendado)*: `DELETE …/admins/<criadora>` passa a responder 409; a criadora só sai excluindo a conta ou removendo a si mesma. Fecha a tomada de controle; é uma tarefa pequena com teste de rota.
   - *Só a criadora remove admins*: as outras admins perdem a ação de remover; muda a ACE-39 da `conta-e-acesso` (spec aprovada) e as telas de admins.
   - *Aceitar o risco*: registrar no THREAT-MODEL; uma convidada hostil continua podendo expulsar a criadora, e o caso vai para o suporte.
2. **SEC-002: piso da data de entrada.**
   - *Mesmo piso 01/01/2000 e mesma mensagem da GEL-78 (Recomendado)*: fecha o 500 e a reabertura do RTP-0185 antes da `partidas-e-ranking`.
   - *Só tratar o ano 0000 (422)*: tira o 500, mas mantém datas de 0001 a 1999 aceitas.
3. **SEC-003: limite de taxa nas escritas autenticadas.**
   - *Rate Limiting por conta nas escritas de `/api/grupos*` (Recomendado)*: um binding novo, sem custo, configurado como o `LIMITE_ENTRAR`; protege a cota gratuita do Neon e do Worker.
   - *Teto de grupos criados por conta por dia na `grupo_criar`*: só no banco, sem binding novo; não cobre jogadores e habilidades.
   - *Aceitar até a `planos-e-cobranca`*: registrar no THREAT-MODEL; uma conta automatizada pode encher o banco gratuito.
4. **SEC-004 a SEC-009 (baixos)**: corrigir agora, numa tarefa de endurecimento antes da liberação, ou registrar como débitos no THREAT-MODEL?
