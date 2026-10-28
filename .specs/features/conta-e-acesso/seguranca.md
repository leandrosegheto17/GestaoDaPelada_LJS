# Conta e acesso — Auditoria de segurança

**Data**: 2026-10-27
**Escopo**: diff `9085f80..HEAD` (`62aa021`) da branch `feat/conta-e-acesso`: cadastro aberto, confirmação, sessão, recuperação
de senha, troca de senha, exclusão de conta, convites de admin, RLS por conta e as funções `SECURITY DEFINER`.
**Modo**: auditoria estática e revisão manual. Não houve teste ativo, nem conexão a banco, nem uso de contêiner (o
`conta-e-acesso-db-1` estava em uso por outro agente).
**Auditor**: subagente `auditor-seguranca`. Leu o THREAT-MODEL (1a), o GUARDRAILS (G-03, G-04, G-08, G-09, G-11, G-20), o
ADR-029, a spec, o design e o `validation.md` (volta 2). O que o `validation.md` já prova não foi refeito aqui.

## Veredito

**Sem achado crítico ou alto em aberto.** Há 4 médios, 8 baixos e 7 informativos. Nenhum deles é falha de isolamento,
injeção ou vazamento de segredo. Os médios são de abuso e disponibilidade: tomada antecipada de conta pelo link de
confirmação, esgotamento da cota de e-mail, bcrypt sem limitador nas rotas com sessão e rotação de IPv6 contra o bloqueio.

| Severidade | Quantidade |
| --- | --- |
| Crítico | 0 |
| Alto | 0 |
| Médio | 4 (SEC-CA-01 a 04) |
| Baixo | 8 (SEC-CA-05 a 12) |
| Informativo | 7 (INF-01 a 07) |

Convenção de caminhos: `api/` = `backend/api/src/`; `mig/` = `backend/api/src/infraestrutura/db/migracoes/`;
`web/` = `frontend/web/src/`.

## Ferramentas

| Ferramenta | Resultado |
| --- | --- |
| `varredura-seguranca.py ferramentas` | Rodou. Saída bruta fora do repositório (pasta de rascunho da sessão) |
| `pnpm audit --prod` e `pnpm audit` (com dev) | 0 vulnerabilidades |
| `gitleaks git --redact` (histórico inteiro e `9085f80..HEAD`) | 2 ocorrências, ambas falso positivo em fixture de teste (INF-01) |
| Busca embutida de segredos no histórico | 82 ocorrências, todas senhas fictícias de teste, URLs `postgres://…@localhost` de exemplo (README, `.env.example`, `vitest.config.ts`) ou as senhas fictícias do job e2e do CI. Nenhum segredo real |
| `osv-scanner`, `semgrep` | **Não executados**: não instalados (instalar é decisão do usuário) |

## Superfície revisada

- Rotas sem sessão, todas com `LIMITE_ENTRAR`: `POST /api/conta`, `/api/conta/confirmar`, `/api/conta/reenviar-confirmacao`,
  `/api/sessao/entrar`, `/api/sessao/esqueci-senha`, `/api/sessao/nova-senha`, `/api/convites/ler`, `/api/convites/cadastrar`.
- Rotas com sessão, **sem** limitador: `GET /api/sessao`, `POST /api/sessao/sair`, `/api/conta/senha`, `/api/conta/excluir`,
  `/api/convites/aceitar`.
- Rotas com sessão e vínculo: `GET /api/grupos/:grupoId/admins`, `POST …/admins/convites`, `DELETE …/admins/convites/:id`,
  `DELETE …/admins/:contaId`.
- `GET /api/dev/emails`, que só responde com `EMAIL_DEV=1`.
- Banco: 13 funções `SECURITY DEFINER` novas, as policies e os grants de `contas`, `sessoes`, `convites_admin` e `auditoria`.
- Front: o `volta` do login, o fragmento `#t=`, o service worker e o `_headers` (CSP, HSTS, `frame-ancestors`).

## Achados

### SEC-CA-01 [MÉDIO] Tomada antecipada de conta: o link de confirmação abre sessão sem pedir a senha

- **Onde**: `api/entrada/rotas/conta-cadastro.ts:48-57` (`/api/conta/confirmar` chama `definirCookieSessao`);
  `mig/1792843440000_conta-cadastro-e-links.sql:100-118` (`link_confirmar` confirma o e-mail e cria a sessão de 12 h);
  `web/telas/confirmar/Confirmar.tsx:49-55` (a tela confirma sozinha ao abrir o link).
- **Cenário**: o cadastro aberto aceita qualquer e-mail, e a senha é de quem cadastra.
  1. O atacante faz `POST /api/conta` com `email: vitima@x`, uma senha P que ele conhece e o nome "Gestão da Pelada".
  2. A vítima recebe do domínio legítimo o e-mail "Confirme seu e-mail". Basta abrir o link: a conta fica confirmada e a
     vítima fica logada sem digitar senha. Para ela, é o próprio cadastro (por exemplo, quando um organizador pediu que
     ela se cadastrasse).
  3. A vítima passa a usar a conta e aceita convites de admin enviados a `vitima@x` (o e-mail confere, ACE-35).
  4. O atacante entra com P quando quiser e vira admin dos mesmos grupos, com acesso aos dados dos jogadores. A vítima
     não consegue trocar a senha porque não sabe a atual. Ela só tira o atacante se usar "esqueci a senha".
- **Variante**: alguém logado que abre o link de confirmação da conta de outra pessoa perde a própria sessão e passa a
  usar a conta do atacante (login CSRF).
- **Por que médio**: o golpe depende de a vítima abrir o link, mas isso é natural, porque o e-mail é legítimo. O impacto
  é acesso persistente de admin a grupos com dados pessoais.
- **Correção sugerida** (uma das duas):
  - (a) `link_confirmar` só confirma o e-mail e não cria sessão: a tela leva a `/entrar`, e só entra quem sabe a senha;
  - (b) a confirmação pede a senha da conta, conferida na própria função.
  Nas duas, um teste prova que confirmar não devolve `Set-Cookie`, ou que recusa a senha errada.

### SEC-CA-02 [MÉDIO] Cota diária do Resend esgotável por qualquer pessoa, com risco à reputação do domínio

- **Onde**: `api/entrada/rotas/conta-cadastro.ts:17-47` (cada cadastro com e-mail novo envia 1 e-mail);
  `api/entrada/app.ts:29-38` e `:74-75` (o único freio é `LIMITE_ENTRAR`, 10/min por IP); o intervalo de 60 s
  (`mig/1792843440000_conta-cadastro-e-links.sql:11-24`) vale por destino, e um e-mail aleatório é sempre um destino novo.
- **Cenário**: um único IP manda 10 `POST /api/conta` por minuto, cada um com um endereço inventado. Em uns 10 minutos a
  cota de 100 e-mails por dia acaba (THREAT-MODEL 1a, linha D). Até o dia seguinte ninguém recebe confirmação,
  recuperação de senha nem convite: a rota responde 503 `email_indisponivel`, o que o ACE-52 trata como correto.
  Endereços inexistentes em provedores reais geram *hard bounces*, e o Resend suspende remetentes com taxa de rejeição
  alta, o que pode tirar o domínio do ar por mais tempo.
- **Correção sugerida**:
  - um teto global de envios por janela (contador no banco ou um binding de rate limit com chave fixa) que preserve uma
    reserva para recuperação de senha;
  - um desafio (Turnstile) no cadastro e no "esqueci a senha";
  - alerta quando a cota passar de 50%;
  - registrar no runbook o que fazer se o Resend suspender o domínio.

### SEC-CA-03 [MÉDIO] bcrypt de custo 12 sem limitador nas rotas com sessão

- **Onde**: `api/entrada/app.ts:29-38` (`ROTAS_LIMITE_ENTRAR` não inclui `/api/conta/senha` nem `/api/conta/excluir`, e o
  `app.use(caminho, …)` casa só o caminho exato); `api/entrada/rotas/conta-minha.ts:15` e `:29`;
  `mig/1792843560000_conta-senha-e-exclusao.sql:17` e `:49` (`crypt()` roda em toda tentativa, certa ou errada, e nenhuma
  falha é contada).
- **Cenário**:
  1. Qualquer pessoa cria uma conta (cadastro aberto, com o próprio e-mail) e manda em paralelo muitos
     `POST /api/conta/senha` com uma senha atual errada. Cada um custa uns 250 ms de CPU do Postgres (Neon) e prende uma
     conexão do Hyperdrive, e nada limita. A CPU satura e o app inteiro cai.
  2. Com uma sessão roubada (aparelho compartilhado), dá para testar a senha atual sem limite. Ao acertar, o atacante
     troca a senha e derruba as outras sessões da vítima (ACE-26).
- **Correção sugerida**: pôr `/api/conta/senha` e `/api/conta/excluir` num limitador (o `LIMITE_ENTRAR` por IP ou um novo
  por conta) e contar as falhas da senha atual por conta, com o mesmo bloqueio de 15 min do login. O THREAT-MODEL 1a,
  linha D, deve citar estas rotas.

### SEC-CA-04 [MÉDIO] Bloqueio por e-mail e IP e `LIMITE_ENTRAR` contornáveis com rotação de IPv6

