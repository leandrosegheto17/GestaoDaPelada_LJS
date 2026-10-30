# Runbook de operação

Roteiro de quem opera a produção: deploy, falha de migração, restauração, rotação de segredos, remoção do Worker
antigo, monitor de uptime e os passos externos da liberação da conta e acesso (seção 9). Cada seção aponta para o arquivo que faz o trabalho; aqui ficam a ordem e os comandos.
Nenhuma senha, chave ou string de conexão vai neste arquivo. Os itens de webhook, pagamento e reativação entram
com as features `planos-e-cobranca` e seguintes.

Nomes usados: Worker novo `gestaodapelada`, Worker antigo `pelada`, environments do GitHub `producao` e `backup`, roles do banco
`pelada_owner` (owner: migração e DDL, tem `bypassrls` no Neon), `pelada_app` (runtime, sem bypass de RLS) e
`pelada_backup_ro` (somente leitura, backup) (seção 2.3), branches do Neon `main` (produção) e `dev` (seção 2.1).

## 1. Antes do primeiro deploy (obrigatório, uma vez)

O primeiro deploy do app novo migra o banco de produção, que hoje atende o Worker antigo `pelada`. Só siga depois de
cumprir os três itens, nesta ordem. Cada um pede confirmação explícita de quem opera.

1. **Dump cifrado do banco de produção.** Dispare o `backup.yml` à mão (`gh workflow run backup.yml --ref main`) e
   confirme que o artefato `backup-AAAA-MM-DD-<run_id>` existe e tem tamanho maior que zero. Guarde o `run_id`.
   Faça um ensaio de decifragem (seção 4) antes de apagar qualquer coisa.
2. **Remoção confirmada do Worker `pelada`.** Veja a seção 6. Só depois do item 1, e só com a confirmação de que o
   Worker antigo saiu do ar e nada mais o chama.
3. **Roles e senhas de login conferidas.** Em produção, `pelada_app` precisa ter login e a mesma senha que a origem
   do Hyperdrive usa (seção 5). O owner (`pelada_owner`) nunca vira origem do Hyperdrive.

Registre a data e quem confirmou cada item na entrada da liberação (`.specs/liberacao.md`).

## 2. Deploy

- **Produção:** disparo manual do `deploy.yml` na `main` (`gh workflow run deploy.yml --ref main`, ou Actions, Run
  workflow). O push não dispara deploy. Não há homologação. Duas execuções juntas: a segunda espera a primeira.
- **Ordem do workflow**, parando no primeiro erro: (1) `URL_PUBLICA` conferida; (2) build do web; (3) dump cifrado
  (`dump-predeploy-<run_id>`), o único ponto de retorno antes de migrar; (4) migração com `NEON_URL_MIGRACAO`
  (`pnpm migrar --alvo producao`); (5) cache do Hyperdrive conferido como desligado e a origem dele
  conferida (conexão direta do Neon, role `pelada_app`); (6) `wrangler deploy` com
  `URL_PUBLICA` e `VERSAO` (o SHA); (7) `GET /api/health` = 200 com `versao` igual ao SHA do commit. O deploy não cria
  nem apaga branch no Neon (ADR-030).
- Se o build ou a conferência de `URL_PUBLICA` falhar, nada em produção mudou. Se a migração falhar, o
  `wrangler deploy` não roda (seção 3).
