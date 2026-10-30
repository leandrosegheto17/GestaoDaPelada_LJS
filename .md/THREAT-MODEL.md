# THREAT-MODEL

Modelo de ameaças enxuto (STRIDE) do Pelada. Trazido do projeto anterior, onde foi atualizado na auditoria de release de 2026-10-22 (2ª), e revisado na fundação
(2026-10-25). A evidência das sondas daquela auditoria (`.md/.seguranca/`) ficou no repositório anterior, somente leitura;
as auditorias novas gravam em `.specs/seguranca/`. Requisitos de origem: `SDD.md` §7, `GUARDRAILS.md`.

## Atualização da fundação (2026-10-25)

Mudanças em relação à última auditoria do projeto anterior (2026-10-22). Evidência nova vem dos testes do repositório
(`GUARDRAILS.md` mapeia cada regra ao teste que a protege) e das auditorias das features seguintes.

| Tema | Mudança | Efeito no risco |
|---|---|---|
| Isolamento entre grupos | RLS com `FORCE` por `grupo_id`, runtime na role `pelada_app` sem bypass, contexto por transação (ADR-025). O owner do Neon (`pelada_owner`) tem `bypassrls` e nunca é origem do Hyperdrive | Reduz o vazamento entre grupos por filtro esquecido; novo risco: contexto vazar entre requisições pelo Hyperdrive (spike S1; testado) |
| Backup | Dump com `--enable-row-security` pela role `pelada_backup_ro`, com policy de leitura; a contagem restaurada é conferida contra a origem | Sem a policy, o dump com `FORCE` sai vazio com exit 0; o teste e o runbook cobrem |
| Host | Domínio próprio `gestaodapelada.ljssoftware.com.br` (ADR-028); HSTS de 1 ano nos assets | T-18 cai para baixa |
| Cabeçalhos | CSP, `nosniff`, `Referrer-Policy` e HSTS nos assets conferidos por e2e; nas respostas de `/api/*` só `nosniff` | Aceito: `/api/*` devolve só JSON, então CSP, Referrer-Policy e HSTS ficam nos assets (decisão de 2026-10-25) |
| Deploy | `deploy.yml` com `concurrency` sem cancelamento, `URL_PUBLICA` obrigatória, `wrangler deploy` único, rollback que não engole erro | Reduz deploy parcial |
| Monitoramento | Sentry no Worker e no front só com DSN e com remoção de corpo, cookies, `Authorization` e e-mails; UptimeRobot em `/api/health` (ação do usuário) | Detecta indisponibilidade; sem DSN o app funciona sem observabilidade |

## Ativos

| Ativo | Onde fica | Sensibilidade |
|---|---|---|
| Senha e sessão do dono e dos admins | `contas` (hash bcrypt via pgcrypto), `sessoes` (hash SHA-256), cookie `__Host-sessao` | Alta |
| Dados pessoais de jogador (telefone, ano de nascimento, notas, financeiro) | Neon (disco cifrado), só rotas de admin | Alta (LGPD) |
| Histórico do legado (57 jogadores, 231 rodadas) | Arquivo na máquina do operador; depois, Neon | Média |
| Credenciais de infraestrutura (`CLOUDFLARE_API_TOKEN`, `NEON_*`, `BACKUP_CHAVE`) | Secrets do ambiente `producao` no GitHub | Crítica |
| Credencial do banco da aplicação | Só na configuração do Hyperdrive | Crítica |
| Ranking público e PDF | `/api/publico/<slug>/*`, aberto por desenho (T-13, risco aceito) | Baixa (sem dado pessoal) |

## Fronteiras de confiança

Navegador (sem confiança) -> Worker Cloudflare (`/api/*` primeiro, assets estáticos) -> Hyperdrive (TLS) -> Neon.
Operador (máquina local, `NEON_URL_MIGRACAO` ou `NEON_URL_DEV` próprias, ADR-032) -> Neon por script. GitHub Actions (ambiente `producao`) -> Cloudflare e Neon.

## STRIDE por superfície

### 1. Login do dono/admin (`/api/sessao/*`)

