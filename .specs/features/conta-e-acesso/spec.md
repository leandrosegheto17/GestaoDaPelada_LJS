# Conta e acesso — Especificação

> Feature 2 de 8 (AD-001). **Spec aprovada pelo usuário em 2026-10-26.** Entrada: `.specs/produto/decisao.md` (entrada do MVP), `.specs/produto/analise-legado.md`
> (§8, D1 e D7), `.specs/features/fundacao/design.md` (C3, C4) e as pendências que a fundação deixou para esta feature
> (`.md/GUARDRAILS.md` G-02 a G-04, G-08, G-09, G-11, G-20; ADR-025; `seguranca.md` SEC-005 e SEC-006). Decisões das
> áreas cinzentas em `context.md`.

## Problem Statement

O app novo está publicado, mas ninguém consegue entrar: não existe rota de sessão, as tabelas de conta estão sem grant
para o runtime e a conta do seed tem um hash inválido. No legado não havia cadastro aberto, e a recuperação de senha
dependia do dono da plataforma. O padrão LJS e a decisão D1 pedem que qualquer organizador crie a própria conta,
recupere a senha sozinho por e-mail e convide outros admins para o grupo. Sem esta feature, nenhuma das features
seguintes (grupos, partidas, ranking, cobrança) tem quem as use.

## Goals

- [ ] Uma pessoa sem conta se cadastra, confirma o e-mail e entra no app em `/app`, sem ajuda de ninguém.
- [ ] Quem esqueceu a senha cria uma nova pelo link recebido por e-mail, sem o dono da plataforma.
- [ ] Um admin convida outra pessoa por e-mail, e ela passa a administrar o grupo ao aceitar o convite.
- [ ] A conta da sessão só lê e altera os próprios dados de conta, e o teste de isolamento prova isso no banco.
- [ ] As contas que já existem no banco de produção (grupo de teste) continuam entrando com a senha atual.

## Out of Scope

