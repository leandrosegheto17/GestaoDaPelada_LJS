# Simulador — Especificação

> Feature 5 de 8 do roteiro (AD-001, AD-015). **Rascunho, aguardando aprovação do usuário.** Fluxo 2, fase 4.
> Entrada: `.specs/produto/necessidade.md` §3 a §5, `.specs/projeto/roadmap.md` (linha 5), `.specs/STATE.md` (AD-002,
> AD-003, AD-015), `GestaoDaPelada_LJS/.specs/produto/analise-legado.md` (§2, linha "Simulador" e "Escalação"; §8, D2).
> Regras de comportamento tiradas do código do legado `C:\Leandro\Projetos\GestaodaPelada` (só leitura, AD-002), em
> `backend/dominio/src/simulador/*.ts`, `backend/api/src/aplicacao/simulador/*.ts`, `backend/contrato/src/simulador/*.ts`
> e `.md/PRD-TECNICO.md` (RF-26, RF-38 a RF-48, RN-08 a RN-12, RNF-03), ADR-007 e ADR-017. O LJS não escreveu spec do
> simulador. Contratos anteriores: `fundacao/spec.md`, `conta-e-acesso/tasks.md` da v2 e, para as features 3 e 4 (ainda
> em planejamento na v2), `GestaoDaPelada_LJS/.specs/features/grupos-e-elenco/spec.md` (main) e
> `partidas-e-ranking/spec.md` (`c6dc82c`). Mensagens tiradas das telas t09, t11, t12, t13 e t14 de `.specs/mockup/`.

## Problem Statement

Com a `partidas-e-ranking`, o grupo tem ranking, mas o organizador ainda divide os times à mão no dia do jogo, sem
critério de equilíbrio e sem regra clara de quem entra no 2º tempo. O legado resolvia isso com um simulador determinístico
que usa a ordem do ranking da véspera para decidir titulares e reservas, equilibra os times por nível e idade e grava a
escalação confirmada, que depois pré-marca a presença no lançamento da partida. Esta feature traz esse simulador para a
v2 com as mesmas regras, dentro do limite de CPU do Worker gratuito (10 ms por requisição), e liga o item "Simulador" do
início do grupo, que a `partidas-e-ranking` deixou oculto (PAR-160).

## Goals

- [ ] O admin monta os times da semana pelo celular em menos de 1 minuto para 20 aptos: escolhe a data, o formato, N e os aptos, recebe a sugestão e confirma.
- [ ] Para a mesma entrada, a v2 dá a mesma sugestão que o legado (casos de referência portados das regras do legado, reescritos a partir dos critérios).
- [ ] Nenhuma requisição do simulador passa do limite de CPU do Worker: p99 abaixo de 7 ms na prévia publicada, sem erro 1102.
- [ ] A escalação confirmada pré-marca como presentes, no lançamento da partida da mesma data, todos os jogadores dela, inclusive os "não entra".

## Out of Scope

| Feature | Reason |
| ----------- | -------------- |
| Trava do plano (simulador só no Pro), trial e excedente somente leitura | Feature `planos-e-cobranca` (D2). Aqui o simulador fica liberado para todo grupo, atrás de um ponto único de verificação (SIM-68) |
| Sorteio aleatório, semente ou "sortear de novo com outro resultado" | O legado é determinístico de propósito (ADR-007, alternativa 3 descartada); decisão do usuário em 2026-11-04 (Assumptions) |
| Regra ou aviso sobre goleiro e posição em campo | RF-47 do legado: "não deve ter regra nem aviso sobre goleiros" (P-13) |
| Excluir ou listar escalações antigas | Não existe no legado; a escalação só é substituída por outra da mesma data |
| Mostrar a escalação no ranking público ou no PDF | Não existe no legado; a escalação é dado de admin |
| Cálculo do simulador fora do Worker (Lightsail, Workers Paid) | Contingência do ADR-017 do legado; só entra por decisão do usuário se SIM-61 falhar |
| Simulador sem conexão | Funções de admin exigem conexão (RF-54 do legado) |
| Ranking, pesos, acumulado e lançamento de partida | Feature `partidas-e-ranking`; aqui só se consome a função única de acumulado (PAR-61) e se estende o lançamento com a pré-marcação |
| Nível e notas | Feature `grupos-e-elenco` (GEL-101 a GEL-104); aqui só se consome o nível |
| Notificar o grupo da escalação | Não existe no legado; push é da `notificacoes` e só de ranking e cobrança (D3) |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | --------------- | --------- | ---------- |
| Regras do simulador | As do código do legado, que prevalece sobre o PRD onde os dois divergem (mesma convenção da `partidas-e-ranking` do LJS) | `analise-legado.md` §2; AD-015 | y |
| Determinismo | Sem aleatoriedade: a mesma entrada dá sempre a mesma sugestão, independente da ordem dos aptos; "Refazer sugestão" devolve a sugestão original, sem os ajustes | ADR-007 §4 e alternativa 3 do legado (sorteio com semente descartado: "difícil explicar ao grupo por que a sugestão mudou"). O roteiro diz "sortear", mas vale o legado; decisão do usuário em 2026-11-04 | y |
| Plano antes da `planos-e-cobranca` | Simulador liberado para todo grupo, atrás de uma verificação única de recurso (`simulador`) que nesta feature sempre libera; a feature 7 liga a trava ali | D2 manda simulador só no Pro, mas a feature 7 vem depois (roteiro); o grupo de teste terá cortesia Pro permanente (necessidade §6), então não há regressão para ele. Decisão do usuário em 2026-11-04 (AD-049). Na feature 7, recurso Pro em grupo Free responde 403 `plano_pro`, e as escalações já confirmadas continuam legíveis | y |
| Idade usada no equilíbrio | Ano da data da partida menos o ano de nascimento | Legado `aplicacao/simulador/entrada.ts:63` e `dominio/src/elenco/idade.ts:4`, para a mesma entrada dar a mesma resposta em qualquer dia. **Diverge** do RN-12 do PRD ("ano corrente"); vale o legado, confirmado pelo usuário em 2026-11-04 (AD-046) | y |
| Jogador sem ano de nascimento | Fica fora da idade média do time (a média usa só quem tem ano; time sem ninguém com ano tem idade média nula) e a tela marca "sem ano" | A coluna aceita nulo por dado antigo (LJS `grupos-e-elenco`, ano obrigatório só no cadastro novo). O legado não tem o caso: `calcularIdade` recebe número (`idade.ts:4`). Decisão do usuário em 2026-11-04 | y |
| Teto de CPU | 10 ms por requisição no Workers Free; orçamento de 7 ms no p99 (margem do legado) e meta de 4 ms em Node no teste de domínio | `necessidade.md` §4 (consulta de 2026-11-03, PREMISSA até medir na prévia); ADR-017 e `test/simulador/sugerir.orcamento.test.ts:10` do legado. Meta aceita pelo usuário em 2026-11-04; o limite de 10 ms segue PREMISSA até a medição de SIM-61 | y |
| Teto da busca local | 200 trocas aceitas por sugestão e no máximo 60 aptos, como no legado; se a medição da pior entrada (60 aptos, N = 2, 3 ou mais times) passar do orçamento, o Design acrescenta um teto de avaliações e mede de novo | `distribuicao-dois.ts:7`, `distribuicao-varios.ts:7,10` do legado; o legado só mediu 30 aptos. Decisão do usuário em 2026-11-04 | y |
| Data da escalação | Qualquer data válida, também passada ou com partida já lançada; a pré-marcação só age no lançamento novo | Legado: o contrato só valida o formato da data (`contrato/src/simulador/entrada.ts:24-30`) e a pré-marcação está só em `partidas/nova.ts:51-58`. Decisão do usuário em 2026-11-04 | y |
| Prévia, sugestão e avaliação na API | A tela não calcula times, níveis, somas, pares nem avisos; chama `previa` (barata, sem banco) e `avaliar` com debounce | ADR-007 §5 e §6 do legado; mesma regra do LJS (regra de negócio só no domínio) | y |
| Rotas da tela | `/app/grupos/:grupoId/simulador` (entradas, t12) e o resultado na mesma rota (t13, t14); o `telas.json` ainda mostra `/admin/g-domingo/simulador` | Padrão `/app/grupos/:grupoId/...` da v2 (PAR-143 do LJS, AD-017); a rota do mockup é a do legado | y |
| Migração | Sem migração nova, salvo a de grants por coluna se o Design pedir: `escalacoes` já está na linha de base com RLS `FORCE`, `UNIQUE (grupo_id, data)` e grants do `pelada_app` | `1792843200000_linha-de-base.sql:212-228`, `1792843260000_roles.sql:22-32` do LJS; AD-003 | y |
| Evento de uso | `escalacao_confirmada` em `eventos_uso`, que a linha de base já aceita; depende do grant de INSERT que a `partidas-e-ranking` dá ao `pelada_app` (PAR-130) | `linha-de-base.sql:197,205`; `1792844700000_eventos-uso.sql` da branch do LJS | y |
| Quem usa | Só admin com vínculo no grupo; o acesso ao financeiro não interfere | RF-38 do legado; GEL-21 do LJS | y |
| Valor de "sem nota" | Nível 550 (5,5) e marca `semNota`, da `grupos-e-elenco` | GEL-102 do LJS; legado `textos-avisos.ts:20` | y |

