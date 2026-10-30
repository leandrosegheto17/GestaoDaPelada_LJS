# Partidas e ranking — Especificação

> Feature 4 de 8 (AD-001). **Spec aprovada pelo usuário em 2026-10-30.** Entrada: `context.md` (P1 a P12),
> `.specs/features/grupos-e-elenco/spec.md` (Out of Scope e Assumptions: C6, C7, débitos I-1, I-3 e SEC-010),
> `.md/PRD.md` (RA-03 a RA-06, RA-09, RA-11, RA-18, RA-19; P-08, P-19, P-23, P-26, P-30, P-43 a P-45),
> `.md/PRD-TECNICO.md` (RF-23 a RF-25, RF-27 a RF-33, RF-49 a RF-52, RF-54, RF-56 a RF-58, RF-70, RF-71, RF-73, RF-78,
> RF-81; RN-01 a RN-07, RN-18, RN-21 a RN-23, RN-25 a RN-31; RNF-06, RNF-13; I-41 a I-43, I-50 a I-56),
> `.md/GUARDRAILS.md` (G-05, G-06, G-10, G-17, G-25, G-26, G-27), `.md/THREAT-MODEL.md` (superfícies 2 e 5, débitos 4 a
> 6), ADR-006, ADR-008, ADR-016, ADR-019, ADR-022, ADR-023 e ADR-035, e o roteiro. Regras portadas do legado
> (`C:\Leandro\Projetos\GestaoDaPelada`, `backend/dominio/src/{pontuacao,ranking,pdf,atividade,datas}`, API e telas de
> partidas, pesos e público), que prevalece sobre o PRD onde os dois divergem (ver Assumptions). Mensagens tiradas das
> telas t01, t03, t09, t10, t11, t16, t18, t21 e P01 de `.specs/mockup/`.

## Problem Statement

Depois da `grupos-e-elenco`, o admin tem grupo e elenco, mas não lança partidas, e o link `/g/:slug` que o início do
grupo já mostra leva a uma rota que não existe. Sem partidas, pesos e ranking, o app não entrega o núcleo do produto
(M1, M2): a tabela pública que o grupo consulta toda semana e compartilha em PDF no WhatsApp. As prévias de acumulado
(C7) também ficaram para cá, porque dependem da função única de acumulado. Esta feature entrega esse núcleo com as regras
do legado, corrigidas em produção, e fecha os débitos 4 a 6 do THREAT-MODEL.

## Goals

- [ ] O admin lança a partida da semana pelo celular, a partir do início do grupo, em menos de 1 minuto para 20 jogadores.
- [ ] O ranking, o PDF e as prévias de um mesmo grupo dão os mesmos números do legado para o mesmo histórico (teste de regressão com os casos do legado).
- [ ] Qualquer pessoa com o link vê o ranking sem login, também sem conexão (último aberto), e exporta o PDF de uma página.
- [ ] Nenhum dado pessoal sai na projeção pública, no PDF ou nos eventos de uso; grupo arquivado ou inexistente mostra "Grupo indisponível".
- [ ] O admin vê, por semana, quantos aparelhos abriram o ranking, quantos PDFs saíram e quantas partidas foram lançadas.

## Out of Scope

| Feature | Reason |
| ----------- | -------------- |
| Pré-preenchimento da partida pela escalação confirmada (RF-26) e o aviso "Pré-marcado pela escalação" da t11 | Feature `simulador`, que cria a escalação |
| Simulador, prioridade da véspera (RN-08) e o evento `escalacao_confirmada` | Feature `simulador`. A função única de acumulado já fica pronta para ela |
| Importação do histórico do legado (RA-17, RF-65 a RF-68) | D5: o banco do legado já foi reaproveitado na linha de base |
| Financeiro (item do início do grupo, atalho do cabeçalho do ranking) | Feature `financeiro` |
| Limites do plano Free, trial e situação comercial | Feature `planos-e-cobranca` |
| Notificações | Feature `notificacoes` |
| Partida cancelada | Não existe no legado |
| Trocar a data na edição da partida | P4: para trocar a data, exclui e lança de novo |
| Pesos com vigência no passado ou no futuro | RF-23 e RN-04: a vigência é sempre hoje |
| Saída de emergência de endereço (`enderecoNovo`, estados `endereco-novo` de t01 e t09) | Mecanismo de troca de host do legado; o host atual é próprio (ADR-028) |
| Lembrar o último grupo no aparelho e abrir o app instalado direto nele | Comportamento de navegação do PWA do legado, fora das histórias desta feature |
| Exclusão definitiva de eventos de uso | Não existe no legado; os eventos são anônimos |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | --------------- | --------- | ---------- |
| PDF do ranking | Entra nesta feature, a partir da mesma projeção pública (G-10) | `context.md` P1 | y |
| Registro anônimo de uso | Entra: `ranking_aberto`, `pdf_exportado`, `partida_lancada` e o painel "Uso do app" | `context.md` P2 | y |
| Ranking sem conexão | Entra: o último ranking aberto do slug fica guardado e aparece com a faixa | `context.md` P3 | y |
| Editar partida | A data é fixa; só mudam chuva e situações | `context.md` P4 | y |
| Ausente | Não grava linha; jogador ativo sem presença é falta e vale 0 | `context.md`; ADR-006 §4; RN-03 | y |
| Pesos padrão | 1, 1, 1, 1, −1, −1 para todo grupo sem configuração (migração) e para o grupo novo (`grupo_criar`) | `context.md`; RN-18; C6 da `grupos-e-elenco` | y |
| Débitos herdados | I-3 (arquivado no ramo público), I-1 (`pelada/sem-escrita-periodo`) e SEC-010 (`deepmerge`) entram | `context.md`; roteiro; THREAT-MODEL débitos 4 a 6 | y |
| Quem saiu e voltou | A contagem recomeça no retorno: o acumulado de hoje soma só as presenças desde o início do período atual, e a pontuação inicial deixa de valer se houver presença antes dele | Legado (RTP-0207 e RTP-0211, aprovados em 2026-10-22; THREAT-MODEL superfície 2). **Diverge** de RN-21, RN-22 e RN-29 do PRD-TECNICO ("reativar não altera ponto") e do texto da t16 "os pontos não mudam"; vale o legado, confirmado pelo usuário em 2026-10-30 | y |
| Texto do diálogo de reativar (t16) | Passa a "Volta a aparecer no ranking e nas partidas; a data de início não muda.", porque a contagem recomeça no retorno e a prévia mostra o efeito nos pontos. Mudam o mockup t16 (todos os estados) e o teste `PeriodosJogador.test.tsx:136`, com o motivo no teste e no commit | Decisão do usuário em 2026-10-30; a frase antiga contradiz a regra do legado | y |
| Presença gravada fora de período | Conta na grade e no acumulado (a grade fecha com o acumulado) | Legado (`rodadasDoJogador`). **Diverge** de RN-21 (1), que manda "–" a quem não estava ativo; vale o legado. Com GEL-68, só dado antigo cai aqui | y |
| PDF com mais de 12 partidas no mês | Ficam as 12 mais recentes do mês; o PTS INICIAL absorve as mais antigas | Legado (`escolherColunasPdf`). **Diverge** de RF-51 ("nunca remover partidas do mês exibido"), impossível com o teto de 12; vale o legado, confirmado pelo usuário em 2026-10-30 | y |
| PTS INICIAL do PDF | Acumulado até a véspera da primeira coluna impressa | I-42; legado | y |
| Mês fora do histórico no público | 422 "Mês fora do histórico do grupo."; sem partidas, só o mês de hoje é válido | Legado (`mesNoHistorico`); RF-31 | y |
| Jogador sem ano de nascimento | Vai para o fim do desempate por ano | Legado (`ANO_SEM_INFORMACAO = 9999`); a coluna aceita nulo por dado antigo | y |
| Limite de taxa do público | `LIMITE_PUBLICO`, 60 requisições por 60 s por IP, já ligado na fundação; 429 | Legado e `wrangler.jsonc`; THREAT-MODEL superfície 2 | y |
| Partida na rota | Identificada pela data (`/partidas/:data`), única por grupo | Legado; `UNIQUE (grupo_id, data)` da linha de base | y |
| Quem aparece na edição | Ativos na data da partida mais quem já tem presença nela | Legado (`carregarPartida`), para nenhuma presença ficar oculta | y |
| Pesos no mesmo dia | Salvar de novo no mesmo dia substitui a configuração do dia | Legado; ADR-006 §3; `UNIQUE (grupo_id, vigente_desde)` | y |
| "Registrado por" e "Última alteração" | Nome da conta (`contas.nome`) | Legado; mockup t11 e t18 | y |
| Auditoria das escritas de período e de início | Passa a levar também o acumulado e a posição antes e depois, agora que a função única existe | RF-72; legado (THREAT-MODEL superfície 3) | y |
| Data da partida na criação e "hoje" | Do `Relogio` injetado (AD-015), também dentro de `grupo_criar`, que passa a receber a data | G-06; AD-015; convenção desta feature | y |
| Semana do painel de uso | Segunda a domingo em America/Sao_Paulo, pelo momento do registro; "em até 48 h" conta a partir da data da partida mais o horário do grupo | Legado (`eventos.porSemana`) | y |
| Ranking sem conexão e painel de uso | Prioridade P2 | RF-54 e RF-58 são Should | y |
| Vigência da configuração padrão criada pela migração | `vigente_desde` = data de criação do grupo em America/Sao_Paulo; `registrado_por` = `grupos.criado_por` | Toda partida usa a mais antiga quando é anterior a ela (legado), então a data não muda pontos; a coluna exige uma conta; decisão do usuário em 2026-10-30 | y |
| Rótulo "Pesos padrão" no início do grupo | Aparece quando o grupo tem uma só configuração e ela tem os valores de RN-18; senão "Vigente desde dd/mm/aaaa" | Mockup t09 `sem-jogadores`; o legado tinha o campo `pesosPadrao` no contrato, mas a API nunca o preenchia; decisão do usuário em 2026-10-30 | y |
| Coluna "Escalações / partidas" do painel | Fica na tabela, com 0 escalações até o `simulador` | Legado e mockup t21; a tela não muda quando o simulador chegar; decisão do usuário em 2026-10-30 | y |
| Tela "Uso do app" (t21) | Entra, aberta pelo item "Uso do app" do início | Legado (T21); RF-58 pede o painel por semana; decisão do usuário em 2026-10-30 | y |
| Comparação visual da t09 | Entra só o estado `sem-jogadores`; o `sucesso` espera Simulador e Financeiro | O `sucesso` do mockup mostra itens de features seguintes; decisão do usuário em 2026-10-30 | y |
| Atalho "Financeiro" no cabeçalho da t01 | Oculto até a feature `financeiro`; a comparação visual da t01 o mascara pela lista `ocultar` de `telas.json` | Out of Scope (financeiro); decisão do usuário em 2026-10-30 | y |
| Prévias em grupo arquivado | Recebem 409 `grupo_arquivado`, como toda rota POST, pelo `exigirGrupoAtivo` | São POST; o middleware não distingue escrita de cálculo e não vale abrir exceção; decisão do usuário em 2026-10-30 | y |
| Ordem do histórico de pesos | Mais recente primeiro | Mockup t18 | y |