- **Conferir à mão:** `curl -fsS https://<host>/api/health` deve devolver `{"status":"ok","versao":"<sha>"}`.
- **Environments e secrets (nunca no nível do repositório).** Secret de repositório vale para qualquer workflow de
  qualquer branch, então quem tem escrita no repositório poderia lê-lo sem passar pela `main`. Todos ficam em
  environment com branch policy só `main` (Settings, Environments, Deployment branches and tags, Selected branches,
  `main`):
  - **`producao`** (usado pelo `deploy.yml`): variável `URL_PUBLICA` (origem https, sem barra final); secrets
    `NEON_URL_MIGRACAO`, `BACKUP_CHAVE`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` e `VITE_SENTRY_DSN`. Os
    antigos `NEON_API_KEY` e `NEON_PROJECT_ID` (da branch de restauração, removida pelo ADR-030) não são mais usados:
    apague-os do environment e revogue a chave no Neon.
  - **`backup`** (usado pelo `backup.yml`): secrets `NEON_URL_BACKUP` e `BACKUP_CHAVE` (a mesma chave pública do
    `producao`).
  - Em Settings, Secrets and variables, Actions, a lista "Repository secrets" fica vazia. Se algum desses segredos já
    esteve lá, mova-o e gire a credencial (seção 5). O teste `segredos-workflows.test.mjs` exige o environment em todo
    job que usa secret.

  Formatos no [`.env.example`](../.env.example).

- **Token da Cloudflare:** Workers (edição) para publicar e `Account > Hyperdrive: Read` para a conferência do cache.
  Sem a segunda, o passo falha fechado e o deploy não segue.
- Só o `deploy.yml` chama `wrangler deploy` (o CI confere com `checar-wrangler-deploy.mjs`).

### 2.1 Branches do Neon

O projeto do Neon tem **só duas branches permanentes** (ADR-030). Nada de branch por PR, por deploy ou de
restauração: se aparecer outra, apague-a no console do Neon (com confirmação de quem opera).

| Branch | Papel                                                                                | Quem aponta para ela                                                                                                                            |
| ------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `main` | Produção (branch padrão do projeto)                                                  | origem do Hyperdrive (role `pelada_app`, cache desligado); secret `NEON_URL_MIGRACAO` (owner, deploy); secret `NEON_URL_BACKUP` (backup diário) |
| `dev`  | Desenvolvimento e ensaios (restauração, migração antes de produção); filha da `main` | `NEON_URL_DEV` (owner), só no terminal de quem opera, com `--alvo teste`; nenhum secret do GitHub                                               |

Conexão com o Neon é sempre por `NEON_URL_*` (ADR-032): `NEON_URL_MIGRACAO` e `NEON_URL_BACKUP` (secrets) e
`NEON_URL_ORIGEM` (só no terminal, para a restauração conferir a origem) apontam para a `main`; `NEON_URL_DEV`, para a
`dev`. Com `--alvo producao` os scripts leem `NEON_URL_MIGRACAO`, com `--alvo teste` leem `NEON_URL_DEV`, e nunca
`DATABASE_URL`. O banco local (`docker compose`) e os bancos temporários dos testes não são branches do Neon e usam
`DATABASE_URL` e `DATABASE_URL_TESTE`. Para renovar a `dev` com os dados atuais da produção, use "Reset from parent" na `dev` (console
do Neon, Branches); isso apaga o que havia nela.

### 2.2 Validação da URL do Neon

Todo caminho que toca o Neon passa pela mesma validação (`backend/api/src/infraestrutura/seguranca/url-neon.ts`,
ADR-032) antes de conectar: o dump cifrado do deploy e do backup (action `dump-cifrado`), `pnpm migrar` e `pnpm dono`
com `--alvo`, `pnpm restaurar` com destino remoto e a origem do Hyperdrive no deploy. Ela recusa host local, host fora
de `.neon.tech`, host do pooler (`-pooler`), URL sem TLS (`sslmode=require`, `verify-ca` ou `verify-full`), parâmetro
na URL fora de `sslmode`, `channel_binding`, `connect_timeout` e `application_name`, e usuário diferente da role do
caminho (`pelada_owner` na migração, no dono, na restauração e no dump do deploy; `pelada_backup_ro` no backup;
`pelada_app` na origem do Hyperdrive). A mensagem de recusa nunca traz a URL nem a senha. A trava de host
(`trava-host.ts`) continua valendo: host remoto exige `--alvo` e a confirmação digitada do host (ou `CI=true`).

Formato de cada secret: `postgres://<role>:<senha>@<endpoint>.<região>.aws.neon.tech/pelada?sslmode=require`, com a
string **direta** do console do Neon (Connect, sem "Connection pooling").

