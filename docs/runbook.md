# Runbook de operação

Roteiro de quem opera a produção: deploy, falha de migração, restauração, rotação de segredos, remoção do Worker
antigo e monitor de uptime. Cada seção aponta para o arquivo que faz o trabalho; aqui ficam a ordem e os comandos.
Nenhuma senha, chave ou string de conexão vai neste arquivo. Os itens de webhook, pagamento e reativação entram
com as features `planos-e-cobranca` e seguintes.

Nomes usados: Worker novo `gestaodapelada`, Worker antigo `pelada`, environments do GitHub `producao` e `backup`, roles do banco
`pelada_app` (runtime, sem bypass de RLS), `pelada_backup` (leitura) e o owner do Neon (migração, tem `bypassrls`).

## 1. Antes do primeiro deploy (obrigatório, uma vez)

O primeiro deploy do app novo migra o banco de produção, que hoje atende o Worker antigo `pelada`. Só siga depois de
cumprir os três itens, nesta ordem. Cada um pede confirmação explícita de quem opera.

1. **Dump cifrado do banco de produção.** Dispare o `backup.yml` à mão (`gh workflow run backup.yml --ref main`) e
   confirme que o artefato `backup-AAAA-MM-DD-<run_id>` existe e tem tamanho maior que zero. Guarde o `run_id`.
   Faça um ensaio de decifragem (seção 4) antes de apagar qualquer coisa.
2. **Remoção confirmada do Worker `pelada`.** Veja a seção 6. Só depois do item 1, e só com a confirmação de que o
   Worker antigo saiu do ar e nada mais o chama.
3. **Roles e senhas de login conferidas.** Em produção, `pelada_app` precisa ter login e a mesma senha que a origem
   do Hyperdrive usa (seção 5). O owner do Neon nunca vira origem do Hyperdrive.

Registre a data e quem confirmou cada item na entrada da liberação (`.specs/liberacao.md`).

## 2. Deploy

- **Produção:** disparo manual do `deploy.yml` na `main` (`gh workflow run deploy.yml --ref main`, ou Actions, Run
  workflow). O push não dispara deploy. Não há homologação. Duas execuções juntas: a segunda espera a primeira.
- **Ordem do workflow**, parando no primeiro erro: (1) `URL_PUBLICA` conferida; (2) build do web; (3) branch de
  restauração no Neon (`restauracao-producao-<run_id>`, mantém só as 2 mais recentes); (4) dump cifrado
  (`dump-predeploy-<run_id>`); (5) migração com `NEON_URL_MIGRACAO` (`pnpm migrar --alvo producao`); (6) cache do
  Hyperdrive conferido como desligado; (7) `wrangler deploy` com `URL_PUBLICA` e `VERSAO` (o SHA); (8) `GET /api/health`
  = 200 com `versao` igual ao SHA do commit.
- Se o build ou a conferência de `URL_PUBLICA` falhar, nada em produção mudou. Se a migração falhar, o
  `wrangler deploy` não roda (seção 3).
- **Conferir à mão:** `curl -fsS https://<host>/api/health` deve devolver `{"status":"ok","versao":"<sha>"}`.
- **Environments e secrets (nunca no nível do repositório).** Secret de repositório vale para qualquer workflow de
  qualquer branch, então quem tem escrita no repositório poderia lê-lo sem passar pela `main`. Todos ficam em
  environment com branch policy só `main` (Settings, Environments, Deployment branches and tags, Selected branches,
  `main`):
  - **`producao`** (usado pelo `deploy.yml`): variável `URL_PUBLICA` (origem https, sem barra final); secrets
    `NEON_URL_MIGRACAO`, `NEON_API_KEY`, `NEON_PROJECT_ID`, `BACKUP_CHAVE`, `CLOUDFLARE_API_TOKEN`,
    `CLOUDFLARE_ACCOUNT_ID` e `VITE_SENTRY_DSN`.
  - **`backup`** (usado pelo `backup.yml`): secrets `NEON_URL_BACKUP` e `BACKUP_CHAVE` (a mesma chave pública do
    `producao`).
  - Em Settings, Secrets and variables, Actions, a lista "Repository secrets" fica vazia. Se algum desses segredos já
    esteve lá, mova-o e gire a credencial (seção 5). O teste `segredos-workflows.test.mjs` exige o environment em todo
    job que usa secret.

  Formatos no [`.env.example`](../.env.example).

- **Token da Cloudflare:** Workers (edição) para publicar e `Account > Hyperdrive: Read` para a conferência do cache.
  Sem a segunda, o passo falha fechado e o deploy não segue.
- Só o `deploy.yml` chama `wrangler deploy` (o CI confere com `checar-wrangler-deploy.mjs`).

## 3. Falha de migração e restauração pela branch

**A migração falhou** (passo 5 vermelho): o `wrangler deploy` não rodou, o app continua na versão anterior. Cada
migration roda na sua transação, então a que falhou não deixou meia alteração; as anteriores do mesmo lote podem ter
sido aplicadas, e as migrations são aditivas (o app anterior continua funcionando).