**Open questions:** none — todas resolvidas pelo usuário em 2026-11-04 ou registradas acima.

---

## User Stories

Convenções que valem para todas as histórias:

- "Admin" é uma conta com vínculo em `vinculos_admin` com o grupo. As rotas ficam sob `/api/grupos/:grupoId/...` e respondem 404 sem revelar existência quando não há vínculo, também para id de jogador de outro grupo.
- Rota POST em grupo arquivado responde 409 `grupo_arquivado` pelo middleware de grupo ativo (GEL-26), inclusive `previa`, `sugerir` e `avaliar`, que só calculam.
- Erro de validação responde 422 com "Corrija os campos indicados." e o objeto `campos`; corpo com campo desconhecido é recusado (`.strict()`); nada é gravado.
- "Hoje" é de America/Sao_Paulo e vem do relógio injetado; o domínio recebe datas por parâmetro.
- Regra de negócio só em `@pelada/dominio`; a tela só formata o que a API entrega.
- N é o número de jogadores por time (inteiro de 2 a 11); K é o limite de substituições por time (inteiro de 0 a 20, ou `ilimitado`); "aptos" são os jogadores marcados para a data.
- Níveis entram no cálculo como inteiro × 100 e idades em anos; médias são inteiras × 100, arredondadas com meio para cima.

### P1: Entradas do simulador ⭐ MVP

**User Story**: Como admin, quero abrir o simulador com a data do próximo jogo e os jogadores ativos já listados, para marcar quem veio e escolher o formato.

**Why P1**: RF-38 e RF-39 do legado; é a porta do simulador.

**Acceptance Criteria**:

1. WHEN um admin abre `GET /api/grupos/:grupoId/simulador/contexto` sem `data` THEN o sistema SHALL responder 200 com `dataSugerida` igual ao próximo dia da semana do grupo a partir de hoje (hoje incluso), `hoje` e `jogadores` com os ativos nessa data, cada um com `id`, `apelido`, `nivel`, `semNota` e `semAno`. [SIM-01]
2. WHEN o contexto recebe `data` válida THEN o sistema SHALL listar os ativos nessa data e manter `dataSugerida` como o próximo dia de jogo. [SIM-02]
3. The contexto SHALL ordenar os jogadores pelo apelido sem acento nem caixa e SHALL não trazer telefone, ano de nascimento, posição, notas por habilidade nem pontos. [SIM-03]
4. IF `data` não é uma data válida `AAAA-MM-DD` THEN o sistema SHALL responder 422 com erro no campo `data`. [SIM-04]
5. The tela de entradas (t12) SHALL mostrar "Data da partida" com a nota "Próximo dia de jogo." quando a data é a sugerida, "Formato" com "2 times (1º e 2º tempo)" (padrão) e "3 ou mais times", "Jogadores por time" com − e +, e "Aptos (N)" com "Marcar todos" e "Desmarcar todos", cada apto com o apelido e "nível d,d" ou "sem nota". [SIM-05]
6. WHILE o formato é "2 times" a tela SHALL mostrar "Limite de substituições por time" com − , + e "Ilimitado" e, em cada apto, a marcação "Só 1º" (padrão: desmarcada); WHILE o formato é "3 ou mais times" SHALL ocultar os dois. [SIM-06]
7. WHEN o grupo não tem jogador ativo na data THEN a tela SHALL mostrar "Sem jogadores", "Cadastre jogadores para usar o simulador." e o botão "Cadastrar jogadores" (t12 `vazio`). [SIM-07]
8. The início do grupo (t09) SHALL mostrar o item "Simulador: <dia abreviado>, dd/mm" do próximo dia de jogo e, abaixo dele, "Escalação de dd/mm confirmada" quando há escalação para essa data ou "Nenhuma escalação confirmada para dd/mm" quando não há, substituindo a omissão da PAR-160. [SIM-08]

