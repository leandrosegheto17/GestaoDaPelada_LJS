# Financeiro — Especificação

> Feature 6 de 8 do roteiro (AD-001, AD-015). **Rascunho, aguardando aprovação do usuário.** Fluxo 2, fase 4. As 5 perguntas do rascunho foram respondidas pelo usuário em 2026-11-04 e estão incorporadas (AD-051 a AD-055, provisórias até a gravação no `STATE.md`). Entrada: `.specs/produto/necessidade.md` §3 a §5 e `.specs/projeto/roadmap.md` (linha 6, depende da `grupos-e-elenco`). Regras extraídas, só leitura, do sistema legado `C:\Leandro\Projetos\GestaodaPelada` @ `ece227e0` (citado como `leg:`) e do schema herdado `GestaoDaPelada_LJS` @ `e557292` (citado como `ljs:`). O LJS nunca construiu o financeiro: não há spec do LJS para esta feature, e a base é o comportamento do legado (`ljs:.specs/produto/analise-legado.md:33`, §8 D1 e D2).

## Problem Statement

O organizador controla o caixa da pelada (quem pagou o mês, entradas, saídas e saldo) em mensagens e planilha (`leg:.md/PRD.md:62`). A v2 precisa de um caixa por grupo que gere a entrada ao marcar a mensalidade, recuse mês futuro e jogador inativo, mostre o saldo e quem não pagou, e trate dinheiro em centavos inteiros no fuso `America/Sao_Paulo`. As tabelas já existem no banco de produção (linha de base `ljs:backend/api/src/infraestrutura/db/migracoes/1792843200000_linha-de-base.sql:230-269`), mas a RLS herdada deixa o financeiro legível no contexto público do slug e por admin sem a permissão de financeiro (achado SEC-003, `ljs:.specs/features/fundacao/seguranca.md:96-115`). Dinheiro e dado pessoal: o isolamento precisa estar no banco, não só na API.

## Goals

- [ ] O admin com acesso ao financeiro configura o caixa, marca e desmarca mensalidades, lança entradas e saídas e vê o saldo atual e quem não pagou no mês, com as mesmas regras e mensagens do legado.
- [ ] Nenhuma conta sem `acessa_financeiro` no grupo, e nenhum contexto público, lê ou escreve linha de `config_financeira`, `lancamentos` ou `pagamentos_mes`, provado no banco por comando.
- [ ] Todo valor é inteiro em centavos, sem arredondamento, e toda escrita do caixa fica auditada na mesma transação.
- [ ] As telas t22, t23 e t24 passam na comparação visual com o mockup aprovado.

## Out of Scope

