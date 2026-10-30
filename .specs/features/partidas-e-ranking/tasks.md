# Partidas e ranking — Tarefas

## Protocolo de Execução (OBRIGATÓRIO — não pular)

Implemente estas tarefas com a skill `tlc-spec-driven`: **acione-a pelo nome e siga o fluxo de Execute e as Critical Rules.** Não procure arquivos da skill por caminho. A skill é a fonte da verdade do fluxo completo (ciclo por tarefa, delegação a subagentes, revisão de adequação, Verificador, sensor de discriminação).

**Se a skill não puder ser acionada, PARE e avise o usuário. Não prossiga sem ela.**

---

**Design**: `.specs/features/partidas-e-ranking/design.md` (mockup aprovado em `mockup/`, componentes C1 a C9, AD-016 a AD-020)
**Spec**: `.specs/features/partidas-e-ranking/spec.md` (PAR-01 a PAR-161; decisões P1 a P12 em `context.md`)
**Status**: Draft (aguardando aprovação do usuário)

> Premissas desta lista:
> - Caminhos `legado:` são relativos a `C:\Leandro\Projetos\GestaoDaPelada`, somente leitura (AD-002). Teste copiado do legado só entra ligado a um `PAR-NN`.
> - **Cada migration desta feature é um arquivo novo** (Phase 4), aditivo (G-14). Nenhuma migration já aplicada é editada. A de `grupo_criar` (T17) segue o padrão de expandir e contrair do AD-019: a função de 6 parâmetros passa a delegar à nova, só até a migration `-- contrair:` da feature seguinte.
> - Toda rota nova entra em `backend/api/test/isolamento/casos.ts` (G-03) na mesma tarefa que a cria; o tipo `publico` é novo (T42).
> - O banco local (`docker compose up -d`, `pnpm migrar`) precisa estar de pé para os gates full e build.
> - A transação da requisição abre `READ ONLY` quando o caminho termina em `/previa` (AD-017); nenhuma prévia grava linha.
> - Data e mês vêm sempre do `Relogio` injetado (AD-015); a única exceção é a delegação temporária de `grupo_criar` (T17, AD-019).
> - Ações externas (push, PR, deploy, banco de produção) ficam fora destas tarefas e pedem confirmação específica na fase 11.

---

## Test Coverage Matrix

> Gerada a partir da matriz da `grupos-e-elenco` (`.specs/features/grupos-e-elenco/tasks.md`), do `package.json` da raiz, dos testes existentes (`backend/api/test/{rotas,isolamento,migracoes,repositorios}`, `backend/dominio/test`, `backend/contrato/test`, `frontend/web/src/**/*.test.tsx`, `frontend/web/e2e/`) e da spec. Guias encontrados: `.md/GUARDRAILS.md` (regra → teste), `CLAUDE.md` da raiz (gate de testes, seção Comandos), `.specs/projeto/testes.json`. Nenhum limiar de cobertura. Padrão forte aplicado: todo PAR e todo caso limite (`Edge Cases` da spec) tem teste, com os casos de regressão do legado (Vandré, Kim, "saiu e voltou") portados em `backend/dominio/test`.

| Camada | Tipo de teste exigido | Expectativa de cobertura | Padrão de local | Comando |
| ------ | --------------------- | ------------------------ | --------------- | ------- |
| Domínio (`backend/dominio`) | unit | Todas as ramificações; 1:1 com PAR-55 a PAR-63, PAR-67 a PAR-75, PAR-84 a PAR-89, PAR-96 a PAR-99, PAR-109 a PAR-121; casos de regressão do legado (Vandré, Kim, "saiu e voltou"); bench de desempenho (PAR-63) | `backend/dominio/test/**/*.test.ts` | `pnpm --filter @pelada/dominio test` |
| Contrato (`backend/contrato`) | unit | Cada schema: aceita o válido, recusa cada limite e campo extra (`strictObject`); teste de campo proibido (G-10); snapshot de compatibilidade | `backend/contrato/test/**/*.test.ts` | `pnpm --filter @pelada/contrato test` |
| Banco: migrations, funções, RLS, grants | integration (Postgres real, como `pelada_app`) | Cada função e cada grant: todos os ramos; isolamento com dois grupos; grupo arquivado no ramo público (I-3); concorrência de lançamento (PAR-30) | `backend/api/test/{migracoes,isolamento}/**/*.test.ts` | `pnpm --filter @pelada/api test` |
| Repositórios da API | integration | Caminhos de cada função, erro, auditoria na mesma transação, travas na ordem do AD-020 e traduções de 23505 | `backend/api/test/repositorios/**/*.test.ts` | `pnpm --filter @pelada/api test` |
| Rotas e middlewares da API (admin e público) | e2e no pool workerd | Toda rota da tabela do C5: caminho feliz, cada código de erro da spec, 401/404 cruzado, 409 de grupo arquivado, 404 do slug indisponível, 429 do limite público | `backend/api/test/rotas/**/*.test.ts` | `pnpm --filter @pelada/api test` |
| Scripts e checagens (`backend/scripts`) | unit com fixtures | A checagem (`checar-escritores-periodo`) falha numa fixture que viola e passa no repositório | `backend/scripts/checagens/test/*.test.mjs` | `pnpm test:checagens` |
| Front: dados e telas | unit (jsdom + Testing Library + axe) | Cada tela: estados do mockup, mensagens da spec e axe sem violação | `frontend/web/src/**/*.test.{ts,tsx}` | `pnpm --filter @pelada/web test` |
| Front: PDF no navegador | unit | `gerarPdf`, `folha`, `entregar`, `ajuste-fonte`, tokens do PDF (cópia do legado, PAR-102 a PAR-107) | `frontend/web/src/pdf/**/*.test.ts` | `pnpm --filter @pelada/web test` |
| Front: service worker | unit | `ehRankingPublico` só casa a rota do ranking; nenhuma outra rota de `/api` é registrada (G-17) | `frontend/web/src/{sw.test.ts,pwa/regras-sw.test.ts}` | `pnpm --filter @pelada/web test` |
| Front: fluxo, comparação visual e PDF visual | e2e (Playwright, build + Worker local) e visual (limite de 1%, P01 a 4,5%/9%) | `ranking-offline.spec.ts`, `pdf-visual.spec.ts`; toda tela listada em PAR-146 em PC e celular | `frontend/web/e2e/*.spec.ts`, `visual.mjs` | `pnpm --filter @pelada/web e2e` e `visual` |
| Tipos, configuração e seed | none (gate de build) | — | — | gate de build |

## Gate Check Commands

> Os mesmos da `grupos-e-elenco`, confirmados no `package.json` da raiz e no `.specs/projeto/testes.json`.

| Nível do gate | Quando usar | Comando |
| ------------- | ----------- | ------- |
| Quick | Tarefas só com testes unitários, no pacote tocado | `pnpm --filter <pacote> test` |
| Full | Tarefas com integration ou e2e. Exige o banco local de pé e `DATABASE_URL_TESTE` | `pnpm test && pnpm test:checagens` |
| Build | Fim de fase, config e tarefas de e2e/visual do web | `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:checagens && pnpm --filter @pelada/web build && pnpm --filter @pelada/web e2e && pnpm --filter @pelada/web visual` |

---

## Execution Plan

As fases rodam em sequência; dentro da fase, as tarefas rodam em ordem.

### Phase 1: Domínio — datas, pesos e acumulado

```
T1 → T2 → T3 → T4
T1 → T5
```

### Phase 2: Domínio — ranking, pdf e prévias

```
T6 → T7 → T9 → T10
T6 → T8 → T9
```

### Phase 3: Contrato

```
T11 → T12 → T13 → T14 → T15
```

### Phase 4: Banco — migrations da feature

```
T16 → T17 → T18 → T19 → T20 → T21
```

### Phase 5: Repositórios — histórico e pesos

```
T22 → T23 → T24
```

### Phase 6: Repositórios — partidas e eventos

```
T25 → T26 → T27 → T28 → T29
```

### Phase 7: Rotas admin — pesos e partidas

```
T30 → T31 → T32 → T33
```

### Phase 8: Rotas admin — prévias, início do grupo e uso

```
T34 → T35 → T36 → T37
```

### Phase 9: Rotas públicas

```
T38 → T39 → T40 → T41 → T42
```

### Phase 10: Lint, auditoria e débitos

```
T43 → T44 → T45
```

### Phase 11: Web — ranking público

```
T46 → T47 → T48
```

### Phase 12: Web — partidas

```
T49 → T50
```

### Phase 13: Web — pontuação, uso e prévias

```
T51 → T52 → T53
```

### Phase 14: Web — início do grupo e navegação

```
T54 → T55 → T56
```

### Phase 15: PDF no navegador

```
T57 → T58 → T59
```

### Phase 16: Service worker e sem conexão

```
T60 → T61 → T62
```

### Phase 17: Integração final

```
T63 → T64 → T65 → T66
```

---

## Task Breakdown

### Phase 1: Domínio — datas, pesos e acumulado

### T1: Utilitários de data e mês

