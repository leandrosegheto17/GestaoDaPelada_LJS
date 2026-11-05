# Simulador — Tarefas

**Modo**: enxuto
**Passada**: rascunho
**Base**: .specs/features/simulador/spec.md (aprovada em 2026-11-04), conferido em 2026-11-04. Contratos: fundação v2 (`.specs/features/fundacao/`), `conta-e-acesso`, `grupos-e-elenco` e `partidas-e-ranking` v2 (`tasks.md` de cada uma, nenhuma executada).
**Branch pai**: `feature/partidas-e-ranking` (a `partidas-e-ranking` ainda não estará integrada). Se já estiver integrada na `main` quando o `/executar` começar, a Branch pai passa a ser `main`.
**Feature**: 5 de 8 do roteiro (AD-001, AD-015). Requisitos `SIM-*`.

> Convenções: `S:` = `.specs/features/simulador/spec.md` (linha); `F:` = `.specs/features/fundacao/tasks.md`; `FD:` = `.specs/features/fundacao/design.md`; `CA:` = `.specs/features/conta-e-acesso/tasks.md`; `GE:` = `.specs/features/grupos-e-elenco/tasks.md`; `PR:` = `.specs/features/partidas-e-ranking/tasks.md`; `M:` = `ljs:backend/api/src/infraestrutura/db/migracoes/` (as 23 migrações copiadas, AD-003); `L:` = legado `C:\Leandro\Projetos\GestaodaPelada` @ `ece227e0`, só leitura, referência de regra. Do zero (AD-002): código e testes do legado e do LJS são só consulta. ADs da feature: AD-080 a AD-086, AD-117 e AD-118. Nome de teste de tarefa de risco alto cita o `SIM-NN`.

## Delta

1. **Banco**: `escalacoes` e o tipo `escalacao_confirmada` de `eventos_uso` existem como a spec diz (`M:1792843200000_linha-de-base.sql:194-207` e `:212-228`; grants `M:1792843260000_roles.sql:22-31`, inclusive DELETE; RLS `FORCE` pelo laço de `M:1792843320000_rls.sql:51-56`). Sem grants por coluna: o `WITH CHECK` da policy já impede mover a linha para outro grupo, e T0 prova a matriz (AD-084). A única migração é o `-- contrair:` da `grupo_criar` de 6 parâmetros (AD-037, AD-048) → T25, com ensaio sobre dump da produção (AD-033, AD-073) → T42. Só roda depois de a prévia já estar com o deploy da `partidas-e-ranking` (que usa a de 7), para o rollback não cair na função apagada.
2. **Testes existentes que esta feature muda** (autorizados pelo usuário em 2026-11-04, `## Autorizações` do `STATE.md`: mesma força, nenhuma asserção removida, motivo no commit): a `grupo_criar` de 6 parâmetros é chamada pelos testes `GE:397` (T2), `GE:426` (T3), `GE:502` (T6, assinatura no meta-teste), `PR:430` (T0 item b) e `PR:987` (T22); `PR:1289`/`PR:1561` fixam `escalacoesConfirmadas` 0; `PR:2073` (T64) afirma "nenhum item Simulador"; `PR:937`/`PR:1538` fixam os 6 campos de `grupoDetalhe`; `PR:1436` fixa a resposta de `partidas/nova`.
3. **Suposições sobre as features 3 e 4, conferidas**: acumulado = `inicioDaContagem` + `acumuladoPorInicio` (`PR:534`, `PR:558`), com `vespera` (`PR:457`); histórico por `historico.carregar(db, grupoId, ate)` (`PR:1135`), que já para em `ate` = véspera (SIM-17); ativos na data por `jogadores.ativosNaData` (`PR:1185`); nível por `calcularNivel` (`GE:599`, 550 e `semNota`); `eventos_uso` com SELECT e INSERT do `pelada_app` (`PR:1038`); `GET .../partidas/nova` em `rotas/partidas.ts` com o contrato `partidaNova` (`PR:1436`, `PR:889`); `exigirGrupoAtivo` (`GE:901`) e transação `READ ONLY` no sufixo `/previa` (`PR:1362`, AD-035), que vale para `simulador/previa`.
4. **O que as features 3 e 4 não têm e a spec supunha**: `ordenarPorRanking` (`PR:661`) não desempata por id e o simulador precisa (SIM-16): ordem própria no módulo do simulador, sem mexer no ranking (AD-085). `dataSugeridaPartida` (`PR:610`) olha para trás; o contexto pede o próximo dia de jogo, hoje incluso: função nova `proximoDiaDeJogo` (AD-086). Não há idade no domínio v2 (`L:backend/dominio/src/elenco/idade.ts:4` não tem par): `idadeNaData` nasce aqui. `recursoLiberado(grupoId, recurso)` (AD-049, PLA-07 da `planos-e-cobranca`) não existe: nasce aqui, liberando tudo (T32).
5. **Mockup**: as respostas `respostas/simulador-*.json` trazem `nivel` decimal (6.1) e não têm `semAno`; o contrato v2 usa nível inteiro × 100 (GEL-101) e `semAno` (SIM-01). As respostas são reescritas no formato do contrato (AD-080, como a P27 da `partidas-e-ranking`). O `telas.json` tem a rota `/admin/g-domingo/simulador` → `/app/grupos/...` (AD-047). O patch da `partidas-e-ranking` tira a faixa de pré-marcação da t11 `nova` (AD-040, P28): a faixa de SIM-77 ganha o estado `t11-partida--pre-marcada.html`, copiado da t11 `nova` de `f417361` (AD-081). A t09 `sucesso` mostra o Financeiro (feature 6), e a AD-029 deixa a t09 fora da comparação até ele existir (AD-082, AD-118: recorte do bloco "Dia de jogo" agora, tela inteira na `financeiro`).
6. **Limite de escrita**: `previa`, `sugerir` e `avaliar` são POST e contam no `LIMITE_ESCRITA` de 60 por minuto por conta (`GE:928`); com o debounce da prévia e os 300 ms do `avaliar`, o uso normal fica abaixo, e o 429 aparece na tela como a falha de recalcular (AD-083).
7. **Uso do app**: o Independent Test de SIM-69/SIM-70 (`S:281`) conta as escalações no painel "Uso do app"; `eventos.porSemana` (`PR:1289`) devolve 0 fixo e passa a contar `escalacao_confirmada` (T30).
8. **Critérios com posição**: SIM-08 ("abaixo dele") com asserção de `boundingBox` (T51); SIM-26 e SIM-38 ("à parte", cartões) pela comparação visual (T53).
9. **Teto de avaliações (SIM-58, SIM-59)**: não há design; se a medição de T20 passar de 4 ms, a tarefa para e pergunta o valor do teto, porque ele muda a sugestão em relação ao legado (SIM-52). Medição na prévia (SIM-61) é T43, com pausa para o deploy feito pelo usuário.

## Critérios