| Ameaça | Controle | Evidência desta auditoria |
|---|---|---|
| S: força bruta e enumeração de e-mail | Bloqueio 5 falhas/15 min por e-mail, hash fixo para e-mail inexistente, mesma mensagem; limitador `LIMITE_ENTRAR` (10/min) | Sonda "login errado: mensagem genérica" 401 sem eco do e-mail; limitador só existe publicado (ver abaixo) |
| T: CSRF | `SameSite=Lax`, JSON e cabeçalho `X-Pelada: 1` em toda escrita | Sonda: POST sem `X-Pelada` -> 403 |
| R: negar autoria | Auditoria de escritas (RNF-12) | Revisão por tarefa |
| I: vazamento em erro | Mensagens genéricas, 500 sem detalhe | Sondas: corpo malformado e SQLi -> 422/401 sem stack, SQL nem caminho |
| D: custo do bcrypt | Limitador por IP + bloqueio por e-mail | Só verificável em ambiente publicado |
| E: sessão roubada | Cookie `HttpOnly; Secure; SameSite=Lax; Path=/`, sem `Domain`, hash no banco, logout encerra | `Set-Cookie` conferido no login |

### 1a. Conta e acesso: cadastro, confirmação, recuperação, exclusão e convites (`/api/conta/*`, `/api/sessao/*`, `/api/convites/*`, `/api/grupos/:grupoId/admins/*`)

Entra com a feature `conta-e-acesso` (2026-10-27). As funções que acham uma conta sem sessão são `SECURITY DEFINER` e o
`pelada_app` nunca lê o hash de senha (ADR-029).