**Database:** o Neon tem um database só, **`pelada`**, o mesmo nas branches `main` e `dev` (ADR-032); a validação
recusa qualquer outro nome, inclusive o padrão `neondb`, e a origem do Hyperdrive também usa `pelada`
(`--database pelada`). O banco local do `docker compose` também se chama `pelada`; os testes criam bancos temporários
`teste_<aleatório>` no servidor de `DATABASE_URL_TESTE` (o `pelada_teste` da URL de exemplo é só o banco de conexão) e
os apagam no fim. Se os dados de produção ainda estiverem noutro database do Neon, copie-os para `pelada` (dump cifrado
e `pg_restore`, com confirmação específica) **antes** de trocar os secrets e a origem do Hyperdrive: apontar para um
`pelada` vazio faria o `pnpm migrar` criar um schema novo e o app abrir sem dados.

### 2.3 Roles do banco

Padrão `<projeto>_owner`, `<projeto>_app` e `<projeto>_backup_ro` (ADR-032):

| Role               | Papel                                                          | Quem conecta com ela                                       |
| ------------------ | -------------------------------------------------------------- | ---------------------------------------------------------- |
| `pelada_owner`     | Dono do schema: migração, DDL, script do dono; tem `bypassrls` | `NEON_URL_MIGRACAO` (deploy); nunca a API nem o Hyperdrive |
| `pelada_app`       | Runtime: `NOBYPASSRLS`, sem DDL nem `TRUNCATE`                 | origem do Hyperdrive (cache desligado)                     |
| `pelada_backup_ro` | Somente leitura: `NOBYPASSRLS`, `SELECT` e policy de leitura   | `NEON_URL_BACKUP` (backup diário)                          |

`pelada_app` e `pelada_backup_ro` nascem pelas migrations (`NOLOGIN NOBYPASSRLS`); a senha de login é dada no Neon
(seção 5). A role de backup se chamava `pelada_backup`: a migration `1792844220000_roles-padronizadas` a renomeia no
primeiro deploy depois de 2026-10-28 (a senha SCRAM, os grants e as policies seguem a role). **No mesmo dia**, troque
o usuário do secret `NEON_URL_BACKUP` para `pelada_backup_ro`, senão o backup diário seguinte falha. A role owner é a
do console do Neon (Roles): ela precisa se chamar `pelada_owner` e ser a dona do database. Se hoje tem outro nome (por
exemplo `neondb_owner`), crie `pelada_owner` no console, transfira a posse do database e dos objetos
(`REASSIGN OWNED BY <antiga> TO pelada_owner`, com confirmação específica) e troque o usuário de `NEON_URL_MIGRACAO`.
Antes do primeiro deploy com `pelada_owner`, a role antiga dá a ela a administração das roles da aplicação
(`GRANT pelada_app, pelada_backup TO pelada_owner WITH ADMIN OPTION, INHERIT FALSE, SET FALSE`, no SQL Editor do Neon, conectado como a role
antiga): sem isso o PostgreSQL recusa a `pelada_owner` renomear `pelada_backup` (a migration de roles padronizadas) e
o deploy para na migração, sem publicar. Confira no console do Neon que a `pelada_owner` tem `CREATEROLE`.

### 2.4 Tempo limite da conexão do Worker

A transação de cada requisição desiste de conectar em **8 s** (`connectionTimeoutMillis`, ADR-033), sem nova
tentativa: com o Neon ou o Hyperdrive sem resposta, as rotas com banco respondem erro em vez de ficarem presas, e o
`/api/health` (que não toca o banco) continua 200. Muitos erros de banco de uma vez apontam para o Neon (página de
status e console) ou para a origem do Hyperdrive, não para o código.

## 3. Falha de migração e volta pelo dump

**A migração falhou** (passo 4 vermelho): o `wrangler deploy` não rodou, o app continua na versão anterior. Cada
migration roda na sua transação, então a que falhou não deixou meia alteração; as anteriores do mesmo lote podem ter
sido aplicadas, e as migrations são aditivas (o app anterior continua funcionando).

1. Leia o erro no log do passo. Corrija a migration em PR novo; nunca edite uma migration já aplicada.
2. Se o banco ficou num estado estranho, `pnpm migrar` diz o estado detectado e recusa sozinho quando é `parcial`,
   sem alterar nada.