| Feature | Reason |
| ----------- | -------------- |
| Ligar a trava de plano (Free, trial, cortesia, `plano_pro`) | Feature 7 `planos-e-cobranca` (D2). Aqui só nasce o ponto único de trava, compatível com ela (FIN-45, FIN-50) |
| Mockup de módulo novo para o t19 | Decisão do usuário (2026-11-04): o interruptor segue o guia de `.specs/mockup/` a partir do mockup do legado (FIN-51) |
| Cobrança automática, lembrete ou push de pagamento ao jogador | Fora do legado (`leg:.md/PRD.md:129`). Push é da feature 8 só para ranking e cobrança da assinatura (D3) |
| Pagamento de jogador avulso (fora do elenco) | Decisão P-20 do legado (`leg:.md/PRD.md:287`) |
| Criar tabelas do financeiro | Já existem na linha de base (`ljs:...linha-de-base.sql:233-269`); a feature só cria a migração de RLS (FIN-40) |
| Relatórios, exportação (PDF, planilha) e histórico de mudanças da configuração na tela | Não existem no legado; a auditoria guarda o histórico |
| Mudar períodos de atividade, exclusão de jogador e arquivamento | Feature 3 `grupos-e-elenco`; aqui só são lidos |
| Leitura do financeiro pelo dono da plataforma | D1: o dono é só suporte; nenhuma tela do dono mostra o caixa |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | --------------- | --------- | ---------- |
| Tabelas | Usa `config_financeira`, `lancamentos` e `pagamentos_mes` da linha de base, sem coluna nova | Schema herdado (`ljs:...linha-de-base.esquema.txt:10-13, 76-95`), AD-003 | y |
| Regime de caixa | A entrada da mensalidade tem a data do dia em que é marcada, não a do mês pago | `leg:backend/dominio/src/caixa/mensalidade.ts:10-12, 24` | y |
| Ativo no mês | Ativo em algum dia do mês, com período `[início, fim)` | `leg:backend/dominio/src/atividade/atividade.ts:3-7, 25-32`; contrato da feature 3: GEL-50 e GEL-61 (`ljs:.specs/features/grupos-e-elenco/spec.md:195, 232`) | y |
| Permissão | Vínculo de admin com `acessa_financeiro` verdadeiro; quem cria o grupo nasce com ela, o convidado sem | `leg:backend/api/src/entrada/middlewares/grupo.ts:34-43`; GEL-01 e ACE-33 | y |
| Recurso Pro antes da feature 7 (AD-051) | Liberado para todo grupo, sem checagem de plano, com a decisão num único ponto da API que a feature 7 liga. Compatível com a feature 7: no Free, escritas recusadas com 403 `plano_pro` e leituras abertas; a cortesia Pro vale só para o grupo de teste (FIN-45, FIN-50) | Decisão do usuário em 2026-11-04 (a mesma vale para o simulador). D2 põe o financeiro no Pro, mas a cobrança só nasce na feature 7 | y |
| Conceder e retirar o acesso ao financeiro de outro admin (AD-053) | Entra nesta feature, como no legado (`leg:backend/api/src/aplicacao/grupos/admins/financeiro.ts:6-30`). O interruptor "Acessa financeiro" no t19 parte do mockup do legado (`leg:.md/mockup/telas/t19-admins--sucesso.html`) e usa os componentes e tokens de `.specs/mockup/`, sem mockup de módulo novo (FIN-35, FIN-36, FIN-51) | Decisão do usuário em 2026-11-04. Nem a conta-e-acesso nem a grupos-e-elenco do LJS o têm; sem isso, só a criadora do grupo teria o financeiro | y |
| Isolamento no banco (AD-052) | Migração nova, aditiva, sem DROP, com policies restritivas nas 3 tabelas (exigem conta com `acessa_financeiro` no grupo) e trava da coluna `vinculos_admin.acessa_financeiro`, com a matriz 3 tabelas × 4 comandos × 3 atores, fechando SEC-003 (FIN-38 a FIN-42) | Decisão do usuário em 2026-11-04. SEC-003 foi adiado para esta feature (`ljs:.specs/features/conta-e-acesso/spec.md:35`, `ljs:.specs/features/conta-e-acesso/seguranca.md:165-171`); policy restritiva só acrescenta (AD-003, FUN-56) | y |
| Lançamento com data futura | Aceito, como no legado: só conta no saldo quando a data chega e só aparece quando o mês dele vira navegável | O contrato do legado não recusa (`leg:backend/contrato/src/financeiro.ts:23-32`); o saldo corta em hoje (`leg:backend/dominio/src/caixa/saldos.ts:34-40`). Decisão do usuário em 2026-11-04 (AD-055) | y |
| Último admin com acesso ao financeiro removido ou com conta excluída | Aceito como no legado: o grupo fica sem ninguém no financeiro, e o suporte (dono da plataforma) resolve, fora do app | Decisão do usuário em 2026-11-04. O legado não trata; mesmo padrão da grupos-e-elenco para a criadora removida (`ljs:.specs/features/grupos-e-elenco/spec.md:49`) | y |
| Rotas das telas | `/app/grupos/:grupoId/financeiro`, `.../financeiro/lancamentos/novo`, `.../financeiro/lancamentos/:id` e `.../financeiro/config`; o `telas.json` ainda usa `/admin/g-quinta/...` e é ajustado no design | Convenção da v2 (AD-017, AD-022 e as rotas `/app/grupos/g-quinta/...` do `telas.json`) | y |
| Descrição da mensalidade com o apelido | "Mensalidade <apelido> MM/AAAA" fica gravada no lançamento, como no legado | `leg:backend/dominio/src/caixa/mensalidade.ts:25`. O apelido é dado pessoal fraco; a exclusão de jogador com pagamento já é recusada (GEL-85) | y |

**Open questions:** none - as 5 perguntas do rascunho foram respondidas pelo usuário em 2026-11-04 e estão registradas acima.

---

## User Stories

### P1: Configurar o caixa ⭐ MVP

**User Story**: Como admin com acesso ao financeiro, quero informar a mensalidade (opcional), o saldo inicial e a data dele, para o caixa começar a contar a partir dali.

**Why P1**: Sem configuração não há saldo nem resumo (`leg:backend/api/src/aplicacao/financeiro/mes.ts:39-54`).

**Acceptance Criteria**:

1. WHEN o admin com acesso envia `PUT /api/grupos/:grupoId/financeiro/config` com `mensalidadeCentavos` (inteiro de 1 a 99.999.999, ou nulo), `saldoInicialCentavos` (inteiro de −99.999.999 a 99.999.999) e `dataSaldoInicial` válidos THEN o sistema SHALL gravar a configuração única do grupo (cria ou substitui) e responder 200 com os três campos. [FIN-01]
2. IF `dataSaldoInicial` é posterior a hoje THEN o sistema SHALL responder 422 com "A data do saldo inicial não pode ser no futuro." no campo `dataSaldoInicial` e não gravar. [FIN-02]
3. IF algum valor não é inteiro, está fora da faixa, é texto ou o corpo tem campo extra THEN o sistema SHALL responder 422 com os campos e não gravar. [FIN-03]
4. WHEN a configuração é gravada THEN o sistema SHALL registrar `financeiro_config_alterada` na auditoria, na mesma transação, com a mensalidade, o saldo inicial e a data antes e depois. [FIN-04]
5. WHEN a mensalidade muda THEN o sistema SHALL manter o valor dos lançamentos de mensalidade já criados. [FIN-05]
6. WHEN duas gravações da configuração do mesmo grupo chegam ao mesmo tempo THEN o sistema SHALL aplicá-las uma depois da outra, de modo que o "antes" da segunda auditoria seja o "depois" da primeira. [FIN-06]