**Independent Test**: no grupo de quinta com 20 ativos, abrir o simulador numa terça mostra a quinta seguinte, "Próximo dia de jogo." e os 20 em ordem alfabética com o nível.

---

### P1: Prévia e aptos insuficientes ⭐ MVP

**User Story**: Como admin, quero ver quantos times vão sair enquanto marco os aptos, e saber por que não dá quando faltam jogadores.

**Why P1**: RF-39 e RF-40 do legado.

**Acceptance Criteria**:

1. WHEN um admin envia `POST /api/grupos/:grupoId/simulador/previa` com `formato`, `n`, `k` (só em 2 times) e `aptos` THEN o sistema SHALL responder 200 com a prévia, sem ler histórico nem gravar nada. [SIM-09]
2. WHILE o formato é "2 times" IF há pelo menos 2N aptos THEN a prévia SHALL ser válida com 2 times e `reservas` = aptos − 2N, descrita como "2 times de N · R reservas" (sem o sufixo quando R = 0, "1 reserva" no singular). [SIM-10]
3. WHILE o formato é "2 times" IF há menos de 2N aptos THEN a prévia SHALL ser inválida com `maiorNPossivel` = aptos ÷ 2 arredondado para baixo (ou nulo se menor que 2), descrita como "Faltam aptos para 2 times de N. Maior N possível: M." ou "Faltam aptos para 2 times." quando não há N possível. [SIM-11]
4. WHILE o formato é "3 ou mais times" IF há mais de 2N aptos THEN a prévia SHALL ser válida com T = aptos ÷ N arredondado para cima, (aptos − R) ÷ N times completos de N e, se R = aptos mod N > 0, um time incompleto de R, descrita como "C times de N + 1 time incompleto de R" ou só "C times de N". [SIM-12]
5. WHILE o formato é "3 ou mais times" IF há até 2N aptos THEN a prévia SHALL ser inválida com `nSugerido` = (aptos − 1) ÷ 2 arredondado para baixo (ou nulo se menor que 2) e `doisTimesPossivel` = aptos ≥ 4, descrita como "Com A aptos e N = n não há 3 times." seguida de "Use N menor ou o formato 2 times.", "Use N menor." ou "Use o formato 2 times." conforme as saídas que existem. [SIM-13]
6. WHILE a prévia é inválida a tela SHALL mostrar a descrição no lugar da prévia e desabilitar "Sugerir times" (t12 `insuficiente`); WHILE a prévia está pendente SHALL mostrar "Prévia calculando…" (t12 `calculando`). [SIM-14]
7. The tela SHALL chamar a prévia com debounce ao mudar formato, N, K ou aptos, e SHALL não calcular o número de times por conta própria. [SIM-15]

**Independent Test**: 19 aptos, 2 times, N = 7 mostra "2 times de 7 · 5 reservas"; N = 11 mostra "Faltam aptos para 2 times de 11. Maior N possível: 9."; 18 aptos, 3 ou mais, N = 4 mostra "4 times de 4 + 1 time incompleto de 2".

---

### P1: Prioridade pelo ranking da véspera (2 times) ⭐ MVP

**User Story**: Como admin, quero que quem está melhor no ranking tenha prioridade para ser titular, contando só as partidas até a véspera.

**Why P1**: RN-08 e RF-41 do legado; é o critério de justiça do grupo.

**Acceptance Criteria**:

1. WHILE o formato é "2 times" o sistema SHALL ordenar os aptos pela ordem do ranking (acumulado maior primeiro, ano de nascimento menor primeiro com sem ano no fim, apelido sem acento nem caixa, id), com o acumulado calculado até a véspera da data da partida pela função única de acumulado (PAR-58 a PAR-61). [SIM-16]
2. The prioridade SHALL contar só partidas com data anterior à data da partida, também quando já existe partida lançada na própria data. [SIM-17]
3. IF o grupo não tem partida anterior à data THEN a prioridade SHALL ser decidida só pelos desempates (ano de nascimento, apelido, id). [SIM-18]
4. WHILE o formato é "3 ou mais times" o sistema SHALL não usar nem devolver a ordem de prioridade. [SIM-19]
5. The tela do resultado em 2 times (t13) SHALL mostrar "Ordem de prioridade" com os apelidos nessa ordem. [SIM-20]

**Independent Test**: com A de acumulado 10 até a véspera e B com 8 até a véspera mas 12 contando a partida da própria data, A vem antes de B.

---

### P1: Titulares, reservas, "não entra" e saída no intervalo (2 times) ⭐ MVP

**User Story**: Como admin, quero saber quem começa, quem entra no 2º tempo e quem sai no intervalo, pela regra do grupo, sem discutir no campo.

**Why P1**: RN-09A, RF-42 e RF-43 do legado.

**Acceptance Criteria**:

1. The sistema SHALL classificar como titulares os 2N primeiros da ordem de prioridade. [SIM-21]
2. The sistema SHALL classificar como reservas que entram no 2º tempo os próximos 2 × min(K, N) da ordem e, com K ilimitado, os próximos 2N; os que passam disso SHALL ficar em "não entra" (legado `classificacao.ts:32-46`). [SIM-22]
3. WHEN um reserva marcado "só 1º tempo" entra THEN o sistema SHALL tratá-lo como qualquer reserva na regra de SIM-22 e indicar que ele joga só o 2º tempo; IF o limite acaba antes dele THEN ele SHALL ficar em "não entra". [SIM-23]
4. The sistema SHALL definir quem sai no intervalo em cada time como todos os titulares "só 1º tempo" (mesmo sem reserva para entrar) e, até completar max(titulares "só 1º tempo", reservas que entram no time) saídas, os demais titulares de pior prioridade, do pior para o melhor (legado `classificacao.ts:52-60`). [SIM-24]
5. The sistema SHALL formar os pares "sai → entra" de cada time na ordem de saída e na ordem de prioridade de quem entra, e devolver à parte quem sai sem par e quem entra sem par. [SIM-25]
6. The tela (t13) SHALL mostrar por time "Titulares" (com "só 1º tempo" e "sai no intervalo" onde couber), "Entram no 2º tempo", "Trocas no intervalo" ("A → B") e, à parte, "Não entra" com a nota "Compareceram e recebem a pontuação de presença.". [SIM-26]

**Independent Test**: 19 aptos, N = 7, K = 2: 14 titulares, 4 reservas que entram (2 por time), 1 "não entra"; o titular "só 1º tempo" sai no intervalo e forma par com um reserva.