| ID | Resumo | Tarefa |
|---|---|---|
| SIM-01 | `GET contexto` sem data: próximo dia de jogo, hoje e ativos | T2, T21, T27, T33 |
| SIM-02 | Com `data`: ativos nessa data, `dataSugerida` mantida | T27, T33 |
| SIM-03 | Ordem pelo apelido; sem telefone, ano, posição, notas, pontos | T27, T33, T41 |
| SIM-04 | `data` inválida: 422 no campo | T21, T33 |
| SIM-05 | t12: data, formato, N, aptos com nível | T45 |
| SIM-06 | 2 times: K e "Só 1º"; 3+: ocultos | T45 |
| SIM-07 | Sem ativos: "Sem jogadores" e "Cadastrar jogadores" | T45 |
| SIM-08 | t09: item Simulador e escalação confirmada abaixo (posição) | T24, T31, T39, T51 |
| SIM-09 | `POST previa` sem banco e sem gravar | T3, T21, T34 |
| SIM-10 | 2 times válida: reservas e descrição | T3, T4 |
| SIM-11 | 2 times inválida: `maiorNPossivel` e descrição | T3, T4 |
| SIM-12 | 3+ válida: T, completos, incompleto | T3, T4 |
| SIM-13 | 3+ inválida: `nSugerido`, `doisTimesPossivel` e descrição | T3, T4 |
| SIM-14 | Tela: descrição no lugar, botão desabilitado, "Prévia calculando…" | T46 |
| SIM-15 | Prévia com debounce, sem cálculo na tela | T44, T46 |
| SIM-16 | Ordem de prioridade com acumulado até a véspera | T5 |
| SIM-17 | Só partidas anteriores à data | T5, T35 |
| SIM-18 | Sem partida anterior: só desempates | T5 |
| SIM-19 | 3+: sem ordem de prioridade | T15 |
| SIM-20 | t13: "Ordem de prioridade" | T47 |
| SIM-21 | Titulares = 2N primeiros | T6 |
| SIM-22 | Reservas que entram 2 × min(K, N); resto "não entra" | T6 |
| SIM-23 | Reserva "só 1º" segue a regra e joga o 2º | T6 |
| SIM-24 | Quem sai no intervalo | T7 |
| SIM-25 | Pares "sai → entra" e sem par | T7 |
| SIM-26 | t13: titulares, entram, trocas, "Não entra" à parte | T47, T53 |
| SIM-27 | Serpentina A, B, B, A | T9 |
| SIM-28 | Busca local 2 times, ordem fixa, 200 trocas | T9 |
| SIM-29 | Chave lexicográfica de 2 times em inteiros | T8 |
| SIM-30 | N titulares e diferença ≤ 1 de substituições | T8, T9 |
| SIM-31 | Ótimo local salvo teto | T9 |
| SIM-32 | Titulares e reservas na ordem de prioridade | T9 |
| SIM-33 | 3+: todos em times; `k`/`so1oTempo` 422 | T10, T22 |
| SIM-34 | Times completos e um incompleto, o último | T10 |
| SIM-35 | Solução inicial em vaivém por nível | T10 |
| SIM-36 | Busca local 3+ com chave de nível e idade | T11 |
| SIM-37 | Todos candidatos ao incompleto; ordem por nível | T10, T11 |
| SIM-38 | t14: cartões por time e "Incompleto (R de N)" | T48, T53 |
| SIM-39 | Indicadores de 2 times | T12 |
| SIM-40 | Indicadores de 3+ | T13 |
| SIM-41 | t13: "Comparação entre os times" | T47 |
| SIM-42 | Aviso "só 1º" sem reserva | T14 |
| SIM-43 | Aviso composição difere da prevista | T14 |
| SIM-44 | Aviso sem nota, singular e plural | T14 |
| SIM-45 | Aviso incompleto < metade e N alternativos | T14 |
| SIM-46 | Aviso não bloqueia; sem dado pessoal | T14, T50 |
| SIM-47 | `POST sugerir` 200 completo, sem gravar | T15, T22, T35 |
| SIM-48 | Mesma entrada, mesma sugestão | T15, T17 |
| SIM-49 | Outra ordem de entrada, mesma sugestão | T15, T17 |
| SIM-50 | Módulo sem `Math.random`, `crypto`, `Date` | T17 |
| SIM-51 | Comparações em inteiros | T2, T8 |
| SIM-52 | Casos de referência conferidos contra o legado | T18 |
| SIM-53 | Mais de 60 aptos ou repetido: 422 | T22, T35 |
| SIM-54 | Apto fora do grupo ou inativo: 422 | T35 |
| SIM-55 | N, K ou campo ausente: 422 | T21, T22, T35 |
| SIM-56 | Aptos insuficientes: 422 com a descrição | T35 |
| SIM-57 | `sugerir` < 4 ms (mediana e p99) em Node | T19 |
| SIM-58 | Pior entrada válida < 4 ms | T20 |
| SIM-59 | Busca termina por teto, composição válida | T9, T11, T20 |
| SIM-60 | Log por requisição sem id, apelido nem grupo | T35 |
| SIM-61 | Medição na prévia: p99 < 7 ms, sem 1102 | T43 |
| SIM-62 | `POST avaliar` recalcula sem gravar | T16, T22, T36 |
| SIM-63 | Composição com repetido ou fora dos aptos: 422 | T16, T36 |
| SIM-64 | Folha "Mover jogador", "Trocar com…", debounce 300 ms | T49 |
| SIM-65 | Falha do `avaliar`: "Não foi possível recalcular." | T49 |
| SIM-66 | "Refazer sugestão" e "Editar entradas" | T50 |
| SIM-67 | `POST escalacoes` grava e responde 201 | T23, T28, T37 |
| SIM-68 | Verificação única de recurso `simulador` | T32 |
| SIM-69 | Nova escalação da data substitui | T28 |
| SIM-70 | Evento `escalacao_confirmada` na mesma transação | T28, T30 |
| SIM-71 | Composição repetida ou inativa: 422 | T37 |
| SIM-72 | Aceita composição ajustada; K nulo | T28, T37 |
| SIM-73 | Sucesso volta ao início; falha mantém a composição | T50 |
| SIM-74 | Cabeçalho do resultado | T47, T48 |
| SIM-75 | `partidas/nova` pré-marcada pela escalação | T24, T29, T38 |
| SIM-76 | Sem escalação ou inválida: como antes | T29, T38 |
| SIM-77 | t11: faixa de pré-marcação | T52 |
| SIM-78 | Só partida nova; edição não muda | T38 |
| SIM-79 | Sem vínculo 404; sem sessão 401 | T40 |
| SIM-80 | Jogador de outro grupo: 422 sem revelar | T35, T40 |
| SIM-81 | RLS de `escalacoes` por comando | T0 |
| SIM-82 | Respostas só com os campos permitidos | T22, T23, T41 |
| SIM-83 | Rotas na suíte de isolamento; 409 em arquivado | T34, T40 |
| SIM-84 | Rota `/app/grupos/:grupoId/simulador` | T51 |
| SIM-85 | Comparação visual das telas | T44, T53 |
| SIM-86 | "Montando os times…" | T47 |
| SIM-87 | Confirmações simultâneas: uma linha, dois 201 | T28 |
| SIM-88 | Jogador inativado fica fora da pré-marcação | T38 |
| SIM-89 | K = 0 | T6, T7 |
| SIM-90 | "Só 1º" sem reserva sai mesmo assim | T7, T14 |
| SIM-91 | Todos iguais: serpentina sem troca | T9 |
| SIM-92 | Teto de trocas: melhor composição válida | T9, T11 |
| SIM-93 | Arquivado no meio: 409 e composição mantida | T37, T50 |
| SIM-94 | Escalação gravada inválida = inexistente | T23, T29 |
| SIM-95 | Sem ano fora da idade média; "sem ano" na tela | T2, T8, T12, T45 |

Nenhum critério fica fora. Mudam de leitura, pelas ADs: SIM-85 (t09 por recorte, AD-082, AD-118), SIM-61 (medição sem gravar, AD-117), SIM-58 e SIM-59 (teto de avaliações decidido na execução, Delta 9).

## Linha de base

- **Comando da suíte** (o de `.specs/projeto/testes.json` ao fim da fundação, `F:409`): `docker compose up -d --wait && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:checagens && pnpm --filter @pelada/web build && pnpm --filter @pelada/web e2e && pnpm --filter @pelada/web visual`.
- **Resultado hoje**: não roda. O `testes.json` atual é a dispensa temporária (repositório sem código) e as features 1 a 4 ainda não foram executadas.
- **Falhas preexistentes**: nenhuma conhecida; a linha de base é o gate final da `partidas-e-ranking`. O `/executar` roda a suíte uma vez antes do lote 1 e registra aqui o resultado. T0 e T1 são a rede de proteção do que esta feature muda no banco.

## Test Coverage Matrix

> Gerada da Base, dos contratos das features 1 a 4 e das regras de teste do `.claude/CLAUDE.md`. Padrão forte: todo critério e todo caso limite (`S:338-346`) com teste.

| Camada | Tipo de teste exigido | Expectativa de cobertura | Padrão de local | Comando |
|---|---|---|---|---|
| Domínio (`backend/dominio/src/simulador`) | unit | Todos os ramos de SIM-09 a SIM-13, SIM-16 a SIM-59, SIM-89 a SIM-95; casos de referência do legado; determinismo; orçamento de CPU | `backend/dominio/test/simulador/*.test.ts` | `pnpm --filter @pelada/dominio test` |
| Contrato (`backend/contrato`) | unit | Cada schema: válido, cada limite, campo extra, campo proibido na resposta | `backend/contrato/test/simulador.test.ts` | `pnpm --filter @pelada/contrato test` |
| Banco: migração, RLS e grants | integration | Postgres real, como `pelada_app` (`comoApp`); matriz política × comando abaixo; overloads da `grupo_criar` | `backend/api/test/banco/*.test.ts` | `pnpm --filter @pelada/api test` |
| Repositórios | integration | Cada caminho, evento na mesma transação, rollback, duas conexões na mesma data | `backend/api/test/repositorios/*.test.ts` | `pnpm --filter @pelada/api test` |
| Middlewares e rotas | e2e | Pool `workerd` com Postgres local: caminho feliz, cada 422 da spec, 404 cruzado, 401, 409 de arquivado; relógio fixo; log capturado | `backend/api/test/rotas/*.test.ts` | `pnpm --filter @pelada/api test` |
| Isolamento de rotas | e2e | As 5 rotas novas e as 2 ampliadas: conta do grupo A contra o B | `backend/api/test/isolamento/rotas.test.ts` | `pnpm --filter @pelada/api test` |
| Ensaio e medição | integration | Dump da produção restaurado localmente; medição na prévia com evidência | `backend/scripts/src/*.ts` | `pnpm --filter @pelada/scripts test` |
| Front: dados e telas | unit | jsdom + Testing Library + axe: cada estado do mockup e cada mensagem da spec | `frontend/web/src/**/*.test.{ts,tsx}` | `pnpm --filter @pelada/web test` |
| Front: comparação visual | e2e | Telas de SIM-85 × 2 viewports até 1% | `frontend/web/e2e/visual.mjs` | `pnpm --filter @pelada/web visual` |
| Front: jornadas e posição | e2e | Jornadas desta feature e a asserção de posição de SIM-08 contra o `wrangler dev` com o seed | `frontend/web/e2e/*.spec.ts` | `pnpm --filter @pelada/web e2e` |
| Mockup | none | `cmp` contra a origem; gate de build | — | gate de build |

**Matriz política × comando** (como `pelada_app`, dois grupos A e B, contexto de conta A e sem contexto; cada célula é um teste que morre com a policy aberta `USING (true)`, sem `WITH CHECK` ou com grant a mais):

| Tabela ou função | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `escalacoes` | conta A só A; sem contexto zero; slug público zero (T0) | conta A em B recusado; sem contexto recusado (T0) | só linhas de A; mover `grupo_id` para B recusado pelo `WITH CHECK`; sem `WHERE` afeta só A (T0) | só de A; sem `WHERE` apaga só as de A (T0) |
| `eventos_uso` (`escalacao_confirmada`) | só com conta, só A (`PR:1038`, mantido) | conta A só em A; sem `data_partida` recusado pelo CHECK (T28) | recusado, sem grant (`PR:1038`, mantido) | recusado, sem grant (`PR:1038`, mantido) |
| `grupo_criar` | — | só a de 7 parâmetros existe; a de 6 some; `EXECUTE` só para `pelada_app` (T25) | — | — |

## Gate Check Commands

| Nível do gate | Quando usar | Comando |
|---|---|---|
| Quick | Tarefas só com teste unitário, no pacote tocado | `pnpm --filter <pacote> test` |
| Full | Tarefas com integration ou e2e; exige o Postgres local | `docker compose up -d --wait && pnpm typecheck && pnpm test && pnpm test:checagens` |
| Build | Mockup e o fim da feature | O comando da seção Linha de base |

## Execution Plan

As Phases rodam em ordem; dentro de cada uma, em sequência. Criticidade: Phases 1 a 16 **críticas**, 17 a 22 **comuns**. Total: 55 tarefas, 22 Phases, 86h. Lotes previstos (até 6h, Phases inteiras; o `progresso.py --lote` confirma na execução): L1 = P1 (3h); L2 = P2 (4h); L3 = P3 (5h); L4 = P4 (3,5h); L5 = P5 (3h); L6 = P6 (4,5h); L7 = P7 (4h); L8 = P8 (5,5h); L9 = P9 (6h); L10 = P10 (3h); L11 = P11 (5h); L12 = P12 (3h); L13 = P13 (4,5h); L14 = P14 (5h); L15 = P15 (4h); L16 = P16 (4h), todos críticos; L17 = P17 (4h); L18 = P18 (3,5h); L19 = P19 + P20 (5h); L20 = P21 + P22 (6,5h: a P22, de 2 tarefas, é a cauda que a regra junta ao lote anterior), comuns. Conferido com `progresso.py --item .specs/features/simulador`: 20 lotes, 16 críticos. Lotes com tarefa de `Domínio: sim`: L2 a L8, L11, L16.