**Independent Test**: configurar mensalidade R$ 75,00, saldo inicial R$ 350,00 em 01/10; a tela do mês mostra o saldo atual R$ 350,00; tentar data de amanhã mostra o erro no campo.

---

### P1: Ver o caixa do mês ⭐ MVP

**User Story**: Como admin com acesso ao financeiro, quero ver o saldo atual, as entradas, as saídas, o resultado e quem não pagou no mês, para saber como está o caixa.

**Why P1**: É o que substitui a planilha (critério "bom o bastante" de `necessidade.md` §3).

**Acceptance Criteria**:

1. WHEN o admin com acesso abre `GET /api/grupos/:grupoId/financeiro/mes?mes=AAAA-MM` (sem `mes`, o mês de hoje) THEN o sistema SHALL responder com o mês, a data de hoje, a navegação (mês anterior e seguinte, ou nulo), a configuração, o saldo atual, o resumo do mês, a lista de pagamentos e os lançamentos do mês. [FIN-07]
2. IF o grupo não tem configuração THEN o sistema SHALL responder 200 com configuração, saldo e resumo nulos, listas vazias e navegação nula, e a tela SHALL mostrar "Caixa não configurado" com a ação "Configurar caixa". [FIN-08]
3. IF o mês pedido está fora do intervalo que vai do mês da data do saldo inicial ao mês de hoje THEN o sistema SHALL responder 422 com "Mês fora do histórico do caixa." no campo `mes`. [FIN-09]
4. The sistema SHALL calcular o saldo atual como saldo inicial + entradas − saídas dos lançamentos com data entre a data do saldo inicial e hoje, inclusive as duas; se hoje for anterior à data do saldo inicial, o saldo atual SHALL ser o saldo inicial. [FIN-10]
5. The sistema SHALL calcular o resumo do mês com as entradas e as saídas dos lançamentos com data no mês, o resultado (entradas − saídas) e "não pagaram" (jogadores ativos no mês sem pagamento marcado); pagamento de quem não era ativo no mês SHALL não descontar de "não pagaram". [FIN-11]
6. The sistema SHALL considerar ativo no mês o jogador com algum período de atividade `[início, fim)` que contenha ao menos um dia do mês, e SHALL listar os pagamentos só desses jogadores, ordenados pelo apelido sem acento e sem caixa, cada um com `pagou` verdadeiro ou falso. [FIN-12]
7. The sistema SHALL somar valores só em inteiros de centavos, sem arredondar nem converter para decimal, e SHALL falhar a requisição com erro (sem resposta com valor truncado) se uma soma sair do inteiro seguro. [FIN-13]
8. The sistema SHALL listar os lançamentos do mês do mais recente ao mais antigo, cada um com id, tipo, data, descrição, valor e a marca `mensalidade` (vinculado a um pagamento). [FIN-14]
9. The tela SHALL mostrar valores no formato `R$ 1.245,50`, as saídas com o sinal de menos, e as entradas de mensalidade do mês numa linha só ("16 mensalidades de 10/2026", o intervalo de datas e o total) que se abre para mostrar cada uma, como no t22. [FIN-15]

**Independent Test**: com 20 ativos em outubro, 16 pagos, saída de R$ 900,00 e mensalidade de R$ 75,00, a tela mostra entradas R$ 1.200,00, saídas R$ 900,00, resultado R$ 300,00 e "Não pagaram 4 jogadores".

---

### P1: Marcar e desmarcar a mensalidade ⭐ MVP

**User Story**: Como admin com acesso ao financeiro, quero marcar quem pagou o mês e ter a entrada criada sozinha, para não lançar cada mensalidade à mão.

**Why P1**: Regra central do financeiro (`necessidade.md` §3; `leg:backend/api/src/aplicacao/financeiro/marcar-pagamento.ts:13-17`).

**Acceptance Criteria**:

