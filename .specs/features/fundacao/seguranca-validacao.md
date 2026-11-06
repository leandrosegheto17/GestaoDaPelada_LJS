# Segurança: fundacao (validação) — 0 críticos, 0 altos, 2 médios, 4 baixos

**Data**: 2026-11-06 · **Árvore**: `feature/fundacao` @ `f9801ec0` (igual à `main`) · **Auditor**: `auditor-seguranca` (somente leitura)
**Ferramentas**: `varredura-seguranca.py ferramentas` (pnpm audit, gitleaks no histórico de 1.148 commits, busca embutida); gitleaks sem allowlist em `.specs/` e `.claude/`; `pnpm audit` completo (com dev). osv-scanner e semgrep **não instalados**.
**Teste ativo**: só o Postgres local `pelada-fundacao-pg` (127.0.0.1:5451); toda sonda em transação com `ROLLBACK`. Nada contra o Neon, a Cloudflare ou o GitHub.

## Achados

| ID | Sev. | Título | Onde |
|---|---|---|---|
| SEC-01 | Médio | `pelada_backup_ro` sem SELECT em 2 sequences: o `pg_dump` completo do backup falha num banco montado pelas migrações | `migracoes/1792843800000_conta-senha-bloqueio.sql:21`, `1792843980000_conta-teto-emails-origem.sql:21` |
| SEC-02 | Médio | Secrets de produção protegidos só pelo `if: github.ref` do job; sem evidência de regra de branch nos environments `producao` e `backup` | `.github/workflows/deploy.yml:20-22`, `backup.yml:18-20` |
| SEC-03 | Baixo | Trava de host do banco (FUN-05, FUN-19) contornável por `?host=` na URL | `backend/scripts/src/host.ts:21` |
| SEC-04 | Baixo | API sem checagem de `Host` nem `Origin`/`Sec-Fetch-Site`, e sem CSP/`Referrer-Policy` nas respostas de `/api` (regra "Segurança padrão de app web") | `backend/api/src/entrada/app.ts:96-98`, `middlewares/cabecalhos.ts:18-21` |
| SEC-05 | Baixo | Dependências vulneráveis só em ferramentas de dev/teste; sem Dependabot | `pnpm-lock.yaml` (miniflare 4 / vitest-pool-workers, node-pg-migrate) |
| SEC-06 | Baixo | Varredura de segredos com pontos cegos: allowlist de pastas inteiras e `.gitignore` só com `.env` | `.gitleaks.toml:11-16`, `.gitignore:5` |

### SEC-01 — backup completo falha com a role das migrações (Médio)
- **Evidência**: as tabelas `falhas_senha_atual` e `pedidos_email_origem` recebem `GRANT SELECT` para a role de backup, mas as sequences `falhas_senha_atual_id_seq` e `pedidos_email_origem_id_seq` não (o `GRANT ... ON ALL SEQUENCES` de `1792843260000_roles.sql:36` vale só para as sequences que já existiam; a `1792846200000_notificacoes-tabelas.sql:65-67` corrigiu isso só para as dela). O `esquema-producao.txt:348-428` confirma: há grant para 6 sequences e não para essas 2.
- **Reprodução (local, feita)**: `docker exec -e PGPASSWORD=… pelada-fundacao-pg pg_dump -h 127.0.0.1 -U pelada_backup_ro -d pelada --format=custom --enable-row-security -f /dev/null` → `failed to get data for sequence "falhas_senha_atual_id_seq"`, **exit=1**. É o mesmo comando de `.github/actions/dump-cifrado/dump-cifrado.sh:18`.
- **Impacto**: qualquer banco montado pelas migrações (restauração, branch nova, ambiente de recuperação) fica sem backup, e o `deploy.yml` para no passo do dump. O `push-backup.test.ts:51-66` (NOT-58) só faz o dump de 3 tabelas e não pega isso. A produção gerou um dump em 2026-11-06 (`docs/restauracao-registro.md`). Então lá a role tem um privilégio que não está no repositório (provavelmente os `ALTER DEFAULT PRIVILEGES` do Neon para `neon_superuser`, citados no mesmo registro). **Se a `pelada_backup_ro` (ou a `pelada_app`) for membro de `neon_superuser` na produção, herda `INSERT/UPDATE/DELETE/TRUNCATE`. O `TRUNCATE` passa por cima da RLS, e isso contraria FUN-11 e AD-016: nesse caso o achado sobe para Alto.**
- **Correção**: migração aditiva com `GRANT SELECT ON SEQUENCE falhas_senha_atual_id_seq, pedidos_email_origem_id_seq TO pelada_backup_ro;`. Junto, um teste meta: toda sequence de `public` tem SELECT para `pelada_backup_ro`, e o `pg_dump` completo, sem `--table`, roda como essa role e sai com 0. Na produção, o usuário confere por SQL de leitura: a quem a role pertence (`pg_auth_members`) e se tem `has_table_privilege(…,'TRUNCATE')`, para `pelada_backup_ro` e para `pelada_app`.