---

### P1: Distribuição equilibrada em 2 times ⭐ MVP

**User Story**: Como admin, quero dois times com força parecida nos dois tempos, para o jogo ficar disputado.

**Why P1**: RN-10A e RF-44 do legado.

**Acceptance Criteria**:

1. The sistema SHALL montar a solução inicial em serpentina pela ordem de prioridade (titulares no padrão A, B, B, A, repetido; reservas que entram alternando A, B) (legado `distribuicao-dois.ts:21,127-128`). [SIM-27]
2. The sistema SHALL melhorar a solução por trocas de um titular de A com um titular de B, e de um reserva de A com um reserva de B, avaliadas em ordem fixa de índices crescentes, aceitando a primeira troca que diminui a chave e recomeçando, até nenhuma troca melhorar ou até 200 trocas aceitas (legado `distribuicao-dois.ts:7,131-154`). [SIM-28]
3. The sistema SHALL comparar composições pela chave lexicográfica, só em inteiros: (1) quantos times não têm N titulares; (2) quanto a diferença de substituições entre os times passa de 1; (3) diferença de nível somado no 1º tempo mais diferença no 2º tempo; (4) diferença de idade média de quem joga pelo time (legado `distribuicao-dois.ts:61-106`). [SIM-29]
4. The sugestão SHALL ter N titulares em cada time e diferença de no máximo 1 no número de substituições entre os times sempre que a classificação permite. [SIM-30]
5. The sugestão final SHALL ser um ótimo local: nenhuma troca titular↔titular nem reserva↔reserva entre os times diminui a chave, salvo quando o teto de trocas foi atingido. [SIM-31]
6. The sistema SHALL devolver os titulares e os reservas de cada time na ordem de prioridade. [SIM-32]

**Independent Test**: 4 aptos de nível e idade iguais, N = 2, K = 0: a serpentina fica como está (A recebe o 1º e o 4º). Um craque muito acima dos outros fica no time que, sem ele, tem menos nível.

---

### P1: Formato 3 ou mais times ⭐ MVP

**User Story**: Como admin de pelada com muita gente, quero dividir todos os presentes em vários times de N, com no máximo um time incompleto.

**Why P1**: RN-09B, RN-10B e RF-42 do legado.

**Acceptance Criteria**:

1. WHILE o formato é "3 ou mais times" o sistema SHALL colocar todos os aptos em times, sem 1º e 2º tempo, sem substituições, sem "só 1º tempo" e sem "não entra"; o corpo com `k` ou `so1oTempo` SHALL ser recusado com 422. [SIM-33]
2. The sistema SHALL formar os times completos de N e, quando aptos mod N > 0, um único time incompleto com o resto, sempre o último, marcado como incompleto. [SIM-34]
3. The sistema SHALL montar a solução inicial ordenando os aptos por nível (maior primeiro, depois id) e distribuindo em vaivém entre os times, respeitando a capacidade de cada um (legado `distribuicao-varios.ts:70-82`). [SIM-35]
4. The sistema SHALL melhorar a solução por trocas de um jogador entre dois times, em ordem fixa, aceitando a que diminui a chave (maior − menor nível médio entre todos os times, incluindo o incompleto; depois maior − menor idade média), até nenhuma troca melhorar ou até 200 trocas aceitas (legado `distribuicao-varios.ts:7,33-47,94-119`). [SIM-36]
5. The sistema SHALL tratar todos os aptos como candidatos ao time incompleto, sem colocá-lo lá por ranking ou por nível baixo, e SHALL devolver os jogadores de cada time por nível (maior primeiro, depois id). [SIM-37]
6. The tela (t14) SHALL mostrar um cartão por time ("Time 1", "Time 2"… e "Incompleto (R de N)" no último quando houver), com os apelidos, "Jogadores", "Nível médio", "Nível somado" e "Idade média". [SIM-38]

**Independent Test**: 22 aptos com N = 4 dão 5 times de 4 e um incompleto de 2, por último; 20 aptos com N = 4 dão 5 times de 4; 8 aptos com N = 4 é insuficiente.

---

### P1: Indicadores e avisos ⭐ MVP

**User Story**: Como admin, quero comparar os times em números e ser avisado do que pode dar errado, sem que o aviso me impeça de confirmar.

**Why P1**: RF-45 e RF-47 do legado.

**Acceptance Criteria**:

1. WHILE o formato é "2 times" o sistema SHALL devolver por time: jogadores no 1º e no 2º tempo, nível somado e médio no 1º e no 2º tempo (médio nulo se ninguém joga), idade média de titulares e reservas que entram (só de quem tem ano de nascimento, SIM-95), substituições, quem sai, os pares e quem sai ou entra sem par. [SIM-39]
2. WHILE o formato é "3 ou mais times" o sistema SHALL devolver por time: jogadores, nível somado, nível médio e idade média (só de quem tem ano de nascimento, SIM-95). [SIM-40]
3. The tela (t13) SHALL mostrar "Comparação entre os times" com "Nível no 1º tempo (soma · média)", "Nível no 2º tempo (soma · média)", "Idade média" e "Substituições" para Time A e Time B, níveis com uma casa decimal e idade com uma casa. [SIM-41]
4. WHILE o formato é "2 times" IF um time tem mais titulares "só 1º tempo" do que reservas entrando nele THEN o sistema SHALL avisar "<Time>: F jogador(es) que só joga(m) o 1º tempo sem reserva para entrar; o time terá menos gente no 2º tempo.". [SIM-42]
5. IF a composição difere da prevista (2 times: time sem N titulares ou com reserva sem par; 3 ou mais: mais de um time abaixo de N ou algum acima de N) THEN o sistema SHALL avisar "A composição difere da prevista: confira <times>.". [SIM-43]
6. IF algum apto não tem nota THEN o sistema SHALL avisar "<apelidos> não tem nota: usamos nível 5,5." (ou "não têm nota" no plural), com os apelidos na ordem de prioridade em 2 times e por id em 3 ou mais. [SIM-44]
7. WHILE o formato é "3 ou mais times" IF o time incompleto tem menos da metade de N THEN o sistema SHALL avisar "O time incompleto ficou com R jogador(es), menos da metade de N." e, quando existir, "Experimente N = a ou b." com até 2 valores de N próximos (N−1, N+1, N−2, …) que formam 3 times e não deixam incompleto menor que a metade (legado `avisos.ts:61-73`). [SIM-45]
8. The sistema SHALL nunca bloquear a confirmação por causa de um aviso, e os avisos SHALL não expor o nível individual nem dado pessoal. [SIM-46]