3. Para voltar ao banco de antes da migração, use o artefato cifrado `dump-predeploy-<run_id>` (seção 4), o único
   ponto de retorno: restaure-o na branch `dev` (ou num banco local) e confira a contagem de linhas.
4. Só em emergência, e com confirmação específica, a `dev` restaurada vira a produção temporária (seção 3.1). Para
   apontar a origem do Hyperdrive para ela (o `id` está em `hyperdrive[0].id` do `wrangler.jsonc`):
   `pnpm --filter @pelada/api exec wrangler hyperdrive update <id> --origin-host <host> --origin-user pelada_app --origin-password <senha> --database pelada --caching-disabled`.
   Mantenha `--caching-disabled`. A senha na linha de comando fica no histórico do shell e aparece no `ps` enquanto o
   comando roda: comece o comando por um espaço com `HISTCONTROL=ignorespace`, ou no PowerShell desligue o histórico
   da sessão (`Set-PSReadLineOption -HistorySaveStyle SaveNothing`). Nunca cole o comando em chat nem em arquivo.
5. Confira `GET /api/health` e a contagem de linhas (seção 4, passo 6).

### 3.1 Emergência: a `dev` como produção temporária

Quando a `main` perdeu dados e o app precisa voltar já, a `dev` serve de produção temporária (ADR-030). O procedimento
é manual, cada passo com confirmação específica de quem opera, e o `pnpm restaurar` **nunca** é liberado para
produção: a restauração vai sempre para a `dev`.

1. **Restaure o dump cifrado na `dev`** (seção 4): o `dump-predeploy-<run_id>` do deploy que falhou, ou o backup
   diário mais recente sem o dano, com `NEON_URL_DEV` e `pnpm restaurar --alvo teste`. Reaplique os grants e dê à
   `pelada_app` da `dev` a mesma senha da origem do Hyperdrive (seção 4, passo 5).
2. **Confira a contagem de linhas** da `dev` contra o que se espera do dump (seção 4, passo 6).
3. **Aponte o Hyperdrive para a `dev`**: o comando da seção 3, passo 4, com o host direto da `dev` (sem `-pooler`),
   `--origin-user pelada_app`, `--database pelada` e `--caching-disabled`. Confira `GET /api/health` e uma leitura
   real pela tela. A partir daqui a `dev` é a produção: não rode ensaio, migração de teste nem "Reset from parent"
   nela, e não dispare o `deploy.yml` (o secret `NEON_URL_MIGRACAO` ainda aponta para a `main`).
4. **Volte ao padrão `main`/`dev`** por um destes caminhos, no console do Neon:
   - **Promover:** torne a `dev` a branch padrão (Branches, `dev`, "Set as default"), renomeie a `main` antiga (ou
     apague-a, só depois de um dump cifrado dela) e renomeie a `dev` para `main`; crie uma `dev` nova filha da `main`.
     O host de cada branch é o do endpoint dela e não muda com o nome: a nova `main` tem o endpoint da antiga `dev`.
     Troque `NEON_URL_MIGRACAO`, `NEON_URL_BACKUP`, `NEON_URL_ORIGEM` e `NEON_URL_DEV` para os hosts certos e confira
     que a origem do Hyperdrive aponta para a nova `main`.
   - **Reset:** restaure a `main` a partir do estado da `dev` pelo recurso de restauração de branch do console
     (Branches, `main`, Restore, escolhendo a `dev` como origem), aponte o Hyperdrive de volta para a `main` e faça
     "Reset from parent" na `dev`. Os hosts não mudam. Se o console não oferecer a `dev` como origem, use o promover.
5. **Confira** `GET /api/health`, a contagem de linhas na `main` e um backup manual (`gh workflow run backup.yml --ref
main`) verde antes de liberar o próximo deploy.
6. **Registre** em `.specs/liberacao.md` a data, o artefato restaurado, o caminho escolhido (promover ou reset) e quem
   confirmou cada passo.