### SEC-02 — environments sem regra de branch comprovada (Médio, a confirmar)
- **Evidência**: o `deploy.yml` só recusa outra ref pelo `if: github.ref == 'refs/heads/main'`, e o `backup.yml` nem isso tem. Quem tem escrita no repositório pode criar uma branch com uma cópia do workflow sem o `if`, disparar e ler `NEON_URL_MIGRACAO` (role dona), `CLOUDFLARE_API_TOKEN` e `NEON_API_KEY`. O runbook (`docs/runbook.md:166-187`) e o `.specs/preparacao.md:18` listam os secrets, mas não registram "Deployment branches = main" nem revisor obrigatório.
- **Reprodução**: não feita (proibido disparar workflow). Confira em Settings → Environments → `producao`/`backup`.
- **Correção**: nos dois environments, restringir a branch a `main` e, no `producao`, exigir revisor. Registrar a regra no runbook.

### SEC-03 — trava de host contornável (Baixo)
- **Evidência**: `exigirHostPermitido` olha só `new URL(url).hostname`. O `pg` honra o parâmetro `host` da query string. Prova offline: `postgres://u:x@127.0.0.1:5432/pelada?host=ep-x.sa-east-1.aws.neon.tech` → `URL.hostname=127.0.0.1`, `pg-connection-string.host=ep-x…neon.tech`. Afeta `migrar.ts:19`, `seed.ts:538`, `restaurar-backup.ts:99` e `test/apoio/banco.ts:40`.
- **Impacto**: a guarda contra erro humano (testes nunca na `main` do Neon, AD-032/033) falha numa URL com `?host=`. Não há atacante externo.
- **Correção**: recusar a URL que tenha `host`/`hostaddr` na query, ou validar o host já resolvido por `pg-connection-string.parse`. Um teste para cada variante.

### SEC-04 — guarda de origem/Host e cabeçalhos da API (Baixo)
- **Evidência**: a escrita é protegida por `X-Pelada: 1` (`cabecalho-pelada.ts:54-63`), sem CORS, com cookie `__Host-sessao; SameSite=Lax`. Isso é eficaz contra CSRF. Faltam o 421 por `Host` e o 403 por `Origin`/`Sec-Fetch-Site` que a regra do projeto pede, e as respostas de `/api` levam só `Cache-Control` e `nosniff`. Na Cloudflare o Host já é fixado pela rota. O risco que sobra é de rebinding de DNS contra o `wrangler dev` local, que serve `/api/dev/emails` com links de token quando `EMAIL_DEV=1`.
- **Correção**: middleware de `Host` (lista de `URL_PUBLICA` + 127.0.0.1/localhost em dev) e de `Origin`/`Sec-Fetch-Site` nas escritas. `Referrer-Policy: same-origin` e `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` em `/api`. Um teste por método e por variante.

### SEC-05 — dependências (Baixo)
- `pnpm audit --prod`: 2 moderadas, `glob` 13.0.6 e `minimatch` 10.2.6, que vêm do `node-pg-migrate`. É uma ferramenta de migração com padrões fixos e não entra no Worker.
- `pnpm audit` completo: 15 altas e 17 moderadas, todas em `@cloudflare/vitest-pool-workers` → `miniflare@4.20260317.3` (`undici@7.24.4`, `ws`, `sharp`, `zod`) e `esbuild@0.27.3` (leitura de arquivo pelo servidor de dev no Windows). O `wrangler@4.157.0` do deploy usa `undici@7.30.1`, já corrigido.
- **Correção**: atualizar o `@cloudflare/vitest-pool-workers` e ativar o Dependabot (ou rodar o `pnpm audit` no CI) para os alertas.