1. WHEN o admin com acesso envia `POST /api/grupos/:grupoId/financeiro/pagamentos` com `jogadorId` e `mes` válidos, e há mensalidade configurada THEN o sistema SHALL gravar o pagamento e criar, vinculado a ele, um lançamento de entrada com a data de hoje, a descrição "Mensalidade <apelido> MM/AAAA" e o valor da configuração (nunca do cliente), e responder 204. [FIN-16]
2. WHEN o pagamento é marcado sem mensalidade configurada (ou sem configuração) THEN o sistema SHALL gravar só o pagamento, sem lançamento, e responder 204. [FIN-17]
3. IF o mês é posterior ao mês de hoje THEN o sistema SHALL responder 422 com "Não dá para marcar o pagamento de um mês que ainda não começou." no campo `mes` e não gravar. [FIN-18]
4. IF o jogador não está ativo no grupo nesse mês, é de outro grupo ou não existe THEN o sistema SHALL responder 422 com "O jogador precisa estar ativo no grupo nesse mês." no campo `jogadorId` e não gravar. [FIN-19]
5. IF o pagamento do jogador naquele mês já está marcado, inclusive numa corrida entre duas requisições THEN o sistema SHALL responder 409 com o código `pagamento_ja_marcado` e "O pagamento deste mês já está marcado.", sem segundo lançamento nem gravação pela metade. [FIN-20]
6. The sistema SHALL gravar o pagamento, o lançamento vinculado e a auditoria `pagamento_marcado` (mês e valor) numa única transação, e nada SHALL ficar gravado se uma das três falhar. [FIN-21]
7. WHEN o admin com acesso envia `DELETE /api/grupos/:grupoId/financeiro/pagamentos/:jogadorId/:mes` de um pagamento marcado THEN o sistema SHALL apagar o pagamento e o lançamento vinculado (mesmo que o valor tenha sido editado), registrar `pagamento_desmarcado` com o valor removido na mesma transação e responder 204. [FIN-22]
8. IF não há pagamento marcado para aquele jogador e mês THEN o sistema SHALL responder 404 sem alterar nada; IF o mês é malformado THEN SHALL responder 422 com "Mês inválido.". [FIN-23]
9. WHEN o admin toca para desmarcar THEN a tela SHALL pedir confirmação com "Desmarcar o pagamento de <apelido>? A entrada "<descrição>" (R$ <valor>) será removida do caixa.", e WHEN a marcação falha THEN SHALL voltar o item para "Não pagou" e mostrar "Não foi possível marcar o pagamento de <apelido>. Tente de novo.". [FIN-24]

**Independent Test**: marcar Toninho em outubro cria "Mensalidade Toninho 10/2026" de R$ 75,00 com a data de hoje; marcar de novo dá 409; desmarcar remove a entrada; marcar novembro em outubro dá 422.

---

### P1: Lançar entradas e saídas ⭐ MVP

**User Story**: Como admin com acesso ao financeiro, quero lançar, editar e excluir entradas e saídas avulsas, para o caixa refletir o aluguel da quadra, as bolas e outras despesas.

**Why P1**: Sem saídas o saldo não fecha.

**Acceptance Criteria**:

1. WHEN o admin com acesso envia `POST /api/grupos/:grupoId/financeiro/lancamentos` com `tipo` (`entrada` ou `saida`), `data`, `descricao` (1 a 80 caracteres depois de tirar os espaços das pontas) e `valorCentavos` (inteiro de 1 a 99.999.999) THEN o sistema SHALL criar o lançamento avulso, registrar `lancamento_criado` com tipo, data e valor na mesma transação e responder 201 com o lançamento, `mensalidade` falso, quem alterou e quando. [FIN-25]
2. IF a descrição está fora do limite, o valor não é inteiro ou está fora da faixa, a data é inválida ou o corpo traz campo extra (inclusive qualquer campo de vínculo com mensalidade) THEN o sistema SHALL responder 422 com os campos e não gravar; a descrição fora do limite SHALL usar "A descrição precisa ter de 1 a 80 caracteres.". [FIN-26]
3. WHEN o admin com acesso envia `PUT /api/grupos/:grupoId/financeiro/lancamentos/:id` válido THEN o sistema SHALL gravar tipo, data, descrição e valor, atualizar quem alterou e quando, registrar `lancamento_editado` com o valor antes e depois na mesma transação e responder 200; uma entrada de mensalidade editada SHALL continuar vinculada ao pagamento. [FIN-27]
4. IF a edição tenta transformar uma entrada de mensalidade em saída THEN o sistema SHALL responder 422 com "A mensalidade é sempre uma entrada." no campo `tipo` e não gravar. [FIN-28]
5. WHEN o admin com acesso envia `DELETE /api/grupos/:grupoId/financeiro/lancamentos/:id` de um lançamento avulso THEN o sistema SHALL apagá-lo, registrar `lancamento_excluido` com tipo, data e valor na mesma transação e responder 204. [FIN-29]
6. IF o lançamento a excluir é a entrada de um pagamento marcado, inclusive se o pagamento for marcado no meio da exclusão THEN o sistema SHALL responder 409 com o código `lancamento_vinculado` e "Esta entrada é a mensalidade de <apelido> MM/AAAA. Desmarque o pagamento no mês para removê-la." e não apagar. [FIN-30]
7. IF o lançamento pedido em `GET`, `PUT` ou `DELETE` não existe ou é de outro grupo THEN o sistema SHALL responder 404, sem distinguir os dois casos. [FIN-31]
8. The tela de lançamento SHALL abrir o novo com Entrada marcada, a data de hoje da API e o contador "0 de 80"; a edição SHALL mostrar "Última alteração: <nome>, dd/mm hh:mm" e a ação Excluir, com a confirmação "Excluir lançamento? "<descrição>" (R$ <valor>) sai do caixa.", como no t23. [FIN-32]