**What**: `datas.ts` novo: `mesDe`, `primeiroDia`, `ultimoDia`, `mesAnterior`, `mesSeguinte`, `compararMeses`, `diaDaSemana`, `dataSugeridaPartida(hoje, diaSemana)`.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `backend/dominio/src/datas.ts`
**Depends on**: None
**Reuses**: `legado:backend/dominio/src/datas/{datas,dia-de-jogo}.ts`
**Requirement**: PAR-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `dataSugeridaPartida` devolve a maior data até hoje que cai no dia da semana do grupo, mesmo quando hoje não é esse dia
- [ ] `mesAnterior`/`mesSeguinte`/`compararMeses` cobertos com meses de virada de ano
- [ ] Nenhuma função lê relógio: `hoje` entra por parâmetro
- [ ] Gate quick passa: `pnpm --filter @pelada/dominio test`

**Tests**: unit
**Gate**: quick

---

### T2: Pesos: tipos, PESOS_PADRAO e pontosDaPresenca

**What**: Tipos `ConfigPesos`, `PresencaDoJogador`; `PESOS_PADRAO`; `pontosDaPresenca(situacao, choveu, pesos)`.
**Estimativa**: 1h
**Risco**: alto
**Where**: `backend/dominio/src/pontuacao/pesos.ts`
**Depends on**: T1
**Reuses**: `legado:backend/dominio/src/pontuacao/pesos.ts`
**Requirement**: PAR-55

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Presente, lesionado e expulso com e sem chuva usam o peso certo (PAR-55); expulso com chuva usa `expulsoComChuva`
- [ ] `PESOS_PADRAO` = 1, 1, 1, 1, −1, −1
- [ ] Gate quick passa: `pnpm --filter @pelada/dominio test`

**Tests**: unit
**Gate**: quick

---

### T3: Resolvedor de pesos por vigência e ehPesosPadrao

**What**: `criarResolvedorDePesos(configs)` (busca binária, anterior ou igual à data; a mais antiga antes da primeira) e `ehPesosPadrao(configs): boolean`.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `backend/dominio/src/pontuacao/resolvedor-pesos.ts`
**Depends on**: T2
**Reuses**: `legado:backend/dominio/src/pontuacao/pesos.ts` (busca binária)
**Requirement**: PAR-56, P10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Data anterior à primeira configuração usa a mais antiga (PAR-56)
- [ ] Partida no dia exato do `vigente_desde` usa a configuração nova (caso limite da spec)
- [ ] `ehPesosPadrao` verdadeiro só com uma configuração nos valores de `PESOS_PADRAO`
- [ ] Gate quick passa: `pnpm --filter @pelada/dominio test`

**Tests**: unit
**Gate**: quick

---

### T4: Função única de acumulado

