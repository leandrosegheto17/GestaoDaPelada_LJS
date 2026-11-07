# Fundação: validação do verificador

**Data**: 2026-11-06 · **Spec**: `.specs/features/fundacao/spec.md` · **Árvore**: `6bfdb8be` (HEAD `f9801ec0`, worktree `feature/fundacao`) · **Verificador**: independente (autor ≠ verificador)
**Veredito**: FAIL ❌ (2 achados críticos e 6 comuns; nenhum critério sem teste de risco, mas FUN-50 e FUN-54/T81 incompletos e FUN-38 não atendido como escrito).

## Lacunas conhecidas (informadas na tarefa, não bloqueiam o resto)

T81: itens 2 e 3 abertos (`testes.json` completo, `trava-testes` verde; ver A-01). R2-T1 (conferir o backup agendado) só em 2026-11-07; já há evidência a favor: `gh run list --workflow backup.yml` mostra a execução `schedule` 42236778226 verde em 2026-11-06 14:45Z e a manual 42220835679 verde.

## Critérios (spec-anchored; saída: asserção no valor da spec)

| FUN | `arquivo:linha` e asserção | Res. |
|---|---|---|
| 01, 02 | `test/estrutura.test.ts:20` `engines.node toBe('>=26 <27')`, `.nvmrc` `'26'`, `:37-:44` strict por pacote, `:28` scripts; `fumaca.test.ts:5` nos 3 pacotes | ✅ |
| 03 | `backend/scripts/test/compose.test.ts:15` `Object.keys(services) toEqual(['postgres'])`, `:20` portas `/^127\.0\.0\.1:\d+:5432$/`; pgcrypto só via migração (`esquema-seguranca.test.ts:133`) | ✅ |
| 04, 55 | `test/dev.test.ts:76` exit 1 + `docker compose up -d`; `:92` `localConnectionString` sem senha; `:103` `GET /api/health` 200 pelo proxy; `migrar.test.ts:53`, `conectar.test.ts:10` | ✅ |
| 05, 19 | `scripts/test/host.test.ts:21` lista local recusa `postgres`; `:15` Neon recusado `/não permitido/`; `seed.test.ts:90` contagens 2 contas/2 grupos/3 vínculos; `api/test/apoio/banco.test.ts:15` | ✅ |
| 06 | `dominio/test/sem-io.test.ts:16` `erros toHaveLength(1)` + mensagem FUN-06 (node:fs, pg) | ✅ |
| 07 | `api/test/migracoes/migrar.test.ts:31` registra todas na ordem; `:40` repetir não aplica; `migracao-nova.test.ts:21` | ✅ |
| 08 | `hash.test.ts:24` 23 herdadas, `:29` SHA-256 byte a byte; `esquema.test.ts:30` `expect(atual).toEqual(referencia)` | ⚠️ gap de precisão: a referência foi regenerada com as migrações das features (49), então a igualdade com `e557292` só se prova pelo hash das 23 e pela T80, não por impressão digital das 23 sozinhas |
| 09 | `zero-ddl.test.ts:65` `tagsDdl toEqual([])`; `:75` contagens e `pgmigrations` iguais; `:90` só a nova executa | ✅ |
| 10 | `estado.test.ts:102` vazio→migra; `:135` divergentes abortam e nada muda | ⚠️ spec diz "igual ao da produção"; código decide só pela `pgmigrations` (A-04) |
| 11 | `isolamento/roles.test.ts:74` sem BYPASSRLS/superusuário/CREATE; `:83` sem TRUNCATE | ✅ (`pelada_owner` só na T80, AD-009) |
| 12 | `meta.test.ts:34` `problemasDeCobertura toEqual([])`; `:38` `relforcerowsecurity` `rows toEqual([])`; `:80` tabela nova sem RLS reprova | ✅ |
| 13, 14, 15 | `leitura.test.ts:49`; `publico.test.ts:66-:83` (slug A/B/inexistente) e `:87` sem contexto `toEqual([])` | ✅ |
| 16 | `db/com-banco.test.ts:105` set_config antes da 1ª consulta, `:139` 100 repetições concorrentes, `:157` GET escreve falha, `:190`/`:202` rollback 4xx/5xx, `:235` conexão fecha | ✅ |
| 17 | `escrita.test.ts:18` INSERT/UPDATE/DELETE de B sobre A, com e sem WHERE, mais controle de A; matriz em `matriz.ts` | ✅ |
| 18 | `scripts/ops/test/hyperdrive.test.ts:27` `conferirSemCache(...) toEqual({ok:true})`; ausente/false/"true"/1/null reprova | ✅ (só unitário; checagem manual no runbook) |
| 20, 21, 22 | `rotas/health.test.ts:50` SPA, `:22` `toEqual({status:'ok',versao})`, `:30` banco parado; `cabecalhos.test.ts:25-:60` `no-store`/`nosniff` em 200/404/500/Response crua; e2e `cabecalhos.spec.ts:48` | ✅ |
| 23 | `test/wrangler.test.ts:97` `URL_PUBLICA toBe('')`; `checagens/test/sem-url-absoluta.test.ts:10` | ✅ |
| 24, 25 | `rotas/observabilidade.test.ts:84` release=VERSAO e `limparEvento`; `:60` sem DSN nada sai; `contrato/test/sentry.test.ts:4`; `web/test/app/observabilidade.test.ts:8` | ✅ |
| 26 | `wrangler.test.ts:61` `toEqual({ENTRAR:10,PUBLICO:60,WEBHOOK:60,ESCRITA:60})`; `limite-taxa.test.ts:54` 429 + Retry-After | ✅ |
| 27, 28 | `wrangler.test.ts:73` nome, `workers_dev`, rota só do domínio da AD-121; `so-previa.test.ts:13` reprova `gestaodapelada` sem `-v2`, routes, custom_domain | ✅ (spec desatualizada, A-03) |
| 29 | `web/test/headers.test.ts:8`; e2e `cabecalhos.spec.ts:12` CSP, nosniff, Referrer-Policy, HSTS (8 casos verdes) | ✅ |
| 30, 31, 32 | `ativos.test.ts:58` SHA-256 igual ao mockup; `componentes/botao.test.tsx:12` (+61 arquivos com axe); `stylelint.test.ts:27` `#fff`, `rgb()`, `font-family`, `box-shadow` reprovam | ✅ |
| 33, 37 | `config/manifesto.test.ts:7`; e2e `instalabilidade.spec.ts:26` manifest+ícones, `:52` `controller`, `:59` offline sem rede, `:74` (verdes) | ✅ |
| 34, 35, 36 | `pwa/service-worker.test.ts:33` listeners push/notificationclick, `:50` precache; `pwa/offline.test.ts:6`; `aviso-instalar-iphone.test.tsx:42` | ✅ |
| 38 | `web/test/app/rotas.test.tsx:36` só renderiza a vitrine; a comparação (`pnpm --filter @pelada/web visual`) fora do CI (AD-126) e T01 `erro`/`carregando` reprovam (3,1% a 11,8%, AD-127) | ❌ não atendido como escrito (A-03) |
| 39 | `git ls-remote origin legado` = `e5572928…` (ação externa já feita; sem teste automatizado) | ✅ |
| 40 | `scripts/test/workflow-ci.test.ts:16`; CI do mesmo commit: run 42291318644, todos os jobs `success` | ✅ (sem visual, AD-126) |
| 41–44, 57, 58 | `workflow-deploy.test.ts:47` dispatch+main+environment, `:55` `cancel-in-progress toBe(false)`, `:60` ordem, `:78` build antes de secrets, `:86` deploy após migração, `:95` `URL_PUBLICA` vazia falha; runbook `docs/runbook.md:65` | ✅ (AD-119) |
| 45, 46, 56 | `wrangler-unico.test.ts:12`; `env-example.test.ts:23`; `migracao-aditiva.test.ts:31` | ✅ |
| 47, 49 | `workflow-backup.test.ts:9` 07:00 UTC, `:31` `retention-days toBe(30)`, `:36` upload falha sem arquivo; `dump-cifrado.test.ts:46` URL inválida sai ≠0 sem arquivo | ✅ |
| 48 | execuções `42220835679` (manual) e `42236778226` (schedule) verdes; R2-T1 formal pendente | ✅ (R2-T1 em 11-07) |
| 50 | `ops/test/restaurar-backup.test.ts:38` contagem igual por tabela; `docs/restauracao-registro.md:5-12` data e 31 tabelas, mas `:12` "**não conferido**" contra a produção | ❌ (A-02) |
| 51 | `test/readme.test.ts:6` | ✅ |
| 52, 53 | sem teste (Tests: none): `docs/runbook.md` tem deploy `:7`, migração `:65`, restauração `:103`, rotação `:317`, UptimeRobot `:328`, paridade `:339`; `CLAUDE.md` tem stack/comandos/estrutura | ⚠️ 53 desatualizado (A-07) |
| 54 | `.specs/projeto/testes.json` roda lint, format, typecheck, `pnpm test` (os 5 pacotes), checagens, e2e, visual; o `visual` reprova, a trava nunca fica verde | ❌ (A-01) |