| Feature | Reason |
| ----------- | -------------- |
| Criar, editar e arquivar grupo; jogadores e o resto do elenco | Feature `grupos-e-elenco`. Aqui a lista de grupos só mostra os vínculos que já existem |
| Planos, trial, Meu plano, Asaas e landing com preços | Feature `planos-e-cobranca` |
| Web Push e e-mails de cobrança | Feature `notificacoes`. Aqui entram só os e-mails de conta (confirmação, recuperação, convite) |
| Telas da área `/dono` (painel, pedidos de reset, redefinir senha de terceiros, criar e arquivar grupo) | Decisão das áreas cinzentas: o dono é só um papel de suporte (D1) e a recuperação passa a ser por e-mail |
| Troca de e-mail da conta | Não existe no legado nem no padrão LJS; exige reconfirmação. Fica para depois do MVP |
| Login social, 2FA, "lembrar-me" | Fora do padrão LJS; a sessão segue D7 |
| Admin de vários grupos com permissões diferentes por grupo além do `acessa_financeiro` | Fora do MVP (`decisao.md`) |
| Restringir a leitura pública do slug e o `acessa_financeiro` na RLS (SEC-003) | Feature `financeiro` e `partidas-e-ranking`, que criam as rotas dessas tabelas |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | --------------- | --------- | ---------- |
| E-mail nesta feature | O envio transacional pelo Resend (`RESEND_API_KEY`, `RESEND_REMETENTE`) entra aqui, só para confirmação, recuperação e convite. Em dev e teste, um remetente falso guarda as mensagens em memória | Cadastro com confirmação e recuperação por e-mail não funcionam sem envio. A `notificacoes` reaproveita o mesmo remetente | y |
| Convite de admin | Convite por link enviado por e-mail, com validade de 7 dias e uso único. Quem não tem conta se cadastra pelo próprio link. A senha temporária do legado deixa de ser usada | Com cadastro aberto, ninguém precisa escolher a senha de outra pessoa | y |
| Área do dono | Sem telas. O dono é criado e recuperado só pelo script `backend/scripts/dono.ts` (G-11). Nenhuma rota lê ou escreve `e_dono` | D1: dono só como papel de suporte. Com recuperação por e-mail, a fila de pedidos de reset perde a razão de existir | y |
| Exclusão de conta | Imediata, depois de digitar a senha. Recusada enquanto a conta for a única admin de algum grupo não arquivado; a tela lista esses grupos | Excluir o único admin deixaria o grupo sem dono, e apagar grupos junto destruiria dados de outras pessoas (jogadores, histórico) | y |
| Termos e privacidade | Páginas públicas `/termos` e `/privacidade`. Texto redigido pelo agente e marcado como rascunho para revisão do usuário. O aceite é obrigatório no cadastro e grava a data e a versão do texto | Exigência do padrão LJS e da LGPD. Não é parecer jurídico | y |
| Nome do cookie | `__Host-sessao`, como manda o G-09 (o padrão LJS sugeria `__Host-sid`) | O guardrail é inegociável e já está em vigor | y |
| Duração da sessão | 15 min de inatividade e 12 h absolutas desde o login | D7 | y |
| Senha | De 8 a 72 caracteres, até 72 bytes em UTF-8, hash bcrypt de custo 12 no Postgres | G-08 e o legado | y |
| Bloqueio por falhas (SEC-006) | 5 falhas do mesmo e-mail **a partir do mesmo IP** em 15 min bloqueiam esse par por 15 min. Falhas vindas de outros IPs não bloqueiam quem tenta de um IP sem falhas | Mantém a proteção do legado contra força bruta de um IP e impede que alguém tranque o dono (ou qualquer conta) de longe. O limite por IP (`LIMITE_ENTRAR`) continua valendo | y |
| CHECK do e-mail do dono no schema (SEC-006) | Mantido. A mitigação é o bloqueio por e-mail e IP acima | Trocar o CHECK exige migration de contração e não esconde o e-mail que já está no histórico do git | y |
| Ordem dos middlewares (SEC-005) | A checagem do `X-Pelada` vem antes dos limitadores de taxa | Requisição de terceiros sem o cabeçalho não gasta a cota do IP | y |
| Contas que já existem | Toda conta existente no momento da migration é considerada com e-mail confirmado e mantém o hash atual | O grupo de teste continua valendo (D5, D6) e o hash do legado é bcrypt de custo 12, o mesmo formato | y |
| Colunas `senha_temporaria`, escopo `troca_de_senha` e tabela `pedidos_reset` | Ficam no schema sem uso (migração aditiva, G-14). Nenhuma rota nova grava nelas | Remover exige contração num deploy seguinte; não há ganho agora | y |
| Cadastro com e-mail já existente | Mesma resposta de sucesso do cadastro novo; a pessoa dona do e-mail recebe um aviso de que alguém tentou criar uma conta com ele | Não revela quais e-mails têm conta | y |
| Validade dos links | Confirmação: 24 h. Recuperação: 1 h, uso único. Convite: 7 dias, uso único. Pedir um link novo invalida o anterior do mesmo tipo | Prazos usuais; recuperação curta porque dá acesso à conta | y |
| Intervalo entre e-mails | No máximo 1 e-mail do mesmo tipo para o mesmo endereço a cada 60 s; o pedido dentro do intervalo recebe a mesma resposta de sucesso, sem novo envio | Evita usar o app para inundar a caixa de alguém | y |
| Ritmo da discussão | Rápido, com as sugestões do agente aceitas em todas as áreas | Decisão do usuário em 2026-10-26 | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Cadastro com confirmação de e-mail ⭐ MVP

**User Story**: Como organizador de pelada, quero criar minha conta com nome, e-mail e senha, para usar o app sem
depender de ninguém.

**Why P1**: Sem cadastro aberto, o produto não tem usuário novo (D1).

**Acceptance Criteria**:

1. WHEN a pessoa envia `POST /api/conta` com nome (2 a 60 caracteres), e-mail válido (até 254), senha válida e o aceite dos termos THEN o sistema SHALL criar a conta sem e-mail confirmado, gravar a data e a versão dos termos aceitos, enviar o e-mail de confirmação e responder 201 com a mensagem "Enviamos um link de confirmação para o seu e-mail". [ACE-01]
2. IF o cadastro chega sem o aceite dos termos THEN o sistema SHALL responder 422 com o código `termos_obrigatorios` e não criar a conta. [ACE-02]
3. IF o nome, o e-mail ou a senha estão fora dos limites THEN o sistema SHALL responder 422 com o campo inválido no corpo e não criar a conta. [ACE-03]
4. IF o e-mail do cadastro já pertence a uma conta THEN o sistema SHALL responder exatamente como no cadastro novo (201, mesma mensagem), não alterar a conta existente e enviar ao dono do e-mail o aviso de tentativa de cadastro. [ACE-04]
5. The sistema SHALL guardar o e-mail em minúsculas e sem espaços nas pontas, e tratar como iguais e-mails que só diferem nisso. [ACE-05]
6. WHEN a pessoa abre o link de confirmação dentro de 24 h THEN o sistema SHALL marcar o e-mail como confirmado, abrir uma sessão e levar a pessoa para `/app`. [ACE-06]
7. IF o link de confirmação está vencido, já foi usado ou não existe THEN o sistema SHALL mostrar a tela "Link inválido ou vencido" com a ação de pedir um novo link, sem abrir sessão. [ACE-07]
8. WHEN a pessoa pede um novo link de confirmação THEN o sistema SHALL invalidar o link anterior e enviar um novo, respondendo com a mesma mensagem de sucesso exista ou não a conta. [ACE-08]

**Independent Test**: num banco local vazio, cadastrar pela tela, abrir o link capturado pelo remetente falso e chegar a
`/app` logado.

---

### P1: Entrar e sair ⭐ MVP

**User Story**: Como admin, quero entrar com e-mail e senha e sair quando terminar, para usar o app no celular à beira
do campo com segurança.

**Why P1**: Toda rota de grupo depende de uma sessão.

**Acceptance Criteria**:

1. WHEN a pessoa envia `POST /api/sessao/entrar` com e-mail e senha corretos de uma conta confirmada THEN o sistema SHALL criar uma sessão com token novo, responder 200 com nome e e-mail da conta e enviar o cookie `__Host-sessao` com `HttpOnly; Secure; SameSite=Lax; Path=/` e sem `Domain`. [ACE-09]
2. The banco SHALL guardar só o SHA-256 do token da sessão, nunca o token. [ACE-10]
3. IF o e-mail não existe ou a senha está errada THEN o sistema SHALL responder 401 com o código `credenciais_invalidas`, com a mesma mensagem nos dois casos. [ACE-11]
4. IF a senha está certa e o e-mail da conta não foi confirmado THEN o sistema SHALL responder 403 com o código `email_nao_confirmado`, sem criar sessão, e a tela SHALL oferecer reenviar o link de confirmação. [ACE-12]
5. IF houve 5 falhas do mesmo e-mail a partir do mesmo IP nos últimos 15 min THEN o sistema SHALL responder 429 com o código `bloqueado_temporariamente` a qualquer tentativa desse par, mesmo com a senha certa, até 15 min depois da quinta falha. [ACE-13]
6. WHILE um e-mail está bloqueado para um IP, uma tentativa do mesmo e-mail vinda de outro IP sem falhas recentes SHALL ser avaliada normalmente. [ACE-14]
7. WHEN a sessão fica 15 min sem requisição THEN o sistema SHALL tratá-la como encerrada e responder 401 com o código `sessao_expirada` à próxima requisição autenticada. [ACE-15]
8. WHEN se passam 12 h desde a criação da sessão THEN o sistema SHALL tratá-la como encerrada, mesmo com uso contínuo, respondendo 401 com `sessao_expirada`. [ACE-16]
9. WHEN a pessoa envia `POST /api/sessao/sair` THEN o sistema SHALL apagar a sessão no banco, responder 204 e enviar o cookie `__Host-sessao` vencido. [ACE-17]
10. WHEN a pessoa autenticada consulta `GET /api/sessao` THEN o sistema SHALL responder 200 com id, nome, e-mail e a lista de grupos em que ela tem vínculo (id, nome, slug, `acessa_financeiro`); sem sessão válida, SHALL responder 401. [ACE-18]
11. WHEN a pessoa entra no app sem sessão em qualquer rota de `/app` THEN a tela SHALL redirecionar para `/entrar` e, depois do login, voltar para a rota pedida. [ACE-19]
12. WHEN a sessão expira durante o uso THEN a tela SHALL levar a pessoa para `/entrar` com o aviso "Sua sessão expirou. Entre de novo.". [ACE-20]
13. The sistema SHALL nunca gravar em log a senha, o token de sessão, os tokens dos links nem o corpo das rotas de autenticação. [ACE-21]

