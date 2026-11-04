# Notificações — Especificação

> Feature 8 de 8 do roteiro (AD-001, AD-015). **Rascunho, aguardando aprovação do usuário.** Fluxo 2, fase 4.
>
> Entrada: `.specs/produto/necessidade.md` §3 (notificações, D3; push é recurso Pro, D2), §4, §5 e §6; `.specs/projeto/roadmap.md` linha 8 (depende de 4 e 7); `GestaoDaPelada_LJS/.specs/produto/analise-legado.md` §8 (D1 a D8) e `decisao.md`. Contrato da fundação v2: `.specs/features/fundacao/spec.md` (FUN-14, FUN-24 a FUN-26, FUN-34, FUN-36). E-mail: `.specs/features/conta-e-acesso/tasks.md` (Resend, `LIMITE_EMAILS_DIA`, ACE-72 e ACE-75). Ranking público: `GestaoDaPelada_LJS@c6dc82c:.specs/features/partidas-e-ranking/spec.md` (PAR-22, PAR-46, PAR-50, PAR-64, PAR-76 a PAR-79, PAR-90, PAR-93). O LJS não especificou notificações nem `planos-e-cobranca`: tudo aqui nasce do D3 e é consultado como dado (AD-002). Pesquisa técnica de Web Push em 2026-11-04 (seção **Fontes técnicas**).

## Problem Statement

O jogador não tem login e hoje só descobre que o ranking mudou abrindo o link `/g/:slug` por conta própria, e o organizador só fica sabendo de uma cobrança, de um pagamento ou de um atraso da assinatura Pro se entrar em Meu plano. O D3 pede dois avisos: **ranking atualizado**, por Web Push, para quem assinou pelo link público do grupo sem login, quando o admin lança ou altera uma partida; e **cobrança da assinatura**, por push e por e-mail, para o organizador (cobrança gerada, pagamento confirmado e atraso). A assinatura de push anônima é dado pessoal mínimo (LGPD) e é uma escrita pública, então precisa de proteção contra abuso, cancelamento, limpeza e isolamento por grupo, dentro dos limites do plano gratuito do Cloudflare Workers (10 ms de CPU e 50 subrequisições por invocação).

## Goals

- [ ] No celular (Android, ou iPhone com o app instalado), a pessoa assina os avisos do ranking em `/g/:slug` com um toque e recebe "Ranking atualizado" até 1 min depois de o admin salvar a partida, sem login.
- [ ] O organizador recebe e-mail e push quando a cobrança é gerada, o pagamento é confirmado ou a cobrança atrasa, uma vez por evento, mesmo que o Asaas repita o webhook.
- [ ] Nenhum dado de jogador sai no payload do push, e a assinatura guarda só o necessário para entregar o aviso, com cancelamento e limpeza automática.
- [ ] Nenhuma requisição passa de 10 ms de CPU nem de 50 subrequisições por causa do envio.

## Out of Scope