## Gate (tasks.md registra `@ abc17b49`, hash de commit, não de árvore: repeti)

Local, Postgres 5451: lint 0, format 0, typecheck 0 (todos os pacotes); `test:checagens` 134/134; contrato 567/567; scripts 326/326; api 3620/3623 (push-backup x2: `pg_dump` 16 contra servidor 18; push-cpu: tempo; mais a suíte `webhook-asaas-aplicar` com `afterAll` > 10 s sob carga); dominio 667/668 (SIM-58, tempo; na 1ª rodada também SIM-57 e GEL-70); web 1057/1058 (SIM-15, timeout 5 s); vitest da raiz 48/50 (PAR-61 e PAR-140 estouram 5 s, ver A-06); e2e 62/74 (12 timeouts de 30 s, todos de J-12 a J-28/PAR-108 das features 3 a 8; todos os specs da fundação verdes, rodado uma vez com a máquina carregada); `visual` 223/256, 33 falhas (T01 5, T13 8, T22 6, T32 4 etc.). CI no mesmo commit verde (run 42291318644).

## Sensor (derivado dos riscos; cópia git worktree com `node_modules` por junção; só o arquivo de teste do mutante)

| # | `arquivo:linha` | Mutação | Resultado |
|---|---|---|---|
| 1 | `api/src/entrada/middlewares/com-banco.ts:159` | `status < 400` → `< 500` (4xx confirma) | morto (`com-banco.test.ts`: 400/404/422) |
| 2 | `com-banco.ts:103` | `set_config(..., true)` → `false` (contexto vaza) | morto (`:105`) |
| 3 | `com-banco.ts:174` | remove `fecharNoFim` (conexão) | morto (`:139`, `:235`) |
| 4 | `middlewares/cabecalhos.ts:13` | remove o `set` pós-handler | morto (`cabecalhos.test.ts`, 2 falhas) |
| 5 | `migracoes/1792843320000_rls.sql:49` | escrita sem exigir conta (slug escreve) | morto (`publico.test.ts`, 34 falhas) |
| 6 | `migracoes/1792844880000_grupos-visiveis-publico-ativo.sql:15` | `conta_id = app_conta_id()` → `IS NOT NULL` | morto (`leitura.test.ts`, 53 falhas) |
| 6b | `1792843320000_rls.sql:21` (mesma condição) | idem | sobreviveu: **equivalente** (a função é substituída por `CREATE OR REPLACE` em migração posterior) |
| 7 | `backend/scripts/src/host.ts:2` | `HOSTS_LOCAIS` aceita `postgres` | morto (`host.test.ts`) |
| 8 | `backend/contrato/src/sentry.ts:15` | tira `authorization` da limpeza | morto (`sentry.test.ts`, 2 falhas) |
| 9 | `.github/workflows/deploy.yml` | `wrangler deploy` antes da migração | morto (`workflow-deploy.test.ts`, 2 falhas) |
| 10 | `api/src/infraestrutura/db/estado.ts:98` | divergente vira gerenciado | morto (`estado.test.ts`, 3 falhas) |