**Independent Test**: uma sugestão com Léo Baiano e Serginho sem nota mostra "Léo Baiano e Serginho não têm nota: usamos nível 5,5." e o botão "Confirmar escalação" continua ativo.

---

### P1: Determinismo e limite de CPU ⭐ MVP

**User Story**: Como organizador, quero que a sugestão seja a mesma sempre que eu pedir com as mesmas entradas, e que ela nunca falhe por estourar o limite do servidor gratuito.

**Why P1**: RF-44 e RNF-03 do legado, ADR-007 e ADR-017; o Worker Free interrompe a requisição que passa de 10 ms de CPU (erro 1102), não a deixa lenta.

**Acceptance Criteria**:

1. WHEN um admin envia `POST /api/grupos/:grupoId/simulador/sugerir` com `formato`, `data`, `n`, `k` (só em 2 times) e `aptos` (cada um com `id` e, em 2 times, `so1oTempo`) válidos THEN o sistema SHALL responder 200 com a sugestão completa (composição, indicadores, avisos e, em 2 times, a ordem de prioridade), sem nenhuma aleatoriedade ("Refazer sugestão" devolve a mesma), e a descrição da prévia, sem gravar nada. [SIM-47]
2. The sistema SHALL devolver a mesma sugestão, campo a campo, para a mesma entrada e o mesmo histórico, em chamadas repetidas. [SIM-48]
3. The sistema SHALL devolver a mesma sugestão quando a lista de aptos do corpo, os jogadores, as partidas e as presenças chegam ao domínio em outra ordem. [SIM-49]
4. The módulo do simulador em `@pelada/dominio` SHALL não usar fonte de aleatoriedade nem relógio (`Math.random`, `crypto`, `Date`), verificado por teste que falha se algum aparecer. [SIM-50]
5. The domínio SHALL fazer todas as comparações do equilíbrio em inteiros (nível × 100, idade em anos, médias × 100 com meio para cima). [SIM-51]
6. The sistema SHALL ter casos de referência fixos (entrada → composição esperada) nos dois formatos, escritos a partir destes critérios e conferidos contra o resultado do legado para as mesmas entradas, incluindo 19 aptos com N = 7 e K = 2 e 22 aptos com N = 4. [SIM-52]
7. IF a lista de aptos passa de 60 ou tem jogador repetido THEN o sistema SHALL responder 422 ("Há jogador repetido nos aptos." no campo `aptos`). [SIM-53]
8. IF algum apto não é jogador do grupo ou não está ativo na data THEN o sistema SHALL responder 422 com "Há jogadores que não estão ativos no grupo nesta data." no campo `aptos`. [SIM-54]
9. IF N está fora de 2 a 11, K fora de 0 a 20 sem ser `ilimitado`, ou falta campo THEN o sistema SHALL responder 422 com erro no campo. [SIM-55]
10. IF os aptos são insuficientes para o formato THEN `sugerir` SHALL responder 422 com a descrição da prévia (SIM-11, SIM-13) no campo `aptos`. [SIM-56]
11. The `sugerir` no domínio SHALL ficar abaixo de 4 ms de CPU na mediana e no p99 de 50 medições, em Node, para 30 aptos em 2 times de 11 com K ilimitado e em 6 times de 5, com histórico de 40 jogadores e 104 partidas (meta do legado `sugerir.orcamento.test.ts:10`). [SIM-57]
12. The `sugerir` e o `avaliar` no domínio SHALL ficar abaixo do mesmo limiar na pior entrada válida (60 aptos, N de 2 a 11, os dois formatos e K ilimitado), por teste que mede todas as combinações. [SIM-58]
13. The busca local SHALL terminar em todo caso por teto de trocas aceitas (200, legado) e, se SIM-58 pedir, por teto de avaliações definido no Design, sempre devolvendo composição válida. [SIM-59]
14. The rota `sugerir` SHALL registrar uma linha de log por requisição com formato, N, K e o número de aptos, sem id, apelido nem grupo, para medir o custo na plataforma (legado `rotas/grupos/simulador/sugerir.ts:20-29`). [SIM-60]
15. WHEN a feature é publicada na prévia THEN 50 execuções de `sugerir` com 30 aptos (2 × 11 e 6 × 5) e 50 de `avaliar` SHALL ter p99 de CPU abaixo de 7 ms e nenhum erro 1102, medidos pelo painel ou pelo `wrangler tail` e registrados no `validation.md`; IF falhar THEN a feature SHALL parar para decisão do usuário (contingência do ADR-017 do legado: otimizar, cálculo fora do Worker, Workers Paid). [SIM-61]

**Independent Test**: chamar `sugerir` duas vezes com os aptos em ordens diferentes dá respostas iguais; o teste de orçamento roda no CI e falha se a mediana passar de 4 ms.

---

### P1: Ajuste manual e refazer sugestão ⭐ MVP

**User Story**: Como admin, quero mover ou trocar jogadores à mão e ver os números atualizados, ou voltar à sugestão original.

**Why P1**: RF-46 do legado; a busca local dá uma sugestão boa e estável, não a melhor possível (ADR-007), e o admin ajusta.

**Acceptance Criteria**:

1. WHEN um admin envia `POST /api/grupos/:grupoId/simulador/avaliar` com a entrada do simulador mais a `composicao` editada THEN o sistema SHALL responder 200 com indicadores, pares e avisos recalculados para essa composição, sem refazer a sugestão nem gravar. [SIM-62]
2. IF a composição tem jogador repetido ou jogador fora dos aptos THEN `avaliar` SHALL responder 422 com "Há jogador repetido na composição." ou "Há jogador fora dos aptos na composição." no campo `composicao`. [SIM-63]
3. WHEN o admin toca num jogador do resultado THEN a tela SHALL abrir a folha "Mover jogador" (t13 `mover`) com os destinos (2 times: titular de A ou de B, entra no 2º tempo por A ou B, "Não entra", "Só 1º tempo"; 3 ou mais: os times, t14 `mover`) e "Trocar com…" (t13 `trocar`), e, ao escolher, SHALL mover na hora e chamar `avaliar` com debounce de 300 ms, mostrando os números como "recalculando" até a resposta (t13 `recalculando`). [SIM-64]
4. IF `avaliar` falha THEN a tela SHALL manter a composição movida e mostrar "Não foi possível recalcular." com "Tentar de novo" (t13 `erro-recalcular`). [SIM-65]
5. WHEN o admin toca em "Refazer sugestão" depois de algum ajuste THEN a tela SHALL perguntar "Descartar seus ajustes?" com "A sugestão será refeita do zero com as mesmas entradas.", "Cancelar" e "Refazer sugestão" (t13 `refazer`), e ao confirmar SHALL chamar `sugerir` de novo; "Editar entradas" SHALL voltar à t12 com as entradas mantidas. [SIM-66]

