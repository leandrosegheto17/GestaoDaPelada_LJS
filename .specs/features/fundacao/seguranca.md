# Segurança: fundação (feature 1 de 8)

**Data:** 2026-10-25 · **Branch:** `feat/fundacao` (commit `7ea27e4`) · **Auditor:** agente `auditor-seguranca`
**Resultado:** 0 crítico, 0 alto, 2 médios, 7 baixos · **Bloqueia o lançamento?** não (nenhum crítico ou alto). Os 2 médios
devem ser resolvidos antes do primeiro deploy com dados reais e antes de configurar o `SENTRY_DSN`.

Escopo: superfície da fundação (Worker com `/api/health`, middlewares, transação por requisição, migrations, roles e RLS,
assets, `_headers` e service worker, workflows `ci`/`deploy`/`backup`, actions compostas, scripts de migração, seed e
operação, runbook). Teste ativo só local: banco temporário no Postgres de teste (`fundacao-db-1`, porta 5432, criado e
apagado pela própria sonda) e `wrangler dev` na porta 8797 (encerrado ao fim). Nada foi executado contra Neon,
Cloudflare ou GitHub reais. Nenhum código foi alterado.

Saídas brutas (fora do git, podem citar URLs locais): pasta de rascunho da sessão
`C:/Users/leand/AppData/Local/Temp/claude/c--Leandro-Projetos-GestaoDaPelada-LJS/129a1510-fa5d-47e5-8fba-cdc0cb2e754f/scratchpad/seguranca-fundacao/`
(`resumo-ferramentas.md`, `gitleaks.json`, `segredos-historico.json`, `dependencias-node.json`, `sondas-rls.txt`,
`sondas-rls-login.txt`). As sondas estão na pasta acima dela (`sondas-rls.mjs`, `sondas-rls-login.mjs`,
`sentry-cabecalhos.mjs`, `trava.mjs`).

## Ferramentas

| Ferramenta | Situação | Resultado |
|---|---|---|
| `pnpm audit --prod` | OK | 0 vulnerabilidades (204 dependências) |
| `pnpm audit` (com dev) | 1 achado | `zod@4.6.5` alto, só em dev (SEC-007) |
| `gitleaks git --redact .` (histórico inteiro, 68 commits, todas as branches) | OK | 0 segredo |
| `gitleaks dir . --redact` | OK | 0 segredo |
| Busca embutida no histórico (`varredura-seguranca.py`) | 28 ocorrências | Todas fictícias (ver "Verificado e OK") |
| osv-scanner, semgrep | NÃO EXECUTADO | Não instalados; instalar é decisão do usuário |

## Superfície de ataque