**O deploy ou a checagem de saúde falhou depois da migração:** o workflow roda `wrangler rollback` (e falha de
verdade se o rollback falhar) e imprime o nome do artefato `dump-predeploy-<run_id>`. O banco já migrado serve à
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
3. **Prepare o destino:** a branch `dev` do Neon (seção 2.1; o `--clean` apaga o que houver nela), ou um banco novo
   no Postgres local
   (`docker compose up -d` e `createdb`). **Nunca** a URL de produção: `--clean` apaga tabelas. O `pnpm restaurar`
   (passo 5) recusa produção, mas confira o host antes de rodar.
4. **Crie as roles antes de restaurar.** O dump leva as policies (`CREATE POLICY ... TO pelada_backup_ro`), e sem a
   role no servidor o `pg_restore` sai com erro `role ... does not exist`. Num servidor onde elas não existem:
   ```sql
   CREATE ROLE pelada_app NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
   CREATE ROLE pelada_backup_ro NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
   ```
   Dump feito antes da renomeação (backups até o primeiro deploy depois de 2026-10-28) cita a role antiga: crie também
   `pelada_backup` do mesmo jeito e, depois do passo 5, rode a migration `1792844220000_roles-padronizadas.sql` no
   destino, que passa as policies para `pelada_backup_ro`.
   Na branch `dev` (filha da `main`) as roles já existem (são do servidor).
5. **Restaure com o `pg_restore` do PostgreSQL 18** (a versão do `pg_dump` que gerou o dump, ADR-031; um `pg_restore` mais antigo não
   lê), sempre pelo script, que passa pela trava de host antes de escrever:
   `NEON_URL_DEV="$URL_NOVA" NEON_URL_ORIGEM="$URL_ORIGEM" pnpm restaurar --arquivo <pasta-temporária>/dump.pgdump --alvo teste`
   (no banco local, `DATABASE_URL="$URL_NOVA"` e sem `--alvo`). Ele roda `pg_restore --no-owner --no-privileges --clean --if-exists` com a senha em
   `PGPASSWORD`, fora da linha de comando. Recusa: host remoto sem `--alvo teste` e sem a confirmação digitada do host;
   `--alvo producao` sempre; destino remoto sem `NEON_URL_ORIGEM` (a origem de produção, a mesma do passo 6); destino no
   mesmo endpoint do Neon que a origem (o pooler `-pooler` e o host com ponto final contam como o mesmo); parâmetro
   na consulta da URL fora de `sslmode`, `channel_binding`, `connect_timeout` e `application_name` (nada de
   `service`, `hostaddr` ou `password`). O `pg_restore` roda com ambiente limpo: `PGHOST`, `PGHOSTADDR`, `PGSERVICE`
   e as demais variáveis `PG*` da sessão não chegam a ele, só o `PGPASSWORD`. Outro
   `pg_restore` 18: `PG_RESTORE=<caminho>`. Nunca rode o `pg_restore --clean` à mão. Como o dump sai sem
   privilégios, reaplique os grants e a senha de login depois:
   `psql "$URL_NOVA" -f backend/api/src/infraestrutura/db/migracoes/1792843260000_roles.sql` e, logo depois,
   `-f backend/api/src/infraestrutura/db/migracoes/1792844220000_roles-padronizadas.sql` (as duas idempotentes; a segunda
   leva os grants para `pelada_backup_ro`) e
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

Dica para o Windows: o `psql` ignora opções depois da URL, então passe a URL por `-d "<url>"` e o arquivo por `-f`.

Registro das restaurações ensaiadas:

- 2026-10-26, artefato `backup-2026-10-26-40379156441` (run 40379156441): restaurado com `pg_restore` 16.15 pelo
  `pnpm restaurar` num banco local novo; as 21 tabelas de `public` com a mesma contagem da origem, lida pelo owner.
- 2026-10-26, artefato `backup-2026-10-26-40365506581` (run 40365506581, antes da migração): as 20 tabelas do legado
  com as mesmas contagens do backup posterior, o que mostra que a migração não alterou dados.

## 5. Rotação de segredos

Faça um por vez, confira o `/api/health` e, quando houver deploy, o workflow verde.