**Profundidade**: 10 mutações (tarefas de risco alto em migração, isolamento, dado pessoal). **Resultado**: 10/10 mortas, 1 equivalente. Isolamento: cópia removida, worktree e junções descartados; `git status --porcelain` da árvore real igual ao início (o único arquivo novo, `seguranca-validacao.md`, é do auditor, não meu).

## Checagens de processo

(a) `testes.json` roda os 5 pacotes via `pnpm test`, mas sem `docker compose up -d --wait` (previsto desde a T10) e com `visual` (A-01). (b) typecheck: `d540f630` (T4) verde nos 5 pacotes; `43f340b3` (T52) verde em contrato, dominio e scripts; api e web inconclusivos (as dependências do lockfile atual diferem das daquele commit); HEAD verde. (c) alterações de teste sem autorização registrada: A-08. (d) IDs: `FUN-NN` dos testes copiados batem com a spec; o `reuso.md` só tem cópia de migrações e ativos. (e) sem banco, role ou dado `teste_*` órfão no cluster 5451 depois da suíte. (f) matriz política × comando: `leitura`, `escrita`, `publico` e `meta` cobrem SELECT, INSERT, UPDATE e DELETE (incl. sem WHERE) por tabela; mutantes 5 e 6 provam. (g) divergências spec × design: AD-119, AD-121, AD-126 e AD-127 cobrem deploy, domínio e visual; FUN-10 não tem (A-04).