### Phase 1: Rede de proteção: escalacoes e a grupo_criar antiga (crítica, 3h)

```
T0 → T1
```

### Phase 2: Domínio: base e prévia (crítica, 4h)

```
T2 → T3 → T4
```

### Phase 3: Domínio: prioridade e classificação de 2 times (crítica, 5h)

```
T5 → T6 → T7
```

### Phase 4: Domínio: distribuição em 2 times (crítica, 3,5h)

```
T8 → T9
```

### Phase 5: Domínio: formato 3 ou mais times (crítica, 3h)

```
T10 → T11
```

### Phase 6: Domínio: indicadores e avisos (crítica, 4,5h)

```
T12 → T13 → T14
```

### Phase 7: Domínio: sugerir, avaliar e determinismo (crítica, 4h)

```
T15 → T16 → T17
```

### Phase 8: Domínio: casos de referência e CPU (crítica, 5,5h)

```
T18 → T19 → T20
```

### Phase 9: Contrato (crítica, 6h)

```
T21 → T22 → T23 → T24
```

### Phase 10: Migração e tipos (crítica, 3h)

```
T25 → T26
```

### Phase 11: Repositórios: aptos e escalações (crítica, 5h)

```
T27 → T28 → T29
```

### Phase 12: Repositórios: uso, grupo e recurso do plano (crítica, 3h)

```
T30 → T31 → T32
```

### Phase 13: Rotas: contexto, prévia e sugerir (crítica, 4,5h)

```
T33 → T34 → T35
```

### Phase 14: Rotas: avaliar, escalação e pré-marcação (crítica, 5h)

```
T36 → T37 → T38
```

### Phase 15: Rotas: início do grupo, isolamento e dados pessoais (crítica, 4h)

```
T39 → T40 → T41
```

### Phase 16: Ensaio da migração e medição na prévia (crítica, 4h)

```
T42 → T43
```

### Phase 17: Web: mockup e dados do simulador (comum, 4h)

```
T44 → T45
```

### Phase 18: Web: prévia e resultado em 2 times (comum, 3,5h)

```
T46 → T47
```

### Phase 19: Web: resultado em 3+ e ajuste manual (comum, 3,5h)

```
T48 → T49
```

### Phase 20: Web: refazer e confirmar (comum, 1,5h)

```
T50
```

### Phase 21: Web: início do grupo e lançamento pré-marcado (comum, 2,5h)

```
T51 → T52
```

### Phase 22: Comparação visual e jornadas (comum, 4h)

```
T53 → T54
```

## Task Breakdown

#### Phase 1: Rede de proteção: escalacoes e a grupo_criar antiga

### T0: Matriz política × comando de escalacoes

**What**: Rede de proteção (skill `rede-de-protecao`) e prova de SIM-81: testes no Postgres, como `pelada_app`, de `escalacoes` por comando, com dois grupos A e B: SELECT só de A; INSERT em B recusado; UPDATE só de A, mover `grupo_id` para B recusado, UPDATE sem `WHERE` só A; DELETE só de A, sem `WHERE` só A; sem contexto e com slug público, zero linhas e INSERT recusado; `UNIQUE (grupo_id, data)` e o CHECK de K só em 2 times. Nenhuma migração muda isso (AD-084); o teste fica verde até o fim.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/banco/escalacoes-rls.test.ts`
**Depends on**: None
**Reuses**: `comoApp` e o cenário de dois grupos (`F:909`); tabela `M:1792843200000_linha-de-base.sql:212-228`; grants `M:1792843260000_roles.sql:22-31`; policies do laço `M:1792843320000_rls.sql:51-56`; molde da matriz de `PR:1038` (T23)
**Requirement**: SIM-81, SIM-69, SIM-72
**Status**: rascunhada
**Nota do rascunho**: usa o cenário da fundação (`abrirCenario`, grupos A e B com uma escalação cada); a evidência da rede (policy `USING (true)`) é do /executar.
**Lacunas**: a matriz pede "slug público zero" no SELECT, mas a policy do laço (`grupos_visiveis()`, ramo do slug, FUN-14) deixa o slug do A ler a escalação do A. O teste segue a matriz (zero); se ficar vermelho, perguntar se vale a matriz (migração nova) ou a policy atual.

**Done when**:

- [ ] Teste `SIM-81`: uma célula por comando da matriz (SELECT, INSERT, UPDATE, DELETE, UPDATE e DELETE sem `WHERE`), com o banco do B igual antes e depois
- [ ] Teste `SIM-69`: segunda linha na mesma data dá 23505 em `escalacoes_grupo_data`; `SIM-72`: `varios_times` com K dá 23514
- [ ] Evidência da rede: `CREATE POLICY ... USING (true)` temporária para `escalacoes` deixa o teste de SELECT vermelho; registrada nesta tarefa
- [ ] Banco e dados de teste limpos no `finally`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T1: Quem ainda usa a grupo_criar de 6 parâmetros

**What**: Rede de proteção antes de T25: teste que lista as sobrecargas de `grupo_criar` no catálogo (hoje 6 e 7 parâmetros) e checagem que procura chamadas à de 6 em `backend/**/src` e `backend/scripts` (só os testes de `GE:397`, `GE:426`, `GE:502`, `PR:430` e `PR:987` podem chamá-la). Registra aqui a lista de testes que T25 migra para a de 7 (autorizado, `## Autorizações`).
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/banco/grupo-criar-sobrecargas.test.ts`
**Depends on**: T0
**Reuses**: `lerEsquema` com funções (`F:760`); função de 7 de `PR:987` (T22); AD-037
**Requirement**: SIM-67 (linha de base da remoção, AD-037)

**Done when**:

- [ ] Teste: o catálogo tem as duas sobrecargas e a de 6 delega à de 7 (estado depois da `partidas-e-ranking`)
- [ ] Teste: nenhum arquivo de `src` nem o seed chama a `grupo_criar` com 6 argumentos
- [ ] `Evidência`: a lista dos testes que chamam a de 6, com arquivo e linha
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 2: Domínio: base e prévia

### T2: Base do simulador: tipos, próximo dia de jogo, idade e médias inteiras

**What**: Em `backend/dominio/src/simulador/base.ts`: tipos `Apto` (`id`, `apelido`, `nivel` × 100, `semNota`, `anoNascimento` ou nulo), `Formato`, `Limite` (0 a 20 ou `ilimitado`); `proximoDiaDeJogo(hoje, diaSemana)` (hoje incluso, para frente); `idadeNaData(ano, data)` (ano da data − ano; nulo sem ano, AD-046); `mediaInteira(soma, quantidade)` (× 100, meio para cima; nula com 0). Sem relógio.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/simulador/base.ts`
**Depends on**: None
**Reuses**: `diaDaSemana` e `ehDataReal` de `backend/dominio/src/datas.ts` (`PR:457`), sem duplicar; regra de domínio sem relógio (AD-028, `GE:527`); idade de `L:backend/api/src/aplicacao/simulador/entrada.ts:63` e `L:backend/dominio/src/elenco/idade.ts:4`; convenções `S:73-79`; AD-086
**Requirement**: SIM-01, SIM-51, SIM-95
**Status**: rascunhada
**Nota do rascunho**: `diaDaSemana`, `NUMERO_DO_DIA` e `NomeDiaDaSemana` vêm de `backend/dominio/src/datas.ts` (já rascunhado pela T1 da partidas-e-ranking); `somarDias` de `atividade/datas.ts`. Além do pedido: `JogadorSim` (apto com idade), `montarElenco`, `jogadorDe` e `compararIds`, usados pelas tarefas seguintes.

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `SIM-01`: grupo de quinta, numa terça, dá a quinta seguinte; numa quinta, hoje; virada de ano
- [ ] Teste `SIM-51`: `mediaInteira(683 + 684, 2)` = 684 (meio para cima); 0 jogadores dá nulo
- [ ] Teste `SIM-95`: `idadeNaData(null, d)` é nulo; `idadeNaData(1990, '2026-01-01')` = 36 em qualquer dia
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T3: Prévia em números

**What**: `calcularPrevia({ formato, n, k, aptos })`: em 2 times, válida com 2N aptos ou mais (`reservas`), senão `maiorNPossivel`; em 3+, válida com mais de 2N (T, completos, incompleto R), senão `nSugerido` e `doisTimesPossivel`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/simulador/previa.ts`
**Depends on**: T2
**Reuses**: Regra de `L:backend/dominio/src/simulador/previa.ts`; critérios `S:110-114`; Independent Test `S:118`
**Requirement**: SIM-09, SIM-10, SIM-11, SIM-12, SIM-13
**Status**: rascunhada
**Nota do rascunho**: `calcularPrevia({ formato, n, aptos })` recebe a quantidade de aptos (o K não muda a prévia); a prévia carrega `n` e `aptos` para a descrição (T4).

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `SIM-10`: 19 aptos, N = 7: válida com 5 reservas; 14 aptos: 0 reservas
- [ ] Teste `SIM-11`: 19 aptos, N = 11: `maiorNPossivel` 9; 3 aptos: nulo
- [ ] Teste `SIM-12`: 18 aptos, N = 4: 4 completos e incompleto de 2; 20 aptos: 5 completos, sem incompleto
- [ ] Teste `SIM-13`: 8 aptos, N = 4: inválida, `nSugerido` 3, `doisTimesPossivel` verdadeiro; 3 aptos: `nSugerido` nulo e falso
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T4: Descrição da prévia

**What**: `descreverPrevia(previa)`: "2 times de N · R reservas" (sem sufixo com 0, "1 reserva"), "Faltam aptos para 2 times de N. Maior N possível: M." ou "Faltam aptos para 2 times.", "C times de N + 1 time incompleto de R" ou "C times de N", "Com A aptos e N = n não há 3 times." com as três continuações.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/simulador/descricao.ts`
**Depends on**: T3
**Reuses**: Textos de `S:111-114`; `L:backend/api/src/aplicacao/simulador/descricao.ts` (regra, escrita do zero no domínio)
**Requirement**: SIM-10, SIM-11, SIM-12, SIM-13
**Status**: rascunhada

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `SIM-10`: "2 times de 7 · 5 reservas", "2 times de 7 · 1 reserva", "2 times de 7"
- [ ] Teste `SIM-11`: "Faltam aptos para 2 times de 11. Maior N possível: 9."
- [ ] Teste `SIM-13`: as três continuações ("Use N menor ou o formato 2 times.", "Use N menor.", "Use o formato 2 times.") e o caso sem nenhuma
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 3: Domínio: prioridade e classificação de 2 times