**Independent Test**: com a conta do seed, entrar pela tela, ver a lista de grupos em `/app`, sair e conferir que
`GET /api/sessao` responde 401.

---

### P1: Recuperar a senha por e-mail ⭐ MVP

**User Story**: Como admin que esqueceu a senha, quero criar uma nova pelo e-mail, sem precisar pedir a ninguém.

**Why P1**: No legado a recuperação dependia do dono; com cadastro aberto isso não escala.

**Acceptance Criteria**:

1. WHEN a pessoa envia `POST /api/sessao/esqueci-senha` com um e-mail THEN o sistema SHALL responder 200 com a mensagem "Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha", exista a conta ou não. [ACE-22]
2. WHEN o e-mail pertence a uma conta THEN o sistema SHALL enviar um link de recuperação válido por 1 h e invalidar qualquer link de recuperação anterior da conta. [ACE-23]
3. WHEN a pessoa envia a nova senha válida com um link de recuperação válido THEN o sistema SHALL trocar a senha, marcar o link como usado, encerrar todas as sessões da conta, marcar o e-mail como confirmado e responder 200, levando a tela para `/entrar` com o aviso "Senha alterada. Entre com a nova senha.". [ACE-24]
4. IF o link de recuperação está vencido, já foi usado ou não existe THEN o sistema SHALL responder 410 com o código `link_invalido` e não alterar a senha. [ACE-25]

**Independent Test**: pedir a recuperação da conta do seed, usar o link capturado, entrar com a senha nova e conferir
que a senha antiga é recusada.

---

### P1: Minha conta: trocar a senha e excluir a conta ⭐ MVP

**User Story**: Como admin logado, quero trocar minha senha e poder excluir minha conta, para cuidar da minha
segurança e dos meus dados.

**Why P1**: A exclusão de conta é exigência da LGPD e do padrão LJS; a troca de senha existe no legado.

**Acceptance Criteria**:

1. WHEN a pessoa logada envia a senha atual correta e uma senha nova válida para `POST /api/conta/senha` THEN o sistema SHALL trocar a senha, encerrar as outras sessões da conta, manter a sessão atual e responder 204. [ACE-26]
2. IF a senha atual está errada THEN o sistema SHALL responder 401 com o código `senha_atual_incorreta` e não trocar a senha. [ACE-27]
3. WHEN a pessoa logada confirma a exclusão com a senha correta e não é a única admin de nenhum grupo não arquivado THEN o sistema SHALL apagar a conta, as sessões, os vínculos e os links pendentes, trocar o autor das linhas de `auditoria` por "conta excluída" sem nome nem e-mail, responder 204 e levar a tela para `/` com o aviso "Sua conta foi excluída". [ACE-28]
4. IF a conta é a única admin de algum grupo não arquivado THEN o sistema SHALL responder 409 com o código `unico_admin` e a lista desses grupos (id e nome), sem apagar nada. [ACE-29]
5. IF a senha informada na exclusão está errada THEN o sistema SHALL responder 401 com `senha_atual_incorreta` e não apagar nada. [ACE-30]

**Independent Test**: com uma conta sem grupos, excluir pela tela e conferir que o login com ela passa a responder 401.

---

### P1: Convidar admin para o grupo ⭐ MVP

**User Story**: Como admin de um grupo, quero convidar outra pessoa pelo e-mail para administrar o grupo comigo, e
remover admins quando precisar.

**Why P1**: D1 define admins por vínculo; o legado já permitia vários admins por grupo.

**Acceptance Criteria**:

1. WHEN um admin do grupo envia `POST /api/grupos/:grupoId/admins/convites` com um e-mail THEN o sistema SHALL criar um convite válido por 7 dias, enviar o link para o e-mail e responder 201 com o convite (id, e-mail, validade). [ACE-31]
2. IF o e-mail já tem vínculo com o grupo THEN o sistema SHALL responder 409 com o código `ja_e_admin` e não criar convite. [ACE-32]
3. WHEN a pessoa logada abre um convite válido enviado ao e-mail da conta dela e aceita THEN o sistema SHALL criar o vínculo com `acessa_financeiro` falso, marcar o convite como usado e levar a tela para o grupo. [ACE-33]
4. WHEN a pessoa sem conta abre um convite válido THEN a tela SHALL oferecer o cadastro com o e-mail do convite já preenchido e travado, e o cadastro feito por esse caminho SHALL nascer com o e-mail confirmado e o vínculo criado. [ACE-34]
5. IF a pessoa logada abre um convite enviado a outro e-mail THEN o sistema SHALL responder 403 com o código `convite_de_outro_email` e não criar vínculo. [ACE-35]
6. IF o convite está vencido, usado, cancelado ou não existe THEN o sistema SHALL responder 410 com `link_invalido`. [ACE-36]
7. WHEN um admin consulta `GET /api/grupos/:grupoId/admins` THEN o sistema SHALL listar os admins (id, nome, e-mail, `acessa_financeiro`) e os convites pendentes (id, e-mail, validade). [ACE-37]
8. WHEN um admin cancela um convite pendente THEN o sistema SHALL invalidar o link e responder 204. [ACE-38]
9. WHEN um admin remove outro admin do grupo THEN o sistema SHALL apagar o vínculo, registrar em `auditoria` e responder 204. [ACE-39]
10. IF a remoção deixaria o grupo sem nenhum admin THEN o sistema SHALL responder 409 com o código `ultimo_admin` e manter o vínculo. [ACE-40]
11. IF quem chama as rotas de `/api/grupos/:grupoId/admins` não tem vínculo com o grupo THEN o sistema SHALL responder 404 (G-03). [ACE-41]
12. The criação e a remoção de vínculo e de convite SHALL gravar uma linha em `auditoria` com o autor, a ação e o grupo. [ACE-42]

**Independent Test**: com dois usuários locais, A convida B pelo e-mail capturado, B aceita, os dois veem o grupo em
`/app`, e A remove B.

---

### P1: Isolamento dos dados de conta no banco ⭐ MVP

**User Story**: Como dono do produto, quero que o banco impeça uma conta de ler ou alterar os dados de outra, mesmo se
a aplicação errar.

**Why P1**: Padrão LJS e ADR-025: o isolamento mora no banco, não só na aplicação.

**Acceptance Criteria**:

1. The role `pelada_app` SHALL ler e alterar em `contas` só a linha de `app.conta_id`; as operações de autenticação que precisam achar uma conta sem sessão (entrar, cadastro, links) SHALL passar por funções do banco que devolvem só o necessário para aquela operação. [ACE-43]
2. The role `pelada_app` SHALL ler e apagar em `sessoes` só as linhas da conta da sessão, e nunca ler o hash de senha de outra conta. [ACE-44]
3. The tabelas novas desta feature e `contas`, `sessoes` e `tentativas_login` SHALL ter RLS com `FORCE`, policy de leitura para `pelada_backup` e caso no teste de isolamento, que roda como `pelada_app` com duas contas e prova que B não lê, não altera e não apaga nada de A. [ACE-45]
4. The role `pelada_app` SHALL ter `INSERT` em `auditoria` e nenhum `UPDATE` ou `DELETE` nela fora da anonimização da exclusão de conta. [ACE-46]
5. WHEN uma requisição chega com cookie de sessão THEN o sistema SHALL resolver a sessão e fixar `app.conta_id` na transação da requisição antes de qualquer consulta a dado de grupo. [ACE-47]
6. The sistema SHALL ter, para toda rota registrada no Hono, um caso na suíte de isolamento de rotas, ou um caso "não se aplica" justificado para as rotas públicas e de sessão (G-04). [ACE-48]

**Independent Test**: `pnpm --filter @pelada/api test` roda a suíte de isolamento no Postgres local e falha se uma
policy for removida.

---

### P1: Proteções da entrada ⭐ MVP

**User Story**: Como dono do produto, quero que as rotas de acesso resistam a abuso sem bloquear quem usa de boa-fé.

**Why P1**: Achados SEC-005 e SEC-006 da fundação; rotas públicas de autenticação são o primeiro alvo.

**Acceptance Criteria**:

1. IF uma escrita em `/api/*` chega sem o cabeçalho `X-Pelada: 1` THEN o sistema SHALL responder 403 sem consumir a cota de nenhum limitador de taxa. [ACE-49]
2. The limitador `LIMITE_ENTRAR` (10 por minuto por IP) SHALL valer para entrar, cadastro, esqueci-senha e reenvio de confirmação; acima dele, o sistema SHALL responder 429. [ACE-50]
3. IF chega um segundo pedido de e-mail do mesmo tipo para o mesmo endereço em menos de 60 s THEN o sistema SHALL responder com a mesma mensagem de sucesso e não enviar outro e-mail. [ACE-51]
4. IF o envio do e-mail falha no Resend THEN o sistema SHALL responder 503 com o código `email_indisponivel`, registrar o erro sem o conteúdo da mensagem, e manter a conta ou o pedido de forma que pedir de novo funcione. [ACE-52]
5. The resposta de toda rota de `/api/sessao` e `/api/conta` SHALL ter `Cache-Control: no-store`. [ACE-53]

**Independent Test**: os testes de rota disparam 11 POST sem `X-Pelada` e conferem que o 12º, com o cabeçalho, não
recebe 429.

---

### P1: Telas de acesso no visual do legado ⭐ MVP

**User Story**: Como organizador, quero telas de acesso com a mesma cara do resto do app, no celular e no PC.

**Why P1**: Layout 100% reaproveitado (decisão do usuário) e G-19.

**Acceptance Criteria**:

1. The telas `/entrar`, `/entrar/esqueci`, `/entrar/nova-senha`, `/conta/senha`, a lista de grupos de `/app` e a tela de admins do grupo SHALL seguir os mockups t04, t05, t06, t25, t08 e t19 de `.specs/mockup/`, com os textos ajustados ao fluxo novo (recuperação por e-mail em t05 e t06), e passar na comparação visual em PC e celular. [ACE-54]
2. The telas novas (cadastro, confirmação de e-mail, link inválido, aceitar convite, minha conta com exclusão, termos e privacidade) SHALL ter mockup aprovado em `.specs/mockup/` antes da implementação e passar na comparação visual com ele. [ACE-55]
3. The telas de acesso SHALL usar só os tokens de `tokens.css` e os componentes base existentes, e passar no axe sem violação. [ACE-56]
4. WHEN a lista de grupos de `/app` não tem nenhum vínculo THEN a tela SHALL mostrar o estado vazio do t08. [ACE-57]

**Independent Test**: `pnpm --filter @pelada/web visual` compara as telas de acesso com o mockup.

---

### P1: Termos e privacidade ⭐ MVP

**User Story**: Como pessoa que vai se cadastrar, quero ler os termos de uso e a política de privacidade antes de
aceitar.

**Why P1**: LGPD e padrão LJS.

**Acceptance Criteria**:

1. The páginas `/termos` e `/privacidade` SHALL ser públicas, abrir sem sessão e mostrar a versão e a data do texto. [ACE-58]
2. The cadastro SHALL ter um campo de aceite com links para as duas páginas, desmarcado por padrão. [ACE-59]
3. The texto das duas páginas SHALL vir marcado como rascunho para revisão do usuário até ele aprovar a versão. [ACE-60]

**Independent Test**: abrir `/termos` e `/privacidade` sem sessão; tentar cadastrar sem o aceite e ver o erro.

---

### P2: Dono da plataforma por script

**User Story**: Como dono da LJS, quero criar ou recuperar a conta de dono por um script, sem expor esse papel em rota.

**Why P2**: G-11 exige o script; o papel não tem tela nesta feature.

**Acceptance Criteria**:

1. WHEN o dono roda `pnpm --filter @pelada/scripts dono -- --email <e-mail> [--alvo producao]` THEN o script SHALL criar a conta de dono ou trocar a senha dela, pedindo a senha nova no terminal sem eco, e nunca mostrar a senha. [ACE-61]
2. IF o script roda contra um banco remoto sem `--alvo` explícito THEN o script SHALL recusar sem alterar nada (G-16). [ACE-62]
3. The sistema SHALL não ter nenhuma rota que leia ou escreva `e_dono` (G-11). [ACE-63]

**Independent Test**: rodar o script no banco local e entrar com a conta do dono.

---

### P2: Seed com conta que entra

**User Story**: Como desenvolvedor, quero que o seed crie uma conta admin com senha conhecida, para testar o app local.