| Feature | Reason |
| ----------- | -------------- |
| Aviso de outros eventos (escalação do simulador, mensalidade em aberto, novo jogador, mudança de pesos, exclusão de partida, fim do trial Pro) | D3 cita só ranking atualizado (lançar e editar) e os três eventos de cobrança. Exclusão de partida e fim do trial ficam fora por decisão do usuário (2026-11-04) |
| Push para jogador com conta ou preferência por jogador | Jogador não tem login (D3). A assinatura é por aparelho e por grupo |
| Painel de quantos assinantes o grupo tem | Nenhum critério do D3 pede. Pode virar demanda depois |
| Notificação nativa de app (TWA, Play Store, APNs direto) | Fora do produto (`necessidade.md` §3) |
| Envio por WhatsApp ou SMS | Fora do D3 e com custo |
| Gerar a cobrança, receber e validar o webhook do Asaas, trocar o plano | Feature `planos-e-cobranca`. Aqui só se consome o evento já validado por ela |
| Lançar, editar e excluir partida | Feature `partidas-e-ranking`. Aqui só se consome o "partida gravada" depois do commit |
| Mockup de módulo e comparação visual das telas de push, dos avisos de cobrança em `/app` e do e-mail de cobrança | Decisão do usuário (2026-11-04, AD-072): seguem o estilo das demais telas com os componentes e tokens do guia de `.specs/mockup/`, sem comparação visual (NOT-72) |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | --------------- | --------- | ---------- |
| Eventos que disparam "ranking atualizado" | Partida lançada (PAR-22, `POST`) e partida editada (PAR-46, `PUT`), depois do commit. Exclusão (PAR-50) **não** dispara | D3: "quando o admin lança ou altera uma partida". Decisão do usuário em 2026-11-04 (AD-069) | y |
| Eventos de cobrança | Três, emitidos pela `planos-e-cobranca` depois de validar o webhook: `cobranca_gerada`, `pagamento_confirmado`, `pagamento_atrasado`, cada um com o id externo do Asaas, o grupo, o valor em centavos e o vencimento | D3. Nomes e campos são PREMISSA até a spec da feature 7 existir | n |
| Quem é "o organizador" | Só a conta responsável pela assinatura do grupo, que é a **criadora do grupo** (`grupos.criado_por`): só ela assina e cancela o Pro. Os outros admins não recebem avisos de cobrança | Decisão do usuário em 2026-11-04, alinhada à `planos-e-cobranca` | y |
| Plano e push | Push de ranking só para grupo Pro ou em trial Pro (D2). Avisos de cobrança saem em qualquer plano | O atraso acontece justamente quando o grupo está perto de cair para Free (AD-070) | n |
| Grupo que cai para Free | Não envia push de ranking e não aceita assinatura nova; as assinaturas existentes ficam guardadas e voltam a receber se o grupo voltar a Pro | "Ao expirar, cai para Free sem apagar dados" (D2) | n |
| Grupo arquivado | Não envia e não aceita assinatura; as assinaturas ficam guardadas e voltam a receber se o grupo for reativado; a limpeza por inatividade apaga as antigas | PAR-93; decisão do usuário em 2026-11-04 | y |
| Limpeza por inatividade | Apagar assinatura de ranking sem envio aceito há 180 dias | Dado pessoal mínimo e temporário (LGPD); decisão do usuário em 2026-11-04 | y |
| Teto de assinaturas de ranking por grupo | 200 | Protege a escrita pública e o envio contra inflação; um grupo tem até cerca de 40 jogadores; decisão do usuário em 2026-11-04 | y |
| Cota de e-mail da cobrança | Usa `LIMITE_EMAILS_DIA` com a reserva de 100% (como a recuperação de senha, ACE-72) | Atraso de pagamento é aviso importante e raro; decisão do usuário em 2026-11-04 | y |
| Link do e-mail de cobrança | Só o link para Meu plano, nunca o link de fatura do Asaas | Reduz o risco de phishing por imitação do e-mail | n |
| Escrita pública da assinatura | Por função `SECURITY DEFINER` dedicada, que confere slug ativo e plano; o contexto público continua sem escrita direta (FUN-14) | AD-065 | n |
| Mecanismo de envio fora da requisição | Decidido no Design (Cloudflare Queues, que está no plano Free com 10 mil operações/dia e retenção de 24 h, ou `waitUntil` em lotes) | Limite de 50 subrequisições e 10 ms de CPU (AD-068) | n |
| Criptografia do payload | Implementada com a Web Crypto do Worker (ECDH P-256, HKDF, AES-GCM, ECDSA), provada contra o vetor de teste do RFC 8291 Apêndice A. Usar biblioteca externa é decisão do Design | AD-002 (do zero); as bibliotecas encontradas não têm revisão de criptografia (AD-071) | n |
| Mockup | Sem mockup de módulo. Assinar e cancelar push na t01, avisos de cobrança em `/app` e o e-mail de cobrança seguem o estilo das demais telas (componentes e tokens do guia de `.specs/mockup/`), sem comparação visual nelas (AD-072) | Decisão do usuário em 2026-11-04 | y |
| Texto da privacidade (t07) | A spec exige atualizar o texto para citar o push e o e-mail de cobrança (NOT-59) | A t07 atual não cita push e diz que os e-mails são só de conta e convite | y |
| Fim do trial Pro | Fora desta feature | Decisão do usuário em 2026-11-04 | y |
| iOS | Web Push só em iOS/iPadOS 16.4+ com o app instalado na Tela de Início e pedido de permissão a partir de um toque | WebKit, "Web Push for Web Apps on iOS and iPadOS" (consulta em 2026-11-04) | y |

**Open questions:** none - all resolved or logged above. As perguntas Q1 a Q8 do rascunho foram respondidas pelo usuário em 2026-11-04.

---

## User Stories

### P1: Assinar os avisos do ranking pelo link público ⭐ MVP

**User Story**: Como jogador sem conta, quero tocar num botão no ranking do meu grupo e passar a receber um aviso quando o ranking mudar, para não precisar abrir o link toda semana.

**Why P1**: É o centro do D3 e o único push para quem não tem login.

**Acceptance Criteria**:

1. WHERE o grupo tem push disponível (Pro ou trial Pro, não arquivado) e o navegador tem `PushManager` e service worker THEN a tela `/g/:slug` (t01) SHALL mostrar o controle "Receber avisos do ranking", com os estados assinado, avisos desligados e sem suporte, montado com os componentes do guia (NOT-72). [NOT-01]
2. WHEN a pessoa toca no controle THEN o front SHALL pedir a permissão de notificação nesse toque (nunca ao carregar a página) e, concedida, chamar `pushManager.subscribe` com `userVisibleOnly: true` e a chave pública VAPID. [NOT-02]
3. WHEN o app está no Safari do iOS fora do modo standalone THEN a tela SHALL mostrar a instrução de instalação do FUN-36 no lugar do controle, sem pedir permissão. [NOT-03]
4. IF a permissão é negada ou a pessoa fecha o pedido THEN a tela SHALL dizer que os avisos estão desligados e como ligá-los nas configurações do navegador, sem chamar a API. [NOT-04]
5. WHEN o front envia `POST /api/publico/:slug/push` com `endpoint`, `chaves.p256dh` e `chaves.auth` válidos THEN o sistema SHALL gravar a assinatura ligada ao grupo do slug e responder 201. [NOT-05]
6. IF o corpo traz outro campo, `endpoint` não é `https`, o host do `endpoint` não está na lista de serviços de push conhecidos, `p256dh` não é uma chave P-256 não comprimida de 65 bytes em base64url ou `auth` não tem 16 bytes THEN o sistema SHALL responder 422 sem gravar. [NOT-06]
7. WHEN o mesmo `endpoint` é assinado de novo no mesmo grupo THEN o sistema SHALL responder 200, atualizar as chaves e não criar outra linha; o mesmo `endpoint` em outro grupo SHALL ser uma assinatura separada. [NOT-07]
8. IF o slug é malformado, não existe ou é de grupo arquivado THEN o sistema SHALL responder 404 com o mesmo corpo de PAR-90. [NOT-08]
9. IF o grupo não tem push disponível pelo plano THEN o sistema SHALL responder 403 com o código `push_indisponivel` e não gravar. [NOT-09]
10. IF o grupo já tem o teto de assinaturas (200) THEN o sistema SHALL responder 409 com o código `limite_assinaturas` e não gravar. [NOT-10]
11. The rota SHALL exigir o cabeçalho `X-Pelada: 1` (ACE-49) e aplicar o limitador `LIMITE_PUBLICO` (FUN-26, PAR-78), usando o IP só como chave do limitador, sem gravá-lo nem registrá-lo em log. [NOT-11]
12. The assinatura SHALL guardar só `grupo_id`, `endpoint`, `p256dh`, `auth`, `criada_em` e `ultimo_envio_em`, sem IP, user agent, conta, apelido nem identificador de jogador. [NOT-12]
13. WHEN a assinatura é gravada THEN a tela SHALL mostrar o estado "assinado" e a opção de parar de receber. [NOT-13]
14. The chave pública VAPID SHALL chegar ao front pela configuração do build ou por uma rota pública somente leitura, e a chave privada SHALL existir só como secret do Worker. [NOT-14]

**Independent Test**: num Chrome com um serviço de push falso, abrir `/g/:slug` de um grupo Pro, tocar no controle, conceder a permissão e ver 201 e o estado "assinado"; repetir num grupo Free e ver 403 `push_indisponivel`.

---

### P1: Cancelar a assinatura ⭐ MVP

**User Story**: Como jogador, quero parar de receber os avisos quando quiser, no mesmo lugar em que assinei, para que meu aparelho não fique registrado sem necessidade.

**Why P1**: Direito de revogar o consentimento (LGPD) e regra das lojas de navegador.

**Acceptance Criteria**:

1. WHILE o aparelho tem assinatura ativa para o grupo THEN a tela `/g/:slug` SHALL mostrar "Parar de receber avisos". [NOT-15]
2. WHEN a pessoa toca em "Parar de receber avisos" THEN o front SHALL enviar `DELETE /api/publico/:slug/push` com `endpoint` e `chaves.auth` e chamar `unsubscribe()` da assinatura local. [NOT-16]
3. WHEN o `DELETE` chega THEN o sistema SHALL apagar a assinatura do grupo cujo `endpoint` e `auth` coincidem e responder 204, e SHALL responder 204 também quando nada coincide, sem revelar se a assinatura existia. [NOT-17]
4. IF o slug é de grupo arquivado ou Free THEN o cancelamento SHALL continuar funcionando (204). [NOT-18]
5. WHEN o service worker recebe `pushsubscriptionchange` THEN ele SHALL pedir a remoção da assinatura antiga e, se o navegador entregar uma nova, assiná-la de novo no mesmo grupo. [NOT-19]

