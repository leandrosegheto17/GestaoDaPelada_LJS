# Runbook

Procedimentos de operação da Gestão da Pelada v2. Cada um traz os comandos exatos e o que se espera ver. O alvo publicado é só a prévia: o Worker `gestaodapelada-v2` no endereço padrão da Cloudflare, sobre a `main` do Neon, com o `deploy.yml` no environment `producao` do GitHub (AD-004, AD-032, AD-119).

Ações deste runbook que mexem fora da máquina (disparar workflow, apagar branch, restaurar a `main` do Neon, trocar secret) são feitas por uma pessoa, uma de cada vez, com confirmação.

## Deploy da prévia

**Quando:** depois que a `main` do GitHub tem o commit a publicar e o `ci` está verde nele.

1. Confira o CI do commit:

   ```bash
   gh run list --workflow ci.yml --branch main --limit 1
   ```

   Esperado: a última execução com `completed` e `success`.

2. Dispare o deploy na `main`:

   ```bash
   gh workflow run deploy.yml --ref main
   gh run watch "$(gh run list --workflow deploy.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
   ```

   Pela tela: Actions > `deploy` > Run workflow > branch `main`.

3. O workflow roda, nesta ordem, e para no primeiro erro (FUN-42):
   1. build do web;
   2. confere que `URL_PUBLICA` existe e começa com `https://` (FUN-58);
   3. cria a branch de restauração `restauracao-<run_id>` a partir da `main` do Neon e apaga as de restauração além das 2 mais recentes;
   4. dump cifrado da `main` pela role `pelada_backup_ro`, guardado como artefato `antes-do-deploy-<run_id>` por 30 dias;
   5. `pnpm migrar` com a role de migração;
   6. publica o Worker com `VERSAO` = SHA do commit e `URL_PUBLICA`;
   7. `GET <URL_PUBLICA>/api/health` com tentativas, até `versao` ser o SHA.

4. Esperado no fim: execução verde e, no log do último passo, `Saúde ok na tentativa N: versao <sha>`. Conferência manual:

   ```bash
   curl -s "$URL_PUBLICA/api/health"
   ```

   Esperado: `{"status":"ok","versao":"<sha do commit>"}`.

Dois deploys não rodam ao mesmo tempo: o segundo espera o primeiro terminar (FUN-57). O deploy só roda na `main`; em outra branch o job é pulado.

## Falha no deploy

### O build ou a conferência de `URL_PUBLICA` falhou

Nada no Neon nem no Worker foi tocado (FUN-43). Corrija o código ou o secret `URL_PUBLICA` do environment `producao` e dispare de novo.

### A branch de restauração ou o dump falhou