- **Onde**: `api/entrada/rotas/sessao.ts:23` (a chave é o `CF-Connecting-IP` inteiro); `api/entrada/middlewares/limite-taxa.ts:29`;
  `mig/1792843500000_conta-entrar-e-sessao.sql:31-49`.
- **Cenário**: quem tem um bloco IPv6 /64 (comum em VPS barata) tem 2^64 endereços. Cada um ganha 10 requisições por
  minuto no limitador e 5 falhas a cada 15 min no par e-mail+IP. Assim a força bruta e o *password spraying* contra uma
  conta só ficam limitados pela CPU do banco, o que também alimenta o SEC-CA-03. O SEC-006 trocou de propósito o
  bloqueio por e-mail pelo bloqueio por par, para que ninguém tranque uma conta de longe; o efeito do IPv6 não aparece
  na decisão.
- **O `CF-Connecting-IP` é confiável?** Sim. O Worker só é alcançado pela borda da Cloudflare, que sobrescreve esse
  cabeçalho, e não existe caminho de origem direto. Fora da Cloudflare, a chave `sem-ip` falha fechada. Não é achado.
- **Correção sugerida**:
  - no IPv6, usar o prefixo /64 como chave do limitador e do `ip_hash`;
  - um teto suave por conta, somando todos os IPs (por exemplo, 50 falhas por hora), que pede um desafio (Turnstile) em
    vez de bloquear, para não reabrir o "trancar o dono de longe".
  Decisão do usuário (ver as perguntas).

### SEC-CA-05 [BAIXO] Enumeração de contas pelo tempo de resposta e pelo 503 em "esqueci a senha" e no reenvio de confirmação

- **Onde**: `api/entrada/rotas/sessao-recuperacao.ts:22-28` e `api/entrada/rotas/conta-cadastro.ts:65-71`. Só há chamada
  HTTP ao Resend quando a conta existe (ou existe sem confirmação).
- **Cenário**:
  - Pelo tempo: um e-mail com conta responde uns 100 a 400 ms mais devagar, porque espera a ida e volta ao Resend.
  - Pelo status: com o Resend falhando ou a cota esgotada (o que o SEC-CA-02 provoca), a conta existente recebe 503 e o
    e-mail sem conta recebe 200.
  O corpo da resposta é igual nos dois casos (ACE-22 e ACE-08 estão cumpridos). O login (hash fixo) e o cadastro (bcrypt
  e e-mail nos dois ramos) não têm esse problema.
- **Correção sugerida**: enviar o e-mail fora do caminho da resposta (`executionCtx.waitUntil`, ou uma fila) e responder
  200 sempre. Isso muda o ACE-52 (o 503 com nova tentativa), então pede decisão do usuário. Se preferir manter o envio
  síncrono, ao menos igualar o tempo com uma espera aleatória no ramo sem conta.

### SEC-CA-06 [BAIXO] Convites pendentes criados por um admin removido continuam valendo

- **Onde**: `api/infraestrutura/db/repositorios/admins.ts:42-54` (`remover` apaga o vínculo e não toca em `convites_admin`).
- **Cenário**: o admin B, antes de ser removido, convida um segundo e-mail dele. Depois que A o remove, B aceita o
  convite (válido por 7 dias) e volta como admin. O convite aparece na lista de pendentes (ACE-37), mas nada avisa que
  ele é do admin removido.
- **Correção sugerida**: na mesma transação de `remover`, cancelar os convites pendentes do grupo com
  `criado_por = contaId` e registrar na auditoria. Precisa de teste.

### SEC-CA-07 [BAIXO, regra de negócio] Qualquer admin remove qualquer outro, inclusive quem acessa o financeiro

- **Onde**: `api/infraestrutura/db/repositorios/admins.ts:42-54`; spec ACE-39 e ACE-40.
- **Cenário**: um admin recém-convidado (`acessa_financeiro` falso) remove os admins antigos, um por um, até sobrar só
  ele. Como nenhuma rota concede `acessa_financeiro`, o grupo perde de vez o acesso ao financeiro e fica com o admin
  novo. O código segue a spec ("todos os admins são iguais no MVP"), e a auditoria registra cada remoção.
- **Correção sugerida** (decisão do usuário): proibir que quem não acessa o financeiro remova quem acessa, ou exigir que
  sobre pelo menos um admin com financeiro.

### SEC-CA-08 [BAIXO, defesa em profundidade] O `pelada_app` tem mais privilégio do que as rotas usam

- **Onde**:
  - `mig/1792843380000_conta-tabelas.sql:88-93`: `INSERT` e `UPDATE` em todas as colunas de `convites_admin`. As rotas só
    gravam `cancelado_em`, e a criação é feita por `convite_criar`, que é `SECURITY DEFINER`.
  - `mig/1792843380000_conta-tabelas.sql:96` e as policies de `auditoria`: o `WITH CHECK` não amarra
    `autor_conta_id = app_conta_id()`.
  - Da fundação, `1792843260000_roles.sql:22-25`: `INSERT` e `UPDATE` em `vinculos_admin`, inclusive `acessa_financeiro`.
- **Cenário**: hoje nenhuma rota explora isso. Bastaria um bug futuro de atribuição em massa ou de SQL para um admin se
  dar `acessa_financeiro`, criar um convite sem auditoria ou gravar auditoria em nome de outra conta. A RLS continua
  limitando tudo aos grupos do próprio admin.
- **Correção sugerida** (migration aditiva):
  - `REVOKE INSERT, UPDATE ON convites_admin` e `GRANT UPDATE (cancelado_em)`;
  - na policy de `auditoria`, `WITH CHECK (autor_conta_id = app_conta_id())`;
  - fechar `UPDATE (acessa_financeiro)` em `vinculos_admin`, ou deixar registrado que isso fica para a feature
    `financeiro` (SEC-003).

### SEC-CA-09 [BAIXO, defesa em profundidade] `GET /api/dev/emails` depende só de configuração

- **Onde**: `api/entrada/rotas/dev-emails.ts:12`; `api/infraestrutura/email/ambiente.ts:28`.
- **Cenário**: o `wrangler.test.ts` impede `EMAIL_DEV` no `wrangler.jsonc`, e o deploy passa só `URL_PUBLICA` e `VERSAO`.
  Mas um `wrangler secret put EMAIL_DEV` (os segredos sobrevivem ao deploy) ligaria a caixa em memória em produção. Aí
  `GET /api/dev/emails` devolveria os tokens de confirmação, recuperação e convite de todo mundo, ou seja, tomada de
  qualquer conta. É improvável e depende de erro de operação.
- **Correção sugerida**: além de `EMAIL_DEV === '1'`, exigir que `URL_PUBLICA` não comece com `https:` (no dev é
  `http://localhost:8787`), na rota e no `remetenteDoAmbiente`, com teste. Opcional: o deploy conferir
  `wrangler secret list` sem `EMAIL_DEV`.

### SEC-CA-10 [BAIXO, LGPD] O hash do IP e o hash do destino são SHA-256 sem sal, reversíveis

- **Onde**: `api/infraestrutura/sessao/token.ts:21` (`hashIp = sha256`); `tentativas_login.ip_hash`; `envios_email.destino_hash`
  (`mig/1792843440000_conta-cadastro-e-links.sql:17`).
- **Cenário**: o espaço de IPv4 (2^32) se percorre em minutos, e um e-mail conhecido se confere com um único hash.
  Quem tiver um backup ou acesso de leitura recupera os IPs das tentativas de login (guardados por até 24 h) e confirma
  se um e-mail recebeu envio. Os comentários das migrations chamam isso de "só o hash, LGPD", mas é pseudonimização
  fraca.
- **Correção sugerida**: HMAC-SHA-256 com uma chave secreta do Worker (um segredo novo no `.env.example`) para o IP e para
  o destino, ou um sal diário. Ajustar o texto do THREAT-MODEL e dos comentários.

### SEC-CA-11 [BAIXO] Contas do legado com senha temporária entram com sessão completa e sem troca obrigatória

- **Onde**: `mig/1792843500000_conta-entrar-e-sessao.sql:51-69` (`conta_entrar` ignora `senha_temporaria`); spec, linha 55.
- **Cenário**: uma conta do legado com `senha_temporaria = true` tem uma senha definida por outra pessoa (o dono ou o
  admin que a criou ou redefiniu). Antes, o legado obrigava a troca no primeiro acesso. Agora a senha vale como
  definitiva: quem a definiu continua podendo entrar, e o titular nunca é levado a trocá-la.
- **Correção sugerida** (decisão do usuário): numa migration aditiva, trocar o hash dessas contas por `'!'` (a pessoa
  recupera por e-mail), ou fazer `conta_entrar` devolver um resultado que obrigue a recuperação. Antes, contar quantas
  contas estão nesse estado em produção.

### SEC-CA-12 [BAIXO] A troca de senha não invalida o link de recuperação pendente

- **Onde**: `mig/1792843560000_conta-senha-e-exclusao.sql:7-25` (`conta_trocar_senha` apaga as sessões, mas não os
  `links_conta` do tipo `recuperacao`).
- **Cenário**: alguém que leu a caixa de e-mail da vítima pede uma recuperação. A vítima percebe e troca a senha, mas o
  link continua valendo por até 1 h e redefine a senha de novo.