**Open questions:** none — todas resolvidas ou registradas acima.

---

## User Stories

Convenções que valem para todas as histórias:

- "Admin" é uma conta com vínculo em `vinculos_admin`. Rota de admin fica sob `/api/grupos/:grupoId/...` e responde 404 sem revelar existência quando não há vínculo (G-03), também para id de jogador, período ou partida de outro grupo.
- Escrita (método que não é GET nem HEAD) em grupo arquivado responde 409 `grupo_arquivado` pelo middleware `exigirGrupoAtivo` (GEL-26).
- Erro de validação responde 422 com "Corrija os campos indicados." e o objeto `campos`; corpo com campo desconhecido é recusado com 422 (`.strict()`); nada é gravado.
- Rota pública fica sob `/api/publico/:slug/...`, sem sessão, no contexto do slug (`app.slug_publico`) e sob `LIMITE_PUBLICO`.
- Toda rota nova entra em `backend/api/test/isolamento/casos.ts`.
- "Hoje" e o mês são de America/Sao_Paulo e vêm do `Relogio` injetado (AD-015, G-06), nunca do `now()` do SQL, do relógio do aparelho nem do domínio, que os recebe por parâmetro.
- Regra de negócio só em `@pelada/dominio` (G-05): a tela e o gerador de PDF só formatam o que a API entrega.
- Datas trafegam como `AAAA-MM-DD`, meses como `AAAA-MM`; a tela mostra `dd/mm/aaaa`, `dd/mm` e "outubro de 2026".

### P1: Pesos de pontuação com vigência ⭐ MVP

**User Story**: Como admin, quero ver e trocar os pesos de presença, lesão e expulsão, com e sem chuva, sem mudar as partidas que já passaram.

**Why P1**: RA-04, RF-23 e RF-24; sem pesos não há pontos.

**Acceptance Criteria**:

1. WHEN um admin abre `GET /api/grupos/:grupoId/pesos` THEN o sistema SHALL responder 200 com `hoje`, `vigente` (os 6 pesos, `vigenteDesde` e `registradoPor`) e `historico` com as configurações anteriores, da mais recente para a mais antiga, cada uma com os 6 pesos, `vigenteDesde`, `vigenteAte` e `registradoPor`. [PAR-01]
2. The sistema SHALL calcular o `vigenteAte` de uma configuração anterior como o dia anterior ao `vigenteDesde` da configuração seguinte. [PAR-02]
3. WHEN um admin envia `POST /api/grupos/:grupoId/pesos` com `presencaSemChuva`, `presencaComChuva`, `lesionadoSemChuva`, `lesionadoComChuva`, `expulsoSemChuva` e `expulsoComChuva` válidos THEN o sistema SHALL gravar a configuração com `vigente_desde` igual a hoje e a conta como `registrado_por`, e responder 200 com o painel atualizado. [PAR-03]
4. IF já existe configuração com vigência hoje THEN o sistema SHALL substituí-la, sem criar outra linha. [PAR-04]
5. WHEN a configuração é gravada THEN o sistema SHALL registrar na auditoria, na mesma transação, `pesos_substituidos` (se substituiu a do dia) ou `pesos_configurados` (se não), com os 6 pesos. [PAR-05]
6. IF algum peso não é inteiro ou está fora de −10 a 10 THEN o sistema SHALL responder 422 com "Use um número inteiro de -10 a 10." no campo desse peso. [PAR-06]
7. IF falta algum dos 6 pesos THEN o sistema SHALL responder 422 com erro no campo que falta. [PAR-07]
8. IF o corpo traz `vigenteDesde` ou qualquer outro campo THEN o sistema SHALL responder 422 e não gravar. [PAR-08]
9. The sistema SHALL nunca alterar nem apagar uma configuração com `vigente_desde` anterior a hoje. [PAR-09]
10. The tela de pontuação (t18) SHALL mostrar "Vigente desde dd/mm/aaaa", a tabela "Pesos vigentes", o formulário "Nova configuração (vale a partir de hoje)" com a nota "Inteiros de −10 a 10. Partidas anteriores a hoje não mudam." e o "Histórico" com uma linha "De dd/mm/aaaa a dd/mm/aaaa" e "p · p · p · p · p · p · registrado por <nome>" por configuração anterior. [PAR-10]
11. WHEN a nova configuração é salva THEN a tela SHALL mostrar "Nova configuração vale a partir de hoje.". [PAR-11]
12. IF um campo da tela está vazio ou não é inteiro de −10 a 10 THEN a tela SHALL mostrar "Use um número inteiro de −10 a 10." ao lado dele, sem enviar. [PAR-12]

**Independent Test**: salvar presença com chuva 2 hoje; o histórico ganha a linha anterior até ontem; salvar de novo hoje substitui, e uma partida de ontem com chuva continua valendo o peso antigo.

---

### P1: Pesos padrão para todo grupo ⭐ MVP

**User Story**: Como organizador, quero que meu grupo já nasça com os pesos padrão, para lançar a primeira partida sem configurar nada.

**Why P1**: RN-18; a `grupos-e-elenco` não criou pesos (C6), e o ranking não calcula sem eles.

**Acceptance Criteria**:

1. The migração nova SHALL criar, para cada grupo sem nenhuma linha em `config_pesos`, uma configuração com presença 1 e 1, lesionado 1 e 1, expulso −1 e −1, `vigente_desde` igual à data de `grupos.criado_em` em America/Sao_Paulo e `registrado_por` igual a `grupos.criado_por`. [PAR-13]
2. The migração SHALL ser aditiva, sem editar migration aplicada, e não SHALL alterar configuração existente. [PAR-14]
3. WHEN um grupo é criado por `grupo_criar` THEN o sistema SHALL criar, na mesma transação, a configuração padrão com `vigente_desde` igual ao hoje do `Relogio` (recebido como parâmetro pela função) e a conta criadora como `registrado_por`. [PAR-15]
4. IF a criação da configuração padrão falha THEN o sistema SHALL desfazer a criação do grupo inteira (GEL-09). [PAR-16]

**Independent Test**: depois de `pnpm migrar`, todo grupo do seed tem uma configuração; criar um grupo novo pela tela e abrir Pontuação mostra os pesos 1, 1, 1, 1, −1, −1 vigentes desde hoje.

---

### P1: Lançar partida ⭐ MVP

**User Story**: Como admin, quero lançar a partida do dia com a chuva e a situação de cada jogador, para o ranking se atualizar.

**Why P1**: RA-05, RF-25 e RF-27; é a ação semanal do admin (G1).

**Acceptance Criteria**:

