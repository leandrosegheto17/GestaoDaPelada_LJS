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

## Grupos e elenco

### Limite de escritas por conta (`LIMITE_ESCRITA`, SEC-003)

- **Valor:** 60 escritas por 60 segundos, **por conta** (não por IP), em toda requisição que muda estado em `/api/grupos*` (criar grupo, jogadores, períodos, habilidades, notas, admins). As leituras não contam.
- **Onde muda:** no binding `LIMITE_ESCRITA` de `ratelimits` no `wrangler.jsonc` (`simple.limit` e `simple.period`; a Cloudflare só aceita `period` de 10 ou 60). A mudança vale no próximo deploy da prévia; não é segredo.
- **Efeito:** passou do limite, a API responde 429 e nada é gravado. No lançamento de notas em lote, cada nota trocada na ficha é uma escrita (`PUT …/notas/:habilidadeId`): dar as 6 notas a 10 jogadores seguidos (60 escritas) esgota o minuto, e a nota seguinte aparece com o erro no campo, sem gravar. Basta esperar o minuto virar e escolher a nota de novo.
- **Quando subir:** só se um organizador legítimo esbarrar no limite com frequência (reclamação no suporte ou 429 recorrente no log da mesma conta). Suba aos poucos (ex.: 120); o limite existe contra conta roubada ou script que encha o banco.

### Grupo arquivado sem a criadora

Só a conta em `grupos.criado_por` arquiva e reativa o grupo, e só enquanto for admin dele (GEL-24, SEC-009). Se a criadora excluiu a conta ou deixou de ser admin, **ninguém reativa aquele grupo pelo app**: as outras admins não o veem (404) e não há transferência de criadora (fora do escopo). Nada se perde: jogadores, notas e slug ficam no banco.

Quando uma admin pedir ao suporte:

1. Confirme pelo e-mail da conta que quem pede é admin do grupo (`vinculos_admin`), sem passar dado do elenco por fora do app.
2. A correção é manual, no banco de produção, com a role de migração e a confirmação específica do dono (ação em produção): numa transação, defina `criado_por` para a conta da admin que pediu e, se o grupo estiver arquivado e ela quiser, limpe `arquivado_em`; registre a ação na `auditoria` com `autor_tipo = 'infraestrutura'` e o `grupo_id`, sem dado pessoal. A `pelada_app` não consegue fazer isso (sem grant em `criado_por`), de propósito.
3. Avise a admin para abrir `/app`: o grupo volta à lista dela, com Arquivar e Reativar.

## Segredos

Nenhum valor real vai para o repositório: o `.env.example` lista só os nomes, com obrigatoriedade, formato e se é segredo (checagem `env-example`, FUN-46), e o `gitleaks` roda no CI.

### Environment `producao` do GitHub (deploy da prévia, AD-119)

| Secret                  | O que é                                                                   |
| ----------------------- | ------------------------------------------------------------------------- |
| `NEON_URL_MIGRACAO`     | URL postgres da role `pelada_owner` da `main` do Neon (migração)          |
| `NEON_URL_BACKUP`       | URL postgres da role `pelada_backup_ro` da `main` (dump antes do deploy)  |
| `BACKUP_CHAVE`          | Chave pública `age` do dump antes do deploy (a mesma do backup diário)    |
| `NEON_API_KEY`          | Chave da API do Neon, com o menor escopo possível (branch de restauração) |
| `NEON_PROJECT_ID`       | Identificador do projeto no Neon                                          |
| `CLOUDFLARE_API_TOKEN`  | Token da API da Cloudflare só com permissão de Workers                    |
| `CLOUDFLARE_ACCOUNT_ID` | ID da conta Cloudflare                                                    |
| `URL_PUBLICA`           | URL https da prévia (o endereço padrão da Cloudflare do Worker)           |
| `VITE_SENTRY_DSN`       | Opcional: Sentry do front; vazio desliga                                  |

O plano original previa um environment `previa` sobre a branch `dev` do Neon; pela AD-119 ele não é usado.