**Independent Test**: lançar a saída "Aluguel da quadra outubro" de R$ 800,00; o saldo cai R$ 800,00; editar para R$ 750,00 sobe R$ 50,00; excluir a mensalidade de Toninho dá 409 com a orientação de desmarcar.

---

### P1: Permissão do financeiro ⭐ MVP

**User Story**: Como admin com acesso ao financeiro, quero que só quem eu autorizar veja e mexa no caixa, para que o dinheiro do grupo não fique aberto a todo admin.

**Why P1**: RA-12 do legado ("só para admin com permissão", `leg:.md/PRD.md:161`); dinheiro.

**Acceptance Criteria**:

1. IF a conta tem vínculo com o grupo mas `acessa_financeiro` é falso THEN toda rota `/api/grupos/:grupoId/financeiro*` SHALL responder 403 com o código `sem_permissao_financeiro` e "Você não tem acesso ao financeiro deste grupo.", e a tela SHALL mostrar o estado "Sem acesso" do t22 com a ação Voltar; sem vínculo, SHALL responder 404. [FIN-33]
2. WHEN um admin abre o início do grupo THEN o sistema SHALL incluir o saldo atual (ou nulo, sem configuração) só para quem tem acesso ao financeiro, e a tela SHALL mostrar o cartão "Financeiro" com o saldo só nesse caso, como no t09; para quem não tem, SHALL não enviar o saldo. [FIN-34]
3. WHEN um admin com acesso envia `PATCH /api/grupos/:grupoId/admins/:contaId/financeiro` com `acessaFinanceiro` THEN o sistema SHALL conceder ou retirar o acesso daquele admin, registrar `financeiro_concedido` ou `financeiro_retirado` na mesma transação e responder com a lista de admins; valor igual ao atual SHALL responder sem gravar nem auditar. [FIN-35]
4. IF quem pede a mudança de acesso não tem acesso ao financeiro THEN o sistema SHALL responder 403 `sem_permissao_financeiro`; IF o alvo é a própria conta THEN SHALL responder 409 com `acao_na_propria_conta` e "Você não pode alterar a sua própria permissão."; IF o alvo não é admin do grupo THEN SHALL responder 404. [FIN-36]
5. WHILE o grupo está arquivado THEN o sistema SHALL recusar toda escrita do financeiro com 409 `grupo_arquivado` e SHALL responder 404 às leituras para quem não é a criadora, seguindo o contrato da feature 3 (GEL-25 e GEL-26). [FIN-37]

**Independent Test**: um admin convidado (sem acesso) recebe 403 no financeiro e não vê o saldo no início; a criadora concede o acesso e ele passa a ver; ele tenta tirar o próprio acesso e recebe 409.

---

### P1: Isolamento, transação e auditoria no banco ⭐ MVP

**User Story**: Como organizador, quero ter certeza de que nem outro grupo, nem o link público, nem um admin sem permissão consegue ler ou alterar o caixa, mesmo que a API tenha um erro.

**Why P1**: Dinheiro e dado pessoal; SEC-003 do LJS deixou a checagem só na aplicação.

**Acceptance Criteria**:

1. WHILE uma transação da `pelada_app` tem só o contexto público de um slug THEN o banco SHALL retornar zero linhas de `config_financeira`, `lancamentos` e `pagamentos_mes` e SHALL recusar INSERT, UPDATE e DELETE nelas. [FIN-38]
2. WHILE uma transação da `pelada_app` tem o contexto de uma conta cujo vínculo com o grupo tem `acessa_financeiro` falso THEN o banco SHALL retornar zero linhas daquele grupo nas três tabelas e SHALL recusar ou afetar zero linhas em INSERT, UPDATE e DELETE, inclusive UPDATE e DELETE sem `WHERE`. [FIN-39]
3. The banco SHALL ter um teste por tabela (as três) e por comando (SELECT, INSERT, UPDATE, DELETE) para cada um destes atores: conta de outro grupo (FUN-17), contexto público (FIN-38) e admin do mesmo grupo sem acesso (FIN-39), e cada teste SHALL falhar se a policy for aberta (`USING (true)`) ou não tiver `WITH CHECK`. [FIN-40]
4. The banco SHALL recusar à `pelada_app` alterar `vinculos_admin.acessa_financeiro` da própria conta e por conta sem acesso ao financeiro no grupo, de modo que um erro na API não conceda a permissão. [FIN-41]
5. The mudança de RLS e de grants SHALL vir numa migração nova da v2, aditiva (sem apagar tabela, coluna ou policy herdada, salvo AD em `.specs/STATE.md`), com timestamp maior que `1792844520000`, e a impressão digital do schema (FUN-08) SHALL ser atualizada com ela. [FIN-42]
6. The sistema SHALL fazer cada escrita do financeiro e a sua auditoria numa única transação da requisição, com o contexto definido por `SET LOCAL` antes da primeira consulta (FUN-16). [FIN-43]
7. The auditoria do financeiro SHALL gravar só ids, nome do evento, mês, datas, tipo e valores em centavos, e nunca a descrição do lançamento, o apelido, o telefone ou o ano de nascimento do jogador. [FIN-44]