| Ameaça | Controle | Evidência |
|---|---|---|
| S: enumeração de e-mail no cadastro, na recuperação e no reenvio | Mesma resposta para e-mail novo e e-mail que já tem conta (ACE-04); mesma mensagem de login para e-mail inexistente e senha errada (ACE-11); `email_nao_confirmado` só com a senha certa. **Risco residual aceito (ACE-73, T71):** com o total de e-mails do dia entre 80% e 100% de `LIMITE_EMAILS_DIA`, "esqueci a senha" responde 503 `email_indisponivel` para conta não confirmada (que conta na cota de cadastro) e 200 para e-mail sem conta, o que revela, só nessa faixa, que a conta existe e não está confirmada. Aceito por ser consequência direta do ACE-73 e exigir a cota nessa faixa (SEC-CA-05) | `backend/api/test/rotas/conta-cadastro.test.ts`, `backend/api/test/rotas/sessao.test.ts`, `backend/api/test/rotas/sessao-recuperacao.test.ts` |
| S/E: token de link roubado ou reaproveitado | Token de 32 bytes no fragmento da URL (`#t=`), que não vai ao servidor nem ao `Referer`; o banco guarda só o SHA-256; uso único; validade de 24 h (confirmação), 1 h (recuperação) e 7 dias (convite); o front apaga o fragmento depois de ler (AD-010) | `backend/api/test/infraestrutura/token.test.ts`, `backend/api/test/repositorios/links.test.ts`, `frontend/web/src/dados/fragmento.test.ts` |
| S: convite aceito pela pessoa errada | O convite só vale para o e-mail convidado; outra conta recebe 403 `convite_de_outro_email` e nada é criado (ACE-35); convite usado, cancelado ou vencido responde 410 | `backend/api/test/rotas/convites.test.ts`, `backend/api/test/repositorios/convites.test.ts` |
| T: CSRF e escrita cruzada | `X-Pelada: 1` em toda escrita, `SameSite=Lax`; admin só vê e altera o grupo em que tem vínculo (404 no resto) | `backend/api/test/rotas/app.test.ts`, `backend/api/test/rotas/vinculo-middleware.test.ts`, `backend/api/test/isolamento/` |
| R: negar autoria de exclusão e convite | A auditoria é gravada pelas próprias funções do banco, não pelas rotas | `backend/api/test/migracoes/conta-senha-e-exclusao.test.ts`, `backend/api/test/migracoes/conta-convites.test.ts` |
| I: senha ou token em log, resposta ou erro | Nenhum log traz senha ou token (ACE-21, G-08); o hash só existe no banco; e-mail do convite só leva o link | `backend/api/test/rotas/sessao.test.ts`, `backend/api/test/rotas/conta-minha.test.ts` |
| D: bombardeio de e-mails e custo do bcrypt | Todas as rotas sem sessão, mais `/api/conta/senha` e `/api/conta/excluir`, passam pelo `LIMITE_ENTRAR` (10/min por IP, ACE-50, ACE-70); 5 falhas por e-mail e IP bloqueiam o login por 15 min (ACE-13); 5 falhas da senha atual por conta bloqueiam a troca de senha e a exclusão por 15 min, sem rodar o bcrypt (ACE-70); no IPv6 a chave do limitador e do `ip_hash` é o prefixo /64 (ACE-71); teto diário de e-mails de `LIMITE_EMAILS_DIA` (padrão 100), com cadastro, reenvio e convite parando em 80% e a recuperação de senha de conta confirmada usando a cota inteira (ACE-72); o "esqueci a senha" de conta não confirmada conta nos 80% (ACE-73); no máximo 20 pedidos de e-mail por hora por IPv4 ou /48 de IPv6, com 429 antes de reservar a cota (`LIMITE_EMAILS_IP_HORA`, ACE-73); 50 senhas erradas em 1 h para o mesmo e-mail, de quaisquer IPs, bloqueiam o login dele por 10 min, sem bcrypt e com a mesma resposta para e-mail sem conta (ACE-74); a nova senha pela recuperação apaga as falhas de login do e-mail e libera o login (ACE-76); o envio ao Resend aborta aos 10 s e a reserva da cota espera no máximo 2 s pela trava (ACE-75); a cota esgotada vira 503 `email_indisponivel` (ACE-52), sem derrubar a rota. **Adiado:** o desafio anti-robô (Turnstile) fica fora desta rodada (AD-013). **Riscos residuais aceitos:** *password spraying* distribuído (muitas contas, poucas tentativas por conta e por IP); força bruta lenta contra uma conta abaixo de 50 falhas por hora; o teto por conta permite travar o login de uma vítima por 10 min de cada vez, e o bloqueio é renovável enquanto o atacante mantiver 50 falhas por hora para o e-mail (cerca de 50 requisições por hora); a saída é a recuperação de senha, que zera as falhas, com a perda das sessões abertas (SEC-CA-15); quem tem muitos IPv4 ou muitos /48 (proxies, *tunnel brokers*, VPS) ainda esgota os 80% de cadastro do dia, com até 80 *bounces* de endereços inventados por dia contra a reputação do domínio no Resend; o teto de 20 e-mails por hora por origem (`LIMITE_EMAILS_IP_HORA`) é compartilhado por quem divide o IPv4 (CGNAT) ou o /48, que pode receber 429 no cadastro e no "esqueci a senha" por até 1 h por causa de outra pessoa (SEC-CA-16, aceito por ora e a decidir na liberação). Revisar se o monitoramento mostrar picos de 401 em `/api/sessao/entrar` ou de 503 nas rotas de e-mail | `backend/api/test/rotas/limite-taxa.test.ts`, `backend/api/test/rotas/sessao.test.ts`, `backend/api/test/rotas/sessao-middleware.test.ts`, `backend/api/test/migracoes/conta-senha-bloqueio.test.ts`, `backend/api/test/infraestrutura/chave-ip.test.ts`, `backend/api/test/rotas/teto-emails.test.ts`, `backend/api/test/rotas/teto-emails-origem.test.ts`, `backend/api/test/migracoes/conta-teto-emails-origem.test.ts`, `backend/api/test/migracoes/conta-entrar-teto-conta.test.ts`, `backend/api/test/migracoes/conta-nova-senha-zera-falhas.test.ts`, `backend/api/test/rotas/entrar-teto-conta.test.ts`, `backend/api/test/migracoes/conta-cota-trava.test.ts`, `backend/api/test/rotas/teto-emails-trava.test.ts`, `backend/api/test/infraestrutura/email.test.ts` |
| E: sessões antigas depois de trocar a senha ou excluir a conta | Trocar a senha encerra as sessões dos outros aparelhos e mantém a atual (ACE-26); a recuperação por link encerra todas (ACE-24); excluir a conta exige a senha e encerra todas (ACE-28, ACE-69) | `backend/api/test/rotas/conta-minha.test.ts`, `backend/api/test/rotas/sessao-recuperacao.test.ts` |
| E: virar dono por uma rota | Só `backend/scripts/dono.ts` define o papel de dono; nenhuma rota lê ou escreve `e_dono` (ACE-63, G-11) | `backend/scripts/test/dono.test.ts`, regra ESLint `pelada/sem-escrita-dono` |
| I/E: caixa de e-mail de desenvolvimento em produção | `GET /api/dev/emails` só responde com `EMAIL_DEV=1`, que nunca existe em produção; fora disso é 404 | `backend/api/test/rotas/dev-emails.test.ts` |