1. Leia o erro no log do passo. Corrija a migration em PR novo; nunca edite uma migration já aplicada.
2. Se o banco ficou num estado estranho, `pnpm migrar` diz o estado detectado e recusa sozinho quando é `parcial`,
   sem alterar nada.
3. Para voltar ao banco de antes da migração, use a branch `restauracao-producao-<run_id>` do Neon (cópia do banco
   no instante anterior) ou o artefato `dump-predeploy-<run_id>` (seção 4).
4. Aponte a origem do Hyperdrive para a branch de restauração (o `id` está em `hyperdrive[0].id` do `wrangler.jsonc`):
   `pnpm --filter @pelada/api exec wrangler hyperdrive update <id> --origin-host <host> --origin-user pelada_app --origin-password <senha> --database <banco> --caching-disabled`.
   Mantenha `--caching-disabled`. A senha na linha de comando fica no histórico do shell e aparece no `ps` enquanto o
   comando roda: comece o comando por um espaço com `HISTCONTROL=ignorespace`, ou no PowerShell desligue o histórico
   da sessão (`Set-PSReadLineOption -HistorySaveStyle SaveNothing`). Nunca cole o comando em chat nem em arquivo.
5. Confira `GET /api/health` e a contagem de linhas (seção 4, passo 6).

**O deploy ou a checagem de saúde falhou depois da migração:** o workflow roda `wrangler rollback` (e falha de
verdade se o rollback falhar) e imprime o nome da branch de restauração e do artefato. O banco já migrado serve à
versão anterior, porque as migrations são aditivas; só restaure o banco se houve dano a dado.

## 4. Restauração do backup

Vale para o backup diário (`backup-AAAA-MM-DD-<run_id>`) e para o dump antes do deploy (`dump-predeploy-<run_id>`).
Trabalhe fora do repositório, numa pasta temporária só sua, de preferência em disco cifrado. O dump tem dados
pessoais e a identidade privada do `age` não pode parar no git (o `.gitignore` cobre `*.pgdump`, `*.sql.age` e
`identidade-age*` só como rede de proteção).

1. **Baixe:** `gh run download <run_id> -n <nome-do-artefato>`. Sai um `<nome>.sql.age`.
2. **Decifre:** `age -d -i <arquivo-da-identidade> -o dump.pgdump <nome>.sql.age`. O secret `BACKUP_CHAVE` guarda só
   o destinatário público (`age1...`); a identidade privada (`AGE-SECRET-KEY-1...`) fica só no gerenciador de senhas
   e num arquivo temporário criado já restrito (`(umask 077; touch identidade-age.txt)`). Apague-o depois.
3. **Prepare o destino:** uma branch nova e vazia no Neon, ou um banco novo no Postgres local
   (`docker compose up -d` e `createdb`). **Nunca** a URL de produção: `--clean` apaga tabelas. O `pnpm restaurar`
   (passo 5) recusa produção, mas confira o host antes de rodar.
4. **Crie as roles antes de restaurar.** O dump leva as policies (`CREATE POLICY ... TO pelada_backup`), e sem a
   role no servidor o `pg_restore` sai com erro `role ... does not exist`. Num servidor onde elas não existem:
   ```sql
   CREATE ROLE pelada_app NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
   CREATE ROLE pelada_backup NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
   ```
   Numa branch do Neon filha de produção as roles já existem (são do servidor).
5. **Restaure com o `pg_restore` do PostgreSQL 16** (a versão do dump; um cliente mais novo gera arquivo que o 16 não
   lê), sempre pelo script, que passa pela trava de host antes de escrever:
   `DATABASE_URL="$URL_NOVA" URL_ORIGEM="$URL_ORIGEM" pnpm restaurar --arquivo <pasta-temporária>/dump.pgdump --alvo teste`
   (no banco local, sem `--alvo`). Ele roda `pg_restore --no-owner --no-privileges --clean --if-exists` com a senha em
   `PGPASSWORD`, fora da linha de comando. Recusa: host remoto sem `--alvo teste` e sem a confirmação digitada do host;
   `--alvo producao` sempre; destino no mesmo host de `URL_ORIGEM` (a origem de produção, a mesma do passo 6). Outro
   `pg_restore` 16: `PG_RESTORE=<caminho>`. Nunca rode o `pg_restore --clean` à mão. Como o dump sai sem
   privilégios, reaplique os grants e a senha de login depois:
   `psql "$URL_NOVA" -f backend/api/src/infraestrutura/db/migracoes/1792843260000_roles.sql` (idempotente) e
   `ALTER ROLE pelada_app WITH LOGIN PASSWORD '<senha>'` (digite a senha só no terminal). Códigos de saída diferentes
   de zero são erro de verdade; avisos de objeto inexistente com `--if-exists` não são.