**Independent Test**: mover Japa do Time A para o Time B muda as somas e os pares depois da resposta de `avaliar`; "Refazer sugestão" devolve exatamente a sugestão inicial.

---

### P1: Confirmar a escalação ⭐ MVP

**User Story**: Como admin, quero gravar os times do dia, para a escalação ficar registrada e já marcar a presença no lançamento da partida.

**Why P1**: RF-48 do legado e o item "escalação confirmada" do escopo (`necessidade.md` §3).

**Acceptance Criteria**:

1. WHEN um admin envia `POST /api/grupos/:grupoId/escalacoes` com `formato`, `data`, `n`, `k` (só em 2 times) e `composicao` (2 times: os dois times com `titulares` e `entramNo2oTempo`, cada jogador com `id` e `so1oTempo`, e `naoEntra`; 3 ou mais: `times` com `jogadores`) THEN o sistema SHALL gravar a escalação do grupo naquela data, com a conta e o momento da confirmação, e responder 201 com `data` e `confirmadaEm`. [SIM-67]
2. The rotas do simulador e de escalação SHALL passar por uma única verificação de recurso do plano (`simulador`), que nesta feature libera todo grupo, para a `planos-e-cobranca` ligar a trava num lugar só. [SIM-68]
3. IF já existe escalação para o grupo na data THEN o sistema SHALL substituí-la, mantendo uma só linha por grupo e data. [SIM-69]
4. WHEN a escalação é gravada THEN o sistema SHALL registrar, na mesma transação, o evento de uso `escalacao_confirmada` com a data da partida e o momento, sem dado de jogador; IF qualquer dos dois falha THEN nenhum dos dois SHALL ficar gravado. [SIM-70]
5. IF a composição tem jogador repetido ou algum jogador que não está ativo no grupo na data THEN o sistema SHALL responder 422 com "Há jogador repetido na composição." ou "Há jogadores que não estão ativos no grupo nesta data." no campo `composicao`, sem gravar. [SIM-71]
6. The sistema SHALL aceitar a confirmação de uma composição ajustada que diverge da prevista (avisos não bloqueiam) e SHALL guardar em 3 ou mais times o K como nulo e, em 2 times, K ilimitado como nulo. [SIM-72]
7. WHEN a confirmação dá certo THEN a tela SHALL voltar ao início do grupo com a faixa "Escalação de dd/mm confirmada."; IF falha THEN SHALL manter a composição na tela e mostrar "Não foi possível confirmar a escalação. Tente de novo." (t13 `erro-confirmar`, vale para t14). [SIM-73]
8. The cabeçalho do resultado SHALL mostrar "<dia abreviado>, dd/mm · 2 times de N · até K substituições por time" (ou "sem limite de substituições" com K ilimitado, decisão do usuário em 2026-11-04) em 2 times e "<dia>, dd/mm · <descrição da prévia>" em 3 ou mais. [SIM-74]

**Independent Test**: confirmar duas vezes a escalação de 22/10 com composições diferentes deixa uma linha só, com a segunda; o painel "Uso do app" conta 2 escalações na semana.

---

### P1: Pré-marcação da partida pela escalação ⭐ MVP

**User Story**: Como admin, quero que o lançamento da partida já venha com quem estava na escalação marcado como presente, para lançar em segundos.

**Why P1**: RF-26 do legado; a `partidas-e-ranking` deixou o item para esta feature.

**Acceptance Criteria**:

1. WHEN um admin abre o lançamento de partida nova numa data que tem escalação confirmada THEN o sistema SHALL devolver como `presente` todo jogador da escalação que está ativo na data (titulares, reservas que entram e "não entra", ou todos os times), os demais ativos como `ausente`, e `preMarcadaPelaEscalacao: true` (legado `partidas/nova.ts:51-58`). [SIM-75]
2. IF a data não tem escalação ou a escalação gravada não passa na validação do contrato THEN o lançamento SHALL vir como na `partidas-e-ranking` (todos ausentes) e `preMarcadaPelaEscalacao: false`. [SIM-76]
3. WHILE o lançamento está pré-marcado a tela (t11) SHALL mostrar a faixa "Pré-marcado pela escalação de dd/mm (inclui quem ficou como “não entra”)." e o admin SHALL poder mudar qualquer marcação antes de salvar. [SIM-77]
4. The pré-marcação SHALL valer só para a partida nova; a edição de partida já lançada SHALL não mudar por causa de escalação. [SIM-78]

**Independent Test**: confirmar a escalação de 22/10 com 19 jogadores (1 "não entra") e abrir "Lançar partida de qui, 22/10" mostra os 19 como presentes e a faixa.

---

### P1: Acesso, isolamento e dados pessoais ⭐ MVP

**User Story**: Como organizador, quero que só os admins do meu grupo usem o simulador e vejam os níveis, e que nada do grupo vaze para outro.

**Why P1**: RF-37 e RF-38 do legado; RLS por `grupo_id` (FUN-12 a FUN-17).

**Acceptance Criteria**:

1. WHEN uma conta sem vínculo com o grupo chama qualquer rota do simulador ou de escalação THEN o sistema SHALL responder 404 sem ler nem gravar dado do grupo, e sem sessão SHALL responder 401. [SIM-79]
2. WHEN uma rota recebe o id de um jogador de outro grupo nos aptos ou na composição THEN o sistema SHALL responder 422 (SIM-54, SIM-71) sem revelar dado desse jogador. [SIM-80]
3. The escrita e a leitura de `escalacoes` SHALL passar pela RLS como `pelada_app`, e a suíte de isolamento SHALL provar, por comando (SELECT, INSERT, UPDATE, DELETE, incluindo UPDATE e DELETE sem WHERE), que um admin do grupo A não lê nem altera a escalação do grupo B. [SIM-81]
4. The respostas do simulador SHALL trazer de cada jogador só id, apelido, nível, `semNota`, `semAno` e "só 1º tempo", e SHALL nunca trazer telefone, ano de nascimento, idade individual, posição, notas por habilidade ou pontos; a composição gravada SHALL ter só ids e "só 1º tempo". [SIM-82]
5. The rotas novas SHALL entrar na lista de casos da suíte de isolamento e SHALL responder 409 `grupo_arquivado` nas escritas e cálculos (POST) em grupo arquivado. [SIM-83]

