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