| Ponto de entrada | Quem acessa | Situação na fundação |
|---|---|---|
| `GET /api/health` | Qualquer pessoa | Única rota de API; não toca o banco; devolve o SHA publicado |
| Demais `/api/*` | Qualquer pessoa | 404 JSON; já passam por Sentry, `no-store`, `nosniff`, limitadores, CSRF (`X-Pelada`), limite de corpo de 16 KB e transação por requisição |
| Assets (SPA, `sw.js`, `offline.html`, manifest) | Qualquer pessoa | `_headers` com CSP, HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy` |
| Hyperdrive -> Neon | Worker (role `pelada_app`) | RLS com `FORCE` em 15 tabelas com `grupo_id` |
| `deploy.yml` | Quem pode disparar na `main` com o environment `producao` | Owner do Neon, token Cloudflare, chave Neon |
| `backup.yml` | Agendado e manual, **sem environment** | `NEON_URL_BACKUP` (lê o banco todo) |
| Scripts `migrar`, `seed`, `dev` | Operador local | Trava de host |
| Restauração (runbook §4) | Operador, comandos manuais | `pg_restore --clean` sem trava de host |

Dados sensíveis: contas (e-mail, hash bcrypt), sessões (SHA-256 do token), dados de jogador (ano de nascimento, notas,
financeiro), credenciais do Neon e da Cloudflare, dumps cifrados.

## Achados

### SEC-001 [MÉDIO] Credencial de leitura do banco inteiro fora de environment protegido (`backup.yml`), e o runbook aceita segredos de deploy no nível do repositório

- **Evidência:** `.github/workflows/backup.yml:19-34`: o job `backup` não declara `environment` e usa
  `secrets.NEON_URL_BACKUP` e `secrets.BACKUP_CHAVE` (linhas 31-32). `docs/runbook.md:38-41`: "**Secrets**
  (repositório ou environment): `NEON_URL_MIGRACAO`, `NEON_API_KEY` [...]. O `backup.yml` roda sem environment:
  `NEON_URL_BACKUP` e `BACKUP_CHAVE` precisam estar no nível do repositório."
- **Por que importa:** secret de repositório fica disponível para **qualquer workflow de qualquer branch**. A proteção
  do environment `producao` (branch policy só `main`, que o THREAT-MODEL §7 cita como controle) não vale para ele.
  `pelada_backup` lê todas as tabelas, inclusive `contas` (e-mails e hashes de senha), `sessoes` e os dados pessoais de
  jogador (sonda: `pelada_backup lê contas (backup completo)`; `1792843260000_roles.sql:35`). O Neon aceita conexão de
  qualquer IP com a senha (allowlist de IP é pago), então a URL vazada basta para copiar o banco. Se o operador seguir
  a opção "repositório" do runbook para `NEON_URL_MIGRACAO`, a exposição é do **owner com `bypassrls` e DDL**.
- **Cenário de exploração:** alguém com escrita no repositório (colaborador, PAT ou app do GitHub comprometido) cria
  uma branch com um workflow `on: push` que usa `${{ secrets.NEON_URL_BACKUP }}` e manda o valor para fora (ou roda
  `gh workflow run backup.yml --ref <branch>` com um `dump-cifrado.sh` alterado para não cifrar). Nada disso passa pela
  `main` nem por revisão. Pré-requisito: escrita no repositório. Por isso médio, e não alto.
- **Reprodução (não executada, por ser contra o GitHub real):** conferir em Settings, Secrets and variables, Actions,
  em que nível estão `NEON_URL_BACKUP`, `BACKUP_CHAVE`, `NEON_URL_MIGRACAO`, `NEON_API_KEY` e `CLOUDFLARE_API_TOKEN`.
  Qualquer um no nível "Repository secrets" confirma o achado.
- **Correção recomendada:** criar o environment `backup` (branch policy só `main`), declarar `environment: backup` no
  job do `backup.yml` e mover `NEON_URL_BACKUP` e `BACKUP_CHAVE` para ele. Deixar os segredos de deploy **só** no
  environment `producao` e trocar "repositório ou environment" por "só environment" no runbook. Acrescentar ao
  `deploy-yml.test.mjs`/`backup.test.mjs` a checagem de que todo job que usa `secrets.*` (exceto `GITHUB_TOKEN`)
  declara `environment`. Se algum desses segredos já esteve no nível do repositório, gire a senha (runbook §5).

### SEC-002 [MÉDIO] Sentry do Worker envia o IP do cliente, o país e o user-agent a terceiro (LGPD), contra o que FUN-23 e o THREAT-MODEL afirmam

- **Evidência:** `backend/api/src/entrada/sentry.ts:51-57` define `dataCollection` sem `httpHeaders`, cujo padrão no
  `@sentry/core` 11.9.0 é `{ request: true, response: true }`
  (`node_modules/.pnpm/@sentry+core@11.9.0/.../utils/data-collection/resolveDataCollectionOptions.js:6`). O SDK copia
  todos os cabeçalhos da requisição para `event.request.headers`
  (`@sentry/cloudflare .../scope-utils.js:16` -> `winterCGRequestToRequestData`) e só mascara nomes com "auth",
  "token", "cookie" etc. O `limparEvento` (`sentry.ts:10`, `:27-41`) remove só `cookie` e `authorization`. Na
  Cloudflare toda requisição chega com `CF-Connecting-IP`, `X-Forwarded-For`, `X-Real-IP` e `CF-IPCountry`.
- **Reprodução local** (`node sentry-cabecalhos.mjs`, com as mesmas opções do `sentry.ts` e o `limparEvento` real):
  ```
  após limparEvento (beforeSend): {"cf-connecting-ip":"200.1.2.3","cf-ipcountry":"BR","user-agent":"Mozilla/5.0 (iPhone)","x-forwarded-for":"200.1.2.3","x-real-ip":"200.1.2.3"}
  ```
  O teste `backend/api/test/rotas/sentry-com-dsn.test.ts` não pega isso: a requisição dele não traz cabeçalho de IP.
- **Impacto:** com `SENTRY_DSN` configurado, todo erro do Worker leva o IP do usuário (dado pessoal pela LGPD) ao
  Sentry, fora do que o projeto declara (THREAT-MODEL, linha "Monitoramento"; FUN-23). Não é explorável por atacante;
  é tratamento de dado pessoal não previsto. Hoje só ocorre se o DSN estiver configurado no Worker.
- **Correção recomendada:** em `opcoesSentry`, `dataCollection.httpHeaders: { request: { allow: ['content-type',
  'content-length', 'user-agent'] }, response: false }` (ou `false`), e no `limparEvento` uma lista de permissão de
  cabeçalhos no lugar da de bloqueio. Acrescentar ao teste com DSN os cabeçalhos `CF-Connecting-IP`,
  `X-Forwarded-For` e `X-Real-IP` e exigir que o IP não saia. No painel do Sentry, ligar "Prevent Storing of IP
  Addresses" como segunda camada.

### SEC-003 [BAIXO] RLS no contexto público (slug) libera todas as tabelas do grupo; no contexto de conta, ignora `acessa_financeiro`

- **Evidência:** `backend/api/src/infraestrutura/db/migracoes/1792843320000_rls.sql:48` e `:52`: a mesma policy de
  leitura (`grupo_id IN (SELECT grupos_visiveis())`) vale para toda tabela, e `grupos_visiveis()` devolve o grupo do
  slug quando não há conta. Sonda como `pelada_app` só com `app.slug_publico`:
  ```
  INFO slug público: tabelas com SELECT permitido no banco -> jogadores:legivel notas:legivel habilidades:legivel config_pesos:legivel lancamentos:legivel pagamentos_mes:legivel config_financeira:legivel vinculos_admin:legivel escalacoes:legivel
  INFO slug público: ano_nascimento do jogador do grupo legível no banco -> [{"ano_nascimento":1990}]
  ```
- **Por que baixo:** cumpre a letra de FUN-14 e hoje não há rota pública. Mas a G-10 (projeção pública sem nota,
  idade nem financeiro) e o 403 do financeiro (G-03) ficam **só** na aplicação: um erro numa rota pública futura (a
  superfície sem login) devolveria notas ou financeiro sem que o banco recuse.
- **Correção recomendada (antes de `partidas-e-ranking`):** no contexto só de slug, limitar as policies às tabelas que
  a projeção pública usa (ex.: `grupos`, `partidas`, `presencas`, `periodos_ativos`, `jogadores` via view só com
  `id`/`apelido`) e negar `notas`, `habilidades`, `config_*`, `lancamentos`, `pagamentos_mes`, `vinculos_admin`,
  `escalacoes`. Para o financeiro, policy que exija `acessa_financeiro` no vínculo da conta.

### SEC-004 [BAIXO] Imagem `postgres:16` por tag mutável recebe a credencial do owner do Neon no deploy

- **Evidência:** `.github/actions/dump-cifrado/dump-cifrado.sh:30` (`docker run --rm -e PG_URL postgres:16 ...`). No
  `deploy.yml:78-83` a action recebe `secrets.NEON_URL_MIGRACAO` (owner, `bypassrls`). A G-24 e o
  `checar-acoes-fixadas.mjs` só cobrem `uses:`, não imagens Docker.
- **Cenário:** uma tag `postgres:16` trocada no Docker Hub (comprometimento da cadeia) recebe a URL do owner. Baixa
  probabilidade (imagem oficial).
- **Correção:** fixar por digest (`postgres:16@sha256:<digest>`) e estender a checagem da G-24 para `docker run` e
  `services.*.image`.

### SEC-005 [BAIXO] Limitador de taxa roda antes da checagem de CSRF: página de terceiros pode esgotar o `LIMITE_ENTRAR` do IP da vítima

- **Evidência:** `backend/api/src/entrada/app.ts:40-48`: os limitadores vêm antes de `exigirCabecalhoPelada`. Sonda
  local (`wrangler dev`, porta 8797): 10 POST com `X-Pelada: 1` em `/api/sessao/entrar` -> 404, os seguintes -> 429;
  depois, 3 POST **sem** `X-Pelada` -> `429 429 429` (consomem a mesma cota).
- **Cenário:** um site qualquer dispara `fetch(..., {method:'POST', mode:'no-cors'})` para `/api/sessao/entrar` a
  partir dos navegadores dos visitantes. Sem preflight (sem cabeçalho próprio), a requisição chega e gasta a cota do IP.
  Em CGNAT (comum em operadora móvel) isso bloqueia o login de outras pessoas. Só disponibilidade.
- **Correção:** registrar `exigirCabecalhoPelada` antes dos limitadores (requisição sem `X-Pelada` vira 403 sem gastar a
  cota). Teste: 11 POST sem o cabeçalho seguidos de 1 com o cabeçalho, que não deve receber 429.

### SEC-006 [BAIXO] E-mail do dono fixado no schema: identificador de login conhecido

- **Evidência:** `backend/api/src/infraestrutura/db/migracoes/1792843200000_linha-de-base.sql:17`
  (`CONSTRAINT contas_dono_email CHECK (NOT e_dono OR email = '<e-mail do dono>')`), também no histórico (commit
  `34a81ce`). O comentário de `dump-cifrado.sh:22` ("o log do Actions é público") sugere repositório público.
- **Impacto:** se o repositório for público, qualquer pessoa conhece o login da conta mais poderosa. Com o bloqueio de 5
  falhas/15 min por e-mail (THREAT-MODEL §1), um atacante com IPs variados mantém o dono bloqueado indefinidamente, e o
  e-mail fica exposto a phishing. Vem do legado; a rota de login chega na `conta-e-acesso`.
- **Correção:** na `conta-e-acesso`, bloqueio progressivo que não tranque o dono só por falhas vindas de IPs diferentes
  (ou CAPTCHA/desafio depois de N falhas) e alerta ao dono. Avaliar trocar o CHECK por uma variável do script
  `dono.ts` (exige migration de contração). Ver "Perguntas para o usuário".

### SEC-007 [BAIXO] `zod@4.6.5` com vulnerabilidade alta (GHSA-mrhx-c7xc-m3w5), só em dev

- **Evidência:** `pnpm audit` -> `zod <4.6.6`, caminho `backend__api>@cloudflare/vitest-plugin>zod`; `pnpm why zod -r`
  confirma que só o plugin de testes usa. Nenhum pacote de produção depende de zod (`backend/contrato/package.json`
  ainda sem dependências).
- **Correção:** `overrides: { zod: '>=4.6.6' }` no `pnpm-workspace.yaml` ou atualizar o plugin. Quando o
  `@pelada/contrato` adotar zod, exigir `>=4.6.6` (aí sim seria entrada de atacante).

### SEC-008 [BAIXO] `workers_dev` e `preview_urls` não declarados no `wrangler.jsonc`

- **Evidência:** `wrangler.jsonc` não tem as chaves. No wrangler 4.152.0, com `routes`, `workers_dev` cai para `false`
  (`wrangler-dist/cli.js:165611`), mas `preview_urls` fica indefinido e o estado vem da conta Cloudflare.
- **Impacto:** se as preview URLs estiverem ligadas, cada versão fica acessível também em
  `<versao>-gestaodapelada.<subdominio>.workers.dev`, um segundo host fora de `URL_PUBLICA` e da G-18.
- **Correção:** declarar `"workers_dev": false` e `"preview_urls": false` e conferir no `wrangler.test.ts`.

### SEC-009 [BAIXO] Restauração destrutiva (`pg_restore --clean`) sem trava de host

- **Evidência:** `docs/runbook.md:79-94`: a restauração é uma sequência de comandos manuais com `--clean --if-exists`
  contra `$URL_NOVA`. A única proteção é o aviso "Nunca a URL de produção". A G-16 exige trava de host em todo script
  que escreve no banco, mas aqui não há script.
- **Correção:** script `backend/scripts/ops/restaurar.ts` que chame `exigirHostPermitido` e recuse o host de produção (o
  mesmo de `NEON_URL_MIGRACAO`) mesmo com `--alvo`, e só então rode `pg_restore`.

## Observações sem severidade (limites conhecidos)

- **A RLS não protege contra injeção de SQL.** `pelada_app` pode chamar `set_config('app.conta_id', <outra conta>,
  true)`. Sonda com login real como `pelada_app`: "grupos visíveis: 1" com a conta B. Isso vale para qualquer RLS por
  GUC. A defesa é o Kysely parametrizado. Sugestão para as próximas features: regra de lint contra `sql.raw`/`sql.lit`
  com valor vindo da requisição.
- `pelada_app` pode criar tabela temporária (privilégio `TEMP` padrão de `PUBLIC`). É inofensivo, mas
  `REVOKE TEMP ON DATABASE ... FROM PUBLIC` fecha.
- O invólucro da transação deixa passar `SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE`. Isso persistiria na
  conexão do pool do Hyperdrive, mas só com SQL arbitrário e só para mudar o modo padrão: o `BEGIN READ ONLY` explícito
  prevalece.
- Fora da Cloudflare (local), um `CF-Connecting-IP` enviado pelo cliente troca a chave do limitador (3 POST com IPs
  forjados -> 404). Na borda da Cloudflare o cabeçalho é definido pela própria Cloudflare. Não é achado; confirmar no
  host publicado (débito 3 do THREAT-MODEL).

## Verificado e OK

**Segredos**
- `gitleaks git` (histórico inteiro) e `gitleaks dir`: 0. As 28 ocorrências da busca embutida são todas fictícias:
  valores distintos conferidos (`postgres:postgres` do compose/CI, `u:s@`, `u:segredo@ep-x...neon.tech`,
  `pelada_app:e2e...@localhost`, `usuario:senha@host:porta`, `senha: 'segredo'`).
- As senhas reais do `.env` local (`PELADA_APP_SENHA`, `PELADA_BACKUP_SENHA`) aparecem 0 vezes no histórico e só no
  `.env`, que é ignorado (`.gitignore:6`). O `.env.example` não tem valores. O `wrangler.jsonc` não tem senha (o
  `localConnectionString` não traz credencial; o id do Hyperdrive não é segredo).

**Roles e RLS** (banco temporário migrado do zero; `sondas-rls.txt` e `sondas-rls-login.txt`)
- `pelada_app` e `pelada_backup`: sem `bypassrls`, `superuser`, `createrole` nem `createdb`, e não são membros de outra
  role.
- `ENABLE` + `FORCE` nas 15 tabelas com `grupo_id` (inclui `auditoria` e `eventos_uso`). As tabelas sem RLS
  (`contas`, `sessoes`, `tentativas_login`, `pedidos_reset`, `pgmigrations`) não têm grant para `pelada_app` (42501
  nas 7 tabelas sondadas). Nenhum grant de tabela para `PUBLIC`.
- Única função `SECURITY DEFINER` (`grupos_visiveis`): `search_path` fixo `public, pg_temp`, sem `EXECUTE` para
  `PUBLIC`.
- Sem contexto: 0 linhas. Conta A: só o grupo A. UPDATE e DELETE em linha de B afetam 0 linhas. INSERT em B, mover
  jogador para B, se vincular a B e trocar o próprio vínculo para B: 42501. Conta A + slug de B: o slug é ignorado.
  Só slug: lê o grupo; INSERT 42501 e UPDATE 0 linhas.
- Login real como `pelada_app`: recusa `SET ROLE postgres`, `SET SESSION AUTHORIZATION`, `COPY TO PROGRAM`,
  `pg_read_file`, `CREATE TABLE` em `public`, `ALTER FUNCTION`/`CREATE OR REPLACE FUNCTION` nas funções de contexto,
  `ALTER POLICY`, `ALTER TABLE ... DISABLE/NO FORCE`, `DROP POLICY`, `TRUNCATE`. `app.conta_id` que não é UUID dá
  erro 22P02 (falha fechada).
- `pelada_backup` lê tudo e não escreve (42501).

**Contexto por transação / vazamento entre requisições**
- `abrirTransacaoDaRequisicao`: um `pg.Client` por requisição, `BEGIN` (ou `BEGIN READ ONLY` em GET/HEAD) e
  `set_config(..., true)` parametrizado antes da primeira consulta. Recusou `COMMIT`, `commit` com comentário na
  frente, `END` e `ABORT` (`TransacaoAninhada`), `SELECT 1; COMMIT` (42601, protocolo estendido),
  `DO $$ BEGIN COMMIT; END $$` (2D000) e `SET TRANSACTION READ WRITE` (25001). INSERT em GET: 25006.
- `SET app.conta_id` de sessão numa "requisição" anterior na mesma conexão não vaza: o `set_config` local da seguinte
  prevalece (0 grupos), e `RESET` dentro da transação volta ao padrão vazio. Isso confirma o spike S1 (0 de 100 pelo
  Hyperdrive real).
- `criarApp()` não guarda estado de requisição em escopo de módulo (só a flag de log do limitador).

**API e cabeçalhos** (`wrangler dev` local, porta 8797)
- `/api/*` com `Cache-Control: no-store` e `X-Content-Type-Options: nosniff` em 200, 403, 404, 413 e 429. Corpo de
  erro JSON genérico, sem pilha. O `onError` registra só `erro.name` (`app.ts:57`).
- CSRF: POST/PUT/DELETE sem `X-Pelada: 1` (ou com `X-Pelada: 0`) -> 403. Sem cabeçalhos CORS: `Origin` estranho não
  recebe `Access-Control-Allow-Origin`, e `OPTIONS` -> 404.
- Corpo de 20 KB -> 413, inclusive com `Transfer-Encoding: chunked` e com `Content-Length` falso.
- `LIMITE_ENTRAR`: 10 passam, a 11ª recebe 429 com `no-store`/`nosniff`.
- Assets e fallback da SPA com CSP restritiva (`script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`,
  `base-uri 'self'`, `form-action 'self'`), HSTS de 1 ano, `nosniff`, `Referrer-Policy: same-origin` e
  `Permissions-Policy`. Com DSN, só a origem do Sentry entra em `connect-src` (`config/cabecalhos.ts`). `/api/%2e%2e/`
  não escapa do roteamento (307 para `/`).

**Service worker**
- `dist/sw.js`: o precache só tem HTML, JS, CSS, fontes, ícones e manifest. Não há rota de runtime nem cache de
  `/api`. `NavigationRoute` com denylist `^/api/` e `^/.well-known/`. Os handlers de push estão vazios.

**Workflows e actions**
- Toda `uses:` é fixada por SHA de 40 caracteres, com a tag em comentário. Todo `checkout` tem
  `persist-credentials: false`. `permissions: contents: read` nos três workflows. Não há `pull_request_target`.
- Nenhum `${{ }}` de contexto controlável por terceiros dentro de `run:`: `github.sha`, `github.run_id`,
  `vars.URL_PUBLICA` e `steps.*.outputs` passam por `env:`, e `URL_PUBLICA` é validada por regex antes do uso.
- Os tokens da Neon e da Cloudflare vão em config do curl (arquivo 600 ou stdin), fora do argv, com validação de
  caracteres. `CLOUDFLARE_API_BASE` fica presa a `https://api.cloudflare.com`.
- `deploy.yml`: só `workflow_dispatch`, `if: refs/heads/main`, `environment: producao`, `concurrency` sem
  cancelamento, rollback sem `|| true`, saúde conferida pelo SHA. `VITE_SENTRY_DSN` é público por natureza (vai no
  bundle).
- Dump: `pg_dump | age -r` em fluxo (nada em claro no disco), `pipefail`, arquivo `.parcial` apagado na falha,
  `if-no-files-found: error`, stderr do `pg_dump` descartado (sem host no log público), `CHAVE_AGE` exige `age1...`
  (chave pública). Retenção de 30 dias.
- O CI não usa segredo além do `GITHUB_TOKEN` (gitleaks). O `pnpm install --frozen-lockfile` roda num passo sem
  segredos no ambiente. `pnpm-workspace.yaml` tem `blockExoticSubdeps`, `minimumReleaseAge: 1440`, `trustPolicy` e
  `allowBuilds` restrito.

**Scripts e trava de host**
- `exigirHostPermitido`: 14 URLs adversárias (`?%68ost=`, `localhost%2e...`, `0x7f000001`, `127.1`,
  `[::ffff:127.0.0.1]`, `localhost@remoto`, `#@remoto`, vírgula) comparadas com o parser do `pg`
  (`pg-connection-string`). Em todas, ou a trava recusa ou o host que o `pg` usa é o mesmo que a trava aprovou
  (`trava.mjs`).
- `seed` só roda em host local (sem `--alvo`) e usa `escapeLiteral` para a senha das roles. `pnpm dev` recusa banco
  remoto. Nenhuma mensagem de erro dos scripts traz a URL.
- Migrations: uma transação por migration, detecção de estado `parcial` sem escrita, `REVOKE CREATE ON SCHEMA public
  FROM PUBLIC`.

**Dados pessoais**
- Sentry (Worker e front): sem corpo, cookies, query, `Authorization` nem e-mails (teste existente). Exceção: os
  cabeçalhos de IP (SEC-002). O front só inicializa com DSN.
- Logs do Worker: só `erro.name`, `limitador ausente` e `limitador indisponível`, sem IP.
- Backup: cifrado com `age`; a identidade privada fica fora do GitHub; o runbook manda trabalhar fora do repositório e
  apagar ao fim. O `.gitignore` cobre `*.pgdump`, `*.sql.age` e `identidade-age*`.
- `eventos_uso` sem IP nem nome (comentário do schema).

## Não verificado (fora do alcance local)

- Configuração do GitHub: nível dos secrets, branch policy do environment `producao`, visibilidade do repositório,
  correspondência dos SHAs das actions com as tags anunciadas.
- Cloudflare: origem do Hyperdrive como `pelada_app`, cache desligado, rate limits e cabeçalhos no host publicado,
  estado das preview URLs.
- Neon: roles e senhas de produção, ausência de outros usuários com `bypassrls` na origem.
- semgrep e osv-scanner (não instalados).

## Correções

Em 2026-10-25, depois da auditoria, um commit por achado, cada um com teste que falhava antes (detalhes e desvios no
`tasks.md`, seção "Correções da auditoria de segurança"). Os achados acima ficam como registro.

| Achado | Situação | Commit | Teste |
|---|---|---|---|
| SEC-001 | Corrigido no código e no runbook. Falta criar os environments no GitHub (T47) e, se algum secret já esteve no nível do repositório, girá-lo | `221c000`, `fae82d2` | `backend/scripts/ops/test/segredos-workflows.test.mjs` |
| SEC-002 | Corrigido: só `content-type`, `content-length` e `x-pelada` saem; IP, país e user-agent não | `e9c95eb` | `backend/api/test/rotas/sentry-com-dsn.test.ts`, `sentry.test.ts` |
| SEC-004 | Corrigido no `dump-cifrado.sh` e no CI (digest de 2026-10-25); G-24 confere imagens. `docker-compose.yml` local segue por tag (pergunta pendente) | `c56c2d2` | `checar-acoes-fixadas.test.mjs`, `backup.test.mjs` |
| SEC-009 | Corrigido: `pnpm restaurar` com a trava de host, recusa `--alvo producao` e o host de `URL_ORIGEM` | `1c16e75` | `backend/scripts/ops/test/restaurar.test.ts` |

SEC-003, SEC-005, SEC-006, SEC-007 e SEC-008 seguem abertos (baixos).

## Perguntas para o usuário

1. **O repositório `GestaoDaPelada_LJS` no GitHub é público?** (afeta SEC-006 e o peso de SEC-001)
   - É público: SEC-006 sobe de prioridade (e-mail do dono exposto) e os artefatos e logs do Actions são visíveis a
     qualquer pessoa.
   - É privado: SEC-006 continua baixo e o risco fica restrito a quem tem acesso.
2. **Em que nível estão hoje os secrets `NEON_URL_BACKUP`, `BACKUP_CHAVE`, `NEON_URL_MIGRACAO`, `NEON_API_KEY` e
   `CLOUDFLARE_API_TOKEN`?** (SEC-001)
   - Ainda não foram criados (Recomendado: criar já nos environments `producao` e `backup`): a correção é só de
     workflow e runbook.
   - Já estão no nível do repositório: além de mover, girar as credenciais (runbook §5).
   - Já estão só em environments: falta apenas o `backup.yml` declarar o dele.
3. **O `SENTRY_DSN` do Worker já está configurado?** (SEC-002)
   - Não (Recomendado: corrigir antes de configurar): nenhum IP saiu ainda.
   - Sim: corrigir já e avaliar apagar do projeto Sentry os eventos com cabeçalhos de IP.