### T5: Ordem de prioridade pelo ranking da véspera

**What**: `ordemDePrioridade(aptos, historico, data)`: acumulado de cada apto até `vespera(data)` pela função única (`inicioDaContagem` + `acumuladoPorInicio`), depois ano de nascimento (menor primeiro, sem ano no fim), apelido sem acento nem caixa e id. Ordem própria do simulador; `ordenarPorRanking` não muda (AD-085).
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/simulador/prioridade.ts`
**Depends on**: T4
**Reuses**: `inicioDaContagem` (`PR:534`) e `acumuladoPorInicio` (`PR:558`) pelo `index.ts` da pontuação (a regra de lint de `PR:1758` proíbe as internas); `vespera` (`PR:457`); `compararApelido` (`GE:575`); regra de `L:backend/dominio/src/simulador/prioridade.ts`; `S:130-133`, Independent Test `S:136`
**Requirement**: SIM-16, SIM-17, SIM-18

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `SIM-17`: A com 10 até a véspera e B com 8 (12 contando a partida da própria data): A antes de B
- [ ] Teste `SIM-18`: grupo sem partida anterior: ordem por ano, apelido e id; sem ano vai ao fim
- [ ] Teste `SIM-16`: "José" e "Jose" empatados em tudo: o id menor primeiro
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T6: Titulares, reservas que entram e "não entra"

**What**: `classificarDoisTimes(ordenados, n, k)`: 2N titulares, os próximos 2 × min(K, N) (2N com `ilimitado`) como reservas que entram, o resto em "não entra"; reserva "só 1º" segue a mesma regra e é marcado como "joga só o 2º tempo".
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/simulador/classificacao.ts`
**Depends on**: T5
**Reuses**: `vagasDeReserva` de `L:backend/dominio/src/simulador/classificacao.ts:32-46`; `S:148-150`, `S:340`
**Requirement**: SIM-21, SIM-22, SIM-23, SIM-89
**Status**: rascunhada
**Nota do rascunho**: a T5 (ordem de prioridade) ainda não foi rascunhada (depende da pontuação da partidas-e-ranking); `classificarDoisTimes` recebe a lista já ordenada e é genérica no tipo do apto.

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `SIM-22`: 19 aptos, N = 7, K = 2: 14 titulares, 4 que entram, 1 "não entra"
- [ ] Teste `SIM-22`: K ilimitado com 40 aptos e N = 7: 14 entram, 12 "não entram"; K = 9 com N = 7 usa min(K, N)
- [ ] Teste `SIM-89`: K = 0: ninguém entra, todos os reservas em "não entra"
- [ ] Teste `SIM-23`: reserva "só 1º" além do limite fica em "não entra"
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T7: Saída no intervalo e pares

**What**: `saidaNoIntervalo(titularesDoTime, reservasEntrando)`: todos os titulares "só 1º" e, até max(titulares "só 1º", reservas que entram), os demais de pior prioridade, do pior para o melhor; `formarPares(saem, entram)` na ordem de saída e de prioridade, com sobras de cada lado.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/simulador/intervalo.ts`
**Depends on**: T6
**Reuses**: `L:backend/dominio/src/simulador/classificacao.ts:52-60`; `S:151-152`, `S:340-341`, Independent Test `S:155`
**Requirement**: SIM-24, SIM-25, SIM-89, SIM-90
**Status**: rascunhada

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `SIM-24`: time com 2 reservas e um titular "só 1º": sai ele e o titular de pior prioridade
- [ ] Teste `SIM-90`: titular "só 1º" sem reserva sai e fica em "sai sem par"
- [ ] Teste `SIM-89`: K = 0 só os "só 1º" saem
- [ ] Teste `SIM-25`: 3 saem e 2 entram: 2 pares na ordem e 1 sai sem par
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 4: Domínio: distribuição em 2 times

### T8: Chave de comparação de 2 times

**What**: `chaveDoisTimes(times, n, elenco)`: (1) times sem N titulares; (2) quanto a diferença de substituições passa de 1; (3) diferença de nível somado no 1º tempo + no 2º tempo; (4) diferença de idade média de quem joga (só com ano). Só inteiros; comparação lexicográfica.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/simulador/chave-dois.ts`
**Depends on**: T7
**Reuses**: `chaveDe` de `L:backend/dominio/src/simulador/distribuicao-dois.ts:61-106`; `mediaInteira` e `idadeNaData` (T2); `S:169-170`, `S:346`
**Requirement**: SIM-29, SIM-30, SIM-51, SIM-95

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `SIM-29`: composição com time sem N titulares perde de qualquer outra com N, mesmo com nível pior
- [ ] Teste `SIM-30`: substituições 3 × 1 perdem de 2 × 2 antes de olhar o nível
- [ ] Teste `SIM-95`: jogador sem ano não entra na idade média; time sem ninguém com ano tem idade nula e o critério (4) não lança
- [ ] Teste `SIM-51`: a chave só tem inteiros (`Number.isInteger` em cada termo)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T9: Serpentina e busca local de 2 times

**What**: `distribuirDoisTimes(classificacao, n, elenco)`: titulares em A, B, B, A repetido e reservas alternando A, B; trocas titular↔titular e reserva↔reserva em índices crescentes, aceitando a primeira que diminui a chave e recomeçando, até nenhuma melhorar ou 200 aceitas; devolve cada lista na ordem de prioridade.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/simulador/distribuicao-dois.ts`
**Depends on**: T8
**Reuses**: `L:backend/dominio/src/simulador/distribuicao-dois.ts:7` (200), `:21` (serpentina), `:127-154` (laço); `S:167-172`, `S:342-343`, Independent Test `S:174`
**Requirement**: SIM-27, SIM-28, SIM-30, SIM-31, SIM-32, SIM-59, SIM-91, SIM-92

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `SIM-91`: 4 aptos iguais, N = 2, K = 0: A recebe o 1º e o 4º, zero trocas aceitas
- [ ] Teste `SIM-31`: na saída, nenhuma troca titular↔titular nem reserva↔reserva diminui a chave (força bruta no teste)
- [ ] Teste `SIM-92`: com teto 1 injetado, devolve a melhor até ali com N titulares por time
- [ ] Teste `SIM-27`: um craque muito acima fica no time que, sem ele, tem menos nível
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 5: Domínio: formato 3 ou mais times

### T10: Times de 3+ e solução inicial em vaivém

**What**: `montarVariosTimes(aptos, n)`: completos de N e um incompleto com o resto, sempre o último, marcado; solução inicial por nível (maior primeiro, depois id) em vaivém respeitando a capacidade; todos candidatos ao incompleto; cada time devolvido por nível e id.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/simulador/varios-inicial.ts`
**Depends on**: T9
**Reuses**: `L:backend/dominio/src/simulador/distribuicao-varios.ts:10` (60 aptos), `:70-82` (vaivém); `S:186-190`, Independent Test `S:193`
**Requirement**: SIM-33, SIM-34, SIM-35, SIM-37

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `SIM-34`: 22 aptos, N = 4: 5 times de 4 e um incompleto de 2, por último; 20 aptos: 5 de 4
- [ ] Teste `SIM-35`: vaivém com capacidade: o incompleto não recebe além de R
- [ ] Teste `SIM-37`: o pior nível não vai obrigatoriamente para o incompleto
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T11: Busca local de 3+ times

**What**: `distribuirVariosTimes(times, elenco)`: trocas de um jogador entre dois times em ordem fixa, aceitando a que diminui a chave (maior − menor nível médio entre todos os times, inclusive o incompleto; depois maior − menor idade média, só com ano), até nenhuma melhorar ou 200 aceitas.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/simulador/distribuicao-varios.ts`
**Depends on**: T10
**Reuses**: `L:backend/dominio/src/simulador/distribuicao-varios.ts:7` (200), `:33-47` (chave), `:94-119` (laço); `S:189-190`, `S:343`
**Requirement**: SIM-36, SIM-37, SIM-59, SIM-92

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `SIM-36`: na saída, nenhuma troca entre dois times diminui a chave (força bruta no teste)
- [ ] Teste `SIM-92`: com teto 1 injetado, os tamanhos continuam os da prévia
- [ ] Teste `SIM-37`: saída de cada time por nível (maior primeiro) e id
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 6: Domínio: indicadores e avisos

### T12: Indicadores de 2 times

**What**: `indicadoresDoisTimes(composicao, elenco)`: por time, jogadores no 1º e no 2º tempo, nível somado e médio por tempo (médio nulo sem ninguém), idade média de titulares e reservas que entram (só com ano), substituições, quem sai, pares e sobras.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/simulador/indicadores-dois.ts`
**Depends on**: T11
**Reuses**: `L:backend/dominio/src/simulador/indicadores.ts`; T7 (pares); `S:205`
**Requirement**: SIM-39, SIM-95

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `SIM-39`: no 2º tempo, quem sai no intervalo deixa a soma e quem entra é somado
- [ ] Teste `SIM-39`: time sem ninguém no 2º tempo tem nível médio nulo
- [ ] Teste `SIM-95`: idade média ignora quem não tem ano
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T13: Indicadores de 3+ times

**What**: `indicadoresVariosTimes(times, elenco)`: por time, jogadores, nível somado, nível médio e idade média (só com ano).
**Estimativa**: 1h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/simulador/indicadores-varios.ts`
**Depends on**: T12
**Reuses**: `L:backend/dominio/src/simulador/indicadores.ts`; `mediaInteira` (T2); `S:206`
**Requirement**: SIM-40, SIM-95

**Done when**:

- [ ] Teste `SIM-40`: time de 4 com níveis 600, 650, 700, 683: soma 2633, média 658
- [ ] Teste `SIM-95`: time só com jogadores sem ano tem idade média nula
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T14: Avisos

**What**: `avisos(formato, composicao, indicadores, aptos)`: "só 1º" sem reserva ("<Time>: F jogador(es) que só joga(m)…"), composição que difere da prevista, sem nota (apelidos na ordem de prioridade em 2 times e por id em 3+, singular e plural), incompleto com menos da metade de N com até 2 N alternativos (N−1, N+1, N−2…). Nenhum aviso bloqueia e nenhum leva nível individual.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/simulador/avisos.ts`
**Depends on**: T13
**Reuses**: `L:backend/dominio/src/simulador/avisos.ts:61-73` (N alternativos) e textos de `L:backend/api/src/aplicacao/simulador/textos-avisos.ts`; `S:208-212`, Independent Test `S:214`
**Requirement**: SIM-42, SIM-43, SIM-44, SIM-45, SIM-46, SIM-90

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `SIM-44`: "Léo Baiano e Serginho não têm nota: usamos nível 5,5."; um só: "não tem nota"
- [ ] Teste `SIM-42`, `SIM-90`: time com 2 "só 1º" e 1 reserva entrando avisa com o plural
- [ ] Teste `SIM-45`: 13 aptos, N = 4 (incompleto de 1): "Experimente N = …" só com N que forma 3 times sem incompleto menor que a metade
- [ ] Teste `SIM-43`: 3+ com dois times abaixo de N avisa e lista os times
- [ ] Teste `SIM-46`: nenhum texto contém um nível individual (regex `\d,\d` só no aviso de sem nota)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 7: Domínio: sugerir, avaliar e determinismo