### SEC-06 — pontos cegos na varredura de segredos (Baixo)
- O `.gitleaks.toml:11-16` ignora `.specs/`, `.claude/` e `.rascunho/` inteiros, e é no `STATE.md` que ficam as notas de operação. O `.gitignore:5` cobre só `.env`: o `.env.validacao` (com senhas locais) fica fora do git apenas pelo `.git/info/exclude` local, e `.dev.vars` não está coberto.
- **Hoje**: gitleaks sem allowlist nessas pastas = 0 segredos reais (2 falsos positivos, hashes em `.claude/.instalacao.json`). Os 3 achados do gitleaks no histórico são valores fictícios de teste (`cifra.test.ts:28`, `sessao.test.ts:100`, `sessao-recuperacao.test.ts:136`). As URLs `*.neon.tech` com senha no histórico são todas fictícias (`ep-x`, `ep-calmo-rio-123456`…). O nome do endpoint real aparece truncado no `STATE.md`, sem credencial.
- **Correção**: trocar a allowlist de pastas por regexes específicas e pôr `.env.*`, `!.env.example` e `.dev.vars` no `.gitignore`.

## Conferido sem achado
- **RLS e roles (sonda local, ROLLBACK)**: as 31 tabelas com `ENABLE` + `FORCE`. `pelada_app` e `pelada_backup_ro` sem `BYPASSRLS` nem superuser. Conta B contra o grupo A: SELECT 0, UPDATE e DELETE 0, UPDATE sem `WHERE` só no próprio grupo, INSERT de jogador e de vínculo recusado pela policy. Sem contexto = 0 linhas. Slug público lê só o grupo dele, com escrita 0 e escalações 0. `pelada_app`: sem `TRUNCATE`, DDL, `ALTER`, `row_security=off` nem `pgmigrations`. `pelada_backup_ro`: lê tudo e não escreve. As policies `ALL` do financeiro e `escalacoes_ler_so_conta` são `RESTRICTIVE`. Toda função `SECURITY DEFINER` tem `search_path` fixo e `EXECUTE` só para `pelada_app`.
- **Worker**: uma transação por requisição com `set_config(…, true)` parametrizado (`com-banco.ts:103`). Erro 500/503 sem detalhe. Rate limit pela chave `cf-connecting-ip`. Nenhum `Access-Control-*`. SQL sem interpolação de entrada (só `sql.raw` de constante em `plano.ts:41,63`).
- **Assets**: `_headers` com CSP sem `unsafe-*`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: same-origin` e HSTS.
- **PWA**: o SW guarda só o ranking público (GET, status 200, até 50) e deixa `/api/` fora do fallback. Tokens de e-mail no fragmento `#t=`, apagado na hora.
- **Logs e Sentry**: logs sem dado pessoal. `limparEvento` tira corpo, cookies, `authorization` e e-mails, e o SDK 10.78 filtra cabeçalhos com "token" por padrão.
- **CI/deploy**: `permissions: contents: read` nos 3 workflows. Actions fixadas por SHA. `persist-credentials: false`. Sem `pull_request_target`. Concurrency sem cancelamento no deploy e no backup. `allowBuilds`, `minimumReleaseAge` e `blockExoticSubdeps` no pnpm.
- **Backup**: o `age` usa a chave pública de secret. Dump em streaming, sem arquivo parcial (`trap`). A restauração decifra por pipe, sem texto claro em disco. A branch de restauração do Neon só apaga `restauracao-*`.
- **Docker**: o Postgres local escuta só em `127.0.0.1`.

**Bloqueia o lançamento?** Não (sem crítico nem alto). SEC-01 vira Alto se a conferência na produção mostrar a role de backup ou a do app com herança de `neon_superuser`. SEC-02 depende da configuração dos environments.