1. WHEN um admin abre `GET /api/grupos/:grupoId/partidas/nova` sem `data` THEN o sistema SHALL responder 200 com `data` e `dataSugerida` iguais à maior data até hoje que cai no dia da semana do grupo, `hoje`, `choveu: false` e `jogadores` com os ativos na data, cada um com id, apelido e `situacao: "ausente"`, ordenados pelo apelido sem acento nem caixa. [PAR-17]
2. WHEN a consulta traz `data` THEN o sistema SHALL responder com os ativos daquela data e manter `dataSugerida` como a do item anterior. [PAR-18]
3. IF a `data` da consulta ou do corpo não é uma data real `AAAA-MM-DD` THEN o sistema SHALL responder 422 com "Informe uma data válida." no campo `data`. [PAR-19]
4. IF a data é posterior a hoje THEN o sistema SHALL responder 422 com "A data não pode ser no futuro." no campo `data`, na consulta e no lançamento. [PAR-20]
5. IF já existe partida do grupo na data THEN o sistema SHALL responder 409 com o código `partida_ja_existe`, a mensagem "Já existe uma partida em dd/mm/aaaa." e `dataExistente`, na consulta e no lançamento. [PAR-21]
6. WHEN um admin envia `POST /api/grupos/:grupoId/partidas` com `data`, `choveu` e `marcacoes` válidos THEN o sistema SHALL gravar a partida e uma presença para cada marcação `presente`, `lesionado` ou `expulso`, e responder 201 com `data`, `hoje`, `choveu`, `alteradaPor`, `alteradaEm` e `jogadores`. [PAR-22]
7. The sistema SHALL não gravar linha para marcação `ausente` nem para jogador ativo sem marcação. [PAR-23]
8. IF uma marcação é de jogador inativo na data, inexistente ou de outro grupo THEN o sistema SHALL responder 422 com "Jogador não está ativo nesta data." no campo `marcacoes.<índice>.jogadorId`, com a mesma mensagem nos três casos, e não gravar nada. [PAR-24]
9. IF o mesmo jogador aparece em duas marcações THEN o sistema SHALL responder 422 com "Há jogador repetido nas marcações." no campo `marcacoes` e não gravar nada. [PAR-25]
10. IF a situação não é uma de `ausente`, `presente`, `lesionado`, `expulso` THEN o sistema SHALL responder 422 no campo da marcação. [PAR-26]
11. The sistema SHALL considerar ativo na data o jogador com um período de atividade [início, fim) que contém a data (GEL-61). [PAR-27]
12. The sistema SHALL gravar a partida, as presenças, o evento de uso `partida_lancada` (data da partida e momento) e a auditoria `partida_lancada` (data, chuva e contagens de presentes, lesionados e expulsos, com a conta como autora) numa única transação, desfeita inteira em qualquer falha. [PAR-28]
13. The sistema SHALL travar os jogadores marcados, em ordem crescente de id, antes de validar as marcações. [PAR-29]
14. WHEN dois lançamentos da mesma data chegam ao mesmo tempo THEN o sistema SHALL gravar um (201) e recusar o outro com 409 `partida_ja_existe`. [PAR-30]
15. The tela de lançar partida (t11) SHALL mostrar Data (com a sugerida), "Choveu?" (padrão Não), "Presentes N · Lesionados N · Expulsos N · Ausentes N", "Buscar jogador", "Marcar todos como presentes", "Limpar marcações", os botões A, P, L e E de cada jogador e "Salvar partida (N presentes)". [PAR-31]
16. WHEN o admin troca a data THEN a tela SHALL mostrar "Carregando os jogadores ativos em dd/mm…" e recarregar a lista para a nova data. [PAR-32]
17. WHEN ninguém estava ativo na data THEN a tela SHALL mostrar "Ninguém estava ativo nessa data." e "Escolha outra data ou confira as datas de entrada dos jogadores.". [PAR-33]
18. WHEN a API responde 409 `partida_ja_existe` THEN a tela SHALL mostrar "Já existe uma partida em dd/mm/aaaa." e o link "Editar a partida de dd/mm". [PAR-34]
19. IF o envio falha por rede ou servidor THEN a tela SHALL mostrar "Não salvou. Suas marcações continuam aqui." com "Tentar de novo", sem perder as marcações. [PAR-35]
20. WHEN a partida é salva THEN a tela SHALL voltar ao início do grupo com "Partida de dd/mm salva.". [PAR-36]

**Independent Test**: num grupo de quinta, abrir "Lançar partida" numa sexta sugere a quinta anterior; marcar 3 presentes e 1 expulso grava 4 presenças; lançar de novo a mesma data mostra o erro com o link de edição.

---

### P1: Partidas do mês ⭐ MVP

**User Story**: Como admin, quero ver as partidas do mês com as contagens, para conferir o que foi lançado e abrir uma para editar.

**Why P1**: t10; é a porta de entrada da edição.

**Acceptance Criteria**:

1. WHEN um admin abre `GET /api/grupos/:grupoId/partidas?mes=AAAA-MM` THEN o sistema SHALL responder 200 com `mes`, `hoje`, `navegacao` (`mesAnterior`, `mesSeguinte`) e as partidas do mês da mais recente para a mais antiga, cada uma com `data`, `choveu` e `contagem` de presentes, lesionados e expulsos. [PAR-37]
2. IF a consulta não traz `mes` THEN o sistema SHALL usar o mês de hoje. [PAR-38]
3. IF `mes` não está no formato `AAAA-MM` THEN o sistema SHALL responder 422 com "Informe o mês como AAAA-MM." no campo `mes`. [PAR-39]
4. IF `mes` é posterior ao mês de hoje THEN o sistema SHALL responder 422 com "O mês não pode ser futuro." no campo `mes`. [PAR-40]
5. The sistema SHALL limitar a navegação da lista do mês da primeira partida do grupo ao mês de hoje, com `mesAnterior` e `mesSeguinte` nulos quando o grupo não tem partida. [PAR-41]
6. The tela de partidas (t10) SHALL mostrar cada partida como "Quinta, 15/10/2026" e "15 P · 0 L · 1 E", com "chuva · " antes das contagens quando choveu, e o botão "Nova partida". [PAR-42]
7. WHEN o mês não tem partidas THEN a tela SHALL mostrar "Nenhuma partida neste mês." e "Nova partida". [PAR-43]

**Independent Test**: com partidas em 01/10, 08/10 (chuva) e 15/10, a lista de outubro mostra as três, de 15/10 para 01/10; julho sem partidas mostra o vazio.

---

### P1: Editar e excluir partida ⭐ MVP

**User Story**: Como admin, quero corrigir a chuva e as situações de uma partida ou excluí-la, para acertar um lançamento errado.

**Why P1**: RF-28, P4; é o caminho para lançar a presença das rodadas que passam a constar (P-43).

**Acceptance Criteria**:

1. WHEN um admin abre `GET /api/grupos/:grupoId/partidas/:data` THEN o sistema SHALL responder 200 com `data`, `hoje`, `choveu`, `alteradaPor` (nome da conta), `alteradaEm` e `jogadores` com os ativos na data e quem já tem presença nela, pelo apelido sem acento nem caixa, cada um com a situação gravada ou `ausente`. [PAR-44]
2. IF não há partida do grupo na data, ou a data do caminho não é uma data real THEN o sistema SHALL responder 404 na leitura, na edição e na exclusão. [PAR-45]
3. WHEN um admin envia `PUT /api/grupos/:grupoId/partidas/:data` com `data`, `choveu` e `marcacoes` válidos THEN o sistema SHALL substituir a chuva e todas as presenças da partida, gravar `alterada_por` e `alterada_em` e responder 200 com a partida. [PAR-46]
4. IF a `data` do corpo difere da data do caminho THEN o sistema SHALL responder 422 com "A data da partida não pode ser alterada." no campo `data` e não gravar. [PAR-47]
5. The sistema SHALL validar as marcações da edição contra os jogadores ativos na data da partida (não de hoje), com as recusas de PAR-24 e seguintes. [PAR-48]
6. WHEN a edição é gravada THEN o sistema SHALL registrar `partida_editada` na auditoria com a data, a chuva e as contagens, na mesma transação, com os jogadores marcados travados como em PAR-29, e sem registrar evento de uso. [PAR-49]
7. WHEN um admin envia `DELETE /api/grupos/:grupoId/partidas/:data` THEN o sistema SHALL apagar a partida e as presenças, registrar `partida_excluida` com a data na auditoria, na mesma transação, e responder 204. [PAR-50]
8. The exclusão SHALL manter o evento de uso `partida_lancada` já registrado. [PAR-51]
9. The tela de edição SHALL mostrar a data sem campo editável e "Última alteração: <nome>, dd/mm hh:mm". [PAR-52]
10. WHEN o admin pede para excluir THEN a tela SHALL confirmar com "Excluir a partida de dd/mm?", "As presenças dessa partida saem do ranking, e os pontos de todos são recalculados.", "Cancelar" e "Excluir partida". [PAR-53]
11. WHEN a exclusão termina THEN a tela SHALL ir para as partidas do mês com "Partida de dd/mm excluída."; IF ela falha THEN SHALL mostrar "Não foi possível excluir a partida. Tente de novo.". [PAR-54]

**Independent Test**: editar a partida de 15/10 trocando um presente por lesionado muda os pontos dele no ranking; excluí-la tira a coluna 15/10 do ranking e a auditoria guarda as duas ações.

---

### P1: Função única de acumulado ⭐ MVP

**User Story**: Como organizador, quero que ranking, PDF e prévias contem os pontos do mesmo jeito, para ninguém ver dois números diferentes.

**Why P1**: RN-01, RN-25, RF-73, G-25 e ADR-023; é a regra corrigida em produção que mais muda o ranking.

**Acceptance Criteria**:

1. The sistema SHALL calcular os pontos de uma presença como o peso da situação (presente, lesionado ou expulso) sem chuva ou com chuva, conforme a partida, na configuração vigente na data da partida. [PAR-55]
2. The sistema SHALL tomar como vigente numa data a configuração de maior `vigente_desde` igual ou anterior a ela; IF a data é anterior à primeira configuração THEN SHALL usar a mais antiga. [PAR-56]
3. The sistema SHALL definir o início da contagem de um jogador numa data X como a data de início da pontuação S quando o período mais recente com início até X é o primeiro (ou não há nenhum), e como o início desse período (o retorno) quando ele não é o primeiro. [PAR-57]
4. The sistema SHALL calcular o acumulado de um jogador até a referência D como a soma dos pontos das suas presenças com data do início da contagem até D, inclusive nas duas pontas. [PAR-58]
5. The sistema SHALL somar a pontuação inicial ao acumulado só quando o início da contagem é igual ou anterior à primeira presença do jogador em todo o histórico, ou quando ele não tem presença. [PAR-59]
6. The sistema SHALL contar uma presença gravada mesmo que a data dela esteja fora de período de atividade, desde que esteja entre o início da contagem e a referência. [PAR-60]
7. The sistema SHALL ter uma só função de acumulado em `@pelada/dominio`, usada pelo ranking, pelo PDF e pelas prévias, sem relógio nem I/O, e com regra ESLint que falha se outro módulo somar pontos ou chamar o cálculo fora do domínio (G-25). [PAR-61]
8. The sistema SHALL calcular o ranking na leitura, a partir de jogadores, períodos, partidas, presenças e pesos, sem tabela de pontos gravada (ADR-006). [PAR-62]
9. The sistema SHALL calcular o ranking de 40 jogadores com 104 partidas em menos de 5 ms (mediana) no domínio. [PAR-63]

**Independent Test**: os testes de domínio portados do legado (`acumulado-inicio`, `ranking`, `pdf`, `previa-*`) passam com os mesmos valores, incluindo Vandré, Kim e o caso "saiu e voltou".

---

### P1: Ranking público ⭐ MVP

**User Story**: Como jogador, quero abrir o link do grupo e ver o ranking com os pontos de cada partida do mês, sem login.

**Why P1**: RA-06, RF-29, RF-30 e RF-33; é a tela principal (M1, M2).

**Acceptance Criteria**:

1. WHEN alguém sem sessão abre `GET /api/publico/:slug/ranking` THEN o sistema SHALL responder 200 com `grupo` (`nome`, `slug`, `diaSemana`, `frequencia`, `horario`), `mes`, `hoje`, `geradoEm`, `navegacao`, `resumoMes` (`partidas`, `comChuva`), `partidas` do mês em ordem crescente de data (`data`, `choveu`) e `linhas`. [PAR-64]
2. IF a consulta não traz `mes` THEN o sistema SHALL usar o mês de hoje; IF `mes` não está no formato `AAAA-MM` THEN SHALL responder 422 com "Mês inválido." no campo `mes`. [PAR-65]
3. IF o mês é anterior ao mês da primeira partida, posterior ao mês de hoje ou, num grupo sem partidas, diferente do mês de hoje THEN o sistema SHALL responder 422 com "Mês fora do histórico do grupo." no campo `mes`. [PAR-66]
4. The sistema SHALL listar nas linhas só os jogadores ativos hoje, os mesmos em qualquer mês exibido (RN-06). [PAR-67]
5. The sistema SHALL ordenar as linhas pelo acumulado até hoje (maior primeiro), depois pelo ano de nascimento (menor primeiro, sem ano no fim) e depois pelo apelido sem acento nem caixa, com a mesma ordem em qualquer mês exibido (RN-05, P-26). [PAR-68]
6. The sistema SHALL dar a mesma posição aos jogadores empatados nos três critérios, e a posição seguinte pula os empatados (1, 1, 3). [PAR-69]
7. The sistema SHALL mostrar em cada linha `posicao`, `apelido`, `ptsInicial`, uma rodada por partida do mês e `ptsFinal`. [PAR-70]
8. The sistema SHALL dar à rodada de uma presença gravada a situação dela e os pontos de PAR-55. [PAR-71]
9. The sistema SHALL dar à rodada de um jogador ativo na data sem presença a situação `falta` e 0 ponto. [PAR-72]
10. The sistema SHALL dar a situação `fora` e pontos nulos ("–") à rodada de um jogador que não estava ativo na data e não tem presença, e a toda rodada anterior ao início da contagem do mês, com ou sem presença. [PAR-73]
11. The sistema SHALL calcular o PTS INICIAL do mês M como o acumulado até a véspera do dia 1 de M, com o início da contagem tomado no último dia de M ou em hoje, o que vier primeiro. [PAR-74]
12. The sistema SHALL calcular o PTS FINAL do mês M como o PTS INICIAL mais a soma dos pontos das rodadas de M, com "–" valendo 0. [PAR-75]
13. The projeção pública SHALL ter só os campos de PAR-64 e PAR-70, com schemas `.strict()`, e nunca id de jogador, telefone, ano de nascimento, idade, posição em campo, notas, nível, períodos, pontuação inicial isolada ou financeiro, verificado por teste que procura esses campos na resposta (G-10, RF-33). [PAR-76]
14. The sistema SHALL ler o ranking só no contexto do slug, sem sessão, numa transação somente leitura. [PAR-77]
15. WHILE um IP passa de 60 requisições em 60 s nas rotas `/api/publico/*` o sistema SHALL responder 429 com "Muitas requisições. Tente de novo em instantes.", usando o IP só como chave do limitador, sem gravá-lo nem registrá-lo em log. [PAR-78]
16. WHEN alguém abre `/g/:slug` THEN a tela (t01) SHALL mostrar, sem login, o nome do grupo, a agenda ("Toda quinta · 20:00"), o mês exibido, "Exportar PDF", "N partidas no mês, M com chuva. Ordem pelos pontos acumulados até hoje." e a tabela "#", "Jogador", "Pts inicial", uma coluna por partida com "dd/mm" e o ícone de sol ou de chuva (texto ", sem chuva" ou ", com chuva") e "Pts final". [PAR-79]
17. The tela SHALL mostrar em cada rodada o número de pontos com um indicador da situação além da cor e o texto acessível "Presente, 1 ponto", "Lesionado, 1 ponto", "Expulso, menos 1 ponto" ou "Falta, 0 pontos", e "–" com "Fora do grupo ou antes da data de início" (RNF-10). [PAR-80]
18. WHEN o grupo não tem jogador ativo hoje THEN a tela SHALL mostrar "Nenhum jogador no ranking ainda." e "Quando o admin cadastrar os jogadores, o ranking aparece aqui.". [PAR-81]
19. WHILE o ranking carrega pela primeira vez a tela SHALL mostrar "Carregando o ranking…". [PAR-82]
20. The link "Ver ranking" do início do grupo SHALL abrir `/g/:slug` do grupo, que passa a existir. [PAR-83]

**Independent Test**: com o seed da Pelada de Quinta, `/g/pelada-de-quinta` mostra outubro com 3 colunas e as linhas na ordem do mockup; o JSON da API não tem nenhum dos campos proibidos.

---

### P1: Navegação entre meses e mês sem partidas ⭐ MVP

**User Story**: Como jogador, quero ver os meses anteriores com a mesma ordem de hoje, para conferir as partidas de cada mês.

**Why P1**: RF-31, RF-32 e P-26.

**Acceptance Criteria**:

1. The sistema SHALL devolver `navegacao.mesAnterior` igual ao mês anterior a M quando M é posterior ao mês da primeira partida, e nulo nos outros casos. [PAR-84]
2. The sistema SHALL devolver `navegacao.mesSeguinte` igual ao mês seguinte a M quando M é anterior ao mês de hoje, e nulo nos outros casos. [PAR-85]
3. IF o grupo não tem nenhuma partida THEN o sistema SHALL devolver `mesAnterior` e `mesSeguinte` nulos, as linhas dos ativos com PTS INICIAL e PTS FINAL iguais ao acumulado e `partidas` vazio. [PAR-86]
4. WHEN o mês exibido não tem partidas, dentro do histórico THEN o sistema SHALL manter as linhas e a ordem, devolver `partidas` vazio e PTS INICIAL igual ao PTS FINAL em cada linha. [PAR-87]
5. WHEN o mês exibido não tem partidas THEN a tela SHALL mostrar "Nenhuma partida registrada neste mês" no lugar das colunas de partida, com os cabeçalhos "Pts inicial (início de <mês>)" e "Pts final (fim de <mês>)". [PAR-88]
6. WHEN a pessoa toca em "Mês anterior" ou "Mês seguinte" THEN a tela SHALL trocar o `?mes=` da URL e as colunas, o PTS INICIAL e o PTS FINAL, mantendo as linhas e a ordem, com o botão desabilitado quando a API devolve nulo. [PAR-89]

**Independent Test**: em julho sem partidas, a tela mostra o vazio do mês com PTS INICIAL igual ao PTS FINAL; voltar para outubro devolve as colunas, com a mesma ordem.

---

### P1: Grupo indisponível ⭐ MVP

**User Story**: Como jogador, quero ver um aviso claro quando o link não leva a um grupo disponível, sem descobrir se ele existe.

**Why P1**: RF-03, RF-09, ADR-016 §7 e débito 6 do THREAT-MODEL (I-3).

**Acceptance Criteria**:

1. IF o slug é malformado, não existe ou é de grupo arquivado THEN o sistema SHALL responder 404 com o mesmo corpo em todas as rotas `/api/publico/:slug/*`, sem distinguir as causas. [PAR-90]
2. The migração nova SHALL trocar `grupos_visiveis()` para que o ramo do slug público só devolva grupo com `arquivado_em` nulo, mantendo o ramo com conta do ADR-035. [PAR-91]
3. The sistema SHALL ter teste de RLS, como `pelada_app`, que no contexto do slug de um grupo arquivado não lê nenhuma linha de `grupos`, `jogadores`, `periodos_ativos`, `partidas`, `presencas`, `config_pesos` nem `eventos_uso`. [PAR-92]
4. WHEN o grupo arquivado é reativado THEN o sistema SHALL voltar a servir o ranking pelo mesmo slug. [PAR-93]
5. WHEN `/g/:slug` recebe 404 da API, ou o slug é malformado THEN a tela (t03) SHALL mostrar "Grupo indisponível" e "Este grupo não está disponível no momento. Fale com o admin do seu grupo.", sem chamar a API no slug malformado. [PAR-94]