- **Correção sugerida**: em `conta_trocar_senha`, marcar como usados (ou apagar) os links de recuperação pendentes da
  conta. Precisa de teste.

## Informativos (sem risco direto)

- **INF-01**: o gitleaks do CI vai acusar duas fixtures, `senhaSecreta` em `backend/api/test/rotas/sessao.test.ts:100` e
  `backend/api/test/rotas/sessao-recuperacao.test.ts:136` (regra `generic-api-key`). O `.gitleaks.toml` não tem
  allowlist para elas, e o job `gitleaks-action` deve falhar no push ou no PR. Resolver com um comentário
  `// gitleaks:allow` na linha ou com um allowlist por caminho de teste. Não é segredo.
- **INF-02**: o cache do Hyperdrive desligado agora protege a sessão. `SELECT sessao_tocar(...)` e
  `SELECT … FROM conta_entrar(...)` têm cara de leitura; com o cache ligado, uma sessão encerrada ou vencida poderia
  continuar valendo pelo tempo do cache. O deploy confere isso (`deploy.yml:92-100`). Manter, e citar no THREAT-MODEL.
- **INF-03**: um `\u0000` na senha ou no nome passa no schema e vira 500 (o Postgres recusa NUL em `text`). Não contorna
  nada, mas a tentativa de login não é contada. Sugestão: o contrato recusar caracteres de controle.
- **INF-04**: o cookie real é `__Host-sessao`, não `__Host-sid` como diz o pedido. Atributos conferidos:
  `HttpOnly; Secure; SameSite=Lax; Path=/`, sem `Domain`, `Max-Age` de 12 h; cookie repetido é recusado; o formato do
  token é validado (`api/infraestrutura/sessao/cookie.ts`).
- **INF-05**: a senha em texto chega ao Postgres como parâmetro (ADR-015 e ADR-029). O log de comandos (`log_statement`,
  `auto_explain`) tem de continuar desligado no Neon. Não verificado (sem acesso).
- **INF-06**: o `wrangler.jsonc` não declara `workers_dev: false` nem `preview_urls: false`. Se o subdomínio
  `*.workers.dev` estiver ativo, a API responde também por ele. Não há impacto direto: o cookie `__Host-` é por host, os
  e-mails usam `URL_PUBLICA` e o limitador vale igual. Não verificado na conta da Cloudflare.
- **INF-07**: o pedido ou o design chama o CSRF de "SameSite e cabeçalho". Está correto: `X-Pelada: 1` em toda escrita
  (antes dos limitadores), sem CORS, `SameSite=Lax`, CSP com `frame-ancestors 'none'` e HSTS no `_headers`.

## Conferido sem achado

- **Tokens**: 32 bytes de `crypto.getRandomValues` em base64url (`api/infraestrutura/sessao/token.ts`). O banco guarda só
  o SHA-256, e a busca é por igualdade do hash, sem oráculo de tempo útil.
  - Uso único com `UPDATE … RETURNING` atômico (`link_confirmar`, `link_nova_senha`) e `FOR UPDATE` nos convites.
  - Validade de 24 h, 1 h e 7 dias conferida em `now()`.
  - O fragmento `#t=` é apagado com `history.replaceState`.
  - `Referrer-Policy: same-origin`.
- **Sessão**:
  - Token novo a cada login, então não há fixação.
  - `sessao_tocar` aplica 15 min de inatividade e 12 h absolutas e recusa o escopo `troca_de_senha`.
  - Sair apaga a sessão atual.
  - Trocar a senha encerra as outras; a recuperação e a exclusão encerram todas.
- **Enumeração**:
  - No login, o hash fixo de custo 12 mantém o tempo igual e `email_nao_confirmado` só aparece com a senha certa.
  - No cadastro, o bcrypt e o e-mail rodam nos dois ramos.
  - O que sobra está no SEC-CA-05.
- **Senha**: 8 a 72 caracteres e no máximo 72 bytes (contrato); bcrypt `gen_salt('bf', 12)` só nas funções; nenhuma
  biblioteca de hash no Worker. O `pg_advisory_xact_lock` por par evita a corrida no contador (ACE-66).
- **Funções `SECURITY DEFINER`**:
  - Todas com `SET search_path = public, pg_temp`, `REVOKE ALL … FROM PUBLIC` e `EXECUTE` só para o `pelada_app`.
  - `conta_definir_senha` e `envio_permitido` não têm grant para a app.
  - O `CREATE` em `public` foi revogado.
  - A conta sempre vem de `app_conta_id()`, nunca de parâmetro.
- **RLS e IDOR**:
  - `contas` e `sessoes` só na própria linha, com `senha_hash` fora do grant de coluna.
  - Convites e admins filtrados por `grupoId` e por `grupos_visiveis()`.
  - `exigirVinculo` responde 404 a grupo de outro.
  - O `id` do convite ou da conta de outro grupo não acha nada.
  - Convite de outro e-mail dá 403.
  - Remoção concorrente é serializada por `FOR UPDATE`.
  - O "único admin" na exclusão trava os vínculos.
- **`e_dono`**: nenhuma rota lê ou escreve (lint `pelada/sem-escrita-dono`); só `dono.ts`, que pede a senha sem eco e usa
  a trava de host.
- **Entrada**: todos os corpos são `z.strictObject`, com limite de 16 KB. As consultas são parametrizadas (template `sql`
  do Kysely e `$1` no `pg`), sem `sql.raw`. O 422 nunca devolve o valor recebido.
