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