| Segredo                          | Onde vale                   | Como girar                                                                                                                                                                                                                                                                       |
| -------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Senha da role `pelada_app`       | Neon e origem do Hyperdrive | `ALTER ROLE pelada_app WITH PASSWORD '<nova>'` no Neon (digitada só no terminal) e `wrangler hyperdrive update <id> --origin-password <nova> --caching-disabled`; confira `/api/health` e uma leitura real.                                                                      |
| Senha da role `pelada_backup_ro` | `NEON_URL_BACKUP`           | `ALTER ROLE pelada_backup_ro WITH PASSWORD '<nova>'` e atualize o secret no environment `backup`; dispare o `backup.yml` à mão para provar.                                                                                                                                      |
| `NEON_URL_MIGRACAO`              | deploy                      | Gire a senha de `pelada_owner` no console do Neon e atualize o secret; o próximo deploy prova.                                                                                                                                                                                   |
| `NEON_API_KEY`                   | deploy                      | Crie a chave nova no Neon, atualize o secret, revogue a antiga depois de um deploy verde.                                                                                                                                                                                        |
| `CLOUDFLARE_API_TOKEN`           | deploy                      | Crie o token novo (Workers edição e Hyperdrive leitura), atualize o secret, revogue o antigo.                                                                                                                                                                                    |
| `BACKUP_CHAVE`                   | backup e dump do deploy     | `age-keygen -o identidade.txt`, guarde a identidade no gerenciador de senhas, grave só a linha `Public key` no secret (nos dois environments, `producao` e `backup`). Os backups antigos só se decifram com a identidade antiga: guarde as duas até o fim da retenção (30 dias). |
| `SENTRY_DSN`                     | Worker                      | `wrangler secret put SENTRY_DSN`. No projeto do Sentry, ligue também Settings, Security & Privacy, "Prevent Storing of IP Addresses" (segunda camada; o código já filtra os cabeçalhos).                                                                                         |
| `VITE_SENTRY_DSN`                | build do web (deploy)       | Em GitHub, Settings, Environments, `producao`, crie o secret `VITE_SENTRY_DSN` com o DSN do projeto Sentry do front (Sentry, Settings, Client Keys). Sem ele, o Sentry do front não inicializa.                                                                                  |

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
dias. O dump é feito pela role `pelada_backup_ro` com `--enable-row-security` e o cliente do PostgreSQL 18. Dumps feitos antes de 2026-10-28 saíram do
cliente 16 e também abrem no `pg_restore` 18.

## 9. Liberação da feature `conta-e-acesso` (passos externos)

Estes passos acontecem fora do código, na conta do Resend, no GitHub e na Cloudflare. **Cada um pede confirmação
específica de quem opera**, mesmo com a fase aprovada, e nenhum deles é feito por script do repositório. Sem os itens 1 a
3 o app abre, mas cadastro, confirmação, recuperação de senha e convite respondem 503 `email_indisponivel` (ACE-52).
Registre a data e quem confirmou cada item na entrada da liberação (`.specs/liberacao.md`).

1. **Verificar o domínio no Resend.** No painel do Resend, Domains, adicione o domínio de envio (por exemplo
   `ljssoftware.com.br`) e crie na zona da Cloudflare os registros DNS que o Resend pedir (SPF e DKIM). Espere o estado
   **Verified**. Confirmação: "o domínio está Verified no Resend".
2. **Criar a chave de API do Resend e gravar os secrets do Worker.** Crie a chave só com permissão de envio. Grave nos
   secrets do Worker `gestaodapelada`, digitando o valor só no terminal:
   `pnpm --filter @pelada/api exec wrangler secret put RESEND_API_KEY --config ../../wrangler.jsonc` e o mesmo para
   `RESEND_REMETENTE` (endereço do domínio verificado, no formato `Gestão da Pelada <acesso@dominio>`). Nenhum dos dois
   vai para o repositório, para o `.env` de produção ou para o `wrangler.jsonc`. Confirmação: "os dois secrets existem
   no Worker" (`wrangler secret list`).