**Independent Test**: a suíte de isolamento roda com dois grupos e prova o 404 cruzado em todas as rotas novas e a matriz por comando em `escalacoes`.

---

### P2: Rotas e comparação visual

**User Story**: Como admin, quero que o simulador tenha a mesma cara do resto do app, no PC e no celular.

**Why P2**: a regra funciona sem a comparação visual; ela garante o acabamento.

**Acceptance Criteria**:

1. The app SHALL ter a rota `/app/grupos/:grupoId/simulador` para as entradas (t12) e o resultado (t13, t14), aberta pelo item "Simulador" do início do grupo. [SIM-84]
2. The telas SHALL passar na comparação visual com o mockup em PC e celular, no limite de 1%: t12 (`vazio`, `dois-times`, `tres-times`, `insuficiente`, `calculando`), t13 (`sucesso`, `carregando`, `recalculando`, `erro-recalcular`, `erro-confirmar`, `mover`, `trocar`, `refazer`), t14 (`sucesso`, `mover`), t09 (`sucesso`) e t11 com a faixa de pré-marcação, com o `telas.json` atualizado para a rota da v2. [SIM-85]
3. WHILE `sugerir` está pendente a tela SHALL mostrar "Montando os times…" (t13 `carregando`, vale para t14). [SIM-86]

**Independent Test**: a comparação visual do CI fica verde para as telas da lista.

---

## Edge Cases

- WHEN dois admins confirmam a escalação da mesma data ao mesmo tempo THEN o sistema SHALL terminar com uma só escalação (a última gravada) e as duas requisições SHALL responder 201, sem erro 500 por violação da chave única. [SIM-87]
- IF um jogador da escalação é inativado antes do lançamento da partida THEN a pré-marcação SHALL ignorá-lo e marcar só os ativos na data. [SIM-88]
- WHILE o formato é "2 times" IF K = 0 THEN ninguém SHALL entrar no 2º tempo, os reservas SHALL ir para "não entra" e só os titulares "só 1º tempo" SHALL sair no intervalo. [SIM-89]
- IF um titular "só 1º tempo" fica sem reserva para entrar THEN ele SHALL sair no intervalo mesmo assim e o aviso de SIM-42 SHALL aparecer. [SIM-90]
- IF todos os aptos têm o mesmo nível e a mesma idade THEN a sugestão de 2 times SHALL ser a serpentina, sem troca aceita. [SIM-91]
- IF a sugestão atinge o teto de trocas THEN o sistema SHALL devolver a melhor composição até ali, válida (N titulares por time em 2 times; tamanhos da prévia em 3 ou mais). [SIM-92]
- IF o grupo é arquivado enquanto o admin está no resultado THEN a confirmação SHALL responder 409 `grupo_arquivado` e a tela SHALL mostrar o erro de confirmação sem perder a composição. [SIM-93]
- IF a escalação gravada no banco tem forma inválida (dado antigo) THEN a leitura SHALL tratá-la como inexistente, sem erro 500 (legado `aplicacao/simulador/composicao.ts:4-11`). [SIM-94]
- IF um apto não tem ano de nascimento (dado antigo) THEN o sistema SHALL deixá-lo fora da soma e da contagem da idade média do time e do critério de idade do equilíbrio, devolver idade média nula para time sem ninguém com ano, e a tela SHALL marcar o apto com "sem ano" no contexto e no resultado. [SIM-95]

---

## Implicit-requirement sweep