### T15: sugerir

**What**: `sugerir(entrada, historico)`: valida a prévia; em 2 times ordena (T5), classifica (T6, T7) e distribui (T9); em 3+ monta e distribui (T10, T11) sem ordem de prioridade; devolve composição, indicadores, avisos, ordem (só 2 times) e a descrição da prévia. Normaliza a ordem da entrada (aptos por id) antes de calcular. `index.ts` exporta só `calcularPrevia`, `descreverPrevia`, `sugerir`, `avaliar`, `proximoDiaDeJogo` e os tipos.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/simulador/sugerir.ts`
**Depends on**: T14
**Reuses**: `L:backend/dominio/src/simulador/sugerir.ts`; exportação pública do domínio (`PR:840`); `S:133`, `S:226-228`
**Requirement**: SIM-19, SIM-47, SIM-48, SIM-49

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `SIM-49`: aptos, jogadores, partidas e presenças embaralhados dão o mesmo resultado (`toStrictEqual`)
- [ ] Teste `SIM-19`: em 3+, o resultado não tem `ordemPrioridade`
- [ ] Teste `SIM-47`: aptos insuficientes devolvem erro com a descrição da prévia
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T16: avaliar

**What**: `avaliar(entrada, composicao, historico)`: confere repetidos e jogadores fora dos aptos, recalcula saídas, pares, indicadores e avisos da composição recebida, sem refazer a distribuição.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/simulador/avaliar.ts`
**Depends on**: T15
**Reuses**: `L:backend/api/src/aplicacao/simulador/avaliar.ts` (regra); T7, T12 a T14; `S:254-255`, Independent Test `S:260`
**Requirement**: SIM-62, SIM-63

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `SIM-62`: mover Japa de A para B muda somas e pares e mantém o resto da composição
- [ ] Teste `SIM-63`: "Há jogador repetido na composição." e "Há jogador fora dos aptos na composição."
- [ ] Teste `SIM-62`: avaliar a própria sugestão devolve os mesmos indicadores e avisos de `sugerir`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T17: Determinismo e módulo sem aleatoriedade nem relógio

**What**: Teste que lê os fontes de `backend/dominio/src/simulador/` e falha com `Math.random`, `crypto`, `Date` (qualquer uso) ou `performance`; e repetição de `sugerir` 20 vezes com a mesma entrada, campo a campo.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/dominio/test/simulador/determinismo.test.ts`
**Depends on**: T16
**Reuses**: Regra do domínio sem relógio (AD-028, `GE:527`) e teste de regra por arquivo de exemplo (`F:385`); `S:227-229`
**Requirement**: SIM-48, SIM-49, SIM-50

**Done when**:

- [ ] Teste `SIM-50`: um arquivo de prova com `Math.random()` no diretório faz o teste falhar (conferido e removido)
- [ ] Teste `SIM-48`: 20 chamadas iguais dão respostas iguais
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 8: Domínio: casos de referência e CPU

### T18: Casos de referência conferidos contra o legado

**What**: Casos fixos (entrada → composição esperada) nos dois formatos, inclusive 19 aptos com N = 7 e K = 2 e 22 aptos com N = 4, escritos a partir dos critérios; os valores esperados são conferidos rodando o domínio do legado (`L:` numa cópia fora do projeto, só leitura) com as mesmas entradas, e a saída entra como dado (como a AD-041). Divergência = pare e pergunte, sem ajustar o esperado.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/test/simulador/referencia.test.ts`
**Depends on**: T17
**Reuses**: Fixtures de `L:backend/dominio/test/simulador/apoio.ts` e `L:backend/dominio/test/simulador/sugerir.test.ts` como dado; Goal `S:25`; AD-046; molde de regressão `PR:584` (T6)
**Requirement**: SIM-52

**Done when**:

- [ ] Teste `SIM-52`: cada caso dá a composição, a ordem e os avisos registrados
- [ ] `Evidência`: comando, commit `ece227e0` e saída do legado para cada entrada, no cabeçalho do teste
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T19: Orçamento de CPU no Node

**What**: Bench com 50 medições: `sugerir` com 30 aptos em 2 times de 11 com K ilimitado e em 6 times de 5, histórico de 40 jogadores e 104 partidas; mediana e p99 abaixo de 4 ms; roda no CI.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/test/simulador/orcamento.test.ts`
**Depends on**: T18
**Reuses**: `L:backend/dominio/test/simulador/sugerir.orcamento.test.ts:10` (limiar 4 ms); bench de `PR:840` (T16); `S:236`
**Requirement**: SIM-57

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `SIM-57`: mediana e p99 < 4 ms nos dois cenários, com aquecimento descartado
- [ ] `Evidência`: números medidos na máquina local e no CI
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T20: Pior entrada válida e teto da busca

**What**: Teste que mede `sugerir` e `avaliar` com 60 aptos para todo N de 2 a 11, nos dois formatos e com K ilimitado; abaixo de 4 ms. Se passar, pare e pergunte o teto de avaliações (Delta 9), porque ele muda a sugestão em relação ao legado; com o teto decidido, ele entra em T9 e T11 e a medição se repete.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/test/simulador/pior-entrada.test.ts`
**Depends on**: T19
**Reuses**: `MAX_APTOS_SIMULADOR` de `L:backend/dominio/src/simulador/distribuicao-varios.ts:10`; Assumption `S:56`; T19
**Requirement**: SIM-58, SIM-59

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `SIM-58`: as 20 combinações × 2 funções abaixo de 4 ms (p99)
- [ ] Teste `SIM-59`: toda combinação devolve composição válida
- [ ] `Evidência`: a pior combinação e o tempo dela; teto de avaliações [A ESCLARECER: só se a medição passar de 4 ms]
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 9: Contrato

### T21: Contrato de contexto e prévia

**What**: `consultaContexto` (`data` opcional `AAAA-MM-DD` real), `contextoResposta` (`dataSugerida`, `hoje`, `jogadores` com `id`, `apelido`, `nivel` inteiro, `semNota`, `semAno`), `previaCorpo` (união por `formato`; `k` só em 2 times; N de 2 a 11; K de 0 a 20 ou `ilimitado`; até 60 aptos) e `previaResposta`; tudo `strictObject`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/contrato/src/simulador.ts`
**Depends on**: None
**Reuses**: Primitivos zod (`CA:550`) e data real de `PR:889` (T18); `L:backend/contrato/src/simulador/contexto.ts`, `previa.ts` e `entrada.ts:24-30`
**Requirement**: SIM-01, SIM-04, SIM-09, SIM-55

**Done when**:

- [ ] Teste `SIM-04`: `2026-02-30` e `2026-1-1` recusados no campo `data`
- [ ] Teste `SIM-55`: N 1 e 12, K 21 e "infinito" recusados no campo; campo ausente recusado
- [ ] Teste: campo desconhecido recusado (`.strict()`)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T22: Contrato de sugerir e avaliar

**What**: `sugerirCorpo` (`formato`, `data`, `n`, `k` só em 2 times, `aptos` com `id` e, em 2 times, `so1oTempo`; até 60 e sem repetido) e `avaliarCorpo` (o mesmo mais `composicao`); `resultadoDois` e `resultadoVarios` com só id, apelido, nível, `semNota`, `semAno` e "só 1º" por jogador.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/contrato/src/simulador.ts`
**Depends on**: T21
**Reuses**: `L:backend/contrato/src/simulador/entrada.ts` e `resultado.ts`; `S:186`, `S:226`, `S:232`, `S:313`
**Requirement**: SIM-33, SIM-47, SIM-53, SIM-55, SIM-62, SIM-82

**Done when**:

- [ ] Teste `SIM-33`: 3+ com `k` ou com `so1oTempo` recusado
- [ ] Teste `SIM-53`: 61 aptos e id repetido recusados com "Há jogador repetido nos aptos." no campo `aptos`
- [ ] Teste `SIM-82`: resposta com `telefone`, `anoNascimento`, `idade`, `posicao`, `notas` ou `pontos` em qualquer jogador é recusada
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T23: Contrato de escalação e leitura tolerante

**What**: `escalacaoCorpo` (união por formato, com `composicao` de 2 times — `times` com `titulares` e `entramNo2oTempo`, cada um `{ id, so1oTempo }`, e `naoEntra` — ou de 3+ — `times` com `jogadores`), `escalacaoResposta` (`data`, `confirmadaEm`), `composicaoGravada` (só ids e "só 1º") e `lerComposicao(formato, json)` que devolve nulo para forma inválida; `idsDaComposicao`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/contrato/src/escalacao.ts`
**Depends on**: T22
**Reuses**: `L:backend/contrato/src/simulador/escalacao.ts`; `L:backend/api/src/aplicacao/simulador/composicao.ts:4-11`; `S:272`, `S:345`
**Requirement**: SIM-67, SIM-82, SIM-94

**Done when**:

- [ ] Teste `SIM-94`: JSON sem `times`, com tipo errado ou com campo extra dá nulo, sem lançar
- [ ] Teste `SIM-82`: `composicaoGravada` com apelido ou nível recusada
- [ ] Teste `SIM-67`: `idsDaComposicao` de 2 times inclui titulares, reservas e "não entra"
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T24: partidaNova e grupoDetalhe ampliados

**What**: `partidaNova` ganha `preMarcadaPelaEscalacao: boolean`; `grupoDetalhe` ganha `proximoDiaDeJogo` e `escalacaoNoProximoDia: boolean`. O `grupoDetalhe` é estendido no arquivo dele (`GE:753`).
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/contrato/src/partidas.ts`
**Depends on**: T23
**Reuses**: Estender `partidaNova` (`PR:889`, T18) e `grupoDetalhe` (`GE:753`, ampliado em `PR:937`); resposta do mockup `respostas/partida-nova-2026-10-22.json` (já tem o campo)
**Requirement**: SIM-08, SIM-75