**Independent Test**: assinar, cancelar, conferir no banco que a linha sumiu e que um `DELETE` repetido responde 204.

---

### P1: Aviso de ranking atualizado ⭐ MVP

**User Story**: Como jogador que assinou, quero receber "Ranking atualizado" logo depois de o admin salvar a partida, e abrir o ranking ao tocar no aviso.

**Why P1**: É o valor entregue pela assinatura.

**Acceptance Criteria**:

1. WHEN uma partida é lançada (PAR-22) ou editada (PAR-46) e a transação faz commit THEN o sistema SHALL agendar um envio de "ranking atualizado" para as assinaturas do grupo. [NOT-20]
2. IF a transação da partida é desfeita THEN o sistema SHALL não enviar nada. [NOT-21]
3. The envio SHALL acontecer fora da resposta ao admin: a resposta de PAR-22 e PAR-46 SHALL não esperar o envio, e uma falha de envio SHALL não desfazer nem alterar a partida. [NOT-22]
4. WHEN uma partida é excluída (PAR-50) THEN o sistema SHALL não enviar aviso (AD-069). [NOT-23]
5. The sistema SHALL enviar só para grupo com push disponível no momento do envio (Pro ou trial, não arquivado). [NOT-24]
6. The payload SHALL ter no máximo o título "Ranking atualizado", o texto "<nome do grupo>: partida de dd/mm" e o caminho `/g/<slug>?mes=AAAA-MM`, sem apelido, pontos, posição, id de jogador nem nenhum campo proibido de PAR-76, e SHALL ocupar menos de 4096 bytes depois de cifrado. [NOT-25]
7. The payload SHALL ser cifrado com `aes128gcm` conforme o RFC 8291, e a implementação SHALL passar no vetor de teste do Apêndice A do RFC 8291. [NOT-26]
8. The requisição ao serviço de push SHALL levar autenticação VAPID (RFC 8292) com JWT ES256, `aud` igual à origem do `endpoint`, `exp` de no máximo 24 h e `sub` igual a `VAPID_ASSUNTO`, mais `TTL` (RFC 8030 §5.2) e `Urgency: normal`. [NOT-27]
9. The envio SHALL usar o cabeçalho `Topic` (RFC 8030 §5.4, até 32 caracteres base64url) derivado do grupo, para que avisos seguidos ainda não entregues se substituam no serviço de push. [NOT-28]
10. WHEN o serviço de push responde 201 THEN o sistema SHALL atualizar `ultimo_envio_em` da assinatura. [NOT-29]
11. WHEN o serviço de push responde 404 ou 410 THEN o sistema SHALL apagar a assinatura. [NOT-30]
12. WHEN o serviço de push responde 429 ou 5xx THEN o sistema SHALL tentar de novo no máximo 2 vezes, respeitando `Retry-After` quando houver, sem apagar a assinatura; IF ainda falha THEN SHALL desistir daquele aviso. [NOT-31]
13. IF o serviço de push responde 400, 403 ou 413 THEN o sistema SHALL não apagar a assinatura e SHALL reportar ao Sentry (FUN-24) só o host do serviço e o status. [NOT-32]
14. The sistema SHALL nunca registrar em log nem enviar ao Sentry o `endpoint`, o `p256dh`, o `auth` nem o payload. [NOT-33]
15. The envio SHALL fazer no máximo 40 requisições a serviços de push por invocação do Worker, deixando folga no limite de 50 subrequisições do plano Free, e SHALL caber em 10 ms de CPU, medido por teste com 40 assinaturas. [NOT-34]
16. WHEN o service worker recebe `push` THEN ele SHALL mostrar a notificação com o título, o texto, o ícone do app e `tag` igual ao slug, substituindo a anterior do mesmo grupo. [NOT-35]
17. IF o payload não pode ser lido THEN o service worker SHALL mostrar mesmo assim uma notificação genérica "Ranking atualizado", nunca um push silencioso. [NOT-36]
18. WHEN a pessoa toca na notificação THEN o service worker SHALL focar uma janela aberta do app ou abrir o caminho do payload, aceitando só caminho relativo da mesma origem que começa com `/g/`. [NOT-37]

**Independent Test**: com um serviço de push falso no teste do Worker, lançar uma partida de um grupo Pro com 3 assinaturas e ver 3 envios cifrados com VAPID; uma das assinaturas responde 410 e some do banco; num grupo Free nada é enviado.

---

### P1: Avisos de cobrança ao organizador ⭐ MVP