**Independent Test**: arquivar a Pelada de Quinta; `/g/pelada-de-quinta` mostra "Grupo indisponível", igual a `/g/nao-existe`; reativar devolve o ranking.

---

### P1: PDF do ranking ⭐ MVP

**User Story**: Como jogador, quero exportar o ranking do mês num PDF de uma página e mandar no grupo do WhatsApp.

**Why P1**: RA-09, RF-49 a RF-52, P-19, P-23 e P1; é a base de M3.

**Acceptance Criteria**:

1. WHEN alguém sem sessão abre `GET /api/publico/:slug/pdf?mes=AAAA-MM` THEN o sistema SHALL responder 200 com `grupo` (`nome`, `slug`), `mes`, `geradoEm`, `urlPublica` (`<URL_PUBLICA>/g/<slug>`), `semPartidasNoMes`, `colunas` (`data`, `choveu`, `doMesExibido`) e `linhas` (`posicao`, `apelido`, `ptsInicial`, uma rodada por coluna, `ptsFinal`). [PAR-95]
2. The sistema SHALL escolher como colunas as partidas até o último dia do mês exibido, as 12 mais recentes, em ordem cronológica, de modo que uma partida do mês só sai quando o mês tem mais de 12. [PAR-96]
3. The sistema SHALL marcar `semPartidasNoMes` quando o mês exibido não tem partida, com as colunas só de meses anteriores. [PAR-97]
4. The sistema SHALL calcular o `ptsInicial` do PDF como o acumulado até a véspera da primeira coluna, e igual ao `ptsFinal` quando não há coluna (I-42). [PAR-98]
5. The sistema SHALL usar no PDF as mesmas linhas, ordem, posições e `ptsFinal` do ranking do mês, e as rodadas pelas regras de PAR-71 a PAR-73. [PAR-99]
6. The rota do PDF SHALL aplicar as mesmas respostas da rota do ranking para mês inválido, mês fora do histórico, slug indisponível e limite de taxa. [PAR-100]
7. The projeção do PDF SHALL ter schemas `.strict()`, no máximo 12 colunas e uma rodada por coluna em cada linha, sem nenhum campo proibido de PAR-76. [PAR-101]
8. WHEN a pessoa toca em "Exportar PDF" THEN a tela SHALL mostrar "Preparando PDF…" e gerar o arquivo no navegador a partir da projeção, com a biblioteca de PDF carregada só nesse momento (ADR-008). [PAR-102]
9. The PDF SHALL ter exatamente 1 página A4 retrato para até 40 jogadores e 12 colunas, com fonte de no mínimo 7 pt. [PAR-103]
10. The PDF SHALL trazer o nome do grupo, "Ranking: <mês> de <ano>", "Gerado em dd/mm/aaaa hh:mm", a tabela com os meses sobre as colunas, os ícones de sol e de chuva, a legenda das situações e dos ícones com equivalente que não depende de cor, e o rodapé "Gestão da Pelada" com o endereço público sem o esquema. [PAR-104]
11. WHEN o aparelho compartilha arquivo (`navigator.canShare({ files })`) THEN a tela SHALL mostrar o diálogo "PDF pronto." com "Ranking de <mês> de <ano> da <grupo>.", "Baixar" e "Compartilhar"; a recusa do compartilhamento volta a esse diálogo (ADR-022). [PAR-105]
12. IF o aparelho não compartilha arquivo THEN a tela SHALL baixar `ranking-<slug>-<AAAA-MM>.pdf` e mostrar "PDF baixado.". [PAR-106]
13. IF a projeção ou a geração falha THEN a tela SHALL mostrar "Não foi possível gerar o PDF." com "Tentar de novo". [PAR-107]
14. The PDF SHALL passar na comparação visual com P01 (`sucesso` e `mes-vazio`), com 794 × 1123 px exatos e divergência de até 4,5% localmente e 9% no CI (ADR-019). [PAR-108]

**Independent Test**: exportar outubro no PC abre "PDF pronto."; o arquivo tem uma página com 12 colunas de 25/06 a 15/10 e a soma de cada linha fecha o Pts final.

---

### P1: Prévias de reativar, data de início e correção de períodos ⭐ MVP

**User Story**: Como admin, quero ver o efeito de uma mudança de datas no acumulado e na posição antes de confirmar.

**Why P1**: RA-18, RA-19, RF-70, RF-71, RF-78 e C7 da `grupos-e-elenco`.

**Acceptance Criteria**:

1. WHEN um admin envia `POST /api/grupos/:grupoId/jogadores/:id/reativar/previa` com `data` (o mesmo corpo da gravação; decisão do usuário em 2026-10-30) para um jogador inativo THEN o sistema SHALL responder 200 com `acumuladoAntes`, `acumuladoDepois`, `posicaoAntes`, `posicaoDepois`, `rodadasQuePassamAConstar` (`data`, `situacao`), `rodadasQueDeixamDeConstar` (`data`) e `aviso`, sem gravar nada. [PAR-109]
2. WHEN um admin envia `POST /api/grupos/:grupoId/jogadores/:id/periodos/:periodoId/previa` com `saida` e/ou `retorno` THEN o sistema SHALL responder 200 com os campos de PAR-109, sem gravar nada. [PAR-110]
3. WHEN um admin envia `POST /api/grupos/:grupoId/jogadores/:id/inicio/previa` com `data` THEN o sistema SHALL responder 200 com `acumuladoAntes`, `acumuladoDepois`, `posicaoAntes`, `posicaoDepois` e o número de rodadas que passam a constar, sem gravar nada. [PAR-111]
4. The prévia SHALL aplicar a mesma validação da gravação correspondente e devolver a mesma recusa (422 com o mesmo campo e mensagem das GEL-63 a GEL-69 e GEL-78 a GEL-80, 409 "O jogador já está ativo." no reativar, 404 fora do grupo). [PAR-112]
5. The prévia SHALL calcular acumulado e posição de hoje pela função única, com os outros jogadores como estão, e `posicao` nula quando o jogador não está ativo hoje naquele cenário. [PAR-113]
6. The sistema SHALL contar como rodada que passa a constar a partida em que a situação do jogador era "–" e passa a ter situação, e como rodada que deixa de constar o inverso, cortando cada rodada no início da contagem do mês dela. [PAR-114]
7. WHEN a prévia de início recua a data para antes do início do primeiro período THEN o sistema SHALL calcular com esse início alinhado à nova data, como a gravação (GEL-81). [PAR-115]
8. The sistema SHALL devolver `aviso` "Ela vale 0 ponto até você lançar a presença em Editar partida." quando exatamente uma rodada que passa a constar é falta, "Elas valem 0 ponto até você lançar a presença em Editar partida." quando são duas ou mais, e nulo quando nenhuma é falta. [PAR-116]
9. WHEN a prévia de reativar ou de corrigir está pronta THEN a tela SHALL mostrar "Acumulado de X pontos passa a Y." ou "Acumulado de X pontos não muda.", seguido de "Posição de N para M.", "Posição N, não muda.", "Passa a aparecer no ranking, na posição M." ou "Sai do ranking (hoje está na posição N).", conforme as posições. [PAR-117]
10. The tela SHALL mostrar as rodadas como "1 rodada passa a constar: 15/10." ou "N rodadas passam a constar: 08/10 e 15/10." (e "N rodadas deixam de constar: …"), com até 5 datas e "e mais K" depois disso, e o `aviso` numa faixa de atenção. [PAR-118]
11. WHEN a prévia de início está pronta THEN a tela SHALL mostrar "Acumulado de X pontos passa a Y; posição de N para M. K rodadas passam a constar.", omitindo as partes que não se aplicam. [PAR-119]
12. WHILE a prévia não voltou sem erro o diálogo SHALL manter "Confirmar" desabilitado e mostrar "Calculando…" durante o cálculo. [PAR-120]
13. WHEN a correção ou a reativação é confirmada com rodadas que passam a constar THEN a ficha SHALL mostrar "N rodadas passaram a constar: … Elas valem 0 ponto até você lançar a presença em Editar partida." (no singular para uma). [PAR-121]
14. WHEN a gravação da reativação, da correção de período ou da data de início acontece THEN o sistema SHALL acrescentar à auditoria dela o acumulado e a posição antes e depois (RF-72). [PAR-122]
15. The diálogo de reativar (t16) SHALL mostrar o texto "Volta a aparecer no ranking e nas partidas; a data de início não muda." e nunca a frase "os pontos não mudam". [PAR-159]

**Independent Test**: com Gil inativo desde 05/10, a prévia de retorno em 08/10 mostra "2 rodadas passam a constar: 08/10 e 15/10." e o aviso no plural; nenhuma linha muda no banco até confirmar.

---

### P1: Registro anônimo de uso ⭐ MVP

**User Story**: Como dono do produto, quero contar aberturas do ranking, PDFs e partidas sem identificar ninguém, para medir M1 a M4.

**Why P1**: RA-11, RF-56, RF-57 e P2.

**Acceptance Criteria**:

1. WHEN o ranking é aberto pela primeira vez num aparelho THEN a tela SHALL gerar um identificador aleatório (UUID v4, sem relação com a pessoa) e guardá-lo no aparelho, e as aberturas seguintes SHALL reutilizá-lo. [PAR-123]
2. WHEN o ranking de um slug carrega THEN a tela SHALL enviar `POST /api/publico/:slug/eventos` com `{ "tipo": "ranking_aberto", "dispositivoId" }` no máximo uma vez por slug a cada carregamento da página, sem repetir ao trocar de mês. [PAR-124]
3. WHEN um PDF é gerado e entregue THEN a tela SHALL enviar `{ "tipo": "pdf_exportado", "mes" }` com o mês exportado. [PAR-125]
4. IF o envio do evento falha THEN a tela SHALL ignorar a falha, sem mensagem e sem nova tentativa. [PAR-126]
5. WHEN a rota de eventos recebe um corpo válido THEN o sistema SHALL gravar o evento com o grupo do slug, o tipo, o momento do `Relogio` e só o `dispositivo_id` (abertura) ou o `mes_exportado` (PDF), e responder 204. [PAR-127]
6. IF o corpo tem outro tipo, campo extra ou campo que falta THEN o sistema SHALL responder 422; IF passa de 1 KB THEN SHALL responder 413 com "O corpo da requisição é grande demais."; IF o slug está indisponível THEN SHALL responder 404. [PAR-128]
7. The sistema SHALL nunca gravar nos eventos IP, user-agent, nome, telefone, localização, conta ou jogador. [PAR-129]
8. The sistema SHALL dar ao `pelada_app` em `eventos_uso` só SELECT e INSERT, sem UPDATE, DELETE nem TRUNCATE, verificado no teste de roles. [PAR-130]
9. The sistema SHALL gravar o evento público sem dar ao contexto do slug escrita em nenhuma outra tabela, verificado por teste de RLS como `pelada_app`. [PAR-131]

**Independent Test**: abrir o ranking duas vezes no mesmo navegador grava dois `ranking_aberto` com o mesmo `dispositivo_id`; nenhuma coluna do evento tem IP ou conta.

---

### P1: Início do grupo com partidas, pontuação e uso ⭐ MVP

**User Story**: Como admin, quero lançar a partida do dia e ver partidas, pesos e uso direto do início do grupo.

**Why P1**: t09; é o atalho semanal do admin (G1).

**Acceptance Criteria**:

1. WHEN um admin abre `GET /api/grupos/:grupoId` THEN o sistema SHALL acrescentar à resposta `dataSugeridaPartida`, `partidaNaDataSugerida`, `partidasNoMes` (mês de hoje), `pesosVigentesDesde`, `pesosPadrao` e `aparelhosNaSemana` (aparelhos distintos com `ranking_aberto` na semana de hoje). [PAR-132]
2. WHEN o grupo tem jogador ativo THEN o bloco "Dia de jogo" SHALL mostrar "Lançar partida de <dia abreviado>, dd/mm", que abre o lançamento nessa data, ou "Editar partida de <dia abreviado>, dd/mm" quando a partida já existe. [PAR-133]
3. The item "Partidas" SHALL mostrar "N em <mês>" ou "Nenhuma em <mês>" e abrir as partidas do mês. [PAR-134]
4. The item "Pontuação" SHALL mostrar "Pesos padrão" quando `pesosPadrao` é verdadeiro e "Vigente desde dd/mm/aaaa" nos outros casos, e abrir a t18. [PAR-135]
5. The item "Uso do app" SHALL mostrar "Esta semana: N aparelhos" (singular para 1) ou "Sem uso registrado" quando N é 0, e abrir a t21. [PAR-136]
6. The início do grupo (t09) SHALL omitir os itens "Simulador" e "Financeiro" até as features `simulador` e `financeiro`. [PAR-160]
7. The cabeçalho do ranking (t01) SHALL omitir o atalho "Financeiro" até a feature `financeiro`. [PAR-161]

**Independent Test**: num grupo novo sem jogadores, o início mostra "Nenhuma em outubro", "Pesos padrão" e "Sem uso registrado"; depois de abrir o ranking, "Esta semana: 1 aparelho".

---

### P1: Isolamento, transação e débitos de segurança ⭐ MVP

**User Story**: Como organizador, quero ter certeza de que partidas, pesos, ranking e eventos de um grupo nunca vazam nem mudam a partir de outro.

**Why P1**: ADR-024, ADR-025, G-03, G-26, G-27 e débitos 4 e 5 do THREAT-MODEL.

**Acceptance Criteria**:

1. The sistema SHALL registrar cada rota nova em `backend/api/test/isolamento/casos.ts`: as de admin como rotas de grupo sob `/api/grupos/:grupoId` e as públicas com um caso de slug de outro grupo. [PAR-137]
2. WHEN uma conta admin do grupo A chama qualquer rota nova com o id do grupo B, ou com a data de uma partida que só existe no grupo B THEN o sistema SHALL responder 404 e não ler nem alterar dado do grupo B. [PAR-138]
3. WHEN uma rota pública recebe o slug do grupo A THEN o sistema SHALL devolver só dados do grupo A, verificado como `pelada_app` com dois grupos. [PAR-139]
4. The sistema SHALL ligar a regra ESLint `pelada/sem-escrita-periodo` em `backend/api/src`, fora do repositório de jogadores e das migrações, com um teste em que um arquivo que escreve `inicio` ou `fim` de `periodos_ativos` fora dele falha o lint, e SHALL atualizar a G-26 e o débito 5 do THREAT-MODEL para "ligada" (I-1). [PAR-140]
5. The sistema SHALL reavaliar o `deepmerge` (GHSA-gcqx-w48m-w2h4) com `pnpm audit`, atualizar a dependência se houver versão corrigida e registrar no débito 4 do THREAT-MODEL a data, o resultado e a decisão (SEC-010). [PAR-141]
6. The sistema SHALL gravar na auditoria das partidas e dos pesos só ids, datas, booleanos, valores numéricos e nomes de evento, nunca apelido, telefone ou ano de nascimento. [PAR-142]

**Independent Test**: a suíte de isolamento roda como `pelada_app` e prova o 404 cruzado em todas as rotas novas; `pnpm lint` falha num arquivo de prova que escreve em `periodos_ativos`.

---

### P1: Telas no visual do legado ⭐ MVP

**User Story**: Como admin e jogador, quero as telas de ranking, partidas e pontuação iguais às do app que já uso.

**Why P1**: métrica do MVP: comparação visual com o mockup sem divergência.

**Acceptance Criteria**:

1. The app SHALL ter as rotas `/g/:slug` (t01, t03), `/app/grupos/:grupoId/partidas` (t10), `/app/grupos/:grupoId/partidas/nova` e `/app/grupos/:grupoId/partidas/:data` (t11), `/app/grupos/:grupoId/pontuacao` (t18) e `/app/grupos/:grupoId/uso` (t21). [PAR-143]
2. The tela "Uso do app" (t21) SHALL mostrar a tabela "Uso por semana, mais recente primeiro" com "Semana" ("dd/mm a dd/mm"), "Aparelhos que abriram o ranking", "PDFs exportados", "Partidas lançadas (em até 48 h)" ("N (M)") e "Escalações / partidas" ("E / N"), ou "Ainda não há uso registrado." sem semanas. [PAR-144]
3. The telas SHALL usar só os tokens de `tokens.css` e passar no `checar-tokens.py`. [PAR-145]
4. The telas SHALL passar na comparação visual com o mockup em PC e celular, no limite de 1%: t01 (`sucesso`, `vazio`, `vazio-mes`, `carregando`, `erro`), t03, t09 (`sem-jogadores`), t10, t11 (`nova`, `edicao`, `carregando`, `vazio`, `data-futura`, `duplicada`), t18 e t21; e os estados de PDF, sem conexão, instalar e as prévias da t16 pela revisão manual do `telas.json`. [PAR-146]
5. WHEN uma rota da API devolve 422 com `campos` THEN a tela SHALL mostrar "Corrija N campos: <rótulos>" e a mensagem ao lado de cada campo (GEL-118). [PAR-147]

**Independent Test**: `pnpm --filter @pelada/web visual` sem divergência nas telas listadas.

---

### P2: Ranking sem conexão

**User Story**: Como jogador, quero ver o último ranking que abri mesmo sem internet no campo.

**Why P2**: RF-54 é Should; P3 o trouxe para esta feature.

**Acceptance Criteria**:

1. WHEN um ranking público carrega com sucesso THEN a tela SHALL guardar no aparelho a resposta por slug e mês (e a do mês atual pedida sem `?mes=`), com o `geradoEm`. [PAR-148]
2. WHILE não há conexão e há ranking guardado do slug e mês pedidos a tela SHALL mostrá-lo somente leitura com a faixa "Sem conexão, atualizado em dd/mm hh:mm", com a hora do `geradoEm` em America/Sao_Paulo. [PAR-149]
3. WHILE não há conexão a tela SHALL responder à tentativa de entrar como admin com "É preciso conexão para entrar.". [PAR-150]
4. IF não há conexão e nada está guardado para o slug THEN a tela SHALL mostrar "Sem conexão", "Conecte-se para ver o ranking." e "Tentar de novo". [PAR-151]
5. WHEN a tela mostra o guardado e a rede responde THEN SHALL mostrar "atualizando…" e trocar pelos dados novos. [PAR-152]
6. The service worker SHALL guardar só o app shell e as respostas de `GET /api/publico/:slug/ranking` (rede primeiro), nunca outra rota de `/api`, o PDF ou os eventos, verificado por teste do service worker (G-17). [PAR-153]
7. The aparelho SHALL guardar só o slug, o identificador anônimo, a projeção pública e a marca do aviso de instalação, nunca sessão ou dado de admin, e a tela SHALL validar o guardado com o contrato antes de usar e descartar o inválido. [PAR-154]