**What**: `acumuladoPorInicio` (G-25) com as internas `inicioDoPeriodo`, `acumuladoAte` e `acumuladoComInicial`, que só este módulo chama.
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/dominio/src/pontuacao/acumulado.ts`
**Depends on**: T3
**Reuses**: `legado:backend/dominio/src/pontuacao/acumulado-inicio.ts` e `backend/dominio/test/pontuacao/*.test.ts` (Vandré, Kim, "saiu e voltou")
**Requirement**: PAR-57, PAR-58, PAR-59, PAR-60, PAR-61

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Os testes portados do legado (Vandré, Kim, "saiu e voltou") passam com os mesmos valores
- [ ] Início da contagem é o primeiro período (sem retorno) ou a data do retorno, conforme PAR-57
- [ ] Pontuação inicial soma só quando o início da contagem é igual ou anterior à primeira presença de todo o histórico (PAR-59); data de início igual à primeira presença soma, um dia depois não soma (caso limite)
- [ ] Presença fora de período de atividade conta, se estiver entre o início da contagem e a referência (PAR-60)
- [ ] Gate quick passa: `pnpm --filter @pelada/dominio test`

**Tests**: unit
**Gate**: quick

---

### T5: Validação de marcações e contagem da partida

**What**: `validarMarcacoes(ativos, marcacoes)` (jogador inativo, inexistente, repetido) e `contagemDaPartida(presencas)`.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `backend/dominio/src/partidas/validar-marcacoes.ts`
**Depends on**: T1
**Reuses**: `legado:backend/dominio/src/aplicacao/partidas/presencas.ts` (regra, não a camada de aplicação)
**Requirement**: PAR-23, PAR-24, PAR-25, PAR-26, PAR-27

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Marcação de jogador inativo na data, inexistente e de outro grupo recusadas com a mesma mensagem (PAR-24)
- [ ] Jogador repetido nas marcações recusado (PAR-25); situação fora de `ausente/presente/lesionado/expulso` recusada (PAR-26)
- [ ] `contagemDaPartida` conta só presente, lesionado e expulso; ausente não entra (PAR-23)
- [ ] Gate quick passa: `pnpm --filter @pelada/dominio test`

**Tests**: unit
**Gate**: quick

---

### Phase 2: Domínio — ranking, pdf e prévias

### T6: calcularRanking e navegação de mês

**What**: `calcularRanking(EntradaRanking): ResultadoRanking` com `ordenarPorRanking`, `rodadasDoJogador`, `limitesDeMes`, `navegacaoDeMes`, `mesNoHistorico`.
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/dominio/src/ranking/calcular-ranking.ts`
**Depends on**: T4, T5
**Reuses**: `legado:backend/dominio/src/ranking/*.ts`, `backend/dominio/test/ranking/*.test.ts`
**Requirement**: PAR-67, PAR-68, PAR-69, PAR-70, PAR-71, PAR-72, PAR-73, PAR-74, PAR-75, PAR-84, PAR-85, PAR-86, PAR-87

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Ordenação por acumulado, depois ano (sem ano no fim, 9999), depois apelido sem acento nem caixa (PAR-68); empate dá a mesma posição e pula o seguinte (1, 1, 3 — PAR-69)
- [ ] Rodada de presença gravada usa a situação e os pontos; ativo sem presença é `falta` e 0; fora do período e sem presença é `fora` e nulo (PAR-71 a PAR-73)
- [ ] PTS INICIAL e PTS FINAL do mês calculados por PAR-74 e PAR-75, inclusive sem nenhuma partida (PAR-86) e mês sem partida dentro do histórico (PAR-87)
- [ ] `mesNoHistorico` recusa mês anterior à primeira partida, posterior a hoje, e mês diferente de hoje num grupo sem partidas (PAR-66)
- [ ] Gate quick passa: `pnpm --filter @pelada/dominio test`

**Tests**: unit
**Gate**: quick

---

### T7: calcularPdf e escolha de colunas

**What**: `calcularPdf(EntradaRanking): ProjecaoPdf` com `escolherColunasPdf` (até 12 mais recentes do mês exibido).
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `backend/dominio/src/pdf/calcular-pdf.ts`
**Depends on**: T6
**Reuses**: `legado:backend/dominio/src/pdf/*.ts`, `backend/dominio/test/pdf/*.test.ts`
**Requirement**: PAR-96, PAR-97, PAR-98, PAR-99

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Mês com 14 partidas mantém as 12 mais recentes; PTS INICIAL absorve as 2 mais antigas (caso limite)
- [ ] Mês sem partida marca `semPartidasNoMes`, com colunas só de meses anteriores (PAR-97); PDF de janeiro completa com dezembro do ano anterior (caso limite)
- [ ] `ptsInicial` igual ao `ptsFinal` quando não há coluna (PAR-98, I-42)
- [ ] Gate quick passa: `pnpm --filter @pelada/dominio test`

**Tests**: unit
**Gate**: quick

---

### T8: compararCenarios e prévias de período e início

**What**: `compararCenarios` (reativar e corrigir), `previaDosPeriodos` (rodadas que passam/deixam de constar e `aviso`), `previaDoInicio`.
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/dominio/src/pontuacao/comparar-cenarios.ts`
**Depends on**: T6
**Reuses**: `legado:backend/dominio/src/pontuacao/comparar-cenarios.ts` (se existir) ou equivalente de `aplicacao/elenco/*-previa.ts`
**Requirement**: PAR-109, PAR-110, PAR-111, PAR-113, PAR-114, PAR-115, PAR-116

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Rodada com situação "–" que passa a ter situação conta como "passa a constar", e o inverso como "deixa de constar", cortando no início da contagem do mês dela (PAR-114)
- [ ] `aviso` no singular para uma rodada de falta, no plural para duas ou mais, nulo sem nenhuma (PAR-116)
- [ ] `posicao` nula quando o jogador não fica ativo hoje no cenário simulado (PAR-113)
- [ ] Prévia de início que recua antes do primeiro período usa esse início alinhado à nova data (PAR-115, GEL-81)
- [ ] Gate quick passa: `pnpm --filter @pelada/dominio test`

**Tests**: unit
**Gate**: quick

---

### T9: Bench de desempenho do domínio

**What**: `desempenho.test.ts`: 40 jogadores × 104 partidas, mediana de `calcularRanking`, `calcularPdf` e `compararCenarios` abaixo de 5 ms em 50 rodadas.
**Estimativa**: 1h
**Risco**: alto
**Where**: `backend/dominio/test/desempenho.test.ts`
**Depends on**: T7, T8
**Reuses**: Nenhum (teste novo)
**Requirement**: PAR-63

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Mediana de `calcularRanking` < 5 ms com o cenário de 40 × 104 (PAR-63)
- [ ] Mesmo orçamento medido para `calcularPdf` e `compararCenarios`
- [ ] Gate quick passa: `pnpm --filter @pelada/dominio test`

**Tests**: unit
**Gate**: quick

---

### T10: Exportar módulo do domínio

**What**: Exporta de `backend/dominio/src/index.ts` tudo que T1 a T9 criaram e confere a API pública.
**Estimativa**: 30 min
**Risco**: baixo
**Where**: `backend/dominio/src/index.ts`
**Depends on**: T9
**Reuses**: `backend/dominio/test/pacote.test.ts`
**Requirement**: PAR-61

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Teste de pacote lista as exportações novas (`acumuladoPorInicio`, `calcularRanking`, `calcularPdf`, `compararCenarios`, `criarResolvedorDePesos`, `PESOS_PADRAO`, `ehPesosPadrao`, `validarMarcacoes`, `contagemDaPartida`, `dataSugeridaPartida`)
- [ ] `pnpm lint` passa: nenhum arquivo do domínio importa I/O, relógio ou zod
- [ ] Gate quick passa: `pnpm --filter @pelada/dominio test`

**Tests**: unit
**Gate**: quick

---

### Phase 3: Contrato

### T11: Contrato de pesos

**What**: `pesosCorpo` (6 inteiros −10 a 10, `.strictObject`), `pesosPainel`.
**Estimativa**: 1h
**Risco**: alto
**Where**: `backend/contrato/src/pesos.ts`
**Depends on**: T10
**Reuses**: `legado:backend/contrato/src/pesos.ts`
**Requirement**: PAR-06, PAR-07, PAR-08, PAR-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Peso não inteiro ou fora de −10 a 10 recusado com "Use um número inteiro de -10 a 10." no campo certo
- [ ] Corpo com `vigenteDesde` ou campo extra recusado (`.strictObject`)
- [ ] Gate quick passa: `pnpm --filter @pelada/contrato test`

**Tests**: unit
**Gate**: quick

---

### T12: Contrato de partidas

**What**: `partidaCorpo { data, choveu, marcacoes }`, `partidaResposta`, `partidaNova`, `partidasDoMes`, `consultaData`, `consultaMes`.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `backend/contrato/src/partidas.ts`
**Depends on**: T11
**Reuses**: `legado:backend/contrato/src/partidas.ts`
**Requirement**: PAR-19, PAR-20, PAR-26, PAR-39, PAR-40, PAR-47

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Data fora do formato `AAAA-MM-DD` ou futura recusada com a mensagem certa no campo `data`
- [ ] Mês fora de `AAAA-MM` ou futuro recusado no campo `mes`
- [ ] `partidaCorpo` recusa campo extra e situação fora da união
- [ ] Gate quick passa: `pnpm --filter @pelada/contrato test`

**Tests**: unit
**Gate**: quick

---

### T13: Contrato público (ranking, pdf, eventos)

**What**: `rankingPublico`, `pdfPublico` (só os campos de PAR-64, PAR-70 e PAR-95), `eventoPublicoCorpo` (união discriminada por `tipo`), `usoResposta`, `CAMPOS_PROIBIDOS_PUBLICO`.
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/contrato/src/publico.ts`
**Depends on**: T12
**Reuses**: `legado:backend/contrato/src/publico.ts`
**Requirement**: PAR-64, PAR-70, PAR-76, PAR-95, PAR-101, PAR-128

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `CAMPOS_PROIBIDOS_PUBLICO` lista id de jogador, telefone, ano de nascimento, idade, posição, notas, nível, períodos, pontuação inicial isolada e financeiro (PAR-76); teste usa a lista para varrer `rankingPublico` e `pdfPublico`
- [ ] `eventoPublicoCorpo` aceita só `ranking_aberto` (com `dispositivoId`, sem `mes`) e `pdf_exportado` (com `mes`, sem `dispositivoId`); outro tipo ou campo extra recusado (PAR-128)
- [ ] `pdfPublico` aceita no máximo 12 colunas (PAR-101)
- [ ] Gate quick passa: `pnpm --filter @pelada/contrato test`

**Tests**: unit
**Gate**: quick

---

### T14: Contrato de prévias e início do grupo ampliado

**What**: `corrigirPeriodoCorpo` e `inicioCorpo` reaproveitados de `periodos.ts`; `previaResposta`, `previaInicioResposta`; `grupoDetalhe` ganha os campos de PAR-132.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `backend/contrato/src/previas.ts`
**Depends on**: T13
**Reuses**: `backend/contrato/src/periodos.ts` (`dataCorpo`, já existente — a prévia de reativar usa o mesmo corpo, PAR-109)
**Requirement**: PAR-109, PAR-110, PAR-111, PAR-132

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `previaResposta` tem `acumuladoAntes`, `acumuladoDepois`, `posicaoAntes`, `posicaoDepois`, `rodadasQuePassamAConstar`, `rodadasQueDeixamDeConstar`, `aviso`
- [ ] `previaInicioResposta` tem `acumuladoAntes`, `acumuladoDepois`, `posicaoAntes`, `posicaoDepois` e a contagem de rodadas (PAR-111)
- [ ] `grupoDetalhe` ganha `dataSugeridaPartida`, `partidaNaDataSugerida`, `partidasNoMes`, `pesosVigentesDesde`, `pesosPadrao`, `aparelhosNaSemana` (PAR-132)
- [ ] Gate quick passa: `pnpm --filter @pelada/contrato test`

**Tests**: unit
**Gate**: quick

---

### T15: Snapshot de compatibilidade e exportações

**What**: Exporta os arquivos novos do contrato e atualiza `compatibilidade.json` (G-20).
**Estimativa**: 45 min
**Risco**: baixo
**Where**: `backend/contrato/src/index.ts`
**Depends on**: T14
**Reuses**: `backend/contrato/test/compatibilidade.test.ts`
**Requirement**: AD-009

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `compatibilidade.test.ts` passa com o snapshot atualizado e falharia sem ele (provado removendo um campo)
- [ ] Os arquivos novos importam o `z` de `zod.ts` (`sem-eval.test.ts` continua verde)
- [ ] Gate quick passa: `pnpm --filter @pelada/contrato test`

**Tests**: unit
**Gate**: quick

---

### Phase 4: Banco — migrations da feature

### T16: Migration — pesos padrão para grupo existente

**What**: `INSERT INTO config_pesos` para todo grupo sem configuração, com `vigente_desde` = `grupos.criado_em` em São Paulo e `registrado_por` = `grupos.criado_por`.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `backend/api/src/infraestrutura/db/migracoes/<timestamp>_pesos-padrao.sql`
**Depends on**: None
**Reuses**: `backend/api/test/migracoes/*.test.ts` (padrão de teste de migration de dados)
**Requirement**: PAR-13, PAR-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Depois de `pnpm migrar`, todo grupo do seed sem `config_pesos` ganha a linha 1, 1, 1, 1, −1, −1; grupo que já tinha configuração não muda (PAR-14)
- [ ] `vigente_desde` é a data de `criado_em` convertida para São Paulo, não `now()` (AD-015)
- [ ] `checar-migracao-aditiva` passa: migration nova, nenhuma editada
- [ ] Gate full passa

**Tests**: integration
**Gate**: full

---

### T17: Migration — grupo_criar com pesos (expandir)

**What**: `grupo_criar(…, p_habilidades, p_hoje)` de 7 parâmetros, criando `config_pesos` padrão na mesma transação; a de 6 parâmetros passa a delegar a esta com `(now() AT TIME ZONE 'America/Sao_Paulo')::date` (AD-019).
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/api/src/infraestrutura/db/migracoes/<timestamp>_grupo-criar-pesos.sql`
**Depends on**: T16
**Reuses**: `backend/api/test/migracoes/grupo-criar-concorrencia.test.ts` (padrão), `funcoes-definer.test.ts`
**Requirement**: PAR-15, PAR-16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Como `pelada_app`, `grupo_criar` de 7 parâmetros cria grupo e configuração padrão com `vigente_desde` = `p_hoje` e `registrado_por` = conta criadora, na mesma transação
- [ ] Falha na criação da configuração desfaz o grupo inteiro (PAR-16); `p_hoje` nulo levanta erro
- [ ] A função de 6 parâmetros (chamada pelo Worker anterior durante o deploy) continua funcionando e cria a mesma configuração com a data do `now()` em São Paulo — teste que falha se outra função do banco usar `now()` para data (AD-015, AD-019)
- [ ] `funcoes-definer.test.ts` verde com as duas assinaturas
- [ ] Gate full passa

**Tests**: integration
**Gate**: full

---

### T18: Migration — evento_publico_registrar

**What**: Função `evento_publico_registrar(p_slug, p_tipo, p_dispositivo, p_mes, p_momento)` `SECURITY DEFINER`, única escrita do contexto do slug; grants de `eventos_uso` e policy de leitura só com conta.
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/api/src/infraestrutura/db/migracoes/<timestamp>_eventos-uso.sql`
**Depends on**: T17
**Reuses**: `convite_criar` como modelo de função `SECURITY DEFINER`
**Requirement**: PAR-127, PAR-128, PAR-129, PAR-130, PAR-131

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Como `pelada_app`, no contexto do slug (`app_conta_id() IS NULL`), a função aceita só `ranking_aberto` (com dispositivo, sem mês) e `pdf_exportado` (com mês, sem dispositivo); grupo inexistente ou arquivado devolve `false`
- [ ] Fora do contexto do slug (com `app_conta_id()`) a função falha
- [ ] `pelada_app` tem só `SELECT`/`INSERT` em `eventos_uso` (sem `UPDATE`, `DELETE`, `TRUNCATE` — PAR-130); a policy de leitura exige conta (PAR-131)
- [ ] Teste de RLS como `pelada_app`: o contexto do slug não escreve em nenhuma outra tabela (PAR-131)
- [ ] Gate full passa

**Tests**: integration
**Gate**: full

---

### T19: Migration — contas_nomes_do_grupo

**What**: `contas_nomes_do_grupo(p_grupo_id) RETURNS TABLE (id, nome)` `SECURITY DEFINER`: só para quem tem vínculo, só contas que aparecem como autoras no grupo.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `backend/api/src/infraestrutura/db/migracoes/<timestamp>_contas-nomes-do-grupo.sql`
**Depends on**: T18
**Reuses**: `admins_listar` (padrão), AD-018
**Requirement**: AD-018

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Como `pelada_app` com vínculo: devolve nome das contas que aparecem em `config_pesos.registrado_por` ou `partidas.{criada_por,alterada_por}` do grupo, nunca e-mail
- [ ] Sem vínculo no grupo: devolve zero linhas
- [ ] `funcoes-definer.test.ts` verde com a função nova
- [ ] Gate full passa

**Tests**: integration
**Gate**: full

---

### T20: Migration — grants por coluna em partidas e config_pesos

**What**: `REVOKE UPDATE ON partidas, config_pesos FROM pelada_app`; `GRANT UPDATE` só nas colunas de chuva/autoria e de pesos vigentes.
**Estimativa**: 1h
**Risco**: alto
**Where**: `backend/api/src/infraestrutura/db/migracoes/<timestamp>_grants-partidas-pesos.sql`
**Depends on**: T19
**Reuses**: `backend/api/test/migracoes/roles.test.ts`
**Requirement**: PAR-09, P4

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `UPDATE partidas SET data = ...` como `pelada_app` falha com permissão negada; `UPDATE` de `choveu`, `alterada_por`, `alterada_em` funciona
- [ ] `UPDATE config_pesos SET vigente_desde = ...` falha; `UPDATE` dos 6 pesos, `registrado_por`, `registrado_em` funciona
- [ ] `roles.test.ts` verde com os casos novos
- [ ] Gate full passa

**Tests**: integration
**Gate**: full

---

### T21: Migration — grupos_visiveis() sem arquivado no ramo público

**What**: `CREATE OR REPLACE FUNCTION grupos_visiveis()` com `AND g.arquivado_em IS NULL` também no ramo do slug (I-3).
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `backend/api/src/infraestrutura/db/migracoes/<timestamp>_grupos-visiveis-publico-ativo.sql`
**Depends on**: T20
**Reuses**: `1792844280000_grupos-visiveis-arquivado.sql` (AD-014, mesma função, ramo do slug)
**Requirement**: PAR-91, PAR-92, PAR-93

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Como `pelada_app`, no contexto do slug de um grupo arquivado: zero linhas em `grupos`, `jogadores`, `periodos_ativos`, `partidas`, `presencas`, `config_pesos` e `eventos_uso` (PAR-92)
- [ ] O ramo com conta (AD-014) não muda; reativar o grupo devolve o ranking pelo mesmo slug (PAR-93)
- [ ] Mesmos `SECURITY DEFINER`, `search_path` fixo e grants da função anterior
- [ ] Gate full passa

**Tests**: integration
**Gate**: full

---

### Phase 5: Repositórios — histórico e pesos

### T22: historico.carregar

**What**: Carregador único: jogadores (sem telefone nem posição), períodos, partidas até `ate`, presenças e pesos, em 4 consultas.
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/api/src/infraestrutura/db/repositorios/historico.ts`
**Depends on**: T15, T21
**Reuses**: `legado:backend/api/src/aplicacao/pontuacao/{historico,adaptadores}.ts`
**Requirement**: PAR-62, AD-017

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `historico.carregar` devolve jogadores sem telefone nem posição (G-10), períodos, partidas até `ate`, presenças e `pesosAte` em exatamente 4 consultas (contagem conferida no teste)
- [ ] Serve igualmente ao contexto do slug e ao do admin: a RLS decide o que se vê, sem filtro de conta no repositório
- [ ] Primeiro parâmetro `grupoId` (`checar-grupo-id` verde)
- [ ] Gate full passa

**Tests**: integration
**Gate**: full

---

### T23: pesos.painel e pesos.salvar

**What**: `pesos.painel(db, grupoId, hoje)` (vigente, histórico, `vigenteAte` calculado) e `pesos.salvar(db, grupoId, pesos, hoje)` (`ON CONFLICT` substitui o do dia, com auditoria).
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/api/src/infraestrutura/db/repositorios/pesos.ts`
**Depends on**: T22
**Reuses**: `legado:backend/api/src/aplicacao/pesos/*.ts`, `contas_nomes_do_grupo` (T19)
**Requirement**: PAR-01, PAR-02, PAR-03, PAR-04, PAR-05, PAR-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `vigenteAte` de uma configuração anterior é o dia anterior ao `vigente_desde` da seguinte (PAR-02)
- [ ] Salvar com vigência já existente hoje substitui, sem criar outra linha, e grava `pesos_substituidos` na auditoria; salvar pela primeira vez no dia grava `pesos_configurados` (PAR-04, PAR-05)
- [ ] `registradoPor` vem de `contas_nomes_do_grupo`, nunca de uma junção direta com `contas`
- [ ] Configuração com `vigente_desde` anterior a hoje nunca é alterada (PAR-09)
- [ ] Gate full passa

**Tests**: integration
**Gate**: full

---

### T24: jogadores — travarVarios, ativosNaData e lerParaPrevia

**What**: `jogadores.travarVarios(ids)` (uma consulta, ordem crescente de id, `FOR UPDATE`), `ativosNaData(db, grupoId, data)` (leitura, sem trava) e `lerParaPrevia` (mesma leitura de `travarParaPeriodo`, sem trava).
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `backend/api/src/infraestrutura/db/repositorios/jogadores.ts`
**Depends on**: T23
**Reuses**: `jogadores.ts:249` (`travar`), `:397` (`travarParaPeriodo`)
**Requirement**: PAR-27, PAR-29, AD-020

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `travarVarios` trava todos os jogadores marcados numa única consulta, em ordem crescente de id (PAR-29, AD-020)
- [ ] `ativosNaData` considera ativo o jogador com período `[início, fim)` que contém a data (PAR-27), sem travar nada
- [ ] `lerParaPrevia` não grava nem trava
- [ ] Gate full passa

**Tests**: integration
**Gate**: full

---

### Phase 6: Repositórios — partidas e eventos

### T25: partidas.lancar

**What**: `partidas.lancar(db, grupoId, dados, hoje)`: trava jogadores (T24) → `ativosNaData` → `validarMarcacoes` → INSERT da partida (23505 → `partida_ja_existe`) → presenças → `eventos.partidaLancada` → auditoria com contagens.
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/api/src/infraestrutura/db/repositorios/partidas.ts`
**Depends on**: T24
**Reuses**: `legado:backend/api/src/aplicacao/partidas/*.ts`
**Requirement**: PAR-21, PAR-22, PAR-23, PAR-28, PAR-29, PAR-30

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Lançamento válido grava partida, presenças (só presente/lesionado/expulso), evento `partida_lancada` e auditoria com contagens, tudo numa transação (PAR-28)
- [ ] 23505 de `partidas_grupo_id_data_key` traduzido para `partida_ja_existe` com `dataExistente` (PAR-21, PAR-30); teste com duas conexões confirma que uma grava e a outra recebe o 409
- [ ] Trava os jogadores marcados antes de validar (ordem do AD-020, depois da trava do grupo já feita pelo `exigirGrupoAtivo`)
- [ ] Gate full passa

**Tests**: integration
**Gate**: full

---

### T26: partidas.editar e partidas.excluir

**What**: `partidas.editar(db, grupoId, data, dados, hoje)` (substitui chuva e presenças; sem mudar `data`) e `partidas.excluir(db, grupoId, data)` (cascade das presenças; mantém o evento).
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/api/src/infraestrutura/db/repositorios/partidas.ts`
**Depends on**: T25
**Reuses**: `partidas.ts` (T25)
**Requirement**: PAR-46, PAR-48, PAR-49, PAR-50, PAR-51

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Edição trava a partida (`FOR UPDATE`) e os jogadores marcados (ordem do AD-020), valida contra os ativos na data da partida — não de hoje (PAR-48) — e grava `alterada_por`/`alterada_em` e `partida_editada` na auditoria (PAR-49)
- [ ] Exclusão apaga partida e presenças (cascade), grava `partida_excluida`, e o evento `partida_lancada` já registrado permanece (PAR-50, PAR-51)
- [ ] Gate full passa

**Tests**: integration
**Gate**: full

---

### T27: partidas.doMes, ler e mesDaPrimeira

**What**: `partidas.doMes(db, grupoId, mes)` (contagens por partida), `partidas.ler(db, grupoId, data)` (ativos na data mais quem tem presença), `partidas.mesDaPrimeira(db, grupoId)`.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `backend/api/src/infraestrutura/db/repositorios/partidas.ts`
**Depends on**: T26
**Reuses**: `partidas.ts` (T26)
**Requirement**: PAR-37, PAR-41, PAR-44

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `doMes` devolve as partidas do mês, mais recente primeiro, com contagens de presentes/lesionados/expulsos (PAR-37)
- [ ] `ler` inclui ativos na data e quem já tem presença nela, mesmo inativo hoje (PAR-44)
- [ ] `mesDaPrimeira` nulo num grupo sem partida (limita a navegação, PAR-41)
- [ ] Gate full passa

**Tests**: integration
**Gate**: full

---

### T28: eventos — partidaLancada, registrarPublico, porSemana, aparelhosDaSemana

**What**: `eventos.partidaLancada` (INSERT com conta, pela RLS), `eventos.registrarPublico` (chama a função T18), `eventos.porSemana(db, grupoId)`, `eventos.aparelhosDaSemana(db, grupoId, hoje)`.
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/api/src/infraestrutura/db/repositorios/eventos.ts`
**Depends on**: T27
**Reuses**: `legado:backend/api/src/infraestrutura/db/repositorios/eventos.ts` (`porSemana`, `aparelhosDaSemana`)
**Requirement**: PAR-127, PAR-155, PAR-156, PAR-157, PAR-158

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `porSemana` agrupa de segunda a domingo em America/Sao_Paulo, só semanas com evento, mais recente primeiro (PAR-155, PAR-156)
- [ ] `aparelhosRanking` conta `dispositivo_id` distintos de `ranking_aberto` na semana (PAR-157); `partidasEm48h` conta `partida_lancada` registrado até 48h depois da data da partida no horário do grupo (PAR-158)
- [ ] `registrarPublico` devolve o booleano da função; sem gravar nada além dela
- [ ] Gate full passa

**Tests**: integration
**Gate**: full

---

### T29: grupos.criar (7 parâmetros) e grupos.ler ampliado

**What**: `grupos.criar` chama `grupo_criar` de 7 parâmetros (T17) com a data do `Relogio`; `grupos.ler` ganha os dados do início (PAR-132) a partir de `historico` mínimo e `eventos.aparelhosDaSemana`.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `backend/api/src/infraestrutura/db/repositorios/grupos.ts`
**Depends on**: T28
**Reuses**: `grupos.ts` (função existente da `grupos-e-elenco`)
**Requirement**: PAR-15, PAR-132

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `grupos.criar` passa `relogio.hoje()` como `p_hoje` para `grupo_criar`
- [ ] `grupos.ler` devolve `dataSugeridaPartida`, `partidaNaDataSugerida`, `partidasNoMes`, `pesosVigentesDesde`, `pesosPadrao`, `aparelhosNaSemana` (PAR-132)
- [ ] Gate full passa

**Tests**: integration
**Gate**: full

---

### Phase 7: Rotas admin — pesos e partidas

### T30: GET/POST /api/grupos/:grupoId/pesos

**What**: Painel de pesos e gravação de nova configuração.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `backend/api/src/entrada/rotas/pesos.ts`
**Depends on**: T23, T29
**Reuses**: `entrada/rotas/admins.ts` (padrão de rota)
**Requirement**: PAR-01, PAR-03, PAR-04, PAR-05, PAR-06, PAR-07, PAR-08, PAR-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `GET` devolve `hoje`, `vigente`, `historico`; `POST` válido grava e responde 200 com o painel atualizado
- [ ] Cada 422 da spec com a mensagem e o campo certos; corpo com campo extra recusado
- [ ] Rota nova em `test/isolamento/casos.ts` (tipo `grupo`)
- [ ] Gate full passa

**Tests**: e2e
**Gate**: full

---

### T31: GET /api/grupos/:grupoId/partidas/nova e GET /partidas?mes

**What**: Consulta de jogadores ativos para lançar e lista de partidas do mês.
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/api/src/entrada/rotas/partidas.ts`
**Depends on**: T27, T30
**Reuses**: `entrada/rotas/admins.ts`
**Requirement**: PAR-17, PAR-18, PAR-19, PAR-20, PAR-21, PAR-37, PAR-38, PAR-39, PAR-40, PAR-41

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `/partidas/nova` registrada antes de `/partidas/:data`; sem `data` sugere a maior data até hoje no dia do grupo; já existe partida na data → 409 `partida_ja_existe`
- [ ] `/partidas?mes=` sem `mes` usa o de hoje; mês malformado ou futuro → 422; navegação limitada pela primeira partida (PAR-41)
- [ ] Rotas novas em `test/isolamento/casos.ts`
- [ ] Gate full passa

**Tests**: e2e
**Gate**: full

---

### T32: POST /api/grupos/:grupoId/partidas (lançar)

**What**: Lançamento da partida.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `backend/api/src/entrada/rotas/partidas.ts`
**Depends on**: T31
**Reuses**: `rotas/partidas.ts` (T31)
**Requirement**: PAR-22, PAR-24, PAR-25, PAR-26, PAR-28, PAR-30

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Lançamento válido → 201 com a partida; marcação inválida → 422 no campo certo, nada gravado
- [ ] Duas requisições simultâneas na mesma data: uma 201, outra 409 `partida_ja_existe` (teste com duas conexões)
- [ ] Rota em `test/isolamento/casos.ts`
- [ ] Gate full passa

**Tests**: e2e
**Gate**: full

---

### T33: GET/PUT/DELETE /api/grupos/:grupoId/partidas/:data

**What**: Ficha, edição e exclusão da partida.
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/api/src/entrada/rotas/partidas.ts`
**Depends on**: T32
**Reuses**: `rotas/partidas.ts` (T32)
**Requirement**: PAR-44, PAR-45, PAR-46, PAR-47, PAR-48, PAR-49, PAR-50, PAR-51

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `GET` de data sem partida, ou de data inválida no caminho → 404 nas três rotas
- [ ] `PUT` com `data` diferente da do caminho → 422 "A data da partida não pode ser alterada."; válido → 200
- [ ] `DELETE` → 204; auditoria grava as duas ações corretamente
- [ ] Rotas em `test/isolamento/casos.ts`
- [ ] Gate full passa

**Tests**: e2e
**Gate**: full

---

### Phase 8: Rotas admin — prévias, início do grupo e uso

### T34: Transação somente leitura para /previa

**What**: `comBanco` abre `READ ONLY` quando o caminho casa `/previa$`; `exigirGrupoAtivo` lê `arquivado_em` sem `FOR KEY SHARE` nesse caso (o Postgres recusa trava em transação de leitura).
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `backend/api/src/entrada/middlewares/com-banco.ts`
**Depends on**: T33
**Reuses**: `com-banco.ts:14-30`, `grupo-ativo.ts:43`
**Requirement**: AD-017, P12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Requisição a um caminho terminado em `/previa` abre a transação `READ ONLY`; um `INSERT` de prova dentro dela falha (teste dedicado)
- [ ] `exigirGrupoAtivo` continua recusando com 409 `grupo_arquivado` em grupo arquivado, mesmo em `READ ONLY` (P12)
- [ ] Rotas que não terminam em `/previa` continuam com a transação de escrita como antes
- [ ] Gate full passa

**Tests**: integration
**Gate**: full

---

### T35: Rotas de prévia (reativar, período, início)

**What**: `POST …/jogadores/:id/reativar/previa`, `…/periodos/:periodoId/previa`, `…/inicio/previa`.
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/api/src/entrada/rotas/periodos.ts`
**Depends on**: T34
**Reuses**: `rotas/periodos.ts` (rotas de gravação já existentes da `grupos-e-elenco`)
**Requirement**: PAR-109, PAR-110, PAR-111, PAR-112, PAR-122

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Cada prévia aplica a mesma validação da gravação correspondente (422/409/404 idênticos, PAR-112) e nunca grava nada (confirmado por contagem de linhas antes/depois)
- [ ] A gravação real (reativar, corrigir período, data de início) passa a registrar na auditoria o acumulado e a posição antes e depois (PAR-122)
- [ ] Rotas novas em `test/isolamento/casos.ts`
- [ ] Gate full passa

**Tests**: e2e
**Gate**: full

---

### T36: GET /api/grupos/:grupoId ampliado

**What**: A rota existente ganha os campos de PAR-132.
**Estimativa**: 1h
**Risco**: alto
**Where**: `backend/api/src/entrada/rotas/grupos.ts`
**Depends on**: T35
**Reuses**: `rotas/grupos.ts` (rota existente)
**Requirement**: PAR-132

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Resposta inclui `dataSugeridaPartida`, `partidaNaDataSugerida`, `partidasNoMes`, `pesosVigentesDesde`, `pesosPadrao`, `aparelhosNaSemana`
- [ ] Teste existente da rota continua verde com os campos novos
- [ ] Gate full passa

**Tests**: e2e
**Gate**: full

---

### T37: GET /api/grupos/:grupoId/uso

**What**: Painel de uso por semana.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `backend/api/src/entrada/rotas/uso.ts`
**Depends on**: T36
**Reuses**: `eventos.porSemana`, `eventos.aparelhosDaSemana` (T28)
**Requirement**: PAR-155, PAR-156, PAR-157, PAR-158

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Resposta tem `semanas` da mais recente para a mais antiga, só com evento, cada uma com os 5 campos da spec
- [ ] Partida de quinta 20:00 lançada no sábado 19:00 conta em `partidasEm48h`; a de segunda não conta (caso do Independent Test)
- [ ] Rota em `test/isolamento/casos.ts`
- [ ] Gate full passa

**Tests**: e2e
**Gate**: full

---

### Phase 9: Rotas públicas

### T38: Middleware contextoPublico

**What**: Valida o slug (`^[a-z0-9-]{1,64}$`), apaga `contaId` e põe `slugPublico` antes da primeira consulta.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `backend/api/src/entrada/middlewares/contexto-publico.ts`
**Depends on**: T37
**Reuses**: `middlewares/vinculo.ts` (padrão)
**Requirement**: PAR-90, AD-016

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Slug malformado → 404 sem consulta ao banco (teste conta consultas)
- [ ] Sessão de admin de outro grupo, aplicada numa rota `/api/publico/:slug/*`: `contaId` sai do contexto antes da consulta (teste com cookie de admin de outro grupo não vê o ramo da conta)
- [ ] Gate full passa

**Tests**: integration
**Gate**: full

---

### T39: GET /api/publico/:slug/ranking

**What**: Ranking público com navegação de mês.
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/api/src/entrada/rotas/publico.ts`
**Depends on**: T38
**Reuses**: `legado:backend/api/src/aplicacao/publico/*.ts`
**Requirement**: PAR-64, PAR-65, PAR-66, PAR-76, PAR-77, PAR-78, PAR-90

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Resposta sem nenhum dos `CAMPOS_PROIBIDOS_PUBLICO` (teste que varre o JSON, PAR-76); transação `READ ONLY` (PAR-77)
- [ ] Mês malformado, fora do histórico e slug indisponível com as respostas certas (PAR-65, PAR-66, PAR-90); limite de taxa testado (PAR-78)
- [ ] Rota em `test/isolamento/casos.ts` (tipo `publico`, com caso de slug de outro grupo)
- [ ] Gate full passa

**Tests**: e2e
**Gate**: full

---

### T40: GET /api/publico/:slug/pdf

**What**: Projeção para o PDF.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `backend/api/src/entrada/rotas/publico.ts`
**Depends on**: T39
**Reuses**: `rotas/publico.ts` (T39)
**Requirement**: PAR-95, PAR-96, PAR-97, PAR-98, PAR-99, PAR-100, PAR-101

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Resposta com no máximo 12 colunas, sem campo proibido; `urlPublica` montada a partir de `URL_PUBLICA` (sem URL absoluta no código)
- [ ] Mesmas respostas da rota do ranking para mês inválido, fora do histórico, slug indisponível e limite de taxa (PAR-100)
- [ ] Rota em `test/isolamento/casos.ts`
- [ ] Gate full passa

**Tests**: e2e
**Gate**: full

---

### T41: POST /api/publico/:slug/eventos

**What**: Registro de evento anônimo.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `backend/api/src/entrada/rotas/publico.ts`
**Depends on**: T40
**Reuses**: `rotas/publico.ts` (T40)
**Requirement**: PAR-127, PAR-128, PAR-129

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Corpo válido → 204; corpo com mais de 1 KB → 413; tipo ou campo inválido → 422; slug indisponível → 404
- [ ] Nenhuma coluna grava IP, user-agent ou dado de conta (PAR-129)
- [ ] Rota em `test/isolamento/casos.ts`
- [ ] Gate full passa

**Tests**: e2e
**Gate**: full

---

### T42: Isolamento das rotas novas

**What**: Caso dedicado de isolamento para toda rota de admin criada nesta feature e teste de RLS cruzado nas três rotas públicas.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `backend/api/test/isolamento/casos.ts`
**Depends on**: T41
**Reuses**: `test/apoio/cenario-dois-grupos.ts`, `meta.test.ts`
**Requirement**: PAR-137, PAR-138, PAR-139

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Conta admin do grupo A em qualquer rota nova com id do grupo B, ou data de partida só do grupo B → 404, nada lido nem alterado (PAR-138)
- [ ] Slug do grupo A nas três rotas públicas devolve só dados do grupo A, verificado como `pelada_app` com dois grupos (PAR-139)
- [ ] `meta.test.ts` aceita o tipo `publico` e cobre todas as rotas registradas
- [ ] Gate full passa

**Tests**: integration
**Gate**: full

---

### Phase 10: Lint, auditoria e débitos

### T43: Regra ESLint G-25 (acumuladoSoNaPontuacao)

**What**: Copia `acumuladoSoNaPontuacao` do legado; liga em `backend/**` e `frontend/**`.
**Estimativa**: 1h
**Risco**: alto
**Where**: `eslint/plugin-pelada.mjs`
**Depends on**: T42
**Reuses**: `legado:eslint/regras-sintaxe.mjs:93`
**Requirement**: PAR-61

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Arquivo de prova fora de `backend/dominio/src/pontuacao/` que chama `acumuladoAte`, `acumuladoComInicial` ou `pontosDaPresenca` falha o lint
- [ ] `pnpm lint` passa no repositório inteiro depois de ligar a regra
- [ ] Gate build passa

**Tests**: unit
**Gate**: build

---

### T44: Regra ESLint I-1 (sem-escrita-periodo) ligada

**What**: Bloco em `eslint.config.mjs` para `backend/api/src/**`, com `ignores` de `repositorios/jogadores.ts` e `migracoes/**`; confirma zero achados antes de ligar.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `eslint.config.mjs`
**Depends on**: T43
**Reuses**: `eslint/plugin-pelada.mjs:83-126` (`sem-escrita-periodo`)
**Requirement**: PAR-140

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `pnpm lint` roda com a regra ligada e dá zero achados antes de travar (confirmado e registrado)
- [ ] Arquivo de prova com `insertInto('periodos_ativos')` fora de `jogadores.ts` falha o lint
- [ ] G-26 e o débito 5 do THREAT-MODEL atualizados para "ligada" (PAR-140)
- [ ] Gate build passa

**Tests**: unit
**Gate**: build

---

### T45: Reavaliação do débito SEC-010 (deepmerge)

**What**: `pnpm audit --prod`, `pnpm audit` e `pnpm why deepmerge`; atualiza se houver correção, senão mantém e registra.
**Estimativa**: 1h
**Risco**: alto
**Where**: `.md/THREAT-MODEL.md`
**Depends on**: T44
**Reuses**: Nenhum
**Requirement**: PAR-141

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Débito 4 do THREAT-MODEL atualizado com data, saída resumida de `pnpm audit` e decisão
- [ ] `workbox-expiration` (introduzido na Phase 16) conferido quanto ao mesmo advisory
- [ ] Gate build passa

**Tests**: none
**Gate**: build

---

### Phase 11: Web — ranking público

### T46: dados/publico.ts e cliente com X-Pelada

**What**: Hooks TanStack Query para ranking e PDF públicos; `useMesDaUrl`.
**Estimativa**: 1,5h
**Risco**: baixo
**Where**: `frontend/web/src/dados/publico.ts`
**Depends on**: T39, T40
**Reuses**: `dados/cliente.ts`, `legado:frontend/web/src/dados/publico.ts`
**Requirement**: PAR-64, PAR-89

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `useMesDaUrl` lê e escreve `?mes=` sem perder a navegação do navegador (voltar/avançar)
- [ ] Erro de rede ou 4xx tratado e exposto à tela sem lançar exceção não capturada
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T47: Tela do ranking (t01)

**What**: `PaginaRanking`, `TelaRanking`, `TabelaRanking`.
**Estimativa**: 2h
**Risco**: alto
**Where**: `frontend/web/src/telas/ranking/TelaRanking.tsx`
**Depends on**: T46
**Reuses**: `legado:frontend/web/src/telas/ranking/*.tsx`
**Requirement**: PAR-79, PAR-80, PAR-81, PAR-82, PAR-88, PAR-89, PAR-147

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Mostra a tabela com cabeçalhos, ícone de sol/chuva e o texto acessível de cada situação (PAR-80); sem jogador ativo mostra o vazio (PAR-81)
- [ ] Mês sem partida mostra "Nenhuma partida registrada neste mês" com os cabeçalhos trocados (PAR-88); navegação troca `?mes=` e desabilita o botão quando a API devolve nulo (PAR-89)
- [ ] Erro 422 com `campos` mostra "Corrija N campos" (PAR-147)
- [ ] Só tokens de `tokens.css`; `checar-tokens.py` passa
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T48: Tela grupo indisponível (t03)

**What**: `GrupoIndisponivel`.
**Estimativa**: 1h
**Risco**: baixo
**Where**: `frontend/web/src/telas/grupo-indisponivel/GrupoIndisponivel.tsx`
**Depends on**: T47
**Reuses**: `legado:frontend/web/src/telas/grupo-indisponivel/*.tsx`
**Requirement**: PAR-94

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Slug malformado mostra a tela sem chamar a API (PAR-94)
- [ ] 404 da API mostra o mesmo texto "Grupo indisponível"
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### Phase 12: Web — partidas

### T49: dados/partidas.ts e Partidas do mês (t10)

**What**: Hooks de partidas do mês e `PaginaPartidas`.
**Estimativa**: 1,5h
**Risco**: baixo
**Where**: `frontend/web/src/telas/partidas/PaginaPartidas.tsx`
**Depends on**: T31, T48
**Reuses**: `legado:frontend/web/src/telas/partidas/*.tsx`
**Requirement**: PAR-42, PAR-43

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Cada partida mostra "Quinta, 15/10/2026" e as contagens, com "chuva · " quando choveu (PAR-42)
- [ ] Mês sem partidas mostra "Nenhuma partida neste mês." e "Nova partida" (PAR-43)
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T50: Lançar e editar partida (t11)

**What**: `PaginaNovaPartida` e `PaginaEditarPartida` com marcações, busca de jogador e os estados de erro da spec.
**Estimativa**: 2h
**Risco**: alto
**Where**: `frontend/web/src/telas/partida/PaginaNovaPartida.tsx`
**Depends on**: T49
**Reuses**: `legado:frontend/web/src/telas/partida/*.tsx`
**Requirement**: PAR-31, PAR-32, PAR-33, PAR-34, PAR-35, PAR-36, PAR-52, PAR-53, PAR-54

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Troca de data mostra "Carregando os jogadores ativos em dd/mm…" e recarrega a lista (PAR-32); sem ativos mostra o vazio (PAR-33)
- [ ] 409 `partida_ja_existe` mostra o link de edição (PAR-34); falha de rede mantém as marcações com "Tentar de novo" (PAR-35)
- [ ] Edição mostra a data sem campo editável e "Última alteração" (PAR-52); exclusão confirma e trata a falha (PAR-53, PAR-54)
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### Phase 13: Web — pontuação, uso e prévias

### T51: dados/pesos.ts e Pontuação (t18)

**What**: Hooks de pesos e `PaginaPontuacao`.
**Estimativa**: 1,5h
**Risco**: baixo
**Where**: `frontend/web/src/telas/pontuacao/PaginaPontuacao.tsx`
**Depends on**: T30, T50
**Reuses**: `legado:frontend/web/src/telas/pontuacao/*.tsx`
**Requirement**: PAR-10, PAR-11, PAR-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Mostra "Vigente desde dd/mm/aaaa", a tabela, o formulário e o histórico com a linha por configuração anterior (PAR-10)
- [ ] Salvar mostra "Nova configuração vale a partir de hoje." (PAR-11); campo inválido mostra a mensagem ao lado sem enviar (PAR-12)
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T52: dados/eventos.ts e Uso do app (t21)

**What**: Hook de uso por semana e `PaginaUso`.
**Estimativa**: 1,5h
**Risco**: baixo
**Where**: `frontend/web/src/telas/uso/PaginaUso.tsx`
**Depends on**: T37, T51
**Reuses**: `legado:frontend/web/src/telas/uso/*.tsx`
**Requirement**: PAR-144

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Tabela com "Semana", "Aparelhos que abriram o ranking", "PDFs exportados", "Partidas lançadas (em até 48 h)" e "Escalações / partidas" (PAR-144)
- [ ] Sem semanas mostra "Ainda não há uso registrado."
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T53: Prévias nas telas de período (t16)

**What**: `PreviaPeriodos` nos diálogos de reativar, corrigir e início (`PeriodosJogador.tsx`, `CorrigirDatas.tsx`); "Calculando…" e "Confirmar" desabilitado até a prévia; texto novo do reativar (P6).
**Estimativa**: 2h
**Risco**: alto
**Where**: `frontend/web/src/telas/jogador/PeriodosJogador.tsx`
**Depends on**: T35, T52
**Reuses**: `legado:frontend/web/src/telas/jogador/PreviaPeriodos.tsx`
**Requirement**: PAR-109, PAR-112, PAR-117, PAR-118, PAR-119, PAR-120, PAR-121, PAR-159

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Diálogo de reativar mostra "Volta a aparecer no ranking e nas partidas; a data de início não muda." e nunca "os pontos não mudam" (PAR-159)
- [ ] Mostra acumulado, posição e rodadas conforme PAR-117 a PAR-119, com "Confirmar" desabilitado durante o cálculo (PAR-120)
- [ ] `PeriodosJogador.test.tsx:136` atualizado com o motivo no teste e no commit (aprovado em `context.md`, P6)
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### Phase 14: Web — início do grupo e navegação

### T54: Início do grupo (t09)

**What**: `InicioDoGrupo.tsx`: Dia de jogo, Partidas, Pontuação ("Pesos padrão"/"Vigente desde"), Uso do app; omite Simulador e Financeiro.
**Estimativa**: 2h
**Risco**: alto
**Where**: `frontend/web/src/telas/grupo/InicioDoGrupo.tsx`
**Depends on**: T36, T53
**Reuses**: `telas/grupo/InicioDoGrupo.tsx` (tela existente da `grupos-e-elenco`)
**Requirement**: PAR-133, PAR-134, PAR-135, PAR-136, PAR-160

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] "Lançar partida de <dia>, dd/mm" ou "Editar partida de <dia>, dd/mm" conforme exista partida na data sugerida (PAR-133)
- [ ] Itens Partidas, Pontuação e Uso do app com os textos da spec (PAR-134 a PAR-136); Simulador e Financeiro não renderizados (PAR-160)
- [ ] `SPEC_DEVIATION` do cabeçalho do arquivo retirado
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T55: Rotas novas e atalho Financeiro oculto na t01

**What**: Rotas em `app/rotas.tsx` (`/g/:slug`, `…/partidas`, `…/partidas/nova`, `…/partidas/:data`, `…/pontuacao`, `…/uso`); cabeçalho do ranking sem o atalho Financeiro.
**Estimativa**: 1,5h
**Risco**: baixo
**Where**: `frontend/web/src/app/rotas.tsx`
**Depends on**: T54
**Reuses**: `app/rotas.tsx` (rotas existentes)
**Requirement**: PAR-83, PAR-143, PAR-161

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `/g/:slug` fica fora de `RotaProtegida`; as demais sob `/app/grupos/:grupoId/...` (PAR-143)
- [ ] "Ver ranking" do início abre `/g/:slug` do grupo (PAR-83)
- [ ] Cabeçalho do ranking sem o atalho Financeiro (PAR-161)
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T56: Identificador anônimo e envio de eventos de uso

**What**: UUID v4 no `localStorage` (`pwa/armazenamento/armazenamento-local.ts`); envio de `ranking_aberto` (uma vez por carregamento e por slug) e `pdf_exportado`.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `frontend/web/src/pwa/armazenamento/armazenamento-local.ts`
**Depends on**: T41, T55
**Reuses**: `legado:frontend/web/src/pwa/armazenamento/armazenamento-local.ts`
**Requirement**: PAR-123, PAR-124, PAR-125, PAR-126

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Primeira abertura gera e guarda o UUID; aberturas seguintes reutilizam (PAR-123)
- [ ] `ranking_aberto` enviado no máximo uma vez por slug a cada carregamento, sem repetir ao trocar de mês (PAR-124)
- [ ] Falha no envio é ignorada, sem mensagem nem nova tentativa (PAR-126)
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### Phase 15: PDF no navegador

### T57: Auditoria e fixação do jspdf

**What**: `pnpm audit` e consulta ao GitHub Advisory do `jspdf`; fixa a última versão 4.x sem aviso aberto.
**Estimativa**: 1h
**Risco**: alto
**Where**: `frontend/web/package.json`
**Depends on**: T56
**Reuses**: Nenhum
**Requirement**: PAR-102

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Versão fixada registrada no `tasks.md` (esta linha) com a saída resumida do `pnpm audit` e do Advisory consultado
- [ ] `pnpm-lock.yaml` atualizado; `pnpm install` sem erro
- [ ] Gate build passa

**Tests**: none
**Gate**: build

---

### T58: Geração do PDF (gerarPdf, folha, ajuste de fonte)

**What**: `gerarPdf(projecao): Promise<Blob>` com `import('jspdf')` sob demanda; fonte de 8,5 a 7 pt.
**Estimativa**: 2h
**Risco**: alto
**Where**: `frontend/web/src/pdf/gerar-pdf.ts`
**Depends on**: T57
**Reuses**: `legado:frontend/web/src/pdf/*.ts`
**Requirement**: PAR-102, PAR-103, PAR-104

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `jspdf` só é importado no toque de "Exportar PDF" ou no pré-carregamento ocioso (PAR-102)
- [ ] 1 página A4 retrato para até 40 jogadores e 12 colunas, fonte mínima 7 pt (PAR-103); nome do grupo, título, "Gerado em", ícones e legenda sem depender de cor (PAR-104)
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T59: Entrega do PDF (diálogo, Web Share, download)

**What**: `entregar(blob, nome)`: `navigator.canShare` → diálogo "PDF pronto."; sem suporte, baixa o arquivo.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `frontend/web/src/telas/ranking/usarExportarPdf.ts`
**Depends on**: T58
**Reuses**: `legado:frontend/web/src/telas/ranking/{usarExportarPdf,DialogoPdfPronto}.tsx`
**Requirement**: PAR-105, PAR-106, PAR-107, PAR-125

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Recusa do compartilhamento volta ao diálogo "PDF pronto." (PAR-105); sem suporte, baixa `ranking-<slug>-<AAAA-MM>.pdf` (PAR-106)
- [ ] Falha na projeção ou geração mostra "Não foi possível gerar o PDF." com "Tentar de novo" (PAR-107)
- [ ] PDF entregue envia o evento `pdf_exportado` com o mês (PAR-125)
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### Phase 16: Service worker e sem conexão

### T60: Estratégia de cache do ranking público no sw.ts

**What**: `ehRankingPublico(url, origem)`; `registerRoute` com `NetworkFirst` só para `GET /api/publico/:slug/ranking`.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `frontend/web/src/sw.ts`
**Depends on**: T59
**Reuses**: `legado:frontend/web/src/sw.ts` (trecho de ranking), `pwa/regras-sw.ts`
**Requirement**: PAR-153

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `ehRankingPublico` casa só a rota do ranking público, mesma origem; nenhuma outra rota de `/api` é registrada (PDF e eventos sempre na rede, PAR-153)
- [ ] Resposta do cache leva `X-Pelada-Cache`
- [ ] Dependências `workbox-cacheable-response` e `workbox-expiration` instaladas (`^7.4.1`)
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T61: Guardado local do ranking e validação

**What**: Guarda a resposta por slug e mês (e a do mês atual); a tela valida com o contrato antes de usar e descarta o inválido.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `frontend/web/src/pwa/armazenamento/armazenamento-local.ts`
**Depends on**: T60
**Reuses**: `armazenamento-local.ts` (T56)
**Requirement**: PAR-148, PAR-154

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Ranking público guardado por slug e mês, com `geradoEm` (PAR-148)
- [ ] Guardado inválido (schema não casa) é descartado antes de mostrar (PAR-154)
- [ ] O aparelho guarda só slug, identificador anônimo, projeção pública e marca do aviso de instalação — nunca sessão ou dado de admin
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T62: Telas de sem conexão

**What**: `FaixaSemConexao`, `SemConexao`; engrenagem de admin recusa sem rede.
**Estimativa**: 2h
**Risco**: alto
**Where**: `frontend/web/src/telas/ranking/FaixaSemConexao.tsx`
**Depends on**: T61
**Reuses**: `legado:frontend/web/src/telas/ranking/{FaixaSemConexao,SemConexao}.tsx`, `e2e/ranking-offline.spec.ts`
**Requirement**: PAR-149, PAR-150, PAR-151, PAR-152

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Sem conexão com guardado: faixa "Sem conexão, atualizado em dd/mm hh:mm" (PAR-149); sem nada guardado: "Sem conexão" com "Tentar de novo" (PAR-151)
- [ ] Tentativa de entrar como admin sem rede: "É preciso conexão para entrar." (PAR-150)
- [ ] Rede voltando: "atualizando…" e troca pelos dados novos (PAR-152)
- [ ] `e2e/ranking-offline.spec.ts` verde: abre online, corta a rede, recarrega, confirma a faixa
- [ ] Gate full passa

**Tests**: e2e
**Gate**: full

---

### Phase 17: Integração final

### T63: seed-local.ts com partidas de exemplo

**What**: `seed-local.ts` chama `grupo_criar` de 7 parâmetros com a data e grava partidas e presenças do exemplo da t01.
**Estimativa**: 1h
**Risco**: baixo
**Where**: `backend/scripts/seed-local.ts`
**Depends on**: T29, T62
**Reuses**: `seed-local.ts` (script existente)
**Requirement**: PAR-62 (Independent Test da P1: Ranking público)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `pnpm seed` cria a Pelada de Quinta com partidas em outubro, igual ao exemplo da t01 do mockup
- [ ] Gate build passa

**Tests**: none
**Gate**: build

---

### T64: Mockup promovido e telas.json atualizado

**What**: Entradas `real` para t01, t03, t09 `sem-jogadores`, t10, t11, t18, t21 nas rotas novas; `ocultar` do atalho Financeiro; `revisaoManual` dos estados de PDF, sem conexão, instalar e as prévias da t16.
**Estimativa**: 1,5h
**Risco**: baixo
**Where**: `.specs/mockup/telas.json`
**Depends on**: T63
**Reuses**: `.specs/features/partidas-e-ranking/mockup/` (aprovado na fase 7)
**Requirement**: PAR-146

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `telas.json` com as entradas `real`, `ocultar` e `revisaoManual` descritas no design (seção "Mockup do módulo")
- [ ] `telas-ativas.txt` com os nomes das telas da comparação
- [ ] Gate build passa

**Tests**: none
**Gate**: build

---

### T65: Comparação visual completa (web e PDF)

**What**: `pnpm --filter @pelada/web visual` e `e2e/pdf-visual.spec.ts` sem divergência.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `frontend/web/e2e/pdf-visual.spec.ts`
**Depends on**: T64
**Reuses**: `visual.mjs`
**Requirement**: PAR-108, PAR-146

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `pnpm --filter @pelada/web visual` sem divergência nas telas de PAR-146
- [ ] `pdf-visual.spec.ts` dentro de 4,5% local e 9% no CI para `sucesso` e `mes-vazio` (PAR-108)
- [ ] Gate build passa

**Tests**: e2e
**Gate**: build

---

### T66: Checagem final da suíte

**What**: Com tudo commitado, roda `python .claude/scripts/trava-testes.py --rodar` e mostra o resultado.
**Estimativa**: 30 min
**Risco**: baixo
**Where**: `.specs/projeto/testes.json`
**Depends on**: T65
**Reuses**: `trava-testes.py`
**Requirement**: Critério de pronto da feature (CLAUDE.md, seção "Gate de testes")

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `trava-testes.py --rodar` verde: lint, format, typecheck, `pnpm test`, `pnpm test:checagens`, build do web, e2e e visual
- [ ] Nenhum teste apagado, pulado ou enfraquecido desde o início da feature
- [ ] Gate build passa

**Tests**: none
**Gate**: build

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 a T10 | 1 arquivo de domínio cada | ✅ Granular |
| T11 a T15 | 1 arquivo de contrato cada | ✅ Granular |
| T16 a T21 | 1 migration cada | ✅ Granular |
| T22 a T29 | 1 arquivo de repositório cada (função ou grupo cohesivo de funções do mesmo arquivo) | ✅ Granular |
| T30 a T42 | 1 arquivo de rota ou de isolamento cada | ✅ Granular |
| T43 a T45 | 1 arquivo de configuração/débito cada | ✅ Granular |
| T46 a T62 | 1 tela ou 1 arquivo de dados/pdf/sw cada | ✅ Granular |
| T63 a T66 | 1 script ou checagem final cada | ✅ Granular |

Nenhuma tarefa cobre mais de um componente do design; nenhuma mistura domínio, banco e rota.

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ----------------------- | -------------- | ------ |
| T1 | None | — (início da Phase 1) | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T1 | T1 → T5 (segunda linha do diagrama da Phase 1) | ✅ Match |
| T6 | T4, T5 | início da Phase 2 (cross-phase, sem seta exigida) | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | T6 | T6 → T8 (segunda linha do diagrama da Phase 2) | ✅ Match |
| T9 | T7, T8 | T7 → T9 e T8 → T9 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T11–T15 | sequencial | T11 → T12 → T13 → T14 → T15 | ✅ Match |
| T16–T21 | sequencial | T16 → T17 → T18 → T19 → T20 → T21 | ✅ Match |
| T22–T24 | sequencial | T22 → T23 → T24 | ✅ Match |
| T25–T29 | sequencial | T25 → T26 → T27 → T28 → T29 | ✅ Match |
| T30–T33 | sequencial | T30 → T31 → T32 → T33 | ✅ Match |
| T34–T37 | sequencial | T34 → T35 → T36 → T37 | ✅ Match |
| T38–T42 | sequencial | T38 → T39 → T40 → T41 → T42 | ✅ Match |
| T43–T45 | sequencial | T43 → T44 → T45 | ✅ Match |
| T46–T48 | sequencial | T46 → T47 → T48 | ✅ Match |
| T49–T50 | sequencial | T49 → T50 | ✅ Match |
| T51–T53 | sequencial | T51 → T52 → T53 | ✅ Match |
| T54–T56 | sequencial | T54 → T55 → T56 | ✅ Match |
| T57–T59 | sequencial | T57 → T58 → T59 | ✅ Match |
| T60–T62 | sequencial | T60 → T61 → T62 | ✅ Match |
| T63–T66 | sequencial | T63 → T64 → T65 → T66 | ✅ Match |

**Nota sobre dependências intraphase fora da cadeia linear** (T5 depende de T1; T8 depende de T6; dentro da mesma phase, mas não do elo imediatamente anterior): o diagrama desta lista desenha a cadeia de execução (ordem em que as tarefas rodam), não o grafo completo de dependências — toda tarefa de uma phase sempre pode depender de qualquer tarefa anterior da mesma phase, porque elas rodam em sequência. Não há dependência cruzando para uma phase posterior em nenhum caso (regra obrigatória, conferida pelo `validate_tasks.py`).

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | ---------------------------- | ---------------- | ---------- | ------ |
| T1–T10 | Domínio | unit | unit | ✅ OK |
| T11–T15 | Contrato | unit | unit | ✅ OK |
| T16–T21 | Banco (migrations, funções, RLS, grants) | integration | integration | ✅ OK |
| T22–T29 | Repositórios da API | integration | integration | ✅ OK |
| T30–T33, T35–T37, T39–T41 | Rotas e middlewares da API | e2e | e2e | ✅ OK |
| T34, T38, T42 | Banco/middleware (transação, contexto, RLS cruzada) | integration | integration | ✅ OK |
| T43, T44 | Scripts e checagens (lint) | unit | unit | ✅ OK |
| T45 | Configuração/débito (sem código de produção) | none | none | ✅ OK |
| T46, T49, T51, T52 | Front: dados | unit | unit | ✅ OK |
| T47, T48, T50, T53, T54, T55, T56 | Front: telas | unit | unit | ✅ OK |
| T57 | Configuração (dependência) | none | none | ✅ OK |
| T58, T59 | Front: PDF no navegador | unit | unit | ✅ OK |
| T60, T61 | Front: service worker | unit | unit | ✅ OK |
| T62, T65 | Front: fluxo, comparação visual e PDF visual | e2e | e2e | ✅ OK |
| T63, T64, T66 | Tipos, configuração e seed | none | none | ✅ OK |

Nenhuma tarefa usa `Tests: none` fora da linha "Tipos, configuração e seed" da matriz, e nenhuma adia teste para outra tarefa.