**Done when**:

- [ ] Teste `SIM-75`: `partidaNova` sem `preMarcadaPelaEscalacao` é recusada
- [ ] Teste `SIM-08`: `grupoDetalhe` exige os 2 campos novos
- [ ] Os testes existentes dos dois schemas passam a esperar os campos novos (autorizado, `## Autorizações`), sem asserção removida
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 10: Migração e tipos

### T25: Migração: remover a grupo_criar de 6 parâmetros (contrair)

**What**: Migração nova (gerador `F:883`, timestamp maior que a última da `partidas-e-ranking`) com `-- contrair: AD-037` e `DROP FUNCTION grupo_criar(<6 tipos>)`; a de 7 fica igual. Os testes listados em T1 passam a chamar a de 7 com a mesma força (autorizado, `## Autorizações`). A referência do schema (`F:784`) é atualizada.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/migracoes/<ts>_grupo-criar-contrair.sql`
**Depends on**: T1
**Reuses**: Gerador e checagem aditiva (`F:883`, `F:858`: `DROP FUNCTION` não está na lista, sem exceção); função de 7 de `PR:987` (T22); meta-teste `GE:502` (T6); AD-037, AD-048
**Requirement**: SIM-67 (AD-037)

**Done when**:

- [ ] Teste: o catálogo tem só a `grupo_criar` de 7 parâmetros, com `SECURITY DEFINER`, `search_path` e `EXECUTE` só para `pelada_app`
- [ ] Teste: os testes de T1 passam com a de 7, mesmas asserções (sufixo, rollback, concorrência, pesos)
- [ ] Teste: com a exceção da AD-037 removida, o teste de `PR:987` ("nenhuma outra função usa `now()` para data") passa a exigir zero funções (autorizado, `## Autorizações`)
- [ ] Teste: migrar de novo não faz DDL (`F:834`)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T26: Tipos Kysely de escalacoes

**What**: Acrescentar `escalacoes` (gravável; `composicao` como `unknown` na leitura) e o tipo `escalacao_confirmada` de `eventos_uso` (com `data_partida`), com o teste contra o catálogo.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/tipos.ts`
**Depends on**: T25
**Reuses**: Estender `tipos.ts` (`GE:878`, `PR:1013`); colunas `M:1792843200000_linha-de-base.sql:194-228`
**Requirement**: SIM-67

**Done when**:

- [ ] Teste: os tipos batem com o catálogo em `escalacoes`
- [ ] `pnpm typecheck` passa
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 11: Repositórios: aptos e escalações

### T27: Aptos na data com nível

**What**: `jogadores.paraSimulador(db, grupoId, data)`: ativos na data (período [início, fim)) com `id`, `apelido`, `ano_nascimento` e o nível de `calcularNivel` (550 e `semNota` sem nota), em duas consultas, ordenados pelo apelido sem acento nem caixa; sem telefone, posição nem notas na saída.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/jogadores-leitura.ts`
**Depends on**: T26
**Reuses**: Estender `jogadores-leitura.ts` (`GE:1179`, duas consultas e nível no domínio); `ativosNaData` (`PR:1185`); `compararApelido` (`GE:575`)
**Requirement**: SIM-01, SIM-02, SIM-03

**Done when**:

- [ ] Teste `SIM-02`: jogador com período que termina na data não aparece; que começa na data aparece
- [ ] Teste `SIM-03`: a consulta não seleciona telefone, posição nem notas individuais (consulta registrada)
- [ ] Teste: 30 jogadores em exatamente 2 consultas; jogador de outro grupo não aparece
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T28: escalacoes.confirmar

**What**: `INSERT … ON CONFLICT (grupo_id, data) DO UPDATE` com formato, N, K (nulo em 3+ e em ilimitado), `composicaoGravada`, `confirmada_por` e `confirmada_em` do relógio, mais o INSERT de `escalacao_confirmada` em `eventos_uso` com `data_partida` e o momento, na transação da requisição.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/escalacoes.ts`
**Depends on**: T27
**Reuses**: `L:backend/api/src/aplicacao/simulador/confirmar-escalacao.ts`; INSERT de evento com conta de `PR:1212` (T30, `partida_lancada`); `ON CONFLICT` de `PR:1159` (T28); `c.var.db` (`FD:103`)
**Requirement**: SIM-67, SIM-69, SIM-70, SIM-72, SIM-87

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `SIM-87`: duas conexões confirmando a mesma data terminam com uma linha (a última) e nenhum 23505
- [ ] Teste `SIM-70`: falha forçada no INSERT do evento desfaz a escalação; falha na escalação não grava evento
- [ ] Teste `SIM-69`: confirmar duas vezes deixa uma linha com a segunda composição e dois eventos
- [ ] Teste `SIM-72`: 3+ e 2 times ilimitado gravam `k` nulo; o evento não tem dado de jogador
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T29: escalacoes.porData

**What**: `escalacoes.porData(db, grupoId, data)`: lê a escalação e passa por `lerComposicao`; forma inválida é tratada como inexistente; `idsNaData` para a pré-marcação.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/escalacoes.ts`
**Depends on**: T28
**Reuses**: `lerComposicao` e `idsDaComposicao` (T23); `L:backend/api/src/aplicacao/partidas/nova.ts:51-58`
**Requirement**: SIM-75, SIM-76, SIM-94

**Done when**:

- [ ] Teste `SIM-94`: linha com `composicao = '{"x":1}'` (gravada como owner) volta nula, sem erro
- [ ] Teste `SIM-75`: os ids incluem "não entra" em 2 times e todos os times em 3+
- [ ] Teste: escalação do grupo B não é lida pelo A
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 12: Repositórios: uso, grupo e recurso do plano

### T30: Uso do app conta as escalações

**What**: `eventos.porSemana` passa a contar `escalacao_confirmada` na semana (segunda a domingo em São Paulo) em `escalacoesConfirmadas`, no lugar do 0 fixo.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/eventos.ts`
**Depends on**: T29
**Reuses**: Estender `eventos.porSemana` (`PR:1289`, T33); Independent Test `S:281`
**Requirement**: SIM-70

**Done when**:

- [ ] Teste `SIM-70`: duas confirmações da mesma data na semana contam 2
- [ ] O teste existente de `PR:1289` e o de `PR:1561` passam a esperar a contagem real (autorizado, `## Autorizações`), sem asserção removida
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T31: grupos.ler com o próximo dia de jogo

**What**: `grupos.ler(db, grupoId, hoje)` acrescenta `proximoDiaDeJogo` (`proximoDiaDeJogo(hoje, dia_semana)`) e `escalacaoNoProximoDia` (existe escalação nessa data).
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/grupos.ts`
**Depends on**: T30
**Reuses**: Estender `grupos.ler` (`GE:1003`, ampliado em `PR:1314`); T2
**Requirement**: SIM-08

**Done when**:

- [ ] Teste `SIM-08`: grupo de quinta numa terça com escalação da quinta: `escalacaoNoProximoDia` verdadeiro; sem, falso
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T32: recursoLiberado e middleware do recurso simulador

**What**: `recursoLiberado(grupoId, recurso)` (ponto único da regra de plano, AD-049; nesta feature devolve sempre `true`) e `exigirRecurso('simulador')`, ligado às rotas de simulador e de escalação; com `false`, 403 `plano_pro` (AD-062), provado por um `recursoLiberado` falso no teste.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/middlewares/recurso.ts`
**Depends on**: T31
**Reuses**: Cadeia `exigirVinculo` → `exigirGrupoAtivo` (`CA:795`, `GE:901`); assinatura de PLA-07 (`.specs/features/planos-e-cobranca/spec.md:79`); AD-049, AD-062
**Requirement**: SIM-68

**Done when**:

- [ ] Teste `SIM-68`: com o padrão, as rotas passam; com `recursoLiberado` falso injetado, 403 `plano_pro` em todas as rotas do simulador e de escalação
- [ ] Teste `SIM-68`: o meta-teste falha se uma rota de `/simulador` ou `/escalacoes` não tem o middleware
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 13: Rotas: contexto, prévia e sugerir

### T33: GET /api/grupos/:grupoId/simulador/contexto

**What**: Rota sob sessão, vínculo e recurso: `dataSugerida` = próximo dia de jogo a partir do `relogio.hoje()`, `hoje` e os aptos da data pedida (ou da sugerida) de `jogadores.paraSimulador`, com `semAno`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/simulador.ts`
**Depends on**: T32
**Reuses**: Molde de `GET partidas/nova` (`PR:1436`, T39); `Relogio` (`GE:831`); T21, T27
**Requirement**: SIM-01, SIM-02, SIM-03, SIM-04

**Done when**:

- [ ] Teste `SIM-01`: relógio numa terça, grupo de quinta, 20 ativos: a quinta seguinte e os 20 em ordem alfabética
- [ ] Teste `SIM-02`: `data` de outra semana lista os ativos dela e mantém `dataSugerida`
- [ ] Teste `SIM-04`: `data=2026-13-01` responde 422 no campo `data`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T34: POST /api/grupos/:grupoId/simulador/previa

**What**: Rota que valida `previaCorpo` e devolve `calcularPrevia` + `descreverPrevia`, sem consulta além do middleware; transação `READ ONLY` pelo sufixo `/previa` (AD-035); 409 em grupo arquivado.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/simulador.ts`
**Depends on**: T33
**Reuses**: `lerCorpo` (`GE:854`); `READ ONLY` de `PR:1362` (T36); T3, T4, T21
**Requirement**: SIM-09, SIM-83

**Done when**:

- [ ] Teste `SIM-09`: 19 aptos, N = 7 responde "2 times de 7 · 5 reservas" e nenhuma consulta a tabela de negócio (consulta registrada)
- [ ] Teste `SIM-83`: grupo arquivado responde 409 `grupo_arquivado`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T35: POST /api/grupos/:grupoId/simulador/sugerir