### 2. Ranking público sem login (`/api/publico/*`)

| Ameaça | Controle | Evidência |
|---|---|---|
| I: dado pessoal na projeção | Esquema estrito de resposta + teste de campos proibidos | Ranking local sem telefone, ano de nascimento, nota, nível, financeiro, e-mail |
| I: enumeração de slug | Risco aceito pelo usuário (T-13); 404 igual para inexistente e arquivado; limitador `LIMITE_PUBLICO` (60/min) | 404 uniforme; limitador só publicado |
| T/E: escrita anônima | Só `POST eventos`, união discriminada estrita (2 tipos) | Tipo inválido e campo extra -> 422 |
| D: varredura | Limitador por IP | Ver acima |
| I: totais por período do jogador (regra "quem saiu e voltou recomeça a contagem no retorno", RTP-0207/0211) | Cálculo puro no domínio (`inicioDoPeriodo`, `periodoDoMes`); a projeção pública segue estrita e não expõe períodos | 2ª auditoria de 2026-10-22: 107 sondas autenticadas de reativar/corrigir retorno com ranking e PDF de 6 variações de `mes` a cada mudança: sem 5xx, sem e-mail/telefone/períodos, sem apelido do outro grupo; 429 uniforme com `no-store` e `nosniff` observado localmente no `LIMITE_PUBLICO` |

### 3. Rotas de admin e do dono (`/api/grupos/*`, `/api/dono/*`)