- **Retorno pós-login**: `lerDestino` (`web/dados/destino.ts:30-42`) recusa `//`, `/\`, barra invertida, esquema e
  caracteres de controle, também depois de decodificar. A navegação fica no próprio app, sem open redirect.
- **Logs e Sentry**:
  - Os únicos `console.error` levam nome de erro e código, nunca valores.
  - O Sentry usa lista de permissão de cabeçalhos, tira corpo, cookies e e-mails, e fica desligado sem DSN.
  - O service worker não guarda `/api/*` em cache.
- **LGPD na exclusão**: anonimiza a conta (e-mail, nome, hash `'!'`) e apaga sessões, vínculos, links, convites para o
  e-mail, tentativas e envios. A auditoria fica com "Conta excluída". As páginas de termos e privacidade são públicas e
  levam a versão.
- **Segredos e CI**:
  - Nenhum segredo real no histórico; `.env` e `.dev.vars` estão no `.gitignore`; `.env.example` documenta `EMAIL_DEV`,
    `SEED_SENHA_ADMIN` e `RESEND_*`.
  - Ações fixadas por SHA e imagem `postgres:16` por digest.
  - O job e2e usa só senhas fictícias e banco descartável, e liga `EMAIL_DEV` só por `--var` no `wrangler dev` em
    `127.0.0.1`.
  - `permissions: contents: read`.

## Não coberto

- Teste ativo (sondas) contra o Worker local ou publicado: não autorizado nesta auditoria.
- Banco: a migração não foi aplicada nem houve consulta. Não foi confirmado que o owner do Neon tem `BYPASSRLS` (as
  funções dependem disso para funcionar; se faltar, o efeito é quebra funcional, não brecha). Também não foi confirmada
  a configuração de log do Neon (INF-05).
- Conta da Cloudflare: segredos do Worker (SEC-CA-09), `workers.dev` (INF-06), configuração real dos limitadores.
- Resend: domínio, SPF, DKIM e DMARC, limites do plano.
- `semgrep` e `osv-scanner` (não instalados).
- Telas do front além do fluxo de token, do `volta` e dos avisos de URL.

## Perguntas para o usuário

1. **SEC-CA-01: o link de confirmação continua abrindo sessão?**
   - (a) Confirmar só valida o e-mail e leva a `/entrar` **(Recomendado)**: fecha a tomada antecipada com um passo a mais
     para quem se cadastra; muda o ACE-06 ("sessão aberta, `/app`").
   - (b) A confirmação pede a senha: mantém a entrada direta e fecha a brecha; mais uma tela e um campo.
   - (c) Aceitar o risco: nada muda; o risco fica registrado no THREAT-MODEL.
2. **SEC-CA-02 e SEC-CA-04: proteção contra abuso automatizado.**
   - (a) Turnstile no cadastro, no "esqueci a senha" e depois de N falhas por conta, mais teto global de e-mails
     **(Recomendado)**: fecha a cota, o bounce e a rotação de IPv6; acrescenta uma dependência da Cloudflare e mexe nas
     telas t04, t05 e t29.
   - (b) Só o teto global de e-mails e a chave /64 no IPv6: sem mudança de tela; o *password spraying* distribuído
     continua possível.
   - (c) Aceitar e registrar: nada muda agora.
3. **SEC-CA-03: limitar as rotas com sessão que rodam bcrypt?**
   - (a) `LIMITE_ENTRAR` mais contador de falhas por conta em `/api/conta/senha` e `/api/conta/excluir`
     **(Recomendado)**: uma linha no `app.ts` e o mesmo padrão do login; precisa de teste.
   - (b) Só o `LIMITE_ENTRAR`: mais simples; não freia uma conta usando muitos IPs.
4. **SEC-CA-07 e SEC-CA-11: regras de negócio.**
   - SEC-CA-07: quem não acessa o financeiro pode remover quem acessa? (a) Não **(Recomendado)**; (b) Sim, como na spec.
   - SEC-CA-11: o que fazer com as contas do legado com senha temporária? (a) Invalidar o hash e obrigar a recuperação por
     e-mail **(Recomendado)**; (b) Manter como está.

## Reteste das correções dos médios (2026-10-28)

**Escopo**: só as correções dos SEC-CA-01 a 04, commits `8df20cc..db0412e` da branch `fix/conta-e-acesso-seguranca`
(T57 a T64). Os baixos SEC-CA-05 a 12 ficaram fora; abaixo só se diz o que mudou neles.
**Modo**: revisão do diff e teste ativo **só no local**. Foi usado o Worker local (`wrangler dev` em `127.0.0.1:8797`,
`EMAIL_DEV=1` e `LIMITE_EMAILS_DIA=10` por `--var`), ligado ao banco `pelada` do contêiner `conta-e-acesso-db-1`
(porta 5432) como `pelada_app`. Foram feitas sondas HTTP com o `CF-Connecting-IP` forjado, que só é possível no local
(na borda, a Cloudflare sobrescreve o cabeçalho). Não houve acesso à produção, à Cloudflare, ao Resend, nem aos
contêineres `controleemcasa_ljs-banco-1` e `evolucao-segura-postgres`.
**Testes do diff**: `vitest run` das 9 suítes tocadas (teto, bloqueio, chave de IP, conta-minha, limite-taxa,
conta-cadastro, links, sessão) deu 113 de 116 verdes. As 3 falhas foram todas em `test/rotas/teto-emails.test.ts`: o
contador do dia leu 79 onde esperava 8. A suíte sozinha passou 14 de 14. Como o `fileParallelism` está em `false`, a
causa provável é outra execução da suíte, ao mesmo tempo, no mesmo banco de teste do Worker. Não é defeito do código,
mas o contador global é compartilhado: duas execuções simultâneas da suíte interferem uma na outra.
**Resíduo das sondas no banco local `pelada`**: contas fictícias `*@reteste.invalid` e o contador
`envios_email_dia` de 2026-10-28 em 10. Nada foi apagado.

### Resultado por achado

| Achado | Antes | Agora | Situação |
| --- | --- | --- | --- |
| SEC-CA-01 | Médio | — | **Fechado** |
| SEC-CA-02 | Médio | Médio | **Parcialmente corrigido; continua em aberto** |
| SEC-CA-03 | Médio | — | **Fechado** |
| SEC-CA-04 | Médio | Médio | **Parcialmente corrigido; continua em aberto** (o /64 fechou, o /48 e o /56 não) |
| SEC-CA-13 (novo) | — | Baixo | Em aberto |
| SEC-CA-14 (novo) | — | Baixo | Em aberto |

### SEC-CA-01: fechado

- **Correção**: `link_confirmar` foi redefinida sem criar sessão (`mig/1792843740000_conta-confirmar-sem-sessao.sql:9-28`).
  A rota não chama mais `definirCookieSessao` (`api/entrada/rotas/conta-cadastro.ts:52-55`), e a tela leva a
  `/entrar?aviso=email-confirmado` (`web/telas/confirmar/Confirmar.tsx`).
- **Prova** (ataque original, no local):
  1. O atacante cadastra `vitima@` com a senha dele: 201. Antes da confirmação, o login do atacante dá 403
     `email_nao_confirmado`.
  2. A vítima abre o link (`POST /api/conta/confirmar`): 204, **sem `Set-Cookie`**. O reuso do link dá 410.
  3. A vítima não entra sem saber a senha. Pelo "esqueci a senha", ela define uma senha nova (200, sem cookie). Com
     isso, a sessão que o atacante tinha aberto passa a dar 401 `sessao_expirada`, e a senha antiga dele dá 401.
  4. A variante de login CSRF também fechou: confirmar não troca a sessão de quem está logado.
- **Resíduo (informativo, sem severidade)**: entre a confirmação e a recuperação feita pela vítima, o atacante entra
  numa conta confirmada com o e-mail da vítima. Se a vítima nunca usar o app, essa conta fica com ele. Ele pode criar
  grupos aparentando ser a vítima. Não pode aceitar convites mandados a ela, porque o token só chega à caixa dela. A
  opção (b) original (pedir a senha para confirmar) fecharia também isso.

### SEC-CA-02: parcialmente corrigido; continua MÉDIO

- **Correção**: há um contador por dia de São Paulo (`envios_email_dia`). Cadastro, reenvio e convite param em 80% de
  `LIMITE_EMAILS_DIA`, e a recuperação vai até 100% (`api/entrada/enviar-email.ts:16-59`,
  `mig/1792843860000_conta-teto-emails.sql:30-50`). O runbook ganhou a seção 10. O Turnstile foi adiado.
- **O que fechou**: o envio nunca passa da cota contratada. A cota já não é ultrapassada sem limite, e o teto vale
  também para envios simultâneos (prova `conta-teto-emails.test.ts:131`).
- **O que continua (prova no local, limite 10, ou seja, 8 para cadastro e 10 para recuperação)**:
  1. Contas não confirmadas criadas pelo próprio atacante, mais cadastros com e-mails inventados: cadastro, reenvio e
     convite ficam recusados (503) para todo mundo até a virada do dia. O cadastro duplicado e o novo dão o mesmo 503,
     então não há enumeração nesse ponto.
  2. A **reserva de 20% para a recuperação é consumível pelo atacante**: o "esqueci a senha" das contas que ele mesmo
     criou (ainda não confirmadas) envia normalmente (200 200) até o teto. Depois disso, a recuperação da vítima
     responde 503 em todas as tentativas.
  3. Com a cota real de 100, o ataque custa cerca de 100 requisições. Ele precisa de uns 20 e-mails próprios para
     contornar o intervalo de 60 s por destino. Com rotação de IPv6 (ver SEC-CA-04), leva segundos. Pode ser repetido
     todo dia.
  4. Os destinatários são endereços inventados, então **até 100 *hard bounces* por dia** continuam possíveis, e o risco
     de suspensão do domínio no Resend continua.
  5. O login de quem já tem conta não é afetado (200 com a cota esgotada).
- **Por que continua médio**: qualquer pessoa, sem conta e com pouco esforço, tira do ar todo dia o cadastro, o convite
  e a recuperação de senha, e ainda ameaça a reputação do domínio. O runbook (seção 10) diz que a recuperação usa a
  cota inteira "para que quem já tem conta consiga recuperar o acesso", mas isso só vale sem ataque. O THREAT-MODEL 1a,
  linha D, não registra esse resíduo.
- **Correção sugerida**:
  - Turnstile no cadastro e no "esqueci a senha" (o que estava no AD-012);
  - ou, no mínimo, o "esqueci a senha" de conta **não confirmada** gastar a cota de cadastro (80%), e não a reserva;
  - um teto por /64 ou /48 de envios por dia;
  - registrar o resíduo no THREAT-MODEL.
- **Nota (PREMISSA)**: o contador vira à meia-noite de São Paulo. Se o Resend contar a cota diária em UTC (não
  verificado), os dois dias ficam desalinhados em 3 h. Um atacante que gaste os 80% nas 3 últimas horas de um dia de
  São Paulo e de novo logo depois da virada passa da cota do Resend com o contador local abaixo do teto. Conferir no
  painel do Resend.

### SEC-CA-03: fechado

- **Correção**: `/api/conta/senha` e `/api/conta/excluir` entraram em `ROTAS_LIMITE_ENTRAR` (`api/entrada/app.ts:38-40`).
  A tabela `falhas_senha_atual` conta as falhas por conta. A linha da conta fica travada (`FOR UPDATE`) e o bloqueio é
  conferido antes do `crypt()` (`mig/1792843800000_conta-senha-bloqueio.sql:62-70` e `:102-110`). A falha é gravada numa
  transação própria, que sobrevive ao 401 (`api/entrada/rotas/conta-minha.ts:22-49`). A sessão é resolvida numa
  transação curta separada (`middlewares/sessao.ts:14-27`), então não há trava presa entre as duas.
- **Prova** (no local):
  1. Do mesmo IP, 11 `POST /api/conta/senha` com a senha errada. As 5 primeiras dão 401 e levam de 0,6 a 1,3 s
     (bcrypt). Da 6ª à 10ª, 429 `bloqueado_temporariamente`, em 0,16 a 0,3 s (sem bcrypt). A 11ª dá 429
     `muitas_requisicoes` (limitador por IP, 18 ms).
  2. Trocando o IP a cada pedido, `/api/conta/excluir` continua em 429 `bloqueado`: o bloqueio é da conta. A senha certa
     durante o bloqueio também recebe 429.
  3. Durante o bloqueio, o login com a senha certa segue funcionando (200) e a sessão continua válida. O bloqueio não
     vira negação de serviço contra o login.
  4. Para disparar o bloqueio é preciso estar com a sessão da conta, e sem sessão a resposta é 401. Então não há
     enumeração nem bloqueio de longe.
  5. Os testes cobrem a corrida (`conta-senha-bloqueio.test.ts:257` e `:272`).
- **Efeito colateral bom**: criar contas exige confirmar o e-mail, e o teto de 80% limita os cadastros a cerca de 80
  por dia no total. Isso limita o custo de bcrypt por "muitas contas" a cerca de 20 por hora por conta.
- **Novo efeito**: SEC-CA-14, abaixo.

### SEC-CA-04: parcialmente corrigido; continua MÉDIO

- **Correção**: `chaveDoIp` (`api/infraestrutura/sessao/chave-ip.ts:46-58`) reduz o IPv6 ao /64 e trata IPv4 mapeado
  como IPv4. É a chave do limitador (`middlewares/limite-taxa.ts:27`) e do `ip_hash` (`rotas/sessao.ts:21`).
- **Prova do que fechou** (no local, um endereço diferente do mesmo /64 a cada pedido):
  - 5 falhas de login dão 401, e o 6º endereço, mesmo com a senha certa, recebe 429 `bloqueado_temporariamente`.
  - A mesma rede escrita em maiúsculas e expandida (`2001:DB8:4:1:FFFF:0:0:99`) também cai no bloqueio.
  - No limitador, 10 pedidos dão 200 e o 11º dá 429.
- **O que continua**:
  - Outro /64 do mesmo /48 com a senha certa é avaliado normalmente (200), como manda o ACE-14.
  - Em 4 /64 do mesmo /48, 20 falhas seguidas contra uma conta foram **todas avaliadas** (20 × 401, nenhum bloqueio).
  - Um /48 de *tunnel broker* gratuito, ou o /56 que vários provedores de VPS dão, tem de 256 a 65 536 /64. Cada um
    rende 5 tentativas a cada 15 min por conta e 10 requisições por minuto no limitador. Assim a força bruta contra
    **uma** conta e a saturação da CPU do banco por bcrypt no `/api/sessao/entrar` (sem sessão) continuam ao alcance de
    uma única máquina.
  - O teto suave por conta somando todos os IPs (sugerido no achado original) e o Turnstile não foram feitos.
  - O THREAT-MODEL 1a, linha D, registra como resíduo só o *password spraying* (muitas contas). Não registra a força
    bruta contra uma conta a partir de muitos /64, nem o custo de CPU.
- **Correção sugerida**:
  - um teto suave por conta no login (por exemplo, 50 falhas por hora somando todos os IPs) que peça o Turnstile em vez
    de bloquear;
  - ou um limitador adicional pelo /48 no `/api/sessao/entrar`;
  - ou aceitar formalmente o resíduo e registrá-lo como acima.

### SEC-CA-13 [BAIXO, novo] A reserva da cota trava a linha do dia durante a chamada ao Resend e serializa todos os envios

- **Onde**:
  - `mig/1792843860000_conta-teto-emails.sql:30-36`: o `INSERT … ON CONFLICT (dia) DO UPDATE` trava a única linha do dia
    até o fim da transação da requisição.
  - `api/entrada/enviar-email.ts:51-57`: a reserva acontece antes do `fetch` ao Resend, dentro dessa transação.
  - `api/infraestrutura/email/resend.ts:26-40`: o `fetch` não tem `AbortSignal` nem tempo máximo.
  - Não há `lock_timeout` nem `statement_timeout` na conexão.
- **Prova** (no local, tudo em `BEGIN … ROLLBACK`):
  - Com uma transação segurando `email_cota_reservar(1000000)` por 6 s, a segunda reserva **esperou 4 990 ms**.
  - A espera vale também quando o teto já foi atingido: o `ON CONFLICT DO UPDATE` trava a linha mesmo com o `WHERE`
    falso, conforme a documentação do PostgreSQL.
- **Cenário**: cada envio de e-mail do app (cadastro, reenvio, convite, recuperação) espera o anterior terminar a ida e
  volta ao Resend. A vazão global fica em uns 3 a 5 envios por segundo. Se o Resend ficar lento ou parar de responder,
  todas as requisições de envio se acumulam, cada uma segurando uma conexão do Hyperdrive com o Neon. Um atacante que
  dispare muitos cadastros simultâneos (com rotação de /64) piora a fila e pode esgotar as conexões do resto do app
  enquanto o contador estiver abaixo do teto.
- **Por que baixo**: depende de o Resend estar lento, ou de uma rajada antes de o teto ser atingido. O efeito é
  temporário e não toca em dados.
- **Correção sugerida**:
  - tempo máximo no `fetch` do Resend (`AbortSignal.timeout`, alguns segundos);
  - `SET LOCAL lock_timeout` curto antes da reserva;
  - ou reservar numa transação própria e curta, devolvendo a vaga numa segunda transação se o envio falhar.

### SEC-CA-14 [BAIXO, novo] Com uma sessão roubada, o atacante trava a troca de senha da vítima

- **Onde**: `mig/1792843800000_conta-senha-bloqueio.sql:23-38` (o bloqueio é por conta, sem distinguir a sessão) e
  `api/entrada/rotas/conta-minha.ts:33-49`.
- **Cenário**:
  1. Quem está com a sessão roubada da vítima (por exemplo, num aparelho compartilhado) manda 5 senhas erradas a cada
     15 min. Com isso, a vítima, na própria sessão, recebe 429 ao tentar trocar a senha (o que derrubaria as outras
     sessões, ACE-26) ou excluir a conta.
  2. A saída que sobra é o "esqueci a senha", e o atacante pode fechá-la esgotando a cota do dia (SEC-CA-02).
  3. Assim ele mantém a sessão pelo prazo absoluto de 12 h.
- **Por que baixo**: pede uma sessão já roubada e dura no máximo 12 h. Antes da T61, a vítima expulsava o invasor
  trocando a senha a qualquer momento.
- **Correção sugerida** (uma das três):
  - contar as falhas por sessão, mais um teto por conta mais alto;
  - deixar "encerrar as outras sessões" sem pedir a senha;
  - a senha certa vinda de uma sessão diferente da que gerou as falhas não ser bloqueada.

### Baixos SEC-CA-05 a 12: o que mudou

- **SEC-CA-05 (agravado, segue baixo)**: o teto da T63 dá ao atacante um gatilho barato e determinístico para o
  oráculo do 503.
  - Com a cota esgotada, `esqueci-senha` responde **503 para o e-mail com conta e 200 para o sem conta**, sempre: o
    rollback desfaz também o registro do intervalo de 60 s.
  - Nenhum e-mail chega à vítima, então a enumeração fica silenciosa, no ritmo do limitador.
  - Prova no local: e-mail inexistente deu 200; o da vítima deu 503, e 503 de novo.
  - Depois da T65 (ACE-73), há também a faixa entre 80% e 100% da cota do dia: "esqueci a senha" de conta **não
    confirmada** (que agora conta nos 80% de cadastro) responde 503, e o de e-mail sem conta, 200. Isso revela que a
    conta existe e não está confirmada, só enquanto a cota está nessa faixa. O usuário aceitou o resíduo (T71),
    registrado no THREAT-MODEL 1a, linha da enumeração.
- **SEC-CA-10**: o `ip_hash` passou a ser o SHA-256 do /64 no IPv6. Segue sem sal, e o IPv4 continua reversível. Sem
  mudança de severidade.
- **SEC-CA-12**: a `conta_trocar_senha` foi redefinida na T61 e continua sem invalidar os links de recuperação
  pendentes. Sem mudança.
- SEC-CA-06 a 09 e 11: sem mudança.

### Veredito do reteste

**Sem crítico nem alto.** SEC-CA-01 e SEC-CA-03 estão fechados. SEC-CA-02 e SEC-CA-04 continuam médios, por causa do
Turnstile e do teto por conta adiados na T64. Os dois foram reduzidos: a cota já não passa do contratado, e o ataque
pela rotação dentro do /64 fechou. Há 2 baixos novos (SEC-CA-13 e 14). Pelo AD-012, os médios são pendência
obrigatória antes da liberação. Por isso, os dois resíduos pedem que o usuário decida: corrigir ou aceitar
formalmente (perguntas abaixo).

### Perguntas para o usuário (reteste)

1. **SEC-CA-02, resíduo da cota de e-mail (o AD-012 previa o Turnstile; a T64 o adiou).**
   - (a) Fazer agora o "esqueci a senha" de conta não confirmada gastar a cota de cadastro, mais um teto de envios por
     /48 **(Recomendado)**: fecha o consumo da reserva com pouca mudança e sem tela nova. A queda diária do cadastro
     continua possível.
   - (b) Turnstile no cadastro e no "esqueci a senha" antes da liberação: fecha o abuso automatizado. Mexe nas telas
     t04, t05 e t29 e põe uma dependência da Cloudflare.
   - (c) Aceitar e registrar no THREAT-MODEL: nada muda, e o domínio fica exposto a *bounces*.
2. **SEC-CA-04, força bruta a partir de muitos /64.**
   - (a) Teto suave por conta no login (50 falhas por hora, somando os IPs), com resposta de bloqueio curta
     **(Recomendado)**: segue o padrão da T61. Pode virar bloqueio remoto da conta, então o prazo tem de ser curto.
   - (b) Limitador adicional pelo /48 no `/api/sessao/entrar`: mudança pequena, que não pega quem tem vários /48 ou
     usa IPv4 de proxies.
   - (c) Aceitar e registrar no THREAT-MODEL o resíduo completo (força bruta numa conta e CPU, além do *spraying*).
3. **SEC-CA-13 e SEC-CA-14 (baixos novos).**
   - (a) Corrigir já o SEC-CA-13 (tempo máximo no `fetch` e `lock_timeout`) e deixar o SEC-CA-14 para a liberação
     **(Recomendado)**: duas linhas com teste. Tira o risco de a lentidão do Resend derrubar o app.
   - (b) Os dois entram como itens a decidir na liberação, junto com os SEC-CA-05 a 12.

## Correções do reteste (T65 a T68, AD-013)

O usuário escolheu, na fase 10, a opção (a) das três perguntas acima. As correções foram feitas sem Turnstile, com
defesas no servidor, e ainda **não foram reverificadas** pelo `auditor-seguranca` (o reteste delas cabe à próxima
validação).

| Achado | Situação | Correção | Commits |
| --- | --- | --- | --- |
| SEC-CA-02 | **Corrigido** (resíduo abaixo) | "Esqueci a senha" de conta não confirmada gasta a cota de cadastro (80%), e não a reserva da recuperação; teto de 20 pedidos de e-mail por hora por IPv4 ou /48 de IPv6, somando cadastro, reenvio, convite e "esqueci a senha", com 429 antes de reservar a cota (ACE-73) | `d0e4ea0` (T65), `a81d70a` (T66) |
| SEC-CA-04 | **Corrigido** (resíduo abaixo) | Teto suave por conta no login: 50 senhas erradas em 1 h para o mesmo e-mail, de quaisquer IPs, bloqueiam por 10 min, sem bcrypt e com a mesma resposta para e-mail sem conta (ACE-74) | `f309ad4` (T67) |
| SEC-CA-13 | **Corrigido** | `fetch` do Resend abortado aos 10 s (vira 503, sem gastar a cota) e `lock_timeout` de 2 s em `email_cota_reservar` (503 acima disso) (ACE-75) | `b1d4581` (T68) |
| SEC-CA-14 | **A decidir na liberação** | Sem mudança | — |
| SEC-CA-05 a 12 | **A decidir na liberação** | Sem mudança (o SEC-CA-05 segue agravado pelo teto da T63, como descrito acima) | — |

**Resíduos aceitos (AD-013), registrados no THREAT-MODEL 1a, linha D:**

- SEC-CA-02: quem tem muitos IPv4 ou muitos /48 (proxies, várias contas de *tunnel broker* ou de VPS) ainda esgota os
  80% de cadastro no dia, a 20 pedidos por hora por origem; a reserva de 20% para a recuperação de contas confirmadas
  fica protegida. Os *hard bounces* de endereços inventados continuam possíveis até o teto do dia.
- SEC-CA-04: força bruta lenta abaixo de 50 falhas por hora por conta (cerca de 50 tentativas por hora, mais 1 a cada
  10 min depois do bloqueio) e *password spraying* em muitas contas. O teto por conta pode ser usado para travar o
  login de uma vítima por 10 min de cada vez (bloqueio remoto curto, aceito em troca de não haver força bruta rápida).

## Segundo reteste (2026-10-28)

**Escopo**: só as correções dos achados que ficaram em aberto no primeiro reteste, commits `d0e4ea0..HEAD` (T65 a T71):
SEC-CA-02 (T65 e T66), SEC-CA-04 (T67 e T70) e SEC-CA-13 (T68). Os resíduos aceitos no AD-013 (oráculo na faixa de
80% a 100% da cota, força bruta lenta abaixo de 50 falhas por hora por conta, SEC-CA-14 e os baixos SEC-CA-05 a 12)
não são achados novos. Para eles, só se diz se algo piorou.
**Modo**: revisão do diff, consulta ao catálogo do banco local (`conta-e-acesso-seguranca-db-1`, banco `pelada`) e a
suíte do próprio projeto. Rodaram as 13 suítes tocadas (`conta-teto-emails-origem`, `conta-entrar-teto-conta`,
`conta-cota-trava`, `conta-esqueci-nao-confirmada`, `funcoes-definer`, `roles`, `rls`, `teto-emails-origem`,
`teto-emails-trava`, `entrar-teto-conta`, `teto-emails`, `chave-ip`, `email`): **211 de 211 verdes**.
**Limitação**: nesta rodada **não houve sondas HTTP**. O Worker local chegou a subir em `127.0.0.1:8798` e foi
encerrado sem receber nenhuma requisição. As conclusões vêm da leitura do código e das funções SQL, do catálogo e dos
testes automatizados. Não houve acesso à produção, à Cloudflare, ao Resend nem aos contêineres
`controleemcasa_ljs-banco-1` e `evolucao-segura-postgres`.
**Resíduo no banco local**: nenhum. Depois da rodada, `contas` tem 1 linha (a do seed), e `envios_email_dia`,
`pedidos_email_origem` e `tentativas_login` estão vazias.

### Resultado por achado

| Achado | Antes | Agora | Situação |
| --- | --- | --- | --- |
| SEC-CA-02 | Médio | — | **Fechado**, com o resíduo aceito no AD-013 |
| SEC-CA-04 | Médio | — | **Fechado** quanto à força bruta rápida. A regressão da correção virou o SEC-CA-15 |
| SEC-CA-13 | Baixo | — | **Fechado** |
| SEC-CA-15 (novo) | — | Médio | Em aberto: o bloqueio por conta pode ser mantido sem fim e não tem saída |
| SEC-CA-16 (novo) | — | Baixo | Em aberto: o teto por origem pune quem divide o IPv4 ou o /48 |

### SEC-CA-02: fechado (com o resíduo aceito)

- **Reserva da recuperação**: o "esqueci a senha" de conta não confirmada cai na categoria
  `recuperacao_nao_confirmada`, que usa o teto de 80% (`api/entrada/rotas/sessao-recuperacao.ts:27`,
  `api/entrada/enviar-email.ts:40`). A coluna `confirmada` vem de `link_pedir_com_confirmacao`
  (`mig/1792843920000_conta-esqueci-nao-confirmada.sql:9-44`). O ataque 2 do primeiro reteste (gastar os 20% com o
  "esqueci a senha" de contas próprias não confirmadas) fechou.
- **Teto por origem**: `limiteEmailsOrigem` (`api/entrada/middlewares/limite-emails-origem.ts:28-37`) vale para as
  4 rotas que chamam `enviarModelo` (`api/entrada/app.ts:48-53`). Conferi pelos chamadores: `admins.ts:42`,
  `conta-cadastro.ts:44` e `:67`, `sessao-recuperacao.ts:29`. Não há rota que envie e-mail fora da lista.
  - O registro roda **antes** da rota e numa transação própria, então o rollback do 503 não desfaz a contagem.
  - Os pedidos simultâneos de uma origem passam pela trava de `pg_advisory_xact_lock`, um de cada vez
    (`mig/1792843980000_conta-teto-emails-origem.sql:36`): não há corrida para passar do teto.
  - Middleware e rota usam o mesmo roteador do Hono. Por isso, variar o caminho (barra no fim, maiúsculas) não chega a
    uma rota que envie sem passar pelo teto.
- **Origem confiável**: a chave vem só de `CF-Connecting-IP` (`limite-emails-origem.ts:30`). O `X-Forwarded-For` é
  ignorado. Na borda, a Cloudflare sobrescreve esse cabeçalho (PREMISSA já usada no primeiro reteste e não verificada
  em produção nesta rodada). Só no local dá para forjá-lo.
- **Enumeração**: o 429 do teto não depende do e-mail, porque todo pedido conta antes de a rota rodar. Não há oráculo
  novo. O oráculo do 503 (SEC-CA-05) e a faixa de 80% a 100% continuam como foram aceitos e não pioraram.
- **Resíduo aceito, sem mudança**: quem tem muitos IPv4 ou muitos /48 ainda esgota os 80% do cadastro, e os *hard
  bounces* continuam possíveis até o teto do dia.

### SEC-CA-04: fechado quanto à força bruta rápida

- `conta_entrar` (`mig/1792844040000_conta-entrar-teto-conta.sql:58-72`) bloqueia o e-mail depois de 50 falhas em 1 h,
  de qualquer IP. O bloqueio vem antes do `crypt()` e vale igual para e-mail sem conta. A trava por e-mail (`:38`)
  avalia uma tentativa de cada vez, e os testes cobrem a corrida (`test/migracoes/conta-entrar-teto-conta.test.ts:170`).
- O e-mail é normalizado pelo contrato e por `lower(btrim())`. Uma variação do endereço não escapa da contagem, porque
  cai noutro e-mail, sem a senha da vítima.
- A força bruta a partir de muitos /64 fica limitada a cerca de 50 tentativas por hora por conta, que é o resíduo
  aceito. O efeito colateral está no SEC-CA-15.

### SEC-CA-13: fechado

- A função tem `lock_timeout=2s` (conferido no catálogo: `proconfig` de `email_cota_reservar`). O `55P03` vira `trava`
  e depois 503 (`api/infraestrutura/db/repositorios/cota-email.ts:18-26`). O `fetch` do Resend é abortado aos 10 s
  (`api/infraestrutura/email/resend.ts:25-61`). Os testes `teto-emails-trava.test.ts:25` e `email.test.ts` passam.
- **Derrubar envios legítimos pela trava**: para manter a linha do dia presa, o atacante precisa de envios em
  andamento. Ele fica limitado pelo teto por origem e, depois de 80% da cota, só segura a trava por milissegundos (o
  `teto` responde na hora). O efeito é pequeno e passageiro e não justifica achado novo.
- **Informativo**: se o Resend aceitar o e-mail mas responder depois de 10 s, o envio sai e a reserva é desfeita, e o
  contador do dia fica abaixo do real. Depende de o provedor estar lento e não está sob controle do atacante.

### SEC-CA-15 [MÉDIO, novo] O bloqueio de login por conta pode ser mantido sem fim, e a recuperação de senha não o desfaz

- **Onde**:
  - `mig/1792844040000_conta-entrar-teto-conta.sql:11-13` e `:58-72`: depois do bloqueio, cada nova falha bloqueia por
    mais 10 min enquanto houver 50 falhas na última hora. O próprio comentário da função diz isso.
  - `mig/1792843440000_conta-cadastro-e-links.sql:125-146`: `link_nova_senha` não limpa `tentativas_login` (só a
    exclusão de conta limpa) e **apaga todas as sessões** da conta.
- **Cenário** (sem conta, só com o e-mail da vítima):
  1. O atacante manda 50 senhas erradas de 10 /64 de um mesmo /48, ou de 10 IPv4. São 5 por par, abaixo do
     bloqueio por e-mail e IP e do limitador de 10 por minuto.
  2. A partir daí, a cada 10 min, uma falha logo depois de o bloqueio vencer renova o bloqueio. Quando as 50 falhas
     iniciais saem da janela de 1 h, uma nova rajada de cerca de 45 falhas recomeça o ciclo. O custo fica em cerca de
     50 requisições por hora, a partir de uma só máquina.
  3. A vítima recebe 429 mesmo com a senha certa. Se tentar o "esqueci a senha", define uma senha nova, **perde as
     sessões que tinha** e continua bloqueada no login. A única saída é acertar a brecha de segundos entre o fim do
     bloqueio e a falha seguinte.
- **Por que médio**: é uma negação de acesso contra uma conta escolhida, sem prazo, barata e sem pré-requisito além do
  e-mail. O alvo natural são os admins de um grupo (o e-mail aparece em convites). O AD-013 aceitou um "bloqueio remoto
  curto, 10 min de cada vez". A leitura do código mostra que ele é renovável sem fim e que a recuperação o agrava. Cabe
  ao usuário dizer se a aceitação cobre isso.
- **Prova**: leitura da função e do comentário dela. Os testes cobrem o bloqueio de 10 min
  (`conta-entrar-teto-conta.test.ts:104`), mas não a renovação nem a interação com a recuperação. Sem sondas HTTP
  nesta rodada.
- **Correção sugerida** (uma ou mais):
  - a nova senha pela recuperação (`link_nova_senha`) zerar as falhas do e-mail, porque quem tem a caixa de e-mail é o
    dono;
  - não renovar o bloqueio com falhas vindas durante ou logo depois dele (contar só falhas novas, exigir 50 novas);
  - deixar passar a senha certa vinda de um /64 que já entrou com sucesso nessa conta antes (dispositivo conhecido).

### SEC-CA-16 [BAIXO, novo] O teto de e-mails por origem pune quem divide o IPv4 ou o /48 com o atacante

- **Onde**: `api/infraestrutura/sessao/chave-ip.ts` (`chaveDoIp48`) e `limite-emails-origem.ts:30`.
- **Cenário**: operadoras móveis no Brasil usam CGNAT no IPv4 e podem dar /64 a aparelhos diferentes dentro do mesmo
  /48 (PREMISSA, não verificada). Quem está atrás da mesma origem esgota os 20 pedidos por hora dela, e quem divide essa
  origem recebe 429 no cadastro e no "esqueci a senha" por até 1 h. O uso legítimo concentrado (o Wi-Fi da quadra, que
  o runbook já cita) cai no mesmo teto.
- **Por que baixo**: o atacante não escolhe a vítima (só atinge quem divide a origem com ele), o efeito dura 1 h e o
  login não é afetado. O runbook (seção 10) já traz a saída operacional: subir `LIMITE_EMAILS_IP_HORA`.
- **Correção sugerida**: acompanhar os 429 do teto depois da liberação; se aparecerem falsos positivos, contar por /64
  dentro de um teto mais alto por /48.

### Permissões das funções e da tabela novas (conferido sem achado)

- `email_origem_registrar(bytea, integer)`: `SECURITY DEFINER`, `search_path = public, pg_temp`, `EXECUTE` só para
  `postgres` e `pelada_app`.
- `email_origem_registrar_em`: sem `SECURITY DEFINER` e sem `EXECUTE` para a `pelada_app`, então o momento não pode ser
  forjado.
- `conta_entrar`, `link_pedir` e `link_pedir_com_confirmacao`: `DEFINER`, com `search_path` fixo e grant só para a
  `pelada_app`.
- `pedidos_email_origem`: RLS com `FORCE`, uma única política (`SELECT` para `pelada_backup`), nenhum grant para a
  `pelada_app` e sem `USAGE` na sequência.
- A `pelada_app` não tem `CREATE` em `public`, então não há como sequestrar o `search_path`.
- O owner local é o `postgres` (superusuário). Em produção, o owner tem `bypassrls` (`wrangler.jsonc`), e as funções
  `DEFINER` passam pelo `FORCE`.

### Logs e dados pessoais

- Os logs novos levam só a categoria e o motivo (`enviar-email.ts:55-59`, `resend.ts:53`), sem IP, e-mail ou destino.
- `pedidos_email_origem` guarda o SHA-256 sem sal da origem por 1 h. O SEC-CA-10 vale também para essa tabela (o IPv4
  é reversível), sem mudança de severidade.

### O que mudou nos resíduos aceitos

- **SEC-CA-05**: sem mudança.
- **SEC-CA-14**: não piorou. A recuperação continua derrubando a sessão roubada (`link_nova_senha` apaga as sessões).
  Somada ao SEC-CA-15, porém, a vítima fica sem a sessão do invasor e sem a própria.
- **Força bruta lenta abaixo de 50 por hora por conta**: como foi aceita.

### Veredito do segundo reteste

**Sem crítico nem alto.** SEC-CA-02, SEC-CA-04 e SEC-CA-13 estão fechados nos termos do AD-013. A correção do SEC-CA-04
trouxe um **médio novo (SEC-CA-15)**: o bloqueio por conta, que deveria ser curto, pode ser mantido sem fim, e a
recuperação de senha não o desfaz. Há também um baixo novo (SEC-CA-16). Pelo AD-012, médio é pendência antes da
liberação: o usuário decide entre corrigir o SEC-CA-15 e estender a aceitação do AD-013 a ele.

### Correções depois do segundo reteste

| Achado | Situação | Correção | Commits |
| --- | --- | --- | --- |
| SEC-CA-15 | **Corrigido** (resíduo abaixo) | A nova senha pela recuperação (`link_nova_senha`) apaga as tentativas de login do e-mail da conta, na mesma transação em que troca a senha: o bloqueio por conta e o do par não sobrevivem à recuperação, e o dono entra com a senha nova (ACE-76). Link inválido não apaga nada, e as falhas de outro e-mail ficam | `a233d42` (T72) |
| SEC-CA-16 | **Aceito por ora, a decidir na liberação** | Sem mudança. Saída operacional já no runbook (seção 10): subir `LIMITE_EMAILS_IP_HORA` | — |

**Resíduos aceitos, registrados no THREAT-MODEL 1a, linha D:**

- SEC-CA-15: o bloqueio por conta continua renovável por quem manda cerca de 50 falhas por hora para o e-mail da
  vítima (a 2ª correção sugerida, não renovar com falhas novas, não foi feita). A saída agora existe: a recuperação de
  senha zera as falhas e o dono entra com a senha nova. O custo para a vítima é o "esqueci a senha" e a perda das
  sessões abertas (que a recuperação já derrubava, ACE-24); o atacante pode recomeçar o bloqueio depois.
- SEC-CA-16: quem divide o IPv4 ou o /48 com o atacante pode receber 429 no cadastro, no reenvio, no convite e no
  "esqueci a senha" por até 1 h; o login não é afetado. Acompanhar os 429 do teto depois da liberação.

## Terceiro reteste (2026-10-28)

**Escopo**: só a correção do SEC-CA-15, commit `a233d42` (T72): a migration
`mig/1792844160000_conta-nova-senha-zera-falhas.sql` e o teste `test/migracoes/conta-nova-senha-zera-falhas.test.ts`.
O `61dffdf` (T73) é só documentação. Os resíduos aceitos (oráculo na faixa de 80% a 100%, SEC-CA-14, SEC-CA-16 e os
baixos SEC-CA-05 a 12) não são achados novos.
**Modo**: leitura do código (migration, `conta_entrar`, rota `/api/sessao/nova-senha`, tela `NovaSenha.tsx`, limitador)
e consultas `SELECT` ao catálogo do banco local (`conta-e-acesso-seguranca-db-1`, banco `pelada`). Nesta rodada não
rodou nenhuma suíte nem sonda HTTP, o Worker não subiu e nenhum dado foi gravado. Ao fim, `tentativas_login` tinha 0
linhas e `contas` tinha 1, sem mudança. Não houve acesso à produção, à Cloudflare nem a outros contêineres.

### Resultado

| Achado | Antes | Agora | Situação |
| --- | --- | --- | --- |
| SEC-CA-15 | Médio | Baixo (resíduo) | **Fechado como médio**: a recuperação dá ao dono uma saída real. Fica uma corrida contra o atacante que reage (abaixo) |
| Novo | — | — | Nenhum achado novo. A correção não abriu caminho para zerar as falhas sem acesso à caixa de e-mail |

### O dono volta a entrar depois da recuperação?

- **Sim, contra o atacante que só renova o bloqueio no relógio.** `link_nova_senha` (`mig/1792844160000:18-33`) apaga
  todas as linhas de `tentativas_login` do e-mail na mesma transação em que troca a senha. Com isso somem o bloqueio da
  conta e o de todos os pares. Na consulta seguinte, `conta_entrar` (`mig/1792844040000:58-73`) não encontra 50 falhas
  e confere a senha nova. O teste `conta-nova-senha-zera-falhas.test.ts:88` cobre esse caminho.
- **Contra o atacante que sonda, a saída vira uma corrida, e o dono pode repeti-la.** O cenário original do SEC-CA-15
  já supõe um atacante automatizado ("uma falha logo depois de o bloqueio vencer").
  - Durante o bloqueio, as tentativas não são gravadas e respondem 429 com o código `bloqueadoTemporariamente`
    (`entrada/rotas/sessao.ts:26-32`), diferente do 429 do limitador.
  - Depois da recuperação, a próxima tentativa do atacante passa a responder 401. Esse é o sinal de que a vítima trocou
    a senha. O atacante então manda mais 49 falhas de cerca de 10 /64 (5 por par, `LIMITE_ENTRAR` de 10/min por /64) e
    volta a bloquear a conta.
  - A troca de senha não abre sessão: a rota responde "Entre com a nova senha" (`sessao-recuperacao.ts:40`) e a tela leva
    para `/entrar?aviso=senha-alterada` (`NovaSenha.tsx:75`). Ou seja, o dono precisa de um `conta_entrar` depois da
    troca, e esse pedido entra na mesma disputa.
  - A janela da vítima vai do commit da troca até a 50ª falha nova ser gravada. Ela soma o intervalo de sondagem do
    atacante e cerca de 50 bcrypt de custo 12 executados um depois do outro: a trava `pg_advisory_xact_lock('entrar|'
    || e-mail)` (`mig/1792844040000:38`) serializa as tentativas do mesmo e-mail, e a da vítima entra na mesma fila.
    PREMISSA, não medida: cerca de 200 a 300 ms por bcrypt no Neon, o que dá uma janela da ordem de 10 a 20 s.
  - Quem digita a senha à mão pode perder a corrida. Mesmo assim, cada nova recuperação abre outra janela, até o teto
    de 20 pedidos de e-mail por hora por origem.
- **Por que baixo**: antes da correção não havia saída, só a brecha de segundos, em momento imprevisível, entre o fim
  do bloqueio e a falha seguinte. Agora quem abre a janela é a vítima, que pode repeti-la, e para manter o bloqueio o
  atacante precisa ficar sondando sem parar (contra cerca de 50 requisições por hora antes). O registro no
  THREAT-MODEL ("o atacante pode recomeçar o bloqueio depois") cobre esse resíduo em espírito. Fica registrado que o
  "depois" pode ser questão de segundos e que o 401 avisa o atacante que a vítima trocou a senha.
- **Para fechar a corrida, se o usuário quiser** (decisão dele):
  - a nova senha pela recuperação abrir a sessão na hora, porque quem consumiu o link provou que tem a caixa de e-mail.
    Não é o caso do SEC-CA-01, em que o link de confirmação abria sessão sem que a pessoa tivesse definido a senha;
  - ou isentar do bloqueio por conta, por 1 h, o /64 que consumiu o link (o bloqueio do par continua valendo).

### (a) Alguém sem acesso ao e-mail consegue zerar o contador?

Não. O `DELETE` só roda depois do `UPDATE links_conta ... RETURNING`, e esse `UPDATE` exige um link do tipo
`recuperacao`, não usado e no prazo (`mig/1792844160000:18-23`).

- O token tem 32 bytes aleatórios e o banco guarda só o SHA-256 dele (`sessao/token.ts`). `token_hash` é único.
- O link chega só ao e-mail da conta. Conta não confirmada recebe o link no mesmo endereço (`link_pedir_com_confirmacao`).
  Por isso, quem cria uma conta com o e-mail da vítima e não confirma não recebe o link e não zera nada.
- Link vencido ou já usado: `false`, sem `DELETE`. O teste `conta-nova-senha-zera-falhas.test.ts:124` cobre esse caso.
- Maiúsculas e espaços: `contas.email` tem `CHECK (email = lower(btrim(email)))` (conferido no catálogo), e
  `conta_entrar` grava `lower(btrim(p_email))`. As duas formas batem, e o `DELETE` atinge só o e-mail da conta dona do
  link. Uma variação que normaliza para outro endereço é outro e-mail, com contador próprio, e não alcança a conta da
  vítima.
- O dono da caixa já é dono da conta, então zerar as falhas não dá a ele nada a mais. Cada recuperação devolve a
  terceiros 50 tentativas contra a senha **nova**, e só quando a vítima decide recuperar: a vantagem é desprezível.

### (b) O `DELETE` só acontece com a troca efetiva?

Sim. A ordem dentro da função é consumir o link, `RETURN false` se ele for inválido, `UPDATE contas`, apagar as sessões
e só então apagar as tentativas, tudo na mesma transação (`mig/1792844160000:18-33`). Se a conta não existir (o que não
deve acontecer, pela FK de `links_conta`), `v_email` fica nulo e o `DELETE` não apaga nada.

### (c) Corrida entre `conta_entrar` e `link_nova_senha`

`link_nova_senha` não pega a trava `entrar|<e-mail>`. Os efeitos são pequenos:

- Uma falha que `conta_entrar` gravou mas ainda não confirmou quando o `DELETE` roda continua na tabela. Como a trava
  por e-mail deixa só um `conta_entrar` em andamento por vez, sobra no máximo uma falha. Ela não chega perto de 50.
- Uma tentativa que começou antes do commit da troca pode ver as linhas antigas e responder `bloqueado`, ou conferir a
  senha antiga. É passageiro: a tentativa seguinte já vê o estado novo.
- **Informativo**: dá para haver *deadlock* entre o expurgo de linhas com mais de 24 h em `conta_entrar`
  (`mig/1792844040000:40`, sem filtro de e-mail) e o `DELETE` por e-mail de `link_nova_senha`. Isso só acontece se
  houver linhas com mais de 24 h desse e-mail, o que é raro, porque cada login apaga essas linhas. O Postgres desfaz
  uma das duas transações. Se for a da troca, o link não é consumido e a pessoa tenta de novo. O mesmo padrão já
  existia na exclusão de conta. Sem achado.

### (d) Permissões (conferido no catálogo, sem achado)

- `link_nova_senha(bytea, text)`: `SECURITY DEFINER`, `proconfig = search_path=public, pg_temp`, `EXECUTE` só para
  `postgres` e `pelada_app`. `PUBLIC` não tem `EXECUTE`. O corpo aplicado tem o `DELETE FROM tentativas_login`, e a
  migration `1792844160000` está registrada em `pgmigrations`.
- `tentativas_login`: RLS com `FORCE` e uma única política (`SELECT` para `pelada_backup`). A `pelada_app` não tem
  `SELECT` nem `DELETE` nela e não tem `CREATE` em `public`.
- Owner local `postgres` (superusuário). Em produção, o owner tem `bypassrls`, como já foi conferido no segundo reteste.

### (e) O que sobra de negação de acesso contra a vítima

- **Sumiu**: o bloqueio renovável **sem saída**. A recuperação zera o bloqueio da conta e o dos pares.
- **Fica** (resíduo baixo, acima): contra um atacante que sonda sem parar, cada recuperação abre uma janela da ordem de
  segundos, e a vítima perde as sessões abertas em cada troca (ACE-24, como antes).
- **Fica, sem mudança**: o atacante que divide o IPv4 com a vítima (CGNAT) pode esgotar o `LIMITE_ENTRAR` dela. Isso
  já existia antes do T72.
- O teste novo não cobre o atacante que volta a bloquear logo depois da recuperação. Essa cobertura só faz sentido
  junto com uma das correções sugeridas acima.

### Veredito do terceiro reteste

**Sem crítico, alto ou médio.** O SEC-CA-15 deixa de ser médio: a recuperação libera o login e não pode ser acionada
por quem não tem a caixa de e-mail. A correção não abriu brecha nova. Fica um resíduo **baixo**: contra um atacante
automatizado que sonda, a saída é uma corrida de segundos que o dono pode repetir. Fechá-la (a recuperação abrir a
sessão, ou isentar o /64 que consumiu o link) ou aceitá-la é decisão do usuário.