6. **Confira a contagem de linhas contra a origem.** Um dump feito com `FORCE` de RLS e sem policy de leitura sai
   vazio com exit 0, então a contagem é a prova do backup:
   `psql "$URL_ORIGEM" -At -f backend/scripts/ops/contar-linhas.sql > origem.txt`,
   `psql "$URL_NOVA" -At -f backend/scripts/ops/contar-linhas.sql > restaurado.txt` e `diff origem.txt restaurado.txt`
   sem diferença. A URL tem senha: guarde-a em variável de ambiente lida de um prompt (`read -rs URL`) ou em
   `~/.pgpass` (`chmod 600`), e apague do histórico depois.
7. **Aponte o Hyperdrive** para o destino só se for trocar de banco (passo 4 da seção 3), conferindo `/api/health`.
8. **Apague** `dump.pgdump`, o `.sql.age` e a identidade ao terminar.
9. **Registre** a data, o artefato e a contagem conferida em `.specs/liberacao.md`. A restauração precisa ser
   executada uma vez de ponta a ponta, com a contagem conferida, antes de o backup ser considerado confiável.

## 5. Rotação de segredos

Faça um por vez, confira o `/api/health` e, quando houver deploy, o workflow verde.

| Segredo                       | Onde vale                   | Como girar                                                                                                                                                                                                                                                                       |
| ----------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Senha da role `pelada_app`    | Neon e origem do Hyperdrive | `ALTER ROLE pelada_app WITH PASSWORD '<nova>'` no Neon (digitada só no terminal) e `wrangler hyperdrive update <id> --origin-password <nova> --caching-disabled`; confira `/api/health` e uma leitura real.                                                                      |
| Senha da role `pelada_backup` | `NEON_URL_BACKUP`           | `ALTER ROLE pelada_backup WITH PASSWORD '<nova>'` e atualize o secret no environment `backup`; dispare o `backup.yml` à mão para provar.                                                                                                                                         |
| `NEON_URL_MIGRACAO`           | deploy                      | Gire a senha do owner no console do Neon e atualize o secret; o próximo deploy prova.                                                                                                                                                                                            |
| `NEON_API_KEY`                | deploy                      | Crie a chave nova no Neon, atualize o secret, revogue a antiga depois de um deploy verde.                                                                                                                                                                                        |
| `CLOUDFLARE_API_TOKEN`        | deploy                      | Crie o token novo (Workers edição e Hyperdrive leitura), atualize o secret, revogue o antigo.                                                                                                                                                                                    |
| `BACKUP_CHAVE`                | backup e dump do deploy     | `age-keygen -o identidade.txt`, guarde a identidade no gerenciador de senhas, grave só a linha `Public key` no secret (nos dois environments, `producao` e `backup`). Os backups antigos só se decifram com a identidade antiga: guarde as duas até o fim da retenção (30 dias). |
| `SENTRY_DSN`                  | Worker                      | `wrangler secret put SENTRY_DSN`. No projeto do Sentry, ligue também Settings, Security & Privacy, "Prevent Storing of IP Addresses" (segunda camada; o código já filtra os cabeçalhos).                                                                                         |
| `VITE_SENTRY_DSN`             | build do web (deploy)       | Em GitHub, Settings, Environments, `producao`, crie o secret `VITE_SENTRY_DSN` com o DSN do projeto Sentry do front (Sentry, Settings, Client Keys). Sem ele, o Sentry do front não inicializa.                                                                                  |

## 6. Remoção do Worker antigo `pelada`

Ação difícil de desfazer. Peça e registre a confirmação específica antes de cada passo.

1. Confirme o dump cifrado (seção 1, item 1) e que o app antigo não tem usuários dependendo dele.
2. Remova o Worker `pelada` no painel da Cloudflare (Workers & Pages, `pelada`, Settings, Delete) ou com
   `pnpm --filter @pelada/api exec wrangler delete --name pelada`. O Hyperdrive existente **não** é apagado: o Worker
   novo o reaproveita (`hyperdrive[0].id` do `wrangler.jsonc`).
3. Confirme que o host antigo deixou de responder e que o painel não lista mais o Worker.
4. Só então rode o primeiro deploy (seção 2).

## 7. Monitor de uptime (UptimeRobot)

Crie a conta e o monitor no painel do UptimeRobot (ação sua; o código funciona sem ele):

1. Add New Monitor, tipo **HTTP(s)**, nome `Gestão da Pelada - saúde`.
2. URL: `https://<host de URL_PUBLICA>/api/health`.
3. Intervalo de 5 minutos. Opcional: tipo **Keyword** procurando `"status":"ok"`.
4. Contato de alerta: seu e-mail (e-mail é o canal gratuito).
5. Teste: pause o monitor e retome, ou confira que o primeiro ciclo fica "Up". O endpoint responde 200 sem tocar o
   banco, então o monitor mede o Worker, não o Postgres.

## 8. Backup diário

O `backup.yml` roda às 07:00 UTC (04:00 em Brasília) e sob demanda, no environment `backup` (seção 2). Falha de dump ou de cifragem deixa o job vermelho
e não publica artefato; o GitHub avisa por e-mail se as notificações de Actions estiverem ligadas. O artefato fica 30
dias. O dump é feito pela role `pelada_backup` com `--enable-row-security` e o cliente do PostgreSQL 16.