**Why P2**: Hoje o seed grava um hash inválido (`seed-local.ts:46`).

**Acceptance Criteria**:

1. WHEN o desenvolvedor roda `pnpm seed` THEN o script SHALL criar a conta admin confirmada com a senha da variável `SEED_SENHA_ADMIN` do `.env` e recusar rodar sem ela. [ACE-64]

**Independent Test**: depois do seed, entrar em `http://localhost:5173/entrar` com o e-mail do seed e a senha do `.env`.

---

## Edge Cases

- IF a pessoa já está logada e abre `/entrar` THEN a tela SHALL levá-la para `/app`. [ACE-65]
- IF duas requisições de login com senha errada do mesmo par e-mail e IP chegam ao mesmo tempo THEN o sistema SHALL contar as duas falhas (sem perder contagem por concorrência). [ACE-66]
- IF duas pessoas aceitam o mesmo convite ao mesmo tempo THEN o sistema SHALL criar no máximo um vínculo, e a segunda resposta SHALL ser 410 `link_invalido`. [ACE-67]
- WHEN a senha tem caracteres acentuados ou emoji que somam mais de 72 bytes THEN o sistema SHALL recusar com 422, mesmo com menos de 72 caracteres. [ACE-68]
- IF a conta foi excluída enquanto havia uma sessão aberta em outro aparelho THEN a próxima requisição desse aparelho SHALL receber 401 `sessao_expirada`. [ACE-69]

---

## Implicit-requirement sweep

