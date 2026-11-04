# Runbook

Procedimentos de operação da Gestão da Pelada v2. Cada procedimento traz os comandos exatos e o resultado esperado. Nenhum valor de segredo aparece aqui: os nomes estão na seção [Segredos](#segredos).

## Estado atual (leia primeiro)

- **Alvo único publicado:** a prévia, o Worker `gestaodapelada-v2` em `workers.dev`, sem domínio próprio (AD-004, AD-119).
- **Banco da prévia:** pela AD-032, o Hyperdrive existente aponta para o banco `pelada` da branch `main` do Neon, que é o banco de **produção**. Ensaio de migração e teste destrutivo nunca rodam nele.
- **Backup:** o `backup.yml` existe, mas a restauração ainda não foi conferida contra dados reais. Pela AD-014, **o backup da produção não é confiável** até a revalidação do fim do projeto (seção [Restaurar um backup](#restaurar-um-backup)).
- **Ações externas** (push, disparo de workflow, secrets, Hyperdrive, deploy) só com confirmação específica do dono do projeto.

## Deploy da prévia

O deploy é o workflow `deploy.yml`, **só por disparo manual, só na `main`**, no environment `producao`. Nenhum outro arquivo roda `wrangler deploy` (checagem FUN-45).

1. Confirme que o CI da `main` está verde: aba **Actions**, workflow `ci`.
2. Dispare: aba **Actions** > `deploy` > **Run workflow** > branch `main`. Pela linha de comando: `gh workflow run deploy.yml --ref main`.
3. O workflow executa, nesta ordem (qualquer passo vermelho para os seguintes):
   1. Confere que o secret `URL_PUBLICA` existe (FUN-58).
   2. Build do front: `pnpm --filter @pelada/web build` (FUN-43).
   3. Cria a branch de restauração `restauracao-<run id>` no Neon e mantém só as 2 mais recentes (FUN-42).
   4. Dump cifrado com a role `pelada_backup_ro`, guardado como artefato `pre-deploy-<run id>` por 30 dias.
   5. Migração: `pnpm migrar`, com a role dona das tabelas (FUN-44).
   6. Deploy do Worker com `--var URL_PUBLICA` e `--var VERSAO=<sha>`.
   7. Verificação de saúde: `GET <URL_PUBLICA>/api/health` com tentativas, exigindo `versao` igual ao SHA publicado.
4. **Resultado esperado:** todos os passos verdes e a última linha do log `saúde ok: versão <sha>`.
5. Conferência à mão:

   ```bash
   curl -s https://<URL_PUBLICA>/api/health
   ```

   A resposta é um JSON com `versao` igual ao SHA do commit publicado.

Dois deploys ao mesmo tempo esperam um ao outro; nenhum é cancelado no meio de uma migração (grupo de concorrência `deploy`).

### Se a verificação de saúde falhar

O Worker novo já está publicado. Veja o log do passo; se a `versao` for a anterior, o Worker ainda não propagou: espere um minuto e rode o passo de novo (re-run do job). Se a API responde 5xx, siga a seção [Migração com falha](#migração-com-falha) apenas se a migração também falhou; senão, volte o Worker para a versão anterior com `pnpm --filter @pelada/api exec wrangler rollback --config ../../wrangler.jsonc` (confirmação do dono antes).

## Migração com falha

O `deploy.yml` não executa o `wrangler deploy` se `pnpm migrar` falhar (FUN-44). O Worker publicado continua na versão anterior. As migrações são **aditivas** (checagem `migracao-aditiva`): uma migração que falha no meio roda dentro de uma transação e não deixa o esquema pela metade; mesmo assim, siga os passos:

1. Abra o log do passo **Migrar** e anote o nome da migração que falhou e o erro.
2. Confirme o estado: `select name from pgmigrations order by id desc limit 3;` na `main` do Neon (role de migração). A migração com falha **não** aparece na lista.
3. **Se o esquema ou os dados foram alterados de forma indevida** (ou se houver dúvida), restaure pela branch de restauração criada no mesmo deploy:
   1. No console do Neon: projeto > **Branches** > escolha a branch `restauracao-<run id>` (a mais recente) e anote a hora da criação, que é anterior à migração.
   2. Na branch `main`: **Restore** > a partir de `restauracao-<run id>` (restauração para o estado da branch de origem). O Neon guarda o estado anterior da `main` em uma branch de backup automática: não apague.
   3. Confirme: `select count(*) from pgmigrations;` volta ao número anterior ao deploy.
4. Corrija a migração em uma nova branch, abra PR, e só então rode o deploy de novo. Nunca edite uma migração já aplicada: crie uma nova (`pnpm migracao:nova <nome>`).
5. **Resultado esperado:** `pnpm migrar` verde no deploy seguinte e `GET /api/health` com o SHA novo.

Alternativa sem o console: restaurar o artefato `pre-deploy-<run id>` num Postgres local (próxima seção) para comparar dados antes de decidir.

## Restaurar um backup

Vale para o artefato do `backup.yml` (`backup-<run id>`) e para o do deploy (`pre-deploy-<run id>`). Os dois são `pg_dump -Fc` cifrados com `age`; a chave privada fica **fora do GitHub** (FUN-47, FUN-50).

Pré-requisitos na sua máquina: Docker, `age` no PATH e a chave privada em um arquivo local (por exemplo `chave-backup.txt`, nunca versionado).

1. Baixe o artefato (os artefatos duram 30 dias):

   ```bash
   gh run download <run id> --name backup-<run id> --dir backup/
   ```

   O resultado é `backup/backup.dump.age` (ou `pre-deploy.dump.age`).

2. Suba o Postgres local e crie um banco **vazio**:

   ```bash
   docker compose up -d --wait
   docker compose exec -T postgres psql -U postgres -c "create database restauracao"
   ```

3. Decifre e restaure:

   ```bash
   node backend/scripts/ops/restaurar-backup.ts backup/backup.dump.age chave-backup.txt postgres://postgres:postgres@127.0.0.1:5432/restauracao
   ```

   O script recusa host que não seja local e recusa banco que já tenha tabelas. Ele decifra com `age -d`, restaura com o `pg_restore` 18 do container do compose e imprime a **contagem de linhas por tabela**.

4. **Resultado esperado:** uma tabela com todas as tabelas do esquema e a contagem de linhas de cada uma, sem erro. Compare com a produção (`select count(*) from <tabela>;` na `main` do Neon): para as tabelas com dados, os números têm de bater, descontando o que mudou depois do dump.
5. Registre a restauração em [`docs/restauracao-registro.md`](restauracao-registro.md) (data, artefato, contagem por tabela e a conferência contra a produção). O arquivo nasce na primeira restauração conferida (tarefa T15, AD-014).
6. Limpe: `docker compose exec -T postgres psql -U postgres -c "drop database restauracao"` e apague o `.dump.age` e a chave do disco se não precisar mais.

> **Atenção (AD-014):** a restauração feita em 2026-11-03 veio com **0 linhas nas 25 tabelas**, embora a produção tenha dados. A causa provável é a role `pelada_backup_ro` sem as policies de leitura. Enquanto a revalidação do fim do projeto não for feita, uma contagem zerada **não** significa produção vazia: trate o backup como não confiável.

### Revalidação do backup (pendente, AD-014)

1. No Neon, confirme que a role `pelada_backup_ro` existe e tem a policy `USING (true)` de leitura em cada tabela com RLS forçada.
2. Rode o `backup.yml` à mão (**Actions** > `backup` > **Run workflow**) e baixe o artefato.
3. Restaure como acima e compare a contagem com os dados do grupo de teste.
4. Só então registre em `docs/restauracao-registro.md` e feche a T15. Depois disso, abra a tarefa para o `backup.yml` falhar quando o dump vier sem linhas.

## Segredos

Nomes por environment do GitHub (Settings > Environments). **Nenhum valor é registrado em arquivo do repositório.**

### Environment `producao` (usado pelo `deploy.yml`, AD-119)

| Secret                  | Para quê                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `NEON_API_KEY`          | API do Neon: criar e apagar as branches de restauração                                     |
| `NEON_PROJECT_ID`       | Projeto do Neon onde ficam as branches                                                     |
| `NEON_URL_BACKUP`       | URL da role somente leitura `pelada_backup_ro` (dump cifrado, AD-010)                      |
| `NEON_URL_MIGRACAO`     | URL da role dona das tabelas, usada por `pnpm migrar`                                      |
| `BACKUP_CHAVE`          | Chave **pública** `age` que cifra o dump                                                   |
| `CLOUDFLARE_API_TOKEN`  | Token do `wrangler deploy`, com permissão de editar Workers do projeto                     |
| `CLOUDFLARE_ACCOUNT_ID` | Conta da Cloudflare                                                                        |
| `URL_PUBLICA`           | URL https do app (workers.dev), injetada por `--var`; ausente, o deploy para antes de tudo |

### Environment `backup` (usado pelo `backup.yml`, AD-013)

| Secret            | Para quê                             |
| ----------------- | ------------------------------------ |
| `NEON_URL_BACKUP` | URL da role `pelada_backup_ro`       |
| `BACKUP_CHAVE`    | Chave pública `age` que cifra o dump |

### Environment `previa`

O plano original previa um environment `previa` sobre a branch `dev` do Neon. A AD-119 o substituiu pelo `producao`. Se a `dev` for adotada depois, o `previa` repete a lista de `producao` com as URLs da `dev` (e a AD que decidir a troca).

### Secret do Worker (não é do GitHub)

| Secret       | Onde                                                                                                            |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| `SENTRY_DSN` | Secret do Worker: `pnpm --filter @pelada/api exec wrangler secret put SENTRY_DSN --config ../../wrangler.jsonc` |

O DSN do front (`VITE_SENTRY_DSN`) entra no build, não no Worker. Vazio desliga o Sentry sem quebrar o app.

### Rotação

Rotacione na ordem: **crie o novo, atualize o secret, dispare o fluxo que o usa, revogue o antigo**.

- **`NEON_API_KEY`:** crie a nova chave no console do Neon, atualize o secret no environment, rode o `deploy.yml`, revogue a antiga.
- **Senha de `pelada_backup_ro` (`NEON_URL_BACKUP`):** `alter role pelada_backup_ro password '<nova>'` no Neon (role de migração), atualize `NEON_URL_BACKUP` nos environments `producao` e `backup` e rode o `backup.yml` à mão.
- **`NEON_URL_MIGRACAO`:** igual, para a role dona das tabelas; rode o `deploy.yml`.
- **`CLOUDFLARE_API_TOKEN`:** crie o token novo no painel da Cloudflare, atualize, rode o `deploy.yml`, revogue o antigo.
- **Chave `age` (`BACKUP_CHAVE`):** gere um par novo com `age-keygen -o chave-backup-nova.txt`, guarde a privada **fora do GitHub**, troque a pública nos dois environments e rode o `backup.yml`. Mantenha a chave privada antiga enquanto existirem artefatos cifrados com ela (30 dias).
- **Senhas das roles locais:** só afetam a máquina de quem desenvolve (`.env`); `pnpm seed` as reaplica.

Suspeita de vazamento: revogue primeiro, depois siga a rotação; o `gitleaks` roda no CI contra o histórico (checagem FUN-46).

## Hyperdrive

O cache do Hyperdrive **precisa estar desligado** (FUN-18): a RLS depende do contexto de cada transação, e uma resposta em cache serviria o dado de outra conta.

1. Crie ou confirme o Hyperdrive (conexão `pelada_app`, banco `pelada`):

   ```bash
   pnpm --filter @pelada/api exec wrangler hyperdrive create <nome> --connection-string "<url da role pelada_app>" --caching-disabled
   ```

2. Ponha o `id` devolvido em `hyperdrive[0].id` do `wrangler.jsonc` (hoje a prévia usa o Hyperdrive existente da AD-032).
3. Confira o cache:

   ```bash
   node backend/scripts/ops/hyperdrive.ts <id>
   ```

   **Esperado:** `Hyperdrive com o cache desligado.` e saída 0. Se o cache estiver ligado: `wrangler hyperdrive update <id> --caching-disabled`.

## Monitor do UptimeRobot

1. No UptimeRobot, crie um monitor **HTTP(s)** com a URL `https://<URL_PUBLICA>/api/health`.
2. Intervalo de 5 minutos; alerta por e-mail ao dono do projeto.
3. Palavra-chave opcional: o corpo é JSON com `versao`; use o tipo **Keyword** com `versao` para pegar respostas 200 vazias.
4. **Esperado:** monitor verde logo após o deploy. `/api/health` não consulta o banco: ele prova que o Worker está no ar, não que o Neon responde. Falha de banco aparece no Sentry.

## Assumir a produção (paridade)

Passo de **`/preparar` Nível 2**, depois do `/validar` da feature `grupos-e-elenco` (AD-030). Cada ação externa pede confirmação específica do dono. Ordem:

1. **Desligar o Worker do LJS** (o app legado) para não haver duas aplicações gravando no mesmo banco: no painel da Cloudflare, remova as rotas do Worker `gestaodapelada` (ou desative a rota do domínio) e confirme que o domínio deixa de responder pelo LJS.
2. **Dump cifrado antes de mexer:** rode o `backup.yml` à mão e confirme o artefato `backup-<run id>` (e a contagem por tabela da seção [Restaurar um backup](#restaurar-um-backup), depois da revalidação da AD-014).
3. **Branch de restauração da `main`:** no Neon, crie a branch `restauracao-paridade-<data>` a partir da `main`. O prefixo `restauracao-` é o único que o `deploy.yml` poda; use outro nome (por exemplo `ponto-de-volta-paridade-<data>`) se quiser que ela **não** seja apagada pelos deploys seguintes.
4. **Domínio:** inclua `routes` ou `custom_domain` no `wrangler.jsonc`, ajuste a guarda `so-previa` (FUN-28) e o `URL_PUBLICA` do environment. Essa mudança entra no `/preparar`, com os próprios testes (AD-030).
5. **Hyperdrive de produção:** confirme com `node backend/scripts/ops/hyperdrive.ts <id>` que o Hyperdrive aponta para a `main` do Neon, com o cache desligado.
6. Dispare o `deploy.yml` e confirme a saúde pelo domínio; o monitor do UptimeRobot passa a apontar para ele.
7. **Volta:** Worker anterior pelo `wrangler rollback`; dados pela branch criada no passo 3.