| Ameaça | Controle | Evidência |
|---|---|---|
| E: acesso sem sessão | Sessão em toda rota | 11 sondas sem cookie -> 401; cookie forjado -> 401 |
| E: admin de um grupo no outro | Middleware de vínculo + repositório com `grupoId` + suíte de isolamento; 404 | Admin da quinta em 6 rotas do grupo do domingo -> 404 (e o inverso); admin comum em `/api/dono/*` -> 404 |
| T: entrada inválida | Esquema estrito do contrato no servidor | `pontuacaoInicial` fora de 0 a 9999, posição inexistente, campo extra, peso fora de -10 a 10 -> 422 |
| I: financeiro sem permissão | 403 sem `acessa_financeiro` | Testes do QA (TP-0205) |
| E/T: data de início da pontuação (TP-0209): `POST …/jogadores/:id/inicio/previa` e `PUT …/jogadores/:id/inicio` | Mesma guarda de admin vinculado (sessão, `X-Pelada`, escopo completo, 404 fora do grupo), corpo estrito `{ data }` com data de calendário, `>= 2000-01-01` (`PISO_INICIO`) e `<= hoje` (servidor), transação com trava da linha e auditoria `jogador_inicio_alterado` (datas e acumulados, sem dado pessoal) | 71 sondas autenticadas (`sondas-autenticadas.py`, 2 grupos e 3 contas), 0 falhas: sem cookie/forjado 401, sem `X-Pelada` 403, senha temporária 403, grupo/jogador alheio e id inválido 404, formato/futura/campo extra/tipo/SQLi/corpo malformado 422, 1 MB 413. **Piso conferido:** `0000-01-01`, `0001-01-01` e `1900-01-01` agora 422 (antes: 500 e aceita); fecha o RTP-0185 |
| E/T/I: períodos do jogador (lote TP-0210 a TP-0231): `GET …/jogadores/:id/periodos`, `PUT …/jogadores/:id/periodos/:periodoId` (corrigir saída e/ou retorno), `POST …/periodos/:periodoId/previa`, `POST …/jogadores/:id/reativar/previa` e `POST …/jogadores/:id/reativar` com `dataRetorno` opcional | Mesma guarda de admin vinculado; `uuidDaRota` em `id` e `periodoId` (não UUID = 404); todas as consultas e o `UPDATE periodos_ativos` filtram por `periodo`, `jogador` **e** `grupo_id` (período de outro jogador ou grupo = 404); corpo estrito (`saida`/`retorno`/`dataRetorno` são `data`, ao menos um, campo extra recusado); `<= hoje` no servidor; regra de domínio única para a prévia e a gravação (`avaliarPedidoDePeriodos`), que devolve 422 por campo com texto fixo (sem eco do valor); correção e reativar retroativo em `emTransacao` com `jogadores.travar` antes da escrita e `auditoria.registrar` (datas, acumulado e posição, sem apelido, telefone nem e-mail); constraints `periodo_fim_depois_inicio` e `periodos_um_aberto` viram 422/409 sem mensagem do banco; prévias só leem; resposta da listagem tem só `id`, `tipo`, `inicio`, `fim`, `corrigivel`; G-26 (proposta) com checagem `checar-escrita-periodo.mjs` no CI | 225 sondas autenticadas (`sondas-autenticadas-periodos.py`, 2 grupos e 3 contas), 0 falhas: sem cookie/forjado 401, sem `X-Pelada` 403, senha temporária 403, admin do outro grupo e par cruzado 404, período de outro jogador do mesmo grupo 404, id/período não UUID e SQLi 404, jogador ativo 409; datas `01/09/2026`, 30/02, mês 13, dia 00, futura, amanhã, `9999-12-31`, `0000-01-01`, `0001-01-01`, `1900-01-01`, `1999-12-31`, SQLi, hora, vazia, espaços, unicode e script: 422 em todas (nenhuma 5xx); tipo errado (número/null/array/objeto/booleano), campo extra, corpo array, JSON malformado, corpo vazio: 422; 1 MB: 413; verbos errados 404/405; caminho feliz: prévias 200 sem gravar, correção com data igual `alterado:false`, reativar retroativo 200 e depois 409, correção real de retorno 200 (duas) com auditoria só com datas e números; mais 35 sondas sem credencial no `sondas.json` (401/403/422) |

### 4. Importação do legado por script (ADR-021)

| Ameaça | Controle |
|---|---|
| T: gravar no banco errado | `exigirHostPermitido` (G-21) e a validação única da URL do Neon (ADR-032), `NEON_URL_*` só do ambiente do operador, confirmação de backup digitada |
| I: dado pessoal do legado no repositório ou no log | Telefone nunca lido; só o ano de nascimento; log só com contagens; arquivo de entrada fora do repositório (ver débito: `.gitignore` não cobre o arquivo do legado) |
| T: carga parcial ou repetida | Transação única; recusa se o grupo já tem partida ou apelido repetido |
| E: uso por agente em produção | A execução em produção é do usuário (ADR-021 item 6) |

### 5. PDF (`/api/publico/<slug>/pdf`)

| Ameaça | Controle |
|---|---|
| I: dado pessoal no PDF | Mesma projeção pública do ranking (RF-33) |
| T: injeção em nome/slug | Slug validado; apelido é texto, sem HTML |
| D: geração pesada | Limitador público; mês validado |

### 6. Hyperdrive / Neon

| Ameaça | Controle |
|---|---|
| I: credencial do banco no Worker | Só o binding `HYPERDRIVE`; `localConnectionString` do `wrangler.jsonc` é só a de desenvolvimento local |
| I: cache de resposta com dado de outro grupo | Cache do Hyperdrive desligado (G-17), conferido no `deploy.yml` antes de publicar |
| T/I: Neon exposto | Não exposto ao navegador; TLS |
| R: perda de dado na migração | Dump cifrado antes de migrar (ADR-030) |
| T/R: migração que contrai o esquema (`202610210000_contrai_posicao`: converte `defensor`/`meio_campo` e recria o CHECK de posição) | Roda depois do dump cifrado do `deploy.yml`; `UPDATE` antes do `DROP/ADD CONSTRAINT` na mesma migração; `checar-migracao-aditiva` aceita a contração prevista em `QUEBRAS.md`. Conferido no banco de desenvolvimento: CHECK com as 7 posições e 0 linhas com posição antiga |