### Environment `backup` do GitHub (backup diário, AD-013)

| Secret            | O que é                                                   |
| ----------------- | --------------------------------------------------------- |
| `NEON_URL_BACKUP` | URL postgres da role `pelada_backup_ro` da `main` do Neon |
| `BACKUP_CHAVE`    | Chave pública `age`; a privada fica fora do GitHub        |

### Secret do Worker (Cloudflare)

| Secret             | O que é                                                                          |
| ------------------ | -------------------------------------------------------------------------------- |
| `SENTRY_DSN`       | Opcional: Sentry do Worker; vazio desliga                                        |
| `RESEND_API_KEY`   | Chave da API do Resend (começa por `re_`), para os e-mails de conta              |
| `RESEND_REMETENTE` | Remetente dos e-mails de conta, ex. `Pelada <nao-responda@<domínio verificado>>` |

| `ASAAS_API_KEY` | Chave da API do Asaas **sandbox**, para criar cliente e assinatura (PLA-37) |
| `ASAAS_WEBHOOK_TOKEN` | `authToken` do webhook do Asaas: 32 a 255 caracteres, diferente da chave |

`LIMITE_EMAILS_DIA` é opcional (padrão 100) e `EMAIL_DEV` nunca existe no Worker publicado: sem ela, `GET /api/dev/emails` responde 404. `ASAAS_URL` não é secret: é a variável do `wrangler.jsonc`, fixa no sandbox (`https://api-sandbox.asaas.com/v3`).

### E-mails de conta (Resend)

Cadastro, reenvio da confirmação, recuperação de senha e convite de admin mandam e-mail pelo Resend. Sem `RESEND_API_KEY` e `RESEND_REMETENTE` no Worker, essas rotas respondem 503 `email_indisponivel` ("Não conseguimos enviar o e-mail agora."), sem gastar a cota; entrar, sair, trocar a senha e o resto do app continuam funcionando.

**Passos do usuário, uma vez** (nenhum valor vai para o repositório nem para esta página):

1. No painel do Resend, adicione e verifique o domínio do remetente (registros DNS que o Resend mostra). Sem domínio verificado, o Resend só entrega para o e-mail da própria conta.
2. Crie uma chave de API com permissão só de envio (_Sending access_), restrita a esse domínio.
3. Grave os dois secrets no Worker da prévia (`gestaodapelada-v2`); o valor é pedido no terminal:

```bash
pnpm --filter @pelada/api exec wrangler secret put RESEND_API_KEY --config ../../wrangler.jsonc
pnpm --filter @pelada/api exec wrangler secret put RESEND_REMETENTE --config ../../wrangler.jsonc
pnpm --filter @pelada/api exec wrangler secret list --config ../../wrangler.jsonc   # só os nomes
```

4. Confira: crie uma conta de teste em `/cadastro` e veja o e-mail chegar.

**Cota.** O plano grátis do Resend manda 100 e-mails por dia. O app conta os envios no banco (`envios_email_dia`) e para antes: cadastro, reenvio e convite usam até 80% de `LIMITE_EMAILS_DIA` (padrão 100) e a recuperação de senha pode ir até 100%, para quem perdeu a senha ainda conseguir entrar. A contagem zera no dia seguinte.

**Quando a cota acaba:** as rotas de e-mail respondem 503 `email_indisponivel` até o dia virar; nada se perde, e a pessoa pode pedir de novo depois. Se acontecer com frequência: confira no painel do Resend se há envio fora do normal (abuso do cadastro); se o uso for legítimo, troque para um plano pago do Resend e suba `LIMITE_EMAILS_DIA` para o novo teto (`wrangler secret put LIMITE_EMAILS_DIA`, ou `--var` no `deploy.yml`), sempre abaixo do limite do plano.

**Resend fora do ar ou lento:** sem resposta em 10 s, a rota responde 503 sem gastar a cota; o log registra só o tipo do e-mail, o status e o código de erro, nunca o destinatário nem o conteúdo.

### Pagamentos (Asaas sandbox)