**User Story**: Como organizador que paga o Pro do grupo, quero saber por e-mail e no celular quando a cobrança é gerada, quando o pagamento é confirmado e quando ele atrasa, para não perder o Pro sem perceber.

**Why P1**: Segunda metade do D3, e o atraso leva à queda para Free (D2).

**Acceptance Criteria**:

1. WHEN a `planos-e-cobranca` registra `cobranca_gerada`, `pagamento_confirmado` ou `pagamento_atrasado` de um grupo THEN o sistema SHALL enviar um e-mail e um push só à conta criadora do grupo (`grupos.criado_por`), a responsável pela assinatura, e a nenhum outro admin. [NOT-38]
2. The sistema SHALL enviar cada aviso de cobrança uma única vez por id externo do evento, mesmo que o mesmo evento chegue mais de uma vez ou em paralelo. [NOT-39]
3. The e-mail SHALL ter o nome do grupo, o tipo do evento em texto claro, o valor em reais formatado a partir de centavos inteiros, o vencimento em dd/mm/aaaa (`America/Sao_Paulo`) e só o link `URL_PUBLICA` para Meu plano, na rota que a `planos-e-cobranca` definir, sem link de pagamento de terceiros. [NOT-40]
4. The e-mail SHALL sair pelo remetente da `conta-e-acesso` (Resend) e contar na cota `LIMITE_EMAILS_DIA` com a reserva de 100%, como a recuperação de senha (ACE-72). [NOT-41]
5. IF o Resend falha ou a cota acabou THEN o sistema SHALL registrar o aviso como pendente e tentar de novo depois, no máximo 3 vezes em 24 h, e reportar ao Sentry a desistência sem e-mail nem conteúdo. [NOT-42]
6. The push de cobrança SHALL ter só o título com o tipo do evento e o nome do grupo e o caminho para Meu plano, sem valor, e-mail nem nome do organizador. [NOT-43]
7. WHILE a conta criadora de algum grupo está com sessão em `/app` e o navegador tem suporte THEN o front SHALL oferecer "Receber avisos de cobrança neste aparelho", montado com os componentes do guia (NOT-72), com o mesmo pedido de permissão por toque de NOT-02. [NOT-44]
8. WHEN o organizador assina ou cancela THEN o sistema SHALL gravar ou apagar a assinatura ligada à conta da sessão por `POST` e `DELETE /api/conta/push`, com sessão, `X-Pelada: 1` e `LIMITE_ESCRITA`, e as mesmas validações de NOT-06, NOT-07 e NOT-17. [NOT-45]
9. IF o organizador não tem assinatura de push THEN o sistema SHALL enviar só o e-mail. [NOT-46]
10. The avisos de cobrança SHALL sair em qualquer plano do grupo, inclusive Free. [NOT-47]
11. The envio do push de cobrança SHALL seguir NOT-26 a NOT-33 e NOT-35 a NOT-37, aceitando no clique só caminho que começa com `/app/`. [NOT-48]

**Independent Test**: com o remetente em memória e o serviço de push falso, injetar `pagamento_atrasado` duas vezes com o mesmo id externo e ver um e-mail e um push; injetar com o Resend falhando e ver o aviso pendente reenviado.

---

### P1: Dados, isolamento e LGPD ⭐ MVP

**User Story**: Como dono do app, quero que as assinaturas de push sejam o mínimo de dado pessoal, isoladas por grupo e por conta no banco, e apagadas quando não servem mais.

**Why P1**: Escrita pública nova e dado pessoal (LGPD), sobre a RLS da fundação.

**Acceptance Criteria**:

1. The migração nova SHALL ser aditiva, com timestamp maior que `1792844520000` (AD-003), sem editar migração aplicada, e passar na checagem do FUN-56. [NOT-49]
2. The tabela de assinaturas de ranking SHALL ter `grupo_id`, `FORCE ROW LEVEL SECURITY` (FUN-12) e unicidade de (`grupo_id`, `endpoint`). [NOT-50]
3. The contexto público (FUN-14) SHALL continuar sem `SELECT`, `INSERT`, `UPDATE` ou `DELETE` direto na tabela; assinar e cancelar pelo slug SHALL passar por função `SECURITY DEFINER` dedicada, que confere slug ativo, plano e teto, com `EXECUTE` só para `pelada_app`. [NOT-51]
4. IF a conta B, no contexto dela, executa SELECT, INSERT, UPDATE ou DELETE sobre assinaturas do grupo da conta A THEN o banco SHALL não retornar linha e SHALL afetar zero linhas ou recusar, com um teste por comando, inclusive UPDATE e DELETE sem `WHERE` (FUN-17). [NOT-52]
5. The assinaturas do organizador SHALL ficar isoladas por conta com a mesma matriz de NOT-52: uma conta SHALL nunca ler nem apagar a assinatura de outra. [NOT-53]
6. The `endpoint`, o `p256dh` e o `auth` SHALL nunca sair em resposta de API, nem para admin do grupo. [NOT-54]
7. WHEN a conta é excluída (`conta-e-acesso`) THEN as assinaturas de push dela SHALL ser apagadas na mesma transação. [NOT-55]
8. The limpeza diária (Cron Trigger) SHALL apagar a assinatura de ranking sem envio aceito há mais de 180 dias, contando da criação quando nunca houve envio. [NOT-56]
9. The registro de avisos de cobrança já enviados SHALL guardar só o id externo, o grupo, o tipo e a data, e SHALL ser apagado depois de 90 dias. [NOT-57]
10. The role `pelada_backup_ro` SHALL ler as tabelas novas (AD-010, AD-016), e um teste SHALL falhar se o dump como `pelada_backup_ro` vier sem as linhas delas. [NOT-58]
11. The página de privacidade (t07) SHALL dizer que o push guarda só o endereço técnico do aparelho por grupo, sem nome, como cancelar e quando é apagado, e SHALL trocar a frase "Enviamos e-mails só para confirmar a conta, recuperar a senha e entregar convites de admin." por uma que inclua os e-mails de cobrança para a criadora do grupo. [NOT-59]

**Independent Test**: no Postgres local como `pelada_app`, a suíte de isolamento prova NOT-51 a NOT-53 por comando; a limpeza com o relógio avançado 181 dias apaga a assinatura.

---

### P2: Configuração e operação

**User Story**: Como dono do app, quero configurar as chaves VAPID como secret, ligar e desligar o push sem quebrar o app e saber o que fazer ao trocar as chaves.

**Why P2**: Não muda o comportamento do usuário, mas a prévia e a produção dependem disso.

**Acceptance Criteria**:

1. The `.env.example` SHALL listar `VAPID_PUBLICA`, `VAPID_PRIVADA` (segredo) e `VAPID_ASSUNTO` (`mailto:` ou URL), com obrigatoriedade e formato (FUN-46). [NOT-60]
2. IF as chaves VAPID não estão configuradas THEN o app SHALL funcionar normalmente, sem mostrar o controle de assinar, com as rotas de assinatura respondendo 503 `push_indisponivel` e sem tentar enviar push; o e-mail de cobrança SHALL continuar saindo. [NOT-61]
3. The README e o `docs/runbook.md` SHALL cobrir gerar as chaves VAPID, criar os secrets no environment `previa` (passo do usuário), o Cron da limpeza e o efeito de trocar as chaves (as assinaturas antigas deixam de valer e o front assina de novo quando a chave pública muda). [NOT-62]
4. The testes SHALL usar um serviço de push falso e o remetente em memória, e nunca SHALL chamar um serviço de push real nem o Resend. [NOT-63]
5. The `.specs/projeto/jornadas.md` SHALL ganhar a jornada "assinar o ranking, admin lança partida, aviso chega, cancelar", com o push simulado no E2E. [NOT-64]
6. The controles de assinar e cancelar da t01, os avisos de cobrança em `/app` e o e-mail de cobrança SHALL usar só componentes e tokens do guia de `.specs/mockup/` (FUN-30, FUN-32), com teste de renderização e de acessibilidade (axe), e SHALL ficar fora da comparação visual do FUN-38 (AD-072). [NOT-72]

**Independent Test**: subir o app sem as variáveis VAPID e ver `/g/:slug` sem o controle e `POST /api/publico/:slug/push` = 503.

---

## Edge Cases

- WHEN duas assinaturas do mesmo `endpoint` no mesmo grupo chegam ao mesmo tempo THEN o sistema SHALL gravar uma linha só e responder 201 a uma e 200 à outra. [NOT-65]
- WHEN o admin edita a mesma partida várias vezes em poucos minutos THEN o aparelho SHALL mostrar uma notificação só por grupo (`Topic` de NOT-28 e `tag` de NOT-35). [NOT-66]
- IF o corpo de `POST` ou `DELETE` de push passa de 4 KB ou não é JSON THEN o sistema SHALL responder 413 ou 422 sem gravar. [NOT-67]
- WHEN o grupo passa de Pro para Free entre o commit da partida e o envio THEN o sistema SHALL não enviar (NOT-24 vale no envio). [NOT-68]
- IF o envio de um lote passa do tempo da invocação THEN o sistema SHALL retomar as assinaturas restantes numa invocação seguinte, sem reenviar as já aceitas (201). [NOT-69]
- WHEN um aparelho assinou vários grupos THEN cada grupo SHALL ser uma assinatura e uma notificação separadas, e cancelar num grupo SHALL não cancelar os outros, salvo quando o `unsubscribe()` local revoga o `endpoint`, caso em que os outros grupos SHALL ser limpos pelo 404 ou 410 do próximo envio. [NOT-70]
- WHEN o navegador já tem permissão `granted` mas não há assinatura no servidor (apagada pela limpeza ou pelo 410) THEN a tela SHALL mostrar de novo "Receber avisos do ranking". [NOT-71]