### 7. `deploy.yml` e CI

| Ameaça | Controle | Situação |
|---|---|---|
| S/E: deploy por quem não deve | `workflow_dispatch` manual, `environment: producao`, branch policy só `main` (RTP-0163) | OK |
| I: segredo no workflow | Todos via `${{ secrets.* }}`; nenhum literal | OK (conferido) |
| E: token amplo | `permissions: contents: read`; token Cloudflare com escopo mínimo | OK |
| T: cadeia de suprimentos | Ações do GitHub fixadas por SHA de 40 caracteres; pnpm com `blockExoticSubdeps`, `minimumReleaseAge` e `trustPolicy` | OK (2ª auditoria: grep sem `uses:` por tag; semgrep sem `mutable-action-tag`); resta RTP-0176 (Baixo) |
| I: dump com dado pessoal | Cifrado com `age` (só a chave pública no GitHub; a identidade privada fora dele), artefato por 30 dias, sem artefato parcial em falha | OK |

## Riscos aceitos (do usuário)

T-13 (enumeração de slug) e sem criptografia por campo na Fase 1. A ausência de RLS deixou de ser risco aceito: a fundação adiciona a RLS com `FORCE` (ADR-025).

## Débitos de segurança abertos nesta auditoria

Resolvidos na 2ª auditoria de 2026-10-20 (RTP-0169 a 0175): nosniff em `/api/*` (30 sondas com o cabeçalho exigido em 200/401/403/404/422), ações do GitHub por SHA, `.gitignore` do legado.

0. ~~Data de início sem limite inferior (RTP-0185)~~ **RESOLVIDO** em 2026-10-22: piso `2000-01-01`; `0000-01-01`, `0001-01-01` e `1900-01-01` respondem 422 (71 sondas).
1. `pnpm-missing-minimum-release-age` ainda acusado pelo semgrep (RTP-0176). Baixo.
2. `braces@3.0.3` dev-only (GHSA-vfj7-8cjw-p6xm), sem versão corrigida. Baixo, monitorado.
3. Verificação do limite de taxa e dos cabeçalhos no host publicado: obrigatória após o deploy (não aplicável ao ambiente local; sem staging, ADR-020 e ADR-028).
4. `deepmerge` (GHSA-gcqx-w48m-w2h4, poluição de protótipo), só de build: `frontend/web > vite-plugin-pwa > workbox-build > @rollup/plugin-node-resolve > deepmerge`, sem versão corrigida. Não vai para o bundle nem para o Worker. Baixo, monitorado como o `braces` (SEC-010 da auditoria da `grupos-e-elenco`, 2026-10-30). **Dono:** `partidas-e-ranking` (feature seguinte), que reavalia o `pnpm audit` na própria auditoria.
5. Regra ESLint `pelada/sem-escrita-periodo` escrita em `eslint/plugin-pelada.mjs`, mas não ligada no `eslint.config.mjs` (I-1 da auditoria da `grupos-e-elenco`). A proteção efetiva da G-26 hoje é `backend/scripts/checagens/checar-escritores-periodo.mjs`, no CI. Baixo. **Dono:** `partidas-e-ranking` (feature seguinte, a primeira a escrever presenças ao lado dos períodos): ligar a regra, com teste, ou retirá-la da G-26.
6. O ramo público de `grupos_visiveis()` (`1792844280000_grupos-visiveis-arquivado.sql`) ainda mostra o grupo arquivado pelo slug (I-3 da auditoria da `grupos-e-elenco`; o design deixou a página "Grupo indisponível" para a feature seguinte). Baixo enquanto não há rota pública. **Dono:** `partidas-e-ranking` (feature seguinte): filtrar `arquivado_em` no ramo público, com teste, antes de publicar o ranking.