3. **Conferir a cota.** O plano gratuito do Resend envia **100 e-mails por dia**. Cadastro, confirmação, reenvio,
   recuperação e convite gastam a mesma cota (a API reserva os últimos 20%, ver a seção 10). Passando dela, a API responde 503 `email_indisponivel` e a tela mostra
   "Não conseguimos enviar o e-mail agora" (ACE-52). Se o uso real passar disso, a decisão de mudar de plano é do
   dono do projeto. Confirmação: "estou ciente da cota de 100 por dia".
4. **Conferir que `EMAIL_DEV` não existe em produção.** `wrangler secret list` e as variáveis do Worker não podem listar
   `EMAIL_DEV` (com ele a caixa de desenvolvimento, `GET /api/dev/emails`, responderia). Confirmação: "`EMAIL_DEV`
   ausente".
5. **Criar a conta do dono em produção (`dono.ts`).** Depois do primeiro deploy com as migrations de conta, rode, com
   `NEON_URL_MIGRACAO` apontando para `pelada_owner` na `main` (só no terminal) e digitando a senha sem eco:
   `pnpm dono -- --email <e-mail do dono> --alvo producao`. O script recusa host remoto sem `--alvo producao`, pede a
   confirmação do host e nunca imprime a senha. É comando em banco de produção: **só com confirmação específica**, com o
   dump cifrado da seção 1 já feito. A segunda execução troca a senha do dono. Nenhuma rota escreve o papel de dono
   (G-11).
6. **Depois do deploy.** Abra `https://<host de URL_PUBLICA>/api/health` (seção 2), cadastre uma conta de teste com um
   e-mail seu, confirme pelo link recebido, entre, saia e exclua a conta de teste pela tela Minha conta. Se o e-mail não
   chegar, veja a caixa de spam, o estado do domínio no Resend e a cota do dia.

Rotação da chave do Resend: crie a nova no painel, grave com `wrangler secret put RESEND_API_KEY`, confira um cadastro
de teste e só depois revogue a antiga.

Hash de senha importado de fora: o filtro de `conta_entrar` aceita `$2a$`, `$2b$` e `$2y$`, mas no pgcrypto (Postgres 16 e 18) só
funcionam os hashes `$2a$` (os que `gen_salt('bf', 12)` do pgcrypto gera). Um hash `$2b$` ou `$2y$` importado de fora entraria como
senha errada: converta para `$2a$` antes de gravar.

Login bloqueado: 5 senhas erradas do mesmo e-mail e IP bloqueiam esse par por 15 min (ACE-13), e 50 senhas erradas
para o mesmo e-mail em 1 h, de quaisquer IPs, bloqueiam o login dele por 10 min (429, ACE-74), mesmo com a senha certa.
Se alguém relatar que continua bloqueado, oriente o "esqueci a senha": a nova senha pela recuperação apaga as falhas de
login do e-mail e libera o login na hora (ACE-76). As sessões abertas da conta caem na troca.

## 10. Cota e suspensão do Resend

O plano gratuito envia **100 e-mails por dia** (`LIMITE_EMAILS_DIA`, padrão 100). A API conta os envios do dia, no fuso
de São Paulo, e se protege sozinha (ACE-72): cadastro, reenvio de confirmação e convite param ao atingir **80%** da
cota, e "esqueci a senha" de conta **confirmada** usa a cota inteira, para que quem já usa o app consiga recuperar o
acesso. A reserva vale também contra contas não confirmadas: o "esqueci a senha" delas conta nos 80% do cadastro, então
quem cria contas sem confirmar não gasta os 20% da recuperação (ACE-73). Acima do teto a rota responde 503
`email_indisponivel` e a tela mostra "Não conseguimos enviar o e-mail agora" (ACE-52).

**Teto por origem.** Cada IPv4, ou cada /48 de IPv6, pede no máximo **20 e-mails por hora** (`LIMITE_EMAILS_IP_HORA`,
padrão 20), somando cadastro, reenvio, convite e "esqueci a senha"; o pedido seguinte recebe 429 `muitas_requisicoes`
sem gastar a cota (ACE-73). Se um evento legítimo concentrar muita gente atrás do mesmo IP (por exemplo, um Wi-Fi de
quadra), o dono do projeto pode subir a variável no Worker por algumas horas. A tabela `pedidos_email_origem` guarda só
o SHA-256 da origem e apaga os pedidos com mais de 1 h.