**Independent Test**: a suíte de isolamento roda como `pelada_app` com dois grupos e três contas (admin com acesso, admin sem acesso, conta de outro grupo) mais o contexto do slug, e prova a matriz de FIN-40; trocar a policy restritiva por `USING (true)` deixa a suíte vermelha.

---

### P1: Recurso Pro antes da cobrança

**User Story**: Como dono do app, quero que o financeiro funcione antes da feature de planos existir, sem espalhar a regra de plano pelo código, para a feature 7 só ligar o bloqueio.

**Why P1**: D2 põe o financeiro no Pro, mas a cobrança é da feature 7, que depende desta.

**Acceptance Criteria**:

1. WHILE a feature `planos-e-cobranca` não está integrada THEN o sistema SHALL liberar o financeiro (leitura e escrita) para todo grupo com vínculo, sem checar `situacao_comercial`, e SHALL decidir o acesso de plano num único ponto da API, coberto por teste, que a feature 7 liga sem mexer nas rotas do financeiro. [FIN-45]
2. WHEN o ponto único de trava responde "somente leitura" para o grupo (contrato da feature 7: recurso Pro no Free) THEN toda escrita do financeiro (configuração, marcar, desmarcar, criar, editar e excluir lançamento, conceder ou retirar acesso) SHALL responder 403 com o código `plano_pro` sem gravar, e as leituras (mês, lançamento, saldo no início) SHALL continuar respondendo 200; um teste com o ponto forçado em "somente leitura" SHALL provar as duas coisas. [FIN-50]

**Independent Test**: um grupo novo, criado na prévia, usa o financeiro; o teste do ponto de decisão prova que todos os grupos passam hoje, e com o ponto forçado em "somente leitura" a marcação dá 403 `plano_pro` e o mês continua 200.

---

### P1: Telas do financeiro no visual do legado ⭐ MVP

**User Story**: Como admin, quero as telas do caixa iguais às do mockup aprovado.

**Why P1**: Métrica do MVP: comparação visual sem divergência.

**Acceptance Criteria**:

1. The app SHALL ter as telas Financeiro do mês (t22: sucesso, mês vazio, caixa não configurado, sem permissão, desmarcar, erro de pagamento), Lançamento (t23: novo, edição, erro, excluir) e Configurar caixa (t24: vazio, erro), além do cartão Financeiro do início (t09) e do selo e do interruptor "Acessa financeiro" nos admins (t19), usando só os tokens de `tokens.css`. [FIN-46]
2. The telas SHALL passar na comparação visual com o mockup em PC e celular, com as rotas do `telas.json` apontando para `/app/grupos/:grupoId/financeiro...`, e WHEN a API devolve 422 com `campos` THEN a tela SHALL mostrar "Corrija N campos: <rótulos>" e a mensagem ao lado de cada campo. [FIN-47]
3. The t19 SHALL mostrar, para quem tem acesso ao financeiro, um interruptor "Acessa financeiro" por admin (`role="switch"`, rótulo "Acessa financeiro: <nome>"), com o da própria conta marcado conforme a permissão, desabilitado e com texto de ajuda; para quem não tem acesso, SHALL mostrar só o selo "Financeiro". O interruptor SHALL seguir o mockup do legado (`leg:.md/mockup/telas/t19-admins--sucesso.html`) com os componentes e tokens de `.specs/mockup/`, conferido por revisão manual registrada (o t19 aprovado não tem o interruptor, então ele não entra na comparação por pixel). [FIN-51]
4. The tela de configuração SHALL aceitar o valor em reais (ex.: "350,00") e convertê-lo para centavos inteiros sem passar por número decimal, mostrando "Informe um valor em reais, ex.: 350,00." quando o texto não for um valor válido. [FIN-48]

**Independent Test**: a comparação visual das entradas t22, t23 e t24 do `telas.json` fica sem divergência.

---

## Edge Cases