## Achados

| ID | `arquivo:linha` | Achado e evidência | Correção sugerida | Crit. |
|---|---|---|---|---|
| A-01 | `.specs/projeto/testes.json:2`, `tasks.md:2427-2429` | O comando inclui `pnpm --filter @pelada/web visual`, que sai 1 (33 falhas; AD-127 diz que seguem reprovando e AD-126 tirou o visual do CI). `trava-testes.py --rodar` nunca fica verde e o hook bloqueia o deploy. Os itens 2 e 3 da T81 seguem abertos mesmo com o JSON já completo. Falta também o `docker compose up -d --wait` da tabela de evolução. | Tirar `visual` do comando (é do `/validar`, AD-126) ou registrar AD que o mantém; acrescentar o `docker compose up -d --wait`; rodar `trava-testes.py --rodar` e fechar a T81. | crítica |
| A-02 | `docs/restauracao-registro.md:12` | FUN-50 exige contagem por tabela "conferida contra a produção"; o registro diz "não conferido". O R2-T1 só cobre a execução agendada. | Contar pela role `pelada_backup_ro` na produção, registrar e incluir no R2-T1 (AD-014 segue aberta). | crítica |
| A-03 | `spec.md:138`, `spec.md:153`; `.specs/projeto/comparacao-visual.md` | FUN-38 e FUN-40 ainda mandam a comparação visual no CI; AD-126 e AD-127 mudaram isso e a spec não foi atualizada. Rodada local: T01 `erro` 3,13% e 6,94%, `carregando` 6,89% e 11,79% acima do limite de 1%. | Nota ou AD na spec (FUN-38 vira "verificador, não CI") e abrir redesign da T01; ou mudar o app. | comum |
| A-04 | `backend/api/src/infraestrutura/db/estado.ts:19-22` | Spec: aborta se o schema "não é vazio nem igual ao da produção"; design C2 e código decidem só pela `pgmigrations` (o próprio código marca `[LACUNA]`); não há AD. | Registrar AD (spec manda comparar, design usa `pgmigrations`) ou ajustar a spec. | comum |
| A-05 | `.specs/STATE.md:131`, `:132` | Duas decisões diferentes com o mesmo ID `AD-126`. | Renumerar a segunda. | comum |
| A-06 | `test/lint/pontuacao-so-no-modulo.test.ts:26`, `test/lint/sem-escrita-periodo.test.ts:26`, `backend/api/test/rotas/webhook-asaas-aplicar.test.ts:149` | Teste com ESLint a frio no timeout padrão de 5 s (levou 28 a 42 s sob carga, falhou 2 vezes); como o `pnpm test` encadeia com `&&`, os pacotes nem rodam. `sem-io.test.ts` já usa 60 s. `afterAll` da suíte do webhook estoura 10 s. | `{ timeout: 60_000 }` no `describe` e `hookTimeout` maior. | comum |
| A-07 | `CLAUDE.md:52`, `wrangler.jsonc:12` | FUN-53: o contexto diz "sem domínio próprio" e não cita a AD-121; o `wrangler.jsonc` declara `custom_domain` de `gestaodapelada.ljssoftware.com.br`. | Atualizar a linha das decisões (AD-121). | comum |
| A-08 | `backend/api/test/migracoes/hash.test.ts:36-52` (`5dfbf107`), `esquema.test.ts:47` (`6dbe6a42`), `isolamento/meta.test.ts:53-77` (`e66a18bb`) | Testes de fundação mudados (contagens fixas viraram "a partir de", lista exata virou `arrayContaining`); `## Autorizações` do `STATE.md` não os cita e `e66a18bb` não traz o motivo. A força foi mantida por `problemasDeCobertura` e pelo catálogo. | Registrar a autorização retroativa com o motivo (decisão do usuário). | comum |

## Rastreabilidade

FUN-01 a 07, 09, 11 a 37, 39 a 49 (48 com R2-T1 pendente), 51 e 55 a 58: ✅ verificados. FUN-08 e 10: ⚠️. FUN-38, 50 e 54: ❌. FUN-52 e 53: ⚠️ (sem teste, conferidos por leitura). `validate_state.py` não foi rodado: lê `validation.md`, que a sessão `/validar` consolida a partir deste arquivo.