---

## Implicit-requirement sweep

| Dimensão | Cobertura |
|---|---|
| Validação de entrada e limites | NOT-06, NOT-10, NOT-67, NOT-25 (4096 bytes) |
| Falha e falha parcial | NOT-21, NOT-22, NOT-31, NOT-32, NOT-42, NOT-61, NOT-69 |
| Idempotência e repetição | NOT-07, NOT-17, NOT-39, NOT-65, NOT-69 |
| Fronteiras de auth e rate limit | NOT-11, NOT-45, NOT-51 a NOT-54, NOT-37 e NOT-48 (sem redirecionamento aberto) |
| Concorrência e ordem | NOT-39, NOT-65, NOT-20 (só depois do commit) |
| Ciclo de vida dos dados | NOT-30, NOT-55, NOT-56, NOT-57, NOT-59 |
| Observabilidade | NOT-32, NOT-33, NOT-42 |
| Falha de dependência externa | NOT-31, NOT-32 (serviço de push), NOT-42 (Resend), NOT-61 (VAPID ausente) |
| Integridade de transições de estado | NOT-23, NOT-24, NOT-68 (plano e arquivamento no envio), NOT-18 |
| Limites da plataforma | NOT-34 (50 subrequisições, 10 ms de CPU), NOT-69 |

---

## Fontes técnicas

Consultadas em 2026-11-04.