| Dimensão | Cobertura |
| --- | --- |
| Input validation & bounds | ACE-03, ACE-05, ACE-68 |
| Failure / partial-failure states | ACE-52 (falha do Resend), ACE-07, ACE-25, ACE-36 |
| Idempotency / retry / duplicate handling | ACE-04, ACE-08, ACE-23, ACE-51, ACE-67 |
| Auth boundaries & rate limits | ACE-11 a ACE-16, ACE-41, ACE-43 a ACE-50 |
| Concurrency / ordering | ACE-66, ACE-67 |
| Data lifecycle / expiry | ACE-15, ACE-16, validade dos links (ACE-06, ACE-23, ACE-31), ACE-28 (exclusão) |
| Observability | ACE-21 (o que nunca vai para o log), ACE-42 (auditoria), ACE-52 (erro do Resend registrado). O Sentry da fundação cobre as exceções |
| External-dependency failure | ACE-52 (Resend fora do ar) |
| State-transition integrity | ACE-06 a ACE-08 (não confirmado → confirmado), ACE-33 e ACE-36 (convite pendente → usado ou cancelado), ACE-40 (último admin) |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----------- | ------ | ------- |
| ACE-01 | P1: Cadastro com confirmação de e-mail | Design | Pending |
| ACE-02 | P1: Cadastro com confirmação de e-mail | Design | Pending |
| ACE-03 | P1: Cadastro com confirmação de e-mail | Design | Pending |
| ACE-04 | P1: Cadastro com confirmação de e-mail | Design | Pending |
| ACE-05 | P1: Cadastro com confirmação de e-mail | Design | Pending |
| ACE-06 | P1: Cadastro com confirmação de e-mail | Design | Pending |
| ACE-07 | P1: Cadastro com confirmação de e-mail | Design | Pending |
| ACE-08 | P1: Cadastro com confirmação de e-mail | Design | Pending |
| ACE-09 | P1: Entrar e sair | Design | Pending |
| ACE-10 | P1: Entrar e sair | Design | Pending |
| ACE-11 | P1: Entrar e sair | Design | Pending |
| ACE-12 | P1: Entrar e sair | Design | Pending |
| ACE-13 | P1: Entrar e sair | Design | Pending |
| ACE-14 | P1: Entrar e sair | Design | Pending |
| ACE-15 | P1: Entrar e sair | Design | Pending |
| ACE-16 | P1: Entrar e sair | Design | Pending |
| ACE-17 | P1: Entrar e sair | Design | Pending |
| ACE-18 | P1: Entrar e sair | Design | Pending |
| ACE-19 | P1: Entrar e sair | Design | Pending |
| ACE-20 | P1: Entrar e sair | Design | Pending |
| ACE-21 | P1: Entrar e sair | Design | Pending |
| ACE-22 | P1: Recuperar a senha por e-mail | Design | Pending |
| ACE-23 | P1: Recuperar a senha por e-mail | Design | Pending |
| ACE-24 | P1: Recuperar a senha por e-mail | Design | Pending |
| ACE-25 | P1: Recuperar a senha por e-mail | Design | Pending |
| ACE-26 | P1: Minha conta | Design | Pending |
| ACE-27 | P1: Minha conta | Design | Pending |
| ACE-28 | P1: Minha conta | Design | Pending |
| ACE-29 | P1: Minha conta | Design | Pending |
| ACE-30 | P1: Minha conta | Design | Pending |
| ACE-31 | P1: Convidar admin para o grupo | Design | Pending |
| ACE-32 | P1: Convidar admin para o grupo | Design | Pending |
| ACE-33 | P1: Convidar admin para o grupo | Design | Pending |
| ACE-34 | P1: Convidar admin para o grupo | Design | Pending |
| ACE-35 | P1: Convidar admin para o grupo | Design | Pending |
| ACE-36 | P1: Convidar admin para o grupo | Design | Pending |
| ACE-37 | P1: Convidar admin para o grupo | Design | Pending |
| ACE-38 | P1: Convidar admin para o grupo | Design | Pending |
| ACE-39 | P1: Convidar admin para o grupo | Design | Pending |
| ACE-40 | P1: Convidar admin para o grupo | Design | Pending |
| ACE-41 | P1: Convidar admin para o grupo | Design | Pending |
| ACE-42 | P1: Convidar admin para o grupo | Design | Pending |
| ACE-43 | P1: Isolamento dos dados de conta no banco | Design | Pending |
| ACE-44 | P1: Isolamento dos dados de conta no banco | Design | Pending |
| ACE-45 | P1: Isolamento dos dados de conta no banco | Design | Pending |
| ACE-46 | P1: Isolamento dos dados de conta no banco | Design | Pending |
| ACE-47 | P1: Isolamento dos dados de conta no banco | Design | Pending |
| ACE-48 | P1: Isolamento dos dados de conta no banco | Design | Pending |
| ACE-49 | P1: Proteções da entrada | Design | Pending |
| ACE-50 | P1: Proteções da entrada | Design | Pending |
| ACE-51 | P1: Proteções da entrada | Design | Pending |
| ACE-52 | P1: Proteções da entrada | Design | Pending |
| ACE-53 | P1: Proteções da entrada | Design | Pending |
| ACE-54 | P1: Telas de acesso no visual do legado | Design | Pending |
| ACE-55 | P1: Telas de acesso no visual do legado | Design | Pending |
| ACE-56 | P1: Telas de acesso no visual do legado | Design | Pending |
| ACE-57 | P1: Telas de acesso no visual do legado | Design | Pending |
| ACE-58 | P1: Termos e privacidade | Design | Pending |
| ACE-59 | P1: Termos e privacidade | Design | Pending |
| ACE-60 | P1: Termos e privacidade | Design | Pending |
| ACE-61 | P2: Dono da plataforma por script | Design | Pending |
| ACE-62 | P2: Dono da plataforma por script | Design | Pending |
| ACE-63 | P2: Dono da plataforma por script | Design | Pending |
| ACE-64 | P2: Seed com conta que entra | Design | Pending |
| ACE-65 | Edge Cases | Design | Pending |
| ACE-66 | Edge Cases | Design | Pending |
| ACE-67 | Edge Cases | Design | Pending |
| ACE-68 | Edge Cases | Design | Pending |
| ACE-69 | Edge Cases | Design | Pending |

**Coverage:** 69 total, 0 mapped to tasks, 69 unmapped ⚠️ (o mapeamento nasce no `tasks.md`)

---

## Success Criteria

- [ ] Cadastro, confirmação e primeiro acesso a `/app` em menos de 2 minutos, no celular, com o e-mail chegando pelo Resend em produção.
- [ ] A conta do grupo de teste entra em produção com a senha que já tinha.
- [ ] Suíte de isolamento verde com casos para as tabelas de conta e para todas as rotas novas.
- [ ] Comparação visual das telas de acesso sem divergência em PC e celular.
- [ ] Nenhum achado crítico ou alto do `auditor-seguranca` em aberto.