A migração e o deploy não rodaram; a prévia anterior segue no ar. Causas comuns: `NEON_API_KEY` vencida ou sem permissão, `NEON_PROJECT_ID` errado, `NEON_URL_BACKUP` ou `BACKUP_CHAVE` ausentes no environment `producao`. Corrija o secret (seção [Segredos](#segredos)) e dispare de novo.

### A migração falhou (FUN-44)

O que acontece: cada migração roda numa transação e se desfaz sozinha; o job para antes do deploy e a prévia anterior segue no ar, com o banco como estava. Na maior parte das vezes basta corrigir a migração (numa migração nova, nunca editando a que já foi aplicada) e disparar de novo.

Se o banco ficou num estado errado (por exemplo, uma migração com mais de um passo fora de transação), restaure a `main` a partir da branch de restauração criada pelo próprio deploy:

1. Ache a branch do deploy que falhou: o nome é `restauracao-<run_id>`, com o `run_id` da execução.

   ```bash
   curl -s -H "Authorization: Bearer $NEON_API_KEY" \
     "https://console.neon.tech/api/v2/projects/$NEON_PROJECT_ID/branches" \
     | jq '.branches[] | {id, name, created_at}'
   ```

   Esperado: a `main`, a `dev` e até 2 branches `restauracao-*`. Anote o `id` da `main` e o da `restauracao-<run_id>`.

2. Restaure a `main` a partir dela, guardando o estado atual com outro nome:

   ```bash
   curl -s -X POST -H "Authorization: Bearer $NEON_API_KEY" -H "Content-Type: application/json" \
     "https://console.neon.tech/api/v2/projects/$NEON_PROJECT_ID/branches/<id-da-main>/restore" \
     -d '{"source_branch_id": "<id-da-restauracao>", "preserve_under_name": "main-antes-da-restauracao"}'
   ```

   Pela tela: Neon > projeto > Branches > `main` > Restore > a partir de `restauracao-<run_id>`.

3. Confira: a contagem de linhas por tabela da `main` volta à de antes do deploy, e `curl -s "$URL_PUBLICA/api/health"` responde `ok`. A branch `main-antes-da-restauracao` fica para investigação; apague-a quando não precisar mais.

### O deploy do Worker ou a saúde falharam

A migração já foi aplicada. Se a versão nova do Worker não sobe, a anterior segue servindo (o deploy não chegou a trocar) ou a nova responde com erro. Veja o log do passo e, se precisar voltar a versão do Worker:

```bash
pnpm --filter @pelada/api exec wrangler rollback --config ../../wrangler.jsonc
```

Esperado: o `GET /api/health` volta a responder com a `versao` anterior. As migrações são aditivas (AD-003), então a versão anterior do Worker continua funcionando com o banco migrado.

## Restaurar um backup

Procedimento de FUN-50: baixar o artefato, decifrar com a chave privada guardada fora do GitHub e restaurar num banco local limpo. O registro de cada restauração feita (data e contagem de linhas por tabela) fica em [`docs/restauracao-registro.md`](restauracao-registro.md).

O backup da produção não é confiável até a revalidação do fim do projeto (AD-014): confira o registro antes de depender dele.

1. Postgres local de pé e um banco vazio para receber o backup:

   ```bash
   docker compose up -d --wait
   docker compose exec -T postgres createdb -U postgres restauracao
   ```

2. Baixe o artefato do backup diário (ou o `antes-do-deploy-<run_id>` de um deploy):

   ```bash
   gh run list --workflow backup.yml --limit 5
   gh run download <run_id> --dir ./backup-baixado
   ```

   Esperado: um arquivo `backup-producao.age` (ou `antes-do-deploy.age`) dentro de `./backup-baixado/<nome do artefato>/`.

3. Restaure com a chave privada `age` (arquivo guardado fora do GitHub; nunca o copie para dentro do repositório):

   ```bash
   pnpm restaurar ./backup-baixado/<artefato>/backup-producao.age /caminho/fora/do/repo/chave-privada.txt \
     postgres://postgres:postgres@127.0.0.1:5432/restauracao
   ```

   O comando decifra com o `age` do sistema, restaura com o `pg_restore` de dentro do container e recusa banco remoto ou banco que não esteja vazio. Esperado: `Linhas por tabela:` seguido de uma linha por tabela.

4. Confira a contagem contra a produção (pela role somente leitura) e registre em `docs/restauracao-registro.md`: data, artefato, contagem por tabela e se bateu.

5. Apague o banco local e o arquivo baixado:

   ```bash
   docker compose exec -T postgres dropdb -U postgres restauracao
   rm -r ./backup-baixado
   ```

## Segredos

Nenhum valor real vai para o repositório: o `.env.example` lista só os nomes, com obrigatoriedade, formato e se é segredo (checagem `env-example`, FUN-46), e o `gitleaks` roda no CI.

### Environment `producao` do GitHub (deploy da prévia, AD-119)

| Secret                  | O que é                                                                    |
| ----------------------- | -------------------------------------------------------------------------- |
| `NEON_URL_MIGRACAO`     | URL postgres da role `pelada_owner` da `main` do Neon (migração)           |
| `NEON_URL_BACKUP`       | URL postgres da role `pelada_backup_ro` da `main` (dump antes do deploy)   |
| `BACKUP_CHAVE`          | Chave pública `age` do dump antes do deploy (a mesma do backup diário)     |
| `NEON_API_KEY`          | Chave da API do Neon, com o menor escopo possível (branch de restauração)  |
| `NEON_PROJECT_ID`       | Identificador do projeto no Neon                                           |
| `CLOUDFLARE_API_TOKEN`  | Token da API da Cloudflare só com permissão de Workers                     |
| `CLOUDFLARE_ACCOUNT_ID` | ID da conta Cloudflare                                                     |
| `URL_PUBLICA`           | URL https da prévia (o endereço padrão da Cloudflare do Worker)            |
| `VITE_SENTRY_DSN`       | Opcional: Sentry do front; vazio desliga                                   |

O plano original previa um environment `previa` sobre a branch `dev` do Neon; pela AD-119 ele não é usado.

### Environment `backup` do GitHub (backup diário, AD-013)

| Secret            | O que é                                                    |
| ----------------- | ---------------------------------------------------------- |
| `NEON_URL_BACKUP` | URL postgres da role `pelada_backup_ro` da `main` do Neon  |
| `BACKUP_CHAVE`    | Chave pública `age`; a privada fica fora do GitHub         |

### Secret do Worker (Cloudflare)

| Secret       | O que é                                 |
| ------------ | --------------------------------------- |
| `SENTRY_DSN` | Opcional: Sentry do Worker; vazio desliga |

### Conferir e criar

```bash
gh secret list --env producao
gh secret list --env backup
gh secret set NEON_API_KEY --env producao        # o valor é pedido no terminal, sem eco
pnpm --filter @pelada/api exec wrangler secret put SENTRY_DSN --config ../../wrangler.jsonc
```

Esperado no `gh secret list`: os nomes das tabelas acima, sem valores.

### Hyperdrive

O Worker fala com o Neon pelo Hyperdrive, com o cache **desligado** (as consultas dependem do contexto da RLS da transação, FUN-18). Pela AD-119, o Hyperdrive da prévia aponta para a `main` do Neon pela role `pelada_app`.

```bash
pnpm --filter @pelada/api exec wrangler hyperdrive create gestaodapelada-v2 \
  --connection-string "postgres://pelada_app:<senha>@<host-do-neon>/<banco>?sslmode=require" \
  --caching-disabled
node backend/scripts/ops/hyperdrive.ts <id>
```

Esperado: o `create` imprime o `id`, que vai para o `wrangler.jsonc` (`hyperdrive[0].id`); a checagem sai com código 0. Se disser que o cache está ligado: `wrangler hyperdrive update <id> --caching-disabled`.

### Rotação

Troque um segredo quando ele vazar, quando quem o tinha sair, ou uma vez por ano.

1. Gere o valor novo na origem: senha da role no Neon (`ALTER ROLE ... PASSWORD`, pela role dona), chave nova na API do Neon, token novo na Cloudflare.
2. Grave o valor novo no lugar que o usa: `gh secret set <NOME> --env producao` (ou `--env backup`), `wrangler hyperdrive update <id> --connection-string ...` para a senha de `pelada_app`, `wrangler secret put` para o Sentry.
3. Dispare o que o usa e confira: `deploy` (saúde verde) ou `backup` (artefato gerado).
4. Só então revogue o valor antigo na origem.

Para a chave `age` do backup: gere o par novo (`age-keygen -o chave-nova.txt`), guarde a privada fora do GitHub junto da antiga (os backups antigos continuam cifrados com a antiga), troque `BACKUP_CHAVE` nos dois environments e rode o `backup` à mão.

## Monitor do UptimeRobot

Opcional, de custo zero (FUN-52). Um monitor HTTP(s) em `GET <URL_PUBLICA>/api/health`:

1. UptimeRobot > Add New Monitor > tipo **HTTP(s)**.
2. URL: `<URL_PUBLICA>/api/health`; intervalo: 5 minutos.
3. Palavra-chave (tipo **Keyword**, se quiser conferir o corpo): `"status":"ok"`.
4. Alerta por e-mail para o dono do app.

Esperado: o monitor fica verde em poucos minutos. O `/api/health` não toca o banco: o monitor diz se o Worker está no ar, não se o Neon está.

## Assumir a produção (paridade)

Passo do `/preparar` Nível 2 (AD-030), feito uma vez, com confirmação para cada ação externa. Hoje a prévia já usa a `main` do Neon (AD-119); assumir a produção é trocar quem atende os usuários: sair do Worker do LJS para o `gestaodapelada-v2`.

Antes de qualquer troca:

1. **Dump cifrado da `main`**: rode o `backup` à mão e confira o artefato (seção [Restaurar um backup](#restaurar-um-backup), passos 2 e 3, num banco local).
2. **Branch de restauração da `main`**: crie uma com nome próprio, fora da rotação do deploy:

   ```bash
   curl -s -X POST -H "Authorization: Bearer $NEON_API_KEY" -H "Content-Type: application/json" \
     "https://console.neon.tech/api/v2/projects/$NEON_PROJECT_ID/branches" \
     -d '{"branch": {"name": "antes-da-paridade", "parent_id": "<id-da-main>"}}'
   ```

   O nome não começa por `restauracao-`, então o deploy nunca a apaga.

A troca:

3. **Desligar o Worker do LJS**: no painel da Cloudflare, remova as rotas e o domínio do Worker antigo (ou desative-o), para ele parar de escrever na `main`.
4. **Domínio**: a AD-121 dá à v2 um domínio próprio, `gestaodapelada.ljssoftware.com.br`, por uma rota `custom_domain` no `wrangler.jsonc`, além do endereço padrão da Cloudflare. A guarda `so-previa` (FUN-28) aceita só essa rota e continua reprovando qualquer outra. Antes do deploy, o Worker do LJS precisa largar o hostname (passo 3), senão o `wrangler deploy` recusa o domínio. O secret `URL_PUBLICA` do environment `producao` passa a ser `https://gestaodapelada.ljssoftware.com.br`.
5. **Hyperdrive de produção**: o da prévia já aponta para a `main` (AD-119). Se a AD do domínio pedir um Hyperdrive separado, crie-o como na seção [Hyperdrive](#hyperdrive), sempre com `--caching-disabled`.
6. **Deploy**: dispare o `deploy` (seção [Deploy da prévia](#deploy-da-prévia)) e confira a saúde.

Se algo der errado: restaure a `main` a partir de `antes-da-paridade` (como em [A migração falhou](#a-migração-falhou-fun-44)) e religue o Worker do LJS.