| Fonte | O que sustenta |
|---|---|
| RFC 8030, https://www.rfc-editor.org/rfc/rfc8030.html | `TTL` obrigatório (§5.2), `Urgency` (§5.3), `Topic` até 32 caracteres base64url (§5.4), 201 = aceito, não entregue (§5), 404 para assinatura expirada (§7.3), sem 413 até 4096 bytes (§7.2) |
| RFC 8291 (criptografia `aes128gcm`, vetor do Apêndice A) e RFC 8292 (VAPID) | NOT-26, NOT-27. Leitura do texto dos RFCs fica para o Design |
| WebKit, https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ | iOS/iPadOS 16.4+, app na Tela de Início com `display: standalone`, permissão por interação direta, endpoints `*.push.apple.com` |
| Cloudflare Web Crypto, https://developers.cloudflare.com/workers/runtime-apis/web-crypto/ | ECDH, ECDSA, HKDF, AES-GCM e HMAC suportados (a página não cita a curva; P-256 é PREMISSA a conferir no Design) |
| Cloudflare Workers limits, https://developers.cloudflare.com/workers/platform/limits/ | Free: 10 ms de CPU por requisição e por Cron, 50 subrequisições por invocação, 5 Cron Triggers, `waitUntil` até 30 s |
| Cloudflare Queues pricing, https://developers.cloudflare.com/queues/platform/pricing/ | Queues no Free: 10 mil operações/dia, retenção de 24 h |
| Bibliotecas `@negrel/webpush` (JSR) e `@mmmike/web-push` (npm) | Existem implementações só com Web Crypto, mas a primeira avisa que não foi revisada por especialistas em criptografia e a segunda é nova (AD-071) |
| 410 Gone como assinatura revogada | Prática dos serviços de push (FCM, Mozilla, Apple), não do RFC 8030: PREMISSA, tratada igual ao 404 em NOT-30 |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----------- | ------ | ------- |
| NOT-01 | P1: Assinar | Design | Pending |
| NOT-02 | P1: Assinar | Design | Pending |
| NOT-03 | P1: Assinar | Design | Pending |
| NOT-04 | P1: Assinar | Design | Pending |
| NOT-05 | P1: Assinar | Design | Pending |
| NOT-06 | P1: Assinar | Design | Pending |
| NOT-07 | P1: Assinar | Design | Pending |
| NOT-08 | P1: Assinar | Design | Pending |
| NOT-09 | P1: Assinar | Design | Pending |
| NOT-10 | P1: Assinar | Design | Pending |
| NOT-11 | P1: Assinar | Design | Pending |
| NOT-12 | P1: Assinar | Design | Pending |
| NOT-13 | P1: Assinar | Design | Pending |
| NOT-14 | P1: Assinar | Design | Pending |
| NOT-15 | P1: Cancelar | Design | Pending |
| NOT-16 | P1: Cancelar | Design | Pending |
| NOT-17 | P1: Cancelar | Design | Pending |
| NOT-18 | P1: Cancelar | Design | Pending |
| NOT-19 | P1: Cancelar | Design | Pending |
| NOT-20 | P1: Ranking atualizado | Design | Pending |
| NOT-21 | P1: Ranking atualizado | Design | Pending |
| NOT-22 | P1: Ranking atualizado | Design | Pending |
| NOT-23 | P1: Ranking atualizado | Design | Pending |
| NOT-24 | P1: Ranking atualizado | Design | Pending |
| NOT-25 | P1: Ranking atualizado | Design | Pending |
| NOT-26 | P1: Ranking atualizado | Design | Pending |
| NOT-27 | P1: Ranking atualizado | Design | Pending |
| NOT-28 | P1: Ranking atualizado | Design | Pending |
| NOT-29 | P1: Ranking atualizado | Design | Pending |
| NOT-30 | P1: Ranking atualizado | Design | Pending |
| NOT-31 | P1: Ranking atualizado | Design | Pending |
| NOT-32 | P1: Ranking atualizado | Design | Pending |
| NOT-33 | P1: Ranking atualizado | Design | Pending |
| NOT-34 | P1: Ranking atualizado | Design | Pending |
| NOT-35 | P1: Ranking atualizado | Design | Pending |
| NOT-36 | P1: Ranking atualizado | Design | Pending |
| NOT-37 | P1: Ranking atualizado | Design | Pending |
| NOT-38 | P1: Cobrança | Design | Pending |
| NOT-39 | P1: Cobrança | Design | Pending |
| NOT-40 | P1: Cobrança | Design | Pending |
| NOT-41 | P1: Cobrança | Design | Pending |
| NOT-42 | P1: Cobrança | Design | Pending |
| NOT-43 | P1: Cobrança | Design | Pending |
| NOT-44 | P1: Cobrança | Design | Pending |
| NOT-45 | P1: Cobrança | Design | Pending |
| NOT-46 | P1: Cobrança | Design | Pending |
| NOT-47 | P1: Cobrança | Design | Pending |
| NOT-48 | P1: Cobrança | Design | Pending |
| NOT-49 | P1: Dados e LGPD | Design | Pending |
| NOT-50 | P1: Dados e LGPD | Design | Pending |
| NOT-51 | P1: Dados e LGPD | Design | Pending |
| NOT-52 | P1: Dados e LGPD | Design | Pending |
| NOT-53 | P1: Dados e LGPD | Design | Pending |
| NOT-54 | P1: Dados e LGPD | Design | Pending |
| NOT-55 | P1: Dados e LGPD | Design | Pending |
| NOT-56 | P1: Dados e LGPD | Design | Pending |
| NOT-57 | P1: Dados e LGPD | Design | Pending |
| NOT-58 | P1: Dados e LGPD | Design | Pending |
| NOT-59 | P1: Dados e LGPD | Design | Pending |
| NOT-60 | P2: Configuração | Design | Pending |
| NOT-61 | P2: Configuração | Design | Pending |
| NOT-62 | P2: Configuração | Design | Pending |
| NOT-63 | P2: Configuração | Design | Pending |
| NOT-64 | P2: Configuração | Design | Pending |
| NOT-72 | P2: Configuração | Design | Pending |
| NOT-65 | Edge Cases | Design | Pending |
| NOT-66 | Edge Cases | Design | Pending |
| NOT-67 | Edge Cases | Design | Pending |
| NOT-68 | Edge Cases | Design | Pending |
| NOT-69 | Edge Cases | Design | Pending |
| NOT-70 | Edge Cases | Design | Pending |
| NOT-71 | Edge Cases | Design | Pending |

**Coverage:** 72 total, 0 mapped to tasks, 72 unmapped ⚠️ (mapeamento na fase Tasks)

---

## Success Criteria

- [ ] Assinatura, aviso e cancelamento ponta a ponta num Android real e num iPhone com o app instalado, na prévia.
- [ ] Suíte de isolamento das tabelas novas verde por comando, e o contexto público sem escrita direta.
- [ ] Vetor do RFC 8291 Apêndice A verde.
- [ ] Evento de cobrança repetido gera um e-mail e um push só.
- [ ] Teste de 40 assinaturas por invocação dentro de 10 ms de CPU e 50 subrequisições.