**What**: Valida o corpo, confere que cada apto é ativo do grupo na data (`jogadores.paraSimulador`), carrega `historico.carregar(db, grupoId, vespera(data))` e devolve `sugerir`; aptos insuficientes = 422 com a descrição no campo `aptos`; uma linha de log por requisição com formato, N, K e número de aptos.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/simulador.ts`
**Depends on**: T34
**Reuses**: `historico.carregar` (`PR:1135`); T15, T22, T27; log de `L:backend/api/src/entrada/rotas/grupos/simulador/sugerir.ts:20-29`; captura de log de `CA:1047` (T31)
**Requirement**: SIM-17, SIM-47, SIM-53, SIM-54, SIM-55, SIM-56, SIM-60, SIM-80

**Done when**:

- [ ] Teste `SIM-47`: sugestão de 19 aptos com a ordem de prioridade e nada gravado (contagem antes e depois)
- [ ] Teste `SIM-54`, `SIM-80`: id de jogador inativo ou do grupo B dá 422 "Há jogadores que não estão ativos no grupo nesta data." sem apelido na resposta
- [ ] Teste `SIM-56`: 8 aptos, 3+, N = 4: 422 com "Com 8 aptos e N = 4 não há 3 times. …" em `aptos`
- [ ] Teste `SIM-60`: uma linha de log com `formato`, `n`, `k`, `aptos` e sem id, apelido nem grupo
- [ ] Teste `SIM-17`: a partida da própria data não muda a ordem
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 14: Rotas: avaliar, escalação e pré-marcação

### T36: POST /api/grupos/:grupoId/simulador/avaliar

**What**: Mesma validação de entrada do `sugerir` mais a `composicao`; devolve `avaliar` sem gravar.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/simulador.ts`
**Depends on**: T35
**Reuses**: T16, T22, T35
**Requirement**: SIM-62, SIM-63

**Done when**:

- [ ] Teste `SIM-62`: composição editada responde 200 com os indicadores recalculados e nada gravado
- [ ] Teste `SIM-63`: repetido e fora dos aptos dão 422 no campo `composicao`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T37: POST /api/grupos/:grupoId/escalacoes

**What**: Valida `escalacaoCorpo`, confere repetidos e que todo jogador é ativo do grupo na data, chama `escalacoes.confirmar` e responde 201 com `data` e `confirmadaEm`; avisos não bloqueiam; 409 em grupo arquivado.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/escalacoes.ts`
**Depends on**: T36
**Reuses**: Molde de `POST partidas` (`PR:1461`, T40); T23, T27, T28
**Requirement**: SIM-67, SIM-71, SIM-72, SIM-93

**Done when**:

- [ ] Teste `SIM-67`: 201 com `data` e `confirmadaEm` do relógio fixo
- [ ] Teste `SIM-71`: repetido dá "Há jogador repetido na composição."; inativo ou de outro grupo, "Há jogadores que não estão ativos no grupo nesta data.", no campo `composicao`, sem gravar
- [ ] Teste `SIM-72`: composição com time sem N titulares é aceita
- [ ] Teste `SIM-93`: grupo arquivado depois da sugestão: 409 `grupo_arquivado` e nada gravado
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T38: GET partidas/nova pré-marcada pela escalação

**What**: A rota de `PR:1436` lê `escalacoes.porData` da data: ativos que estão na escalação vêm `presente`, os demais `ausente`, com `preMarcadaPelaEscalacao` verdadeiro; sem escalação ou inválida, como antes e falso. Edição (`GET partidas/:data`) não muda.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/partidas.ts`
**Depends on**: T37
**Reuses**: Estender `GET partidas/nova` (`PR:1436`, T39); T24, T29; `L:backend/api/src/aplicacao/partidas/nova.ts:51-58`
**Requirement**: SIM-75, SIM-76, SIM-78, SIM-88

**Done when**:

- [ ] Teste `SIM-75`: escalação de 19 (1 "não entra") dá os 19 `presente` e a marca verdadeira
- [ ] Teste `SIM-88`: jogador da escalação inativado antes da data não aparece
- [ ] Teste `SIM-76`: escalação inválida no banco dá todos `ausente` e falso
- [ ] Teste `SIM-78`: `GET partidas/:data` de partida já lançada não muda com escalação na data
- [ ] O teste existente de `PR:1436` passa a esperar o campo novo (autorizado, `## Autorizações`)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 15: Rotas: início do grupo, isolamento e dados pessoais

### T39: GET /api/grupos/:grupoId com o próximo dia de jogo

**What**: A rota do início do grupo devolve `proximoDiaDeJogo` e `escalacaoNoProximoDia`.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/grupo.ts`
**Depends on**: T38
**Reuses**: Rota de `GE:1080` ampliada em `PR:1538` (T43); T31
**Requirement**: SIM-08

**Done when**:

- [ ] Teste `SIM-08`: relógio numa terça: `proximoDiaDeJogo` é a quinta seguinte
- [ ] O teste existente da rota passa a esperar os 2 campos (autorizado, `## Autorizações`), sem asserção removida
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T40: Isolamento das rotas novas

**What**: As 5 rotas novas (`contexto`, `previa`, `sugerir`, `avaliar`, `escalacoes`) entram na suíte de isolamento: conta do grupo A contra o B dá 404 sem ler nem gravar; sem sessão, 401; id de jogador do B nos aptos ou na composição do A dá 422 sem dado do B; arquivado, 409 nos POST.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/isolamento/rotas.test.ts`
**Depends on**: T39
**Reuses**: Suíte de isolamento (`CA:1070`, estendida em `GE:1607` e `PR:1658`)
**Requirement**: SIM-79, SIM-80, SIM-83

**Done when**:

- [ ] Teste `SIM-79`: as 5 rotas respondem 404 ao grupo B e o banco do B fica igual; sem sessão, 401
- [ ] Teste `SIM-80`: a resposta do 422 não contém apelido nem id do jogador do B
- [ ] Teste `SIM-83`: o meta-teste falha com uma rota nova sem caso
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T41: Só os campos permitidos nas respostas

**What**: Teste das respostas reais de `contexto`, `sugerir`, `avaliar` e da linha gravada em `escalacoes`: cada jogador só com id, apelido, nível, `semNota`, `semAno` e "só 1º"; a composição gravada só com ids e "só 1º".
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/rotas/simulador-dados-pessoais.test.ts`
**Depends on**: T40
**Reuses**: Molde de `CAMPOS_PROIBIDOS_PUBLICO` (`PR:913`, T19); `S:313`
**Requirement**: SIM-82, SIM-03

**Done when**:

- [ ] Teste `SIM-82`: varredura recursiva das respostas sem `telefone`, `anoNascimento`, `idade`, `posicao`, `notas` nem `pontos`
- [ ] Teste `SIM-82`: o JSON gravado em `escalacoes.composicao` só tem `id` e `so1oTempo` por jogador
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 16: Ensaio da migração e medição na prévia

### T42: Ensaio da migração sobre um dump da produção (AD-033, AD-073)

**What**: Restaurar no Postgres local um dump recente da produção (artefato do `backup.yml`, decifrado pelo usuário fora do repositório: pausa para o usuário), contar as linhas por tabela, aplicar `pnpm migrar` com a migração de T25 e conferir: mesma contagem em toda tabela, schema igual à referência menos a `grupo_criar` de 6 parâmetros, e segunda execução sem DDL. Antes do primeiro deploy da prévia com a migração (AD-032). Nada roda contra a `main` do Neon.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/scripts/src/ensaio-migracao.ts`
**Depends on**: T41, T25
**Reuses**: Script de ensaio da `partidas-e-ranking` (`PR:1684`, T81); restauração (`F:584`); `lerEsquema` e a referência (`F:736`, `F:784`); `F:834`; AD-073
**Requirement**: SIM-67 (AD-037, AD-048)

**Done when**:

- [ ] `Evidência`: data e origem do dump, contagem por tabela antes e depois, diff do schema e a saída da segunda execução, registrados nesta tarefa
- [ ] Teste: nenhuma tabela perde linha; o diff do schema é só a função removida
- [ ] Dump com zero linhas nas tabelas de negócio (AD-014) bloqueia a tarefa: pare e pergunte (AD-073)
- [ ] Banco de ensaio removido no `finally`; o dump decifrado não entra no git
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T43: Medição de CPU na prévia publicada

**What**: Script que, contra a prévia publicada (deploy feito pelo usuário, com confirmação: pausa), dispara 50 `sugerir` com 30 aptos (2 × 11 ilimitado e 6 × 5) e 50 `avaliar` no grupo de teste, só pelas rotas `previa`, `sugerir` e `avaliar`, sem confirmar escalação e sem gravar nada (AD-117, AD-032), com confirmação do usuário na hora, e lê o CPU de cada execução pelo `wrangler tail` (ou painel); p99 abaixo de 7 ms e nenhum erro 1102. O resultado vai nesta tarefa e é copiado no `validation.md` pelo `/validar`. Falha = pare para decisão do usuário (contingência do ADR-017 do legado).
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/scripts/src/medir-simulador.ts`
**Depends on**: T42
**Reuses**: Assumption `S:55` e critério `S:240`; AD-117; entradas de T19; `URL_PUBLICA` como origem (`F:1251`)
**Requirement**: SIM-61

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste: o script calcula p99 e conta 1102 a partir de uma saída de `wrangler tail` de exemplo
- [ ] `Evidência`: data, versão publicada, grupo de teste, p99 de cada rota e zero 1102; contagem de `escalacoes` e `eventos_uso` do grupo igual antes e depois (AD-117)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 17: Web: mockup e dados do simulador

### T44: Mockup do simulador no formato da v2

**What**: Reescrever `respostas/simulador-*.json` no formato do contrato (nível inteiro × 100, `semAno`, sem campo fora de SIM-82; AD-080); trocar as rotas `/admin/g-domingo/simulador` e as do T13/T14 por `/app/grupos/...` no `telas.json` (AD-047); criar `telas/t11-partida--pre-marcada.html` a partir de `git show f417361:.specs/mockup/telas/t11-partida--nova.html` (AD-081) e a entrada dela.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `.specs/mockup/telas.json`
**Depends on**: None
**Reuses**: Molde da P27 da `partidas-e-ranking` (respostas sem `enderecoNovo`, `PR:2344`); `.specs/mockup/respostas/simulador-*.json`; AD-047
**Requirement**: SIM-85, SIM-15

**Done when**:

- [ ] Teste: cada resposta do simulador passa no schema do contrato (T21 a T23)
- [ ] `cmp` do estado novo da t11 com a versão de `f417361`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: build

---

### T45: Dados do simulador e tela de entradas (t12)