**Independent Test**: o e2e `ranking-offline` abre o ranking online, corta a rede e recarrega: aparece a faixa com a hora e o aviso ao tentar entrar; sem nada guardado, aparece "Sem conexão".

---

### P2: Painel de uso por semana

**User Story**: Como admin, quero ver o uso do app por semana, para saber se o grupo está usando o ranking e o PDF.

**Why P2**: RF-58 é Should.

**Acceptance Criteria**:

1. WHEN um admin abre `GET /api/grupos/:grupoId/uso` THEN o sistema SHALL responder 200 com `semanas`, da mais recente para a mais antiga, só as que têm evento, cada uma com `inicio` (segunda), `fim` (domingo), `aparelhosRanking`, `pdfsExportados`, `partidasLancadas`, `partidasEm48h` e `escalacoesConfirmadas`. [PAR-155]
2. The sistema SHALL agrupar os eventos pela semana de segunda a domingo do momento do registro em America/Sao_Paulo. [PAR-156]
3. The sistema SHALL contar em `aparelhosRanking` os `dispositivo_id` distintos de `ranking_aberto` na semana. [PAR-157]
4. The sistema SHALL contar em `partidasEm48h` os `partida_lancada` registrados até 48 horas depois da data da partida no horário do grupo, em America/Sao_Paulo. [PAR-158]

**Independent Test**: com uma partida de quinta 20:00 lançada no sábado 19:00 e outra lançada na segunda, a semana mostra "2 (1)".

---

## Edge Cases

- WHEN a data de início S é posterior à primeira presença do jogador THEN o sistema SHALL deixar a pontuação inicial fora e mostrar como "–" as rodadas anteriores a S. [PAR-59, PAR-73]
- WHEN S é igual à primeira presença THEN o sistema SHALL contar a pontuação inicial; um dia depois, não. [PAR-59]
- WHEN o jogador não tem nenhuma presença THEN o sistema SHALL contar a pontuação inicial com qualquer S, e PTS INICIAL e PTS FINAL iguais a ela em todo mês. [PAR-59, PAR-86]
- WHEN o jogador saiu e voltou THEN o sistema SHALL contar hoje só as presenças desde o retorno, mostrar PTS INICIAL 0 no mês do retorno (sem pontuação inicial, se havia presença antes) e manter os meses do primeiro período com os valores de antes. [PAR-57, PAR-74]
- WHEN os pesos mudam no meio do mês THEN o sistema SHALL pontuar cada partida pela configuração vigente na data dela. [PAR-56]
- WHEN a partida é no dia exato do `vigente_desde` THEN o sistema SHALL usar a configuração nova. [PAR-56]
- WHEN três jogadores empatam em pontos, ano e apelido sem acento nem caixa ("José", "Jose", "Jôse") THEN o sistema SHALL dar a todos a mesma posição e ao seguinte a posição 4. [PAR-69]
- WHEN o mês exibido é o corrente e ainda não acabou THEN o sistema SHALL tomar o período em hoje e o PTS FINAL igual ao acumulado de hoje. [PAR-74, PAR-75]
- WHEN o grupo não tem nenhuma partida THEN o sistema SHALL aceitar só o mês de hoje, sem navegação, e o PDF sem colunas. [PAR-86, PAR-66]
- WHEN um jogador inativo hoje tem partidas no mês exibido THEN o sistema SHALL tirá-lo das linhas do ranking e do PDF, sem apagar o histórico dele. [PAR-67]
- WHEN um jogador é expulso numa partida com chuva THEN o sistema SHALL usar o peso `expulsoComChuva`. [PAR-55]
- WHEN uma presença antiga está fora de período (dado anterior à GEL-68) THEN o sistema SHALL contá-la na rodada e no acumulado. [PAR-60]
- WHEN o mês exibido tem 14 partidas THEN o PDF SHALL ter as 12 mais recentes, com o PTS INICIAL absorvendo as 2 primeiras. [PAR-96, PAR-98]
- WHEN o PDF de janeiro precisa de colunas anteriores THEN o sistema SHALL completá-las com dezembro do ano anterior. [PAR-96]
- WHEN o recuo da data de início não alcança presença lançada THEN a prévia SHALL mostrar o acumulado de todos sem mudança, só com rodadas que passam de "–" a falta (RN-28). [PAR-111]
- WHEN a data de início é hoje THEN o jogador SHALL ficar com acumulado 0 e voltar ao valor de antes ao recuar a data (Kim). [PAR-58, PAR-59]
- IF a partida é lançada num dia que não é o do grupo THEN o sistema SHALL aceitá-la; a data sugerida é só sugestão. [PAR-17]

---

## Implicit-requirement sweep