| Dimensão | Cobertura |
|---|---|
| Validação de entrada e limites | SIM-04, SIM-33, SIM-53 a SIM-56, SIM-63, SIM-71 (N 2 a 11, K 0 a 20 ou ilimitado, até 60 aptos, sem repetição, `.strict()`) |
| Falha e falha parcial | SIM-65, SIM-70 (evento e escalação na mesma transação), SIM-73, SIM-93 |
| Idempotência e repetição | SIM-48, SIM-49, SIM-69 (confirmar de novo substitui), SIM-87 |
| Fronteiras de auth e rate limit | SIM-68, SIM-79 a SIM-83. Rate limit: N/A because as rotas exigem sessão de admin e seguem o limite das rotas autenticadas da `conta-e-acesso` |
| Concorrência e ordem | SIM-28, SIM-36 (ordem fixa de avaliação), SIM-87 |
| Ciclo de vida dos dados | SIM-69 (uma escalação por grupo e data), SIM-88, SIM-94; exclusão de conta anonimiza `contas` e mantém a FK `confirmada_por` (ACE-28) |
| Observabilidade | SIM-60, SIM-61 |
| Falha de dependência externa | SIM-61 (limite de CPU do Worker e contingência) |
| Integridade de transições de estado | SIM-66 (sugestão → ajustes → refazer), SIM-69, SIM-75 a SIM-78 (escalação → pré-marcação) |
| Desempenho | SIM-57, SIM-58, SIM-59, SIM-61 |
| Determinismo | SIM-48 a SIM-52 |
| Dados pessoais (LGPD) | SIM-03, SIM-46, SIM-70, SIM-82 |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----------- | ------ | ------- |
| SIM-01 | P1: Entradas do simulador | Design | Pending |
| SIM-02 | P1: Entradas do simulador | Design | Pending |
| SIM-03 | P1: Entradas do simulador | Design | Pending |
| SIM-04 | P1: Entradas do simulador | Design | Pending |
| SIM-05 | P1: Entradas do simulador | Design | Pending |
| SIM-06 | P1: Entradas do simulador | Design | Pending |
| SIM-07 | P1: Entradas do simulador | Design | Pending |
| SIM-08 | P1: Entradas do simulador | Design | Pending |
| SIM-09 | P1: Prévia e aptos insuficientes | Design | Pending |
| SIM-10 | P1: Prévia e aptos insuficientes | Design | Pending |
| SIM-11 | P1: Prévia e aptos insuficientes | Design | Pending |
| SIM-12 | P1: Prévia e aptos insuficientes | Design | Pending |
| SIM-13 | P1: Prévia e aptos insuficientes | Design | Pending |
| SIM-14 | P1: Prévia e aptos insuficientes | Design | Pending |
| SIM-15 | P1: Prévia e aptos insuficientes | Design | Pending |
| SIM-16 | P1: Prioridade pela véspera | Design | Pending |
| SIM-17 | P1: Prioridade pela véspera | Design | Pending |
| SIM-18 | P1: Prioridade pela véspera | Design | Pending |
| SIM-19 | P1: Prioridade pela véspera | Design | Pending |
| SIM-20 | P1: Prioridade pela véspera | Design | Pending |
| SIM-21 | P1: Titulares, reservas e saída | Design | Pending |
| SIM-22 | P1: Titulares, reservas e saída | Design | Pending |
| SIM-23 | P1: Titulares, reservas e saída | Design | Pending |
| SIM-24 | P1: Titulares, reservas e saída | Design | Pending |
| SIM-25 | P1: Titulares, reservas e saída | Design | Pending |
| SIM-26 | P1: Titulares, reservas e saída | Design | Pending |
| SIM-27 | P1: Distribuição em 2 times | Design | Pending |
| SIM-28 | P1: Distribuição em 2 times | Design | Pending |
| SIM-29 | P1: Distribuição em 2 times | Design | Pending |
| SIM-30 | P1: Distribuição em 2 times | Design | Pending |
| SIM-31 | P1: Distribuição em 2 times | Design | Pending |
| SIM-32 | P1: Distribuição em 2 times | Design | Pending |
| SIM-33 | P1: Formato 3 ou mais times | Design | Pending |
| SIM-34 | P1: Formato 3 ou mais times | Design | Pending |
| SIM-35 | P1: Formato 3 ou mais times | Design | Pending |
| SIM-36 | P1: Formato 3 ou mais times | Design | Pending |
| SIM-37 | P1: Formato 3 ou mais times | Design | Pending |
| SIM-38 | P1: Formato 3 ou mais times | Design | Pending |
| SIM-39 | P1: Indicadores e avisos | Design | Pending |
| SIM-40 | P1: Indicadores e avisos | Design | Pending |
| SIM-41 | P1: Indicadores e avisos | Design | Pending |
| SIM-42 | P1: Indicadores e avisos | Design | Pending |
| SIM-43 | P1: Indicadores e avisos | Design | Pending |
| SIM-44 | P1: Indicadores e avisos | Design | Pending |
| SIM-45 | P1: Indicadores e avisos | Design | Pending |
| SIM-46 | P1: Indicadores e avisos | Design | Pending |
| SIM-47 | P1: Determinismo e limite de CPU | Design | Pending |
| SIM-48 | P1: Determinismo e limite de CPU | Design | Pending |
| SIM-49 | P1: Determinismo e limite de CPU | Design | Pending |
| SIM-50 | P1: Determinismo e limite de CPU | Design | Pending |
| SIM-51 | P1: Determinismo e limite de CPU | Design | Pending |
| SIM-52 | P1: Determinismo e limite de CPU | Design | Pending |
| SIM-53 | P1: Determinismo e limite de CPU | Design | Pending |
| SIM-54 | P1: Determinismo e limite de CPU | Design | Pending |
| SIM-55 | P1: Determinismo e limite de CPU | Design | Pending |
| SIM-56 | P1: Determinismo e limite de CPU | Design | Pending |
| SIM-57 | P1: Determinismo e limite de CPU | Design | Pending |
| SIM-58 | P1: Determinismo e limite de CPU | Design | Pending |
| SIM-59 | P1: Determinismo e limite de CPU | Design | Pending |
| SIM-60 | P1: Determinismo e limite de CPU | Design | Pending |
| SIM-61 | P1: Determinismo e limite de CPU | Design | Pending |
| SIM-62 | P1: Ajuste manual e refazer | Design | Pending |
| SIM-63 | P1: Ajuste manual e refazer | Design | Pending |
| SIM-64 | P1: Ajuste manual e refazer | Design | Pending |
| SIM-65 | P1: Ajuste manual e refazer | Design | Pending |
| SIM-66 | P1: Ajuste manual e refazer | Design | Pending |
| SIM-67 | P1: Confirmar a escalação | Design | Pending |
| SIM-68 | P1: Confirmar a escalação | Design | Pending |
| SIM-69 | P1: Confirmar a escalação | Design | Pending |
| SIM-70 | P1: Confirmar a escalação | Design | Pending |
| SIM-71 | P1: Confirmar a escalação | Design | Pending |
| SIM-72 | P1: Confirmar a escalação | Design | Pending |
| SIM-73 | P1: Confirmar a escalação | Design | Pending |
| SIM-74 | P1: Confirmar a escalação | Design | Pending |
| SIM-75 | P1: Pré-marcação da partida | Design | Pending |
| SIM-76 | P1: Pré-marcação da partida | Design | Pending |
| SIM-77 | P1: Pré-marcação da partida | Design | Pending |
| SIM-78 | P1: Pré-marcação da partida | Design | Pending |
| SIM-79 | P1: Acesso, isolamento e dados pessoais | Design | Pending |
| SIM-80 | P1: Acesso, isolamento e dados pessoais | Design | Pending |
| SIM-81 | P1: Acesso, isolamento e dados pessoais | Design | Pending |
| SIM-82 | P1: Acesso, isolamento e dados pessoais | Design | Pending |
| SIM-83 | P1: Acesso, isolamento e dados pessoais | Design | Pending |
| SIM-84 | P2: Rotas e comparação visual | Design | Pending |
| SIM-85 | P2: Rotas e comparação visual | Design | Pending |
| SIM-86 | P2: Rotas e comparação visual | Design | Pending |
| SIM-87 | Edge Cases | Design | Pending |
| SIM-88 | Edge Cases | Design | Pending |
| SIM-89 | Edge Cases | Design | Pending |
| SIM-90 | Edge Cases | Design | Pending |
| SIM-91 | Edge Cases | Design | Pending |
| SIM-92 | Edge Cases | Design | Pending |
| SIM-93 | Edge Cases | Design | Pending |
| SIM-94 | Edge Cases | Design | Pending |
| SIM-95 | Edge Cases | Design | Pending |

**Coverage:** 95 total, 0 mapped to tasks, 95 unmapped ⚠️ (mapeamento na fase Tasks)

---

## Success Criteria

- [ ] O grupo de teste monta os times de uma pelada real no simulador e confirma a escalação, e o lançamento da partida vem pré-marcado.
- [ ] Casos de referência dos dois formatos dão a mesma composição do legado.
- [ ] Teste de orçamento de CPU verde no CI, inclusive na pior entrada válida.
- [ ] Medição na prévia com p99 abaixo de 7 ms e nenhum erro 1102, registrada no `validation.md`.
- [ ] Suíte de isolamento verde com as rotas novas e a matriz por comando em `escalacoes`.
- [ ] Comparação visual verde para t12, t13, t14, t09 e a faixa da t11.