A assinatura do Pro (R$ 9,90/mês por grupo) é cobrada pelo Asaas, **só no sandbox** enquanto não houver AD de produção (AD-061, PLA-38): o `wrangler.jsonc` fixa `ASAAS_URL` no sandbox e a checagem `so-previa` reprova o endereço de produção e qualquer `ASAAS_URL` vinda de `vars`, `secrets` ou shell no `deploy.yml`. Trocar para produção pede uma AD nova em `.specs/STATE.md`, a mudança da checagem e chaves novas: não basta trocar a variável.

**Passos do usuário, uma vez (`/preparar` Nível 2)** (nenhum valor vai para o repositório nem para esta página):

1. No sandbox do Asaas (`https://sandbox.asaas.com`), gere a chave de API em _Integrações > Chave de API_.
2. Gere um token aleatório de 32 a 255 caracteres para o webhook, **diferente da chave** (ex.: `openssl rand -base64 48`).
3. Grave os dois secrets no Worker da prévia (`gestaodapelada-v2`); o valor é pedido no terminal:

```bash
pnpm --filter @pelada/api exec wrangler secret put ASAAS_API_KEY --config ../../wrangler.jsonc
pnpm --filter @pelada/api exec wrangler secret put ASAAS_WEBHOOK_TOKEN --config ../../wrangler.jsonc
pnpm --filter @pelada/api exec wrangler secret list --config ../../wrangler.jsonc   # só os nomes
```

4. No painel do sandbox, em _Integrações > Webhooks_, crie o webhook: URL `<URL_PUBLICA>/api/webhooks/asaas`, o mesmo token do passo 2 em _Token de autenticação_ (o Asaas o manda no header `asaas-access-token`), envio **sequencial**, com os eventos de cobrança (`PAYMENT_*`) e de assinatura (`SUBSCRIPTION_*`) ligados.
5. Confira: em Meu plano de um grupo de teste, assine com um CPF de teste; abra a fatura e, no painel do sandbox, marque a cobrança como recebida (_Cobranças > a cobrança > Confirmar recebimento_, ou "Simular pagamento"). Em até um minuto Meu plano mostra Pro com o `pagoAte` de um mês depois do vencimento.

**Fila pausada.** O Asaas pausa a fila do webhook depois de **15 falhas seguidas** (qualquer resposta que não seja 200: Worker fora, token trocado, 5xx). Com a fila pausada, nenhum pagamento confirma o Pro e os eventos parados **somem depois de 14 dias**. Para retomar (PLA-72):

1. Corrija a causa: confira a saúde (`/api/health`), o log do Worker (`wrangler tail`; o webhook registra só o tipo do evento e o status, nunca dado pessoal) e se o token do painel é o mesmo de `ASAAS_WEBHOOK_TOKEN`.
2. No painel, em _Integrações > Webhooks_, reative a fila e mande reprocessar os eventos pendentes, antes dos 14 dias.
3. Os eventos chegam fora de ordem e alguns repetidos: o app grava cada `id` uma vez só (repetido responde 200 sem efeito) e um evento mais antigo que o último aplicado na assinatura não regride a situação (PLA-48). Não é preciso reprocessar em ordem.
4. Confira em Meu plano dos grupos afetados que a situação bate com a do painel do Asaas.

**Asaas fora do ar, lento ou em 429:** sem resposta em 10 s, ou com erro, assinar e cancelar respondem 502 "Não foi possível falar com o sistema de pagamento. Tente de novo em instantes.", sem gravar nada e sem repetir sozinho; o log registra só a operação e o status, nunca CPF, nome, e-mail ou a chave.

### Avisos no celular (push e fila)

Os avisos do ranking e de cobrança saem por Web Push com as chaves VAPID e passam pela fila `avisos` (Cloudflare Queues; a rota só enfileira depois do `COMMIT`, e o próprio Worker consome uma mensagem por vez). Sem as três VAPID no Worker, o push fica desligado: o controle some das telas, as rotas de assinar respondem 503 `push_indisponivel` e os e-mails de cobrança continuam.