| Dimensão | Cobertura |
| --- | --- |
| Input validation & bounds | PAR-06 e seguintes, PAR-19, PAR-20, PAR-24 e seguintes, PAR-47, PAR-66, PAR-112; corpo público de até 1 KB |
| Failure / partial-failure states | PAR-28, PAR-15, edição e exclusão em transação; falha de PDF e de evento na tela |
| Idempotency / retry / duplicate handling | PAR-21, PAR-30, PAR-04, PAR-124 (um envio por carregamento) |
| Auth boundaries & rate limits | Convenções (404 sem vínculo, 409 arquivado), PAR-137, PAR-90, PAR-91, PAR-78; escritas sob o `LIMITE_ESCRITA` da `grupos-e-elenco` |
| Concurrency / ordering | PAR-29, PAR-30 |
| Data lifecycle / expiry | PAR-09; exclusão da partida mantém o evento; ranking guardado no aparelho é trocado a cada abertura |
| Observability | Auditoria de pesos e partidas; eventos de uso (PAR-127); PAR-129; o Sentry da fundação cobre as exceções |
| External-dependency failure | Web Share recusado ou ausente (ADR-022), rede ausente (PAR-149), envio de evento (PAR-124) |
| State-transition integrity | ativo ↔ inativo na data (PAR-27); partida existe ↔ não existe; configuração vigente (PAR-56) |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----------- | ------ | ------- |
| PAR-01 | P1: Pesos de pontuação com vigência | - | Pending |
| PAR-02 | P1: Pesos de pontuação com vigência | - | Pending |
| PAR-03 | P1: Pesos de pontuação com vigência | - | Pending |
| PAR-04 | P1: Pesos de pontuação com vigência | - | Pending |
| PAR-05 | P1: Pesos de pontuação com vigência | - | Pending |
| PAR-06 | P1: Pesos de pontuação com vigência | - | Pending |
| PAR-07 | P1: Pesos de pontuação com vigência | - | Pending |
| PAR-08 | P1: Pesos de pontuação com vigência | - | Pending |
| PAR-09 | P1: Pesos de pontuação com vigência | - | Pending |
| PAR-10 | P1: Pesos de pontuação com vigência | - | Pending |
| PAR-11 | P1: Pesos de pontuação com vigência | - | Pending |
| PAR-12 | P1: Pesos de pontuação com vigência | - | Pending |
| PAR-13 | P1: Pesos padrão para todo grupo | - | Pending |
| PAR-14 | P1: Pesos padrão para todo grupo | - | Pending |
| PAR-15 | P1: Pesos padrão para todo grupo | - | Pending |
| PAR-16 | P1: Pesos padrão para todo grupo | - | Pending |
| PAR-17 | P1: Lançar partida | - | Pending |
| PAR-18 | P1: Lançar partida | - | Pending |
| PAR-19 | P1: Lançar partida | - | Pending |
| PAR-20 | P1: Lançar partida | - | Pending |
| PAR-21 | P1: Lançar partida | - | Pending |
| PAR-22 | P1: Lançar partida | - | Pending |
| PAR-23 | P1: Lançar partida | - | Pending |
| PAR-24 | P1: Lançar partida | - | Pending |
| PAR-25 | P1: Lançar partida | - | Pending |
| PAR-26 | P1: Lançar partida | - | Pending |
| PAR-27 | P1: Lançar partida | - | Pending |
| PAR-28 | P1: Lançar partida | - | Pending |
| PAR-29 | P1: Lançar partida | - | Pending |
| PAR-30 | P1: Lançar partida | - | Pending |
| PAR-31 | P1: Lançar partida | - | Pending |
| PAR-32 | P1: Lançar partida | - | Pending |
| PAR-33 | P1: Lançar partida | - | Pending |
| PAR-34 | P1: Lançar partida | - | Pending |
| PAR-35 | P1: Lançar partida | - | Pending |
| PAR-36 | P1: Lançar partida | - | Pending |
| PAR-37 | P1: Partidas do mês | - | Pending |
| PAR-38 | P1: Partidas do mês | - | Pending |
| PAR-39 | P1: Partidas do mês | - | Pending |
| PAR-40 | P1: Partidas do mês | - | Pending |
| PAR-41 | P1: Partidas do mês | - | Pending |
| PAR-42 | P1: Partidas do mês | - | Pending |
| PAR-43 | P1: Partidas do mês | - | Pending |
| PAR-44 | P1: Editar e excluir partida | - | Pending |
| PAR-45 | P1: Editar e excluir partida | - | Pending |
| PAR-46 | P1: Editar e excluir partida | - | Pending |
| PAR-47 | P1: Editar e excluir partida | - | Pending |
| PAR-48 | P1: Editar e excluir partida | - | Pending |
| PAR-49 | P1: Editar e excluir partida | - | Pending |
| PAR-50 | P1: Editar e excluir partida | - | Pending |
| PAR-51 | P1: Editar e excluir partida | - | Pending |
| PAR-52 | P1: Editar e excluir partida | - | Pending |
| PAR-53 | P1: Editar e excluir partida | - | Pending |
| PAR-54 | P1: Editar e excluir partida | - | Pending |
| PAR-55 | P1: Função única de acumulado | - | Pending |
| PAR-56 | P1: Função única de acumulado | - | Pending |
| PAR-57 | P1: Função única de acumulado | - | Pending |
| PAR-58 | P1: Função única de acumulado | - | Pending |
| PAR-59 | P1: Função única de acumulado | - | Pending |
| PAR-60 | P1: Função única de acumulado | - | Pending |
| PAR-61 | P1: Função única de acumulado | - | Pending |
| PAR-62 | P1: Função única de acumulado | - | Pending |
| PAR-63 | P1: Função única de acumulado | - | Pending |
| PAR-64 | P1: Ranking público | - | Pending |
| PAR-65 | P1: Ranking público | - | Pending |
| PAR-66 | P1: Ranking público | - | Pending |
| PAR-67 | P1: Ranking público | - | Pending |
| PAR-68 | P1: Ranking público | - | Pending |
| PAR-69 | P1: Ranking público | - | Pending |
| PAR-70 | P1: Ranking público | - | Pending |
| PAR-71 | P1: Ranking público | - | Pending |
| PAR-72 | P1: Ranking público | - | Pending |
| PAR-73 | P1: Ranking público | - | Pending |
| PAR-74 | P1: Ranking público | - | Pending |
| PAR-75 | P1: Ranking público | - | Pending |
| PAR-76 | P1: Ranking público | - | Pending |
| PAR-77 | P1: Ranking público | - | Pending |
| PAR-78 | P1: Ranking público | - | Pending |
| PAR-79 | P1: Ranking público | - | Pending |
| PAR-80 | P1: Ranking público | - | Pending |
| PAR-81 | P1: Ranking público | - | Pending |
| PAR-82 | P1: Ranking público | - | Pending |
| PAR-83 | P1: Ranking público | - | Pending |
| PAR-84 | P1: Navegação entre meses e mês sem partidas | - | Pending |
| PAR-85 | P1: Navegação entre meses e mês sem partidas | - | Pending |
| PAR-86 | P1: Navegação entre meses e mês sem partidas | - | Pending |
| PAR-87 | P1: Navegação entre meses e mês sem partidas | - | Pending |
| PAR-88 | P1: Navegação entre meses e mês sem partidas | - | Pending |
| PAR-89 | P1: Navegação entre meses e mês sem partidas | - | Pending |
| PAR-90 | P1: Grupo indisponível | - | Pending |
| PAR-91 | P1: Grupo indisponível | - | Pending |
| PAR-92 | P1: Grupo indisponível | - | Pending |
| PAR-93 | P1: Grupo indisponível | - | Pending |
| PAR-94 | P1: Grupo indisponível | - | Pending |
| PAR-95 | P1: PDF do ranking | - | Pending |
| PAR-96 | P1: PDF do ranking | - | Pending |
| PAR-97 | P1: PDF do ranking | - | Pending |
| PAR-98 | P1: PDF do ranking | - | Pending |
| PAR-99 | P1: PDF do ranking | - | Pending |
| PAR-100 | P1: PDF do ranking | - | Pending |
| PAR-101 | P1: PDF do ranking | - | Pending |
| PAR-102 | P1: PDF do ranking | - | Pending |
| PAR-103 | P1: PDF do ranking | - | Pending |
| PAR-104 | P1: PDF do ranking | - | Pending |
| PAR-105 | P1: PDF do ranking | - | Pending |
| PAR-106 | P1: PDF do ranking | - | Pending |
| PAR-107 | P1: PDF do ranking | - | Pending |
| PAR-108 | P1: PDF do ranking | - | Pending |
| PAR-109 | P1: Prévias de reativar, data de início e correção de períodos | - | Pending |
| PAR-110 | P1: Prévias de reativar, data de início e correção de períodos | - | Pending |
| PAR-111 | P1: Prévias de reativar, data de início e correção de períodos | - | Pending |
| PAR-112 | P1: Prévias de reativar, data de início e correção de períodos | - | Pending |
| PAR-113 | P1: Prévias de reativar, data de início e correção de períodos | - | Pending |
| PAR-114 | P1: Prévias de reativar, data de início e correção de períodos | - | Pending |
| PAR-115 | P1: Prévias de reativar, data de início e correção de períodos | - | Pending |
| PAR-116 | P1: Prévias de reativar, data de início e correção de períodos | - | Pending |
| PAR-117 | P1: Prévias de reativar, data de início e correção de períodos | - | Pending |
| PAR-118 | P1: Prévias de reativar, data de início e correção de períodos | - | Pending |
| PAR-119 | P1: Prévias de reativar, data de início e correção de períodos | - | Pending |
| PAR-120 | P1: Prévias de reativar, data de início e correção de períodos | - | Pending |
| PAR-121 | P1: Prévias de reativar, data de início e correção de períodos | - | Pending |
| PAR-122 | P1: Prévias de reativar, data de início e correção de períodos | - | Pending |
| PAR-123 | P1: Registro anônimo de uso | - | Pending |
| PAR-124 | P1: Registro anônimo de uso | - | Pending |
| PAR-125 | P1: Registro anônimo de uso | - | Pending |
| PAR-126 | P1: Registro anônimo de uso | - | Pending |
| PAR-127 | P1: Registro anônimo de uso | - | Pending |
| PAR-128 | P1: Registro anônimo de uso | - | Pending |
| PAR-129 | P1: Registro anônimo de uso | - | Pending |
| PAR-130 | P1: Registro anônimo de uso | - | Pending |
| PAR-131 | P1: Registro anônimo de uso | - | Pending |
| PAR-132 | P1: Início do grupo com partidas, pontuação e uso | - | Pending |
| PAR-133 | P1: Início do grupo com partidas, pontuação e uso | - | Pending |
| PAR-134 | P1: Início do grupo com partidas, pontuação e uso | - | Pending |
| PAR-135 | P1: Início do grupo com partidas, pontuação e uso | - | Pending |
| PAR-136 | P1: Início do grupo com partidas, pontuação e uso | - | Pending |
| PAR-137 | P1: Isolamento, transação e débitos de segurança | - | Pending |
| PAR-138 | P1: Isolamento, transação e débitos de segurança | - | Pending |
| PAR-139 | P1: Isolamento, transação e débitos de segurança | - | Pending |
| PAR-140 | P1: Isolamento, transação e débitos de segurança | - | Pending |
| PAR-141 | P1: Isolamento, transação e débitos de segurança | - | Pending |
| PAR-142 | P1: Isolamento, transação e débitos de segurança | - | Pending |
| PAR-143 | P1: Telas no visual do legado | - | Pending |
| PAR-144 | P1: Telas no visual do legado | - | Pending |
| PAR-145 | P1: Telas no visual do legado | - | Pending |
| PAR-146 | P1: Telas no visual do legado | - | Pending |
| PAR-147 | P1: Telas no visual do legado | - | Pending |
| PAR-148 | P2: Ranking sem conexão | - | Pending |
| PAR-149 | P2: Ranking sem conexão | - | Pending |
| PAR-150 | P2: Ranking sem conexão | - | Pending |
| PAR-151 | P2: Ranking sem conexão | - | Pending |
| PAR-152 | P2: Ranking sem conexão | - | Pending |
| PAR-153 | P2: Ranking sem conexão | - | Pending |
| PAR-154 | P2: Ranking sem conexão | - | Pending |
| PAR-155 | P2: Painel de uso por semana | - | Pending |
| PAR-156 | P2: Painel de uso por semana | - | Pending |
| PAR-157 | P2: Painel de uso por semana | - | Pending |
| PAR-158 | P2: Painel de uso por semana | - | Pending |
| PAR-159 | P1: Prévias de reativar, data de início e correção de períodos | - | Pending |
| PAR-160 | P1: Início do grupo com partidas, pontuação e uso | - | Pending |
| PAR-161 | P1: Início do grupo com partidas, pontuação e uso | - | Pending |

**Coverage:** 161 total, 0 mapped to tasks, 161 unmapped ⚠️ (as tarefas ainda não existem)

---

## Success Criteria

- [ ] Os testes de domínio do legado em `pontuacao`, `ranking` e `pdf` passam portados, com os mesmos valores.
- [ ] Lançar a partida de 20 jogadores pelo celular, a partir do início do grupo, leva menos de 1 minuto.
- [ ] Nenhum campo proibido (G-10) aparece nas respostas públicas nem no PDF, no teste automático.
- [ ] Comparação visual sem divergência nas telas listadas e P01 dentro de 4,5% (9% no CI).
- [ ] Suíte de isolamento verde, como `pelada_app`, com casos para todas as rotas novas, incluindo o slug de grupo arquivado.
- [ ] Débitos 4, 5 e 6 do THREAT-MODEL fechados ou reavaliados com data; nenhum achado crítico ou alto do `auditor-seguranca` em aberto.