**What**: `dados/simulador.ts` (contexto, prévia com debounce, sugerir, avaliar com debounce de 300 ms, confirmar que invalida o início e a partida nova) e `PaginaSimulador` nas entradas: "Data da partida" com "Próximo dia de jogo.", "Formato", "Jogadores por time" com − e +, K com "Ilimitado" e "Só 1º" só em 2 times, "Aptos (N)" com "Marcar todos" e "Desmarcar todos", "nível d,d", "sem nota", "sem ano"; vazio com "Cadastrar jogadores".
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/simulador/PaginaSimulador.tsx`
**Depends on**: T44
**Reuses**: `.specs/mockup/telas/t12-simulador--{vazio,dois-times,tres-times}.html`; `exibirNivel` (`GE:1726`); `CampoData` (`GE:1751`); molde de `PaginaNovaPartida` (`PR:1974`)
**Requirement**: SIM-05, SIM-06, SIM-07, SIM-95

**Done when**:

- [ ] Teste `SIM-06`: trocar para "3 ou mais times" oculta K e "Só 1º"
- [ ] Teste `SIM-07`: contexto sem jogadores mostra "Sem jogadores" e "Cadastrar jogadores"
- [ ] Teste `SIM-05`: data sugerida mostra "Próximo dia de jogo."; outra data, não
- [ ] Teste `SIM-95`: apto sem ano mostra "sem ano"; axe sem violação
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 18: Web: prévia e resultado em 2 times

### T46: Prévia na tela de entradas

**What**: A prévia é pedida com debounce ao mudar formato, N, K ou aptos; pendente mostra "Prévia calculando…"; inválida mostra a descrição no lugar e desabilita "Sugerir times". Nenhum cálculo de times na tela.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/simulador/PreviaSimulador.tsx`
**Depends on**: T45
**Reuses**: `.specs/mockup/telas/t12-simulador--{insuficiente,calculando}.html`; T45
**Requirement**: SIM-14, SIM-15

**Done when**:

- [ ] Teste `SIM-15`: três mudanças rápidas fazem uma chamada só (temporizador falso)
- [ ] Teste `SIM-14`: prévia inválida desabilita "Sugerir times" e mostra a descrição da API
- [ ] Teste `SIM-15`: o componente não importa nada de `@pelada/dominio`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T47: Resultado em 2 times (t13)

**What**: `ResultadoDoisTimes`: cabeçalho "<dia>, dd/mm · 2 times de N · até K substituições por time" (ou "sem limite de substituições"), "Ordem de prioridade", por time "Titulares" com "só 1º tempo" e "sai no intervalo", "Entram no 2º tempo", "Trocas no intervalo" ("A → B"), "Não entra" à parte com a nota, "Comparação entre os times" com uma casa decimal, avisos e "Montando os times…".
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/simulador/ResultadoDoisTimes.tsx`
**Depends on**: T46
**Reuses**: `.specs/mockup/telas/t13-resultado-dois--{sucesso,carregando}.html`; `respostas/simulador-sugestao-dois.json` (T44); `exibirNivel` (`GE:1726`)
**Requirement**: SIM-20, SIM-26, SIM-41, SIM-74, SIM-86

**Done when**:

- [ ] Teste `SIM-74`: K ilimitado mostra "sem limite de substituições"
- [ ] Teste `SIM-26`: "Não entra" com "Compareceram e recebem a pontuação de presença."
- [ ] Teste `SIM-41`: nível 6845 de soma aparece como "68,5"; idade com uma casa
- [ ] Teste `SIM-86`: `sugerir` pendente mostra "Montando os times…"
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 19: Web: resultado em 3+ e ajuste manual

### T48: Resultado em 3 ou mais times (t14)

**What**: `ResultadoVariosTimes`: cabeçalho "<dia>, dd/mm · <descrição da prévia>", um cartão por time ("Time 1"… e "Incompleto (R de N)" no último) com apelidos, "Jogadores", "Nível médio", "Nível somado" e "Idade média".
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/simulador/ResultadoVariosTimes.tsx`
**Depends on**: T47
**Reuses**: `.specs/mockup/telas/t14-resultado-varios--sucesso.html`; `respostas/simulador-sugestao-varios.json` (T44); T47
**Requirement**: SIM-38, SIM-74

**Done when**:

- [ ] Teste `SIM-38`: 22 aptos com N = 4 mostram 6 cartões, o último "Incompleto (2 de 4)"
- [ ] Teste `SIM-74`: cabeçalho com a descrição da prévia
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T49: Mover e trocar jogador

**What**: Folha "Mover jogador" com os destinos de cada formato e "Trocar com…"; move na hora, chama `avaliar` com debounce de 300 ms e mostra os números como "recalculando"; falha (inclusive 429, AD-083) mantém a composição e mostra "Não foi possível recalcular." com "Tentar de novo".
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/simulador/MoverJogador.tsx`
**Depends on**: T48
**Reuses**: `.specs/mockup/telas/t13-resultado-dois--{mover,trocar,recalculando,erro-recalcular}.html` e `t14-resultado-varios--mover.html`; `Dialogo` (`CA:1286`)
**Requirement**: SIM-64, SIM-65

**Done when**:

- [ ] Teste `SIM-64`: mover Japa para o Time B muda a lista na hora e chama `avaliar` uma vez após 300 ms
- [ ] Teste `SIM-65`: falha mantém Japa no B e mostra "Não foi possível recalcular." e "Tentar de novo"
- [ ] Teste `SIM-64`: em 3+, os destinos são os times
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 20: Web: refazer e confirmar

### T50: Refazer sugestão, editar entradas e confirmar

**What**: "Refazer sugestão" depois de ajuste pergunta "Descartar seus ajustes?" com o texto, "Cancelar" e "Refazer sugestão" e chama `sugerir`; "Editar entradas" volta à t12 com as entradas; "Confirmar escalação" sempre ativo, sucesso volta ao início com "Escalação de dd/mm confirmada.", falha (inclusive 409) mantém a composição com "Não foi possível confirmar a escalação. Tente de novo.".
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/simulador/AcoesResultado.tsx`
**Depends on**: T49
**Reuses**: `.specs/mockup/telas/t13-resultado-dois--{refazer,erro-confirmar}.html`; `Dialogo` e `Faixa` (`CA:1286`)
**Requirement**: SIM-46, SIM-66, SIM-73, SIM-93

**Done when**:

- [ ] Teste `SIM-66`: refazer depois de mover devolve a sugestão inicial; sem ajuste, não pergunta
- [ ] Teste `SIM-73`, `SIM-93`: 409 mantém a composição e mostra a mensagem de erro
- [ ] Teste `SIM-46`: com avisos, "Confirmar escalação" continua ativo
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 21: Web: início do grupo e lançamento pré-marcado

### T51: Rota do simulador e item no início do grupo (t09)

**What**: Rota `/app/grupos/:grupoId/simulador` (entradas e resultado); no `InicioGrupo`, o item "Simulador: <dia abreviado>, dd/mm" e, abaixo, "Escalação de dd/mm confirmada" ou "Nenhuma escalação confirmada para dd/mm", no lugar da omissão da PAR-160.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/grupo/InicioGrupo.tsx`
**Depends on**: T50
**Reuses**: Rotas do app (`CA:1309`, `PR:1926`); tela de `PR:2073` (T64); asserção de posição no molde de `GE:2138`; `.specs/mockup/telas/t09-inicio--sucesso.html:19-20`
**Requirement**: SIM-08, SIM-84

**Done when**:

- [ ] Teste `SIM-84`: a rota renderiza o simulador e o item abre ela
- [ ] Teste `SIM-08`: com escalação, "Escalação de 22/10 confirmada"; sem, "Nenhuma escalação confirmada para 22/10"
- [ ] Teste `SIM-08` (posição, e2e `simulador-inicio.spec.ts` no fim do lote): a linha da escalação fica abaixo do item Simulador (`boundingBox`, topo maior que a base do item, mesma coluna)
- [ ] O teste de `PR:2073` "nenhum item Simulador" passa a esperar o item (autorizado, `## Autorizações`)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T52: Faixa de pré-marcação no lançamento (t11)

**What**: `PaginaNovaPartida` mostra "Pré-marcado pela escalação de dd/mm (inclui quem ficou como “não entra”)." quando `preMarcadaPelaEscalacao` é verdadeiro, com as marcações editáveis antes de salvar.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/partida/PaginaNovaPartida.tsx`
**Depends on**: T51
**Reuses**: Estender `PaginaNovaPartida` (`PR:1974`, T60); `telas/t11-partida--pre-marcada.html` (T44); `Faixa` (`CA:1286`)
**Requirement**: SIM-77

**Done when**:

- [ ] Teste `SIM-77`: com a marca, a faixa aparece e trocar um jogador para ausente funciona; sem, não aparece
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 22: Comparação visual e jornadas

### T53: Comparação visual das telas do simulador

**What**: Ativar t12 (`vazio`, `dois-times`, `tres-times`, `insuficiente`, `calculando`), t13 (`sucesso`, `carregando`, `recalculando`, `erro-recalcular`, `erro-confirmar`, `mover`, `trocar`, `refazer`), t14 (`sucesso`, `mover`), t11 `pre-marcada` e a t09 `sucesso` com recorte do bloco "Dia de jogo" (AD-082, AD-118; a tela inteira é comparada na `financeiro`), em PC e celular, até 1%.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/e2e/telas-ativas.json`
**Depends on**: T52
**Reuses**: Lista de telas ativas (`CA:1633`, `PR:2369`); runner com `sequencia`, `pendente` e `abortar` (`PR:2344`); Stylelint de tokens (`F:1374`)
**Requirement**: SIM-85, SIM-26, SIM-38, SIM-86

**Done when**:

- [ ] Teste `SIM-85`: as telas listadas × 2 viewports em até 1%
- [ ] Stylelint de tokens sem erro nos CSS novos
- [ ] As telas já ativas das features anteriores continuam passando
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T54: Jornadas do simulador ponta a ponta

**What**: Testes Playwright das jornadas novas desta feature (`.specs/projeto/jornadas.md`, numeradas pela sessão principal) contra o `wrangler dev` com o seed: montar e confirmar 2 times com ajuste; 3 ou mais times; lançar a partida pré-marcada.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/e2e/simulador.spec.ts`
**Depends on**: T53
**Reuses**: Jornadas de `PR:2441` (T79) e `CA:1683`; seed de `PR:2319` (T74)
**Requirement**: SIM-47, SIM-64, SIM-67, SIM-75

**Done when**:

- [ ] Um teste por jornada, com o nome da jornada
- [ ] Cada jornada termina com a asserção do Resultado esperado dela
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---