**Resend lento.** O envio ao Resend é abortado aos 10 s e a reserva da cota espera no máximo 2 s pela trava do contador
do dia (ACE-75): com o Resend lento, as rotas de e-mail respondem 503 rápido em vez de acumular conexões. Muitos 503
com a cota longe do teto e o painel do Resend sem erros apontam para lentidão do provedor: veja a página de status do
Resend antes de mexer em configuração.

**Conferir o consumo.** O número do dia está na tabela `envios_email_dia` (colunas `dia` e `total`); leia-o com a role
`pelada_backup_ro`, nunca com o owner de produção para algo que não seja operação. O painel do Resend (Emails) mostra os
envios e as falhas. **Alerta manual aos 50%:** olhe o consumo ao fim da tarde nos primeiros dias depois da liberação e
sempre que houver divulgação do app. Passando de 50 e-mails antes do meio do dia, avise o dono do projeto.

**Cota esgotada.** Os cadastros novos recebem 503 até a virada do dia (00:00 de São Paulo); nada se perde, a pessoa
tenta de novo. Se o uso real passa do plano gratuito com frequência, a decisão de mudar de plano é do dono do projeto;
depois de mudar, ajuste `LIMITE_EMAILS_DIA` na configuração do Worker (variável, não é segredo) e confira com um
cadastro de teste.

**Domínio ou conta suspensos no Resend.** Sintoma: 503 `email_indisponivel` com a cota longe do teto, e o painel do
Resend mostrando o domínio fora de **Verified** ou a conta suspensa. Passos: 1) abra o painel e leia o motivo e o
e-mail que o Resend enviou; 2) se for DNS (SPF ou DKIM) quebrado, corrija os registros na zona da Cloudflare e espere
voltar a **Verified**; 3) se for suspensão da conta, abra o chamado com o suporte do Resend e, se a demora passar de um
dia, avalie outro provedor, o que pede `escolha-tecnologia` e ADR novo; 4) enquanto isso, quem já tem conta continua entrando, e quem perdeu a senha fica sem recuperação até o envio
voltar. Confirme com um cadastro de teste
quando voltar.

## 11. Limite de escrita por conta (`LIMITE_ESCRITA`)

Cada conta faz no máximo **60 escritas por 60 s** (`POST`, `PUT`, `PATCH` e `DELETE` em `/api/grupos*`: criar grupo,
editar, jogadores, períodos, habilidades, notas e admins). A chave é a conta da sessão, não o IP; leituras não contam.
Acima disso a API responde 429 `muitas_requisicoes` com `Retry-After: 60`, antes da rota, sem gravar nada (SEC-003).
O limite protege a cota gratuita do Neon e do Worker contra uma conta automatizada.

**Sintoma de limite apertado.** Uma admin legítima relata "Muitas requisições" ao dar notas ou cadastrar o elenco em
sequência. Ela só precisa esperar um minuto; nada se perdeu. Se acontecer com frequência, suba o limite.

**Como mudar o valor.** Edite `simple.limit` (ou `simple.period`, só 10 ou 60) do `LIMITE_ESCRITA` em `ratelimits` no
`wrangler.jsonc`. Se mudar o período, mude também `PERIODO_LIMITE_ESCRITA_S` em `backend/api/src/entrada/app.ts` (vai no
`Retry-After`) e o valor esperado em `backend/api/test/config/wrangler.test.ts`. Rode
`node backend/scripts/checagens/checar-limitadores.mjs` (também no CI) e a suíte; o valor novo vale em produção no
próximo deploy (seção 2). O limitador da Cloudflare conta por local de borda e é aproximado: trate o número como ordem
de grandeza, não como cota exata.

**Binding ausente.** Sem o binding no Worker publicado, a API não limita e registra `limitador ausente` uma vez no log;
se o limitador falhar, a escrita passa e o log registra `limitador indisponível`. Nos dois casos, confira o
`wrangler.jsonc` publicado e refaça o deploy.