- WHEN a data de hoje muda de mês à meia-noite de `America/Sao_Paulo` THEN o mês padrão, o limite do mês futuro (FIN-18) e o fim do saldo (FIN-10) SHALL seguir o relógio da API nesse fuso, nunca o do cliente nem o UTC. [FIN-49]
- WHEN o pagamento de setembro é marcado em outubro THEN a entrada SHALL ter a data de outubro (regime de caixa) e contar nas entradas de outubro. [FIN-16]
- WHEN o jogador sai e volta no mesmo mês THEN ele SHALL contar uma vez em "não pagaram" e na lista de pagamentos. [FIN-11, FIN-12]
- IF o jogador foi inativado depois de pagar THEN o pagamento SHALL continuar gravado e o desmarcar SHALL continuar possível. [FIN-22]
- IF a soma das entradas passa de 99.999.999 centavos THEN o saldo e o resumo SHALL continuar exatos (a resposta aceita qualquer inteiro seguro; só a entrada do cliente tem teto). [FIN-13]
- IF o saldo inicial é negativo THEN o saldo atual SHALL aceitar e mostrar valor negativo. [FIN-10]
- WHEN um lançamento tem data anterior à data do saldo inicial THEN ele SHALL não entrar no saldo atual. [FIN-10]
- IF a conta autora de um lançamento foi excluída THEN a edição SHALL mostrar "Conta excluída" como autor da última alteração (ACE-28). [FIN-32]
- IF o último admin com acesso ao financeiro é removido ou exclui a conta THEN o sistema SHALL aceitar, deixando o grupo sem ninguém no financeiro; nenhuma rota do app SHALL permitir a outro admin se conceder o acesso, e o caso SHALL ser resolvido pelo suporte (dono da plataforma). [FIN-36]
- WHEN duas requisições desmarcam o mesmo pagamento ao mesmo tempo THEN uma SHALL responder 204 e a outra 404, sem erro 500. [FIN-23]

---

## Implicit-requirement sweep

| Dimensão | Cobertura |
|---|---|
| Validação de entrada e limites | FIN-02, FIN-03, FIN-18, FIN-19, FIN-23, FIN-26, FIN-28, FIN-48 |
| Falha e falha parcial | FIN-13 (estouro sem valor truncado), FIN-21, FIN-24 (tela volta ao estado anterior) |
| Idempotência e repetição | FIN-20 (marcar de novo), FIN-23 (desmarcar o inexistente), FIN-35 (valor igual sem gravar) |
| Fronteiras de auth e rate limit | FIN-33, FIN-36 a FIN-41, FIN-50 (trava de plano). As escritas usam o `LIMITE_ESCRITA` da fundação (FUN-26), sem limite próprio |
| Concorrência e ordem | FIN-06, FIN-20, FIN-30, desmarcar simultâneo nos Edge Cases |
| Ciclo de vida dos dados | FIN-05, FIN-22 (desmarcar apaga a entrada vinculada), FIN-37 (arquivado não apaga). Pagamento bloqueia a exclusão do jogador (GEL-85, feature 3) |
| Observabilidade | FIN-04, FIN-21, FIN-22, FIN-25, FIN-27, FIN-29, FIN-35 (auditoria); FIN-44 (o que nunca entra) |
| Falha de dependência externa | N/A because a feature não chama serviço externo; o banco é coberto por FIN-21 e FIN-43 |
| Integridade de transições de estado | FIN-16 a FIN-23 (não pago ↔ pago, com a entrada vinculada), FIN-28 e FIN-30 (a entrada vinculada não vira saída nem some sozinha) |
| Dinheiro e arredondamento | FIN-01, FIN-13, FIN-25, FIN-48: centavos inteiros do contrato ao banco, sem decimal |
| Fuso e datas | FIN-49 |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----------- | ------ | ------- |
| FIN-01 | P1: Configurar o caixa | Design | Pending |
| FIN-02 | P1: Configurar o caixa | Design | Pending |
| FIN-03 | P1: Configurar o caixa | Design | Pending |
| FIN-04 | P1: Configurar o caixa | Design | Pending |
| FIN-05 | P1: Configurar o caixa | Design | Pending |
| FIN-06 | P1: Configurar o caixa | Design | Pending |
| FIN-07 | P1: Ver o caixa do mês | Design | Pending |
| FIN-08 | P1: Ver o caixa do mês | Design | Pending |
| FIN-09 | P1: Ver o caixa do mês | Design | Pending |
| FIN-10 | P1: Ver o caixa do mês | Design | Pending |
| FIN-11 | P1: Ver o caixa do mês | Design | Pending |
| FIN-12 | P1: Ver o caixa do mês | Design | Pending |
| FIN-13 | P1: Ver o caixa do mês | Design | Pending |
| FIN-14 | P1: Ver o caixa do mês | Design | Pending |
| FIN-15 | P1: Ver o caixa do mês | Design | Pending |
| FIN-16 | P1: Marcar e desmarcar | Design | Pending |
| FIN-17 | P1: Marcar e desmarcar | Design | Pending |
| FIN-18 | P1: Marcar e desmarcar | Design | Pending |
| FIN-19 | P1: Marcar e desmarcar | Design | Pending |
| FIN-20 | P1: Marcar e desmarcar | Design | Pending |
| FIN-21 | P1: Marcar e desmarcar | Design | Pending |
| FIN-22 | P1: Marcar e desmarcar | Design | Pending |
| FIN-23 | P1: Marcar e desmarcar | Design | Pending |
| FIN-24 | P1: Marcar e desmarcar | Design | Pending |
| FIN-25 | P1: Lançamentos | Design | Pending |
| FIN-26 | P1: Lançamentos | Design | Pending |
| FIN-27 | P1: Lançamentos | Design | Pending |
| FIN-28 | P1: Lançamentos | Design | Pending |
| FIN-29 | P1: Lançamentos | Design | Pending |
| FIN-30 | P1: Lançamentos | Design | Pending |
| FIN-31 | P1: Lançamentos | Design | Pending |
| FIN-32 | P1: Lançamentos | Design | Pending |
| FIN-33 | P1: Permissão | Design | Pending |
| FIN-34 | P1: Permissão | Design | Pending |
| FIN-35 | P1: Permissão | Design | Pending |
| FIN-36 | P1: Permissão | Design | Pending |
| FIN-37 | P1: Permissão | Design | Pending |
| FIN-38 | P1: Isolamento | Design | Pending |
| FIN-39 | P1: Isolamento | Design | Pending |
| FIN-40 | P1: Isolamento | Design | Pending |
| FIN-41 | P1: Isolamento | Design | Pending |
| FIN-42 | P1: Isolamento | Design | Pending |
| FIN-43 | P1: Isolamento | Design | Pending |
| FIN-44 | P1: Isolamento | Design | Pending |
| FIN-45 | P1: Recurso Pro | Design | Pending |
| FIN-46 | P1: Telas | Design | Pending |
| FIN-47 | P1: Telas | Design | Pending |
| FIN-48 | P1: Telas | Design | Pending |
| FIN-49 | Edge Cases | Design | Pending |
| FIN-50 | P1: Recurso Pro | Design | Pending |
| FIN-51 | P1: Telas | Design | Pending |