**Passos do usuário, uma vez (`/preparar` Nível 2)** (nenhum valor vai para o repositório nem para esta página):

1. Gere o par: `pnpm vapid:gerar` (imprime `VAPID_PUBLICA` e `VAPID_PRIVADA`; não grava arquivo). Feche o terminal depois de copiar.
2. Grave as três como secrets do Worker da prévia (`gestaodapelada-v2`); o valor é pedido no terminal. `VAPID_ASSUNTO` é o contato do remetente (`mailto:<e-mail>` ou uma URL `https`):

```bash
pnpm --filter @pelada/api exec wrangler secret put VAPID_PUBLICA --config ../../wrangler.jsonc
pnpm --filter @pelada/api exec wrangler secret put VAPID_PRIVADA --config ../../wrangler.jsonc
pnpm --filter @pelada/api exec wrangler secret put VAPID_ASSUNTO --config ../../wrangler.jsonc
pnpm --filter @pelada/api exec wrangler secret list --config ../../wrangler.jsonc   # só os nomes
```

3. Crie a fila, antes do primeiro deploy com o binding `FILA_AVISOS` (sem ela o deploy falha):

```bash
pnpm --filter @pelada/api exec wrangler queues create avisos
pnpm --filter @pelada/api exec wrangler queues list   # "avisos" com o Worker como produtor e consumidor depois do deploy
```

4. Confira: num grupo Pro, abra `/g/<slug>` num navegador com suporte (no iPhone, só com o app instalado na Tela de Início), toque em **Receber avisos do ranking**, lance uma partida pela área do admin e veja a notificação chegar.

SPEC_DEVIATION: a T40 fala em "environment `previa`"; pela AD-119 o deploy usa o environment `producao` do GitHub, e as VAPID não passam por ele: são secrets do próprio Worker, como `RESEND_API_KEY`.

**Limpeza diária.** O Cron do `wrangler.jsonc` (`0 6 * * *`, 06:00 UTC) apaga as assinaturas sem aviso aceito há 180 dias e os registros de avisos de cobrança com mais de 90 dias. Para conferir que roda: `wrangler tail` perto das 06:00 UTC, ou o painel do Worker (_Triggers > Cron Triggers_, última execução).

**Fila acumulando.** No painel da Cloudflare (_Queues > avisos_) o backlog deve voltar a zero em minutos. Se crescer:

1. Veja o `wrangler tail` e o Sentry: nada ali traz endpoint, chave nem conteúdo do aviso (NOT-33); os erros do serviço de push chegam só com o host e o status.
2. Banco fora (`/api/health` 503): a mensagem volta à fila sozinha (até 2 novas entregas); passou disso, ela é descartada e o aviso daquela partida não sai (o próximo lançamento avisa de novo).
3. Serviço de push lento ou em 429/5xx: o app reenfileira só as assinaturas que falharam, com o atraso do `Retry-After` (padrão 60 s, teto 1 h), até 2 vezes, e depois desiste daquele aviso sem apagar a assinatura.
4. Resend fora ou cota acabada: o e-mail de cobrança volta à fila a cada 8 h, até 3 tentativas; na última, o Sentry recebe "desistência" com o tipo, sem destinatário.
5. As mensagens ficam no máximo 24 h na fila (plano Free); o que passar disso some.

**Troca das chaves VAPID** (vazou a privada, ou a rotação anual): as assinaturas existentes foram feitas com a chave pública antiga e **deixam de valer** com a nova (o serviço de push recusa o envio e a assinatura é apagada no primeiro aviso). Não há como migrá-las: cada aparelho assina de novo. O front faz isso sozinho: ao abrir a tela, ele vê que a assinatura local é de outra chave, cancela a local e volta a mostrar **Receber avisos do ranking** (ou o de cobrança), e a pessoa toca de novo. Passos: gere o par novo (`pnpm vapid:gerar`), grave `VAPID_PUBLICA` e `VAPID_PRIVADA` juntas (`wrangler secret put`), faça o deploy e confira que um aviso de teste chega a um aparelho assinado depois da troca.

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