**Coverage:** 51 total, 0 mapped to tasks, 51 unmapped ⚠️ (mapeamento na fase Tasks)

### Origem das regras no legado

| Regra | Fonte |
|---|---|
| Entrada da mensalidade: data de hoje, descrição, valor da configuração; sem mensalidade, só a marcação | `leg:backend/dominio/src/caixa/mensalidade.ts:10-28` |
| Saldo atual, intervalo do saldo, resumo do mês, soma sem estouro | `leg:backend/dominio/src/caixa/saldos.ts:27-79` |
| Mês futuro, jogador fora do mês, já marcado, transação com auditoria | `leg:backend/api/src/aplicacao/financeiro/marcar-pagamento.ts:7-63` |
| Desmarcar apaga a entrada vinculada, com auditoria | `leg:backend/api/src/aplicacao/financeiro/desmarcar-pagamento.ts:5-28`; rota 204/404/422 em `leg:backend/api/src/entrada/rotas/grupos/financeiro/pagamentos-desmarcar.ts:8-27` |
| Limites do mês navegável e forma vazia sem configuração | `leg:backend/api/src/aplicacao/financeiro/mes.ts:20-89`; 422 em `leg:backend/api/src/entrada/rotas/grupos/financeiro/mes.ts:17-22` |
| Configuração: data no futuro recusada, auditoria antes e depois, trava por grupo | `leg:backend/api/src/aplicacao/financeiro/config.ts:7-42`; `leg:backend/api/src/infraestrutura/db/repositorios/financeiro/config.ts:19-39` |
| Lançamentos: auditoria sem descrição, mensalidade sempre entrada, vinculado só sai desmarcando | `leg:backend/api/src/aplicacao/financeiro/lancamentos/criar.ts:7-31`, `editar.ts:7-41`, `excluir.ts:5-36` |
| Limites e centavos inteiros | `leg:backend/contrato/src/limites.ts:17-19`, `leg:backend/contrato/src/primitivos.ts:35-42`, `leg:backend/contrato/src/financeiro.ts:8-103` |
| Ativo no mês | `leg:backend/dominio/src/atividade/atividade.ts:3-36` |
| Permissão 403 e conceder ou retirar | `leg:backend/api/src/entrada/middlewares/grupo.ts:34-43`, `leg:backend/api/src/aplicacao/grupos/admins/financeiro.ts:6-30`, `leg:backend/api/src/entrada/rotas/grupos/admins/financeiro.ts:12-44` |
| Tabelas, restrições e RLS herdadas | `ljs:...1792843200000_linha-de-base.sql:230-269`, `ljs:...1792843260000_roles.sql:20-31`, `ljs:...1792843320000_rls.sql:32-61` |

---

## Success Criteria

- [ ] O grupo de teste roda um mês inteiro de caixa no app (mensalidades, aluguel, saldo) sem planilha.
- [ ] Suíte de isolamento verde com a matriz de FIN-40 (3 tabelas × 4 comandos × 3 atores).
- [ ] Nenhum valor monetário passa por número decimal do contrato ao banco.
- [ ] Comparação visual de t22, t23 e t24 sem divergência.
