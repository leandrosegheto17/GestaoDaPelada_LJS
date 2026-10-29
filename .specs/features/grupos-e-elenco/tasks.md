# Grupos e elenco — Tarefas

## Protocolo de Execução (OBRIGATÓRIO — não pular)

Implemente estas tarefas com a skill `tlc-spec-driven`: **acione-a pelo nome e siga o fluxo de Execute e as Critical Rules.** Não procure arquivos da skill por caminho. A skill é a fonte da verdade do fluxo completo (ciclo por tarefa, delegação a subagentes, revisão de adequação, Verificador, sensor de discriminação).

**Se a skill não puder ser acionada, PARE e avise o usuário. Não prossiga sem ela.**

---

**Design**: `.specs/features/grupos-e-elenco/design.md` (mockup aprovado em `mockup/`)
**Spec**: `.specs/features/grupos-e-elenco/spec.md` (decisões C1 a C10 em `context.md`)
**Status**: Approved (usuário, 2026-10-29; execução por subagentes, um lote por vez; ferramentas como estão)

> Premissas desta lista:
> - Caminhos `legado:` são relativos a `C:\Leandro\Projetos\GestaoDaPelada`, somente leitura (AD-002). Teste copiado do legado só entra ligado a um `GEL-NN`.
> - **Cada migration desta feature é um arquivo novo** (T17, T18 e T20), aditivo (G-14), em vez da migration única do design: o banco local de quem já migrou não pode ter migration editada. Nenhuma migration já aplicada é editada.
> - Toda rota nova entra em `backend/api/test/isolamento/casos.ts` (G-04) na mesma tarefa que a cria; o meta-teste fica verde ao fim de cada tarefa de rota.
> - O banco local (`docker compose up -d`, `pnpm migrar`) precisa estar de pé para os gates full e build.
> - Os contratos de período e de habilidade ficam em `periodos.ts` e `habilidades.ts` do contrato (o design previa tudo em `elenco.ts`): arquivos menores, mesma forma.
> - Ações externas (push, PR, deploy, banco de produção) ficam fora destas tarefas e pedem confirmação específica na fase 11.

---

## Test Coverage Matrix

> Gerada a partir da matriz da `conta-e-acesso` (`.specs/features/conta-e-acesso/tasks.md`), do `package.json` da raiz, dos testes existentes (`backend/api/test/{rotas,isolamento,migracoes,repositorios}`, `backend/dominio/test`, `backend/contrato/test`, `frontend/web/src/**/*.test.tsx`) e da spec. Guias encontrados: `.md/GUARDRAILS.md` (regra → teste), `CLAUDE.md` da raiz (gate de testes); nenhum limiar de cobertura. Padrão forte aplicado: todo critério GEL e todo caso limite tem teste.

| Camada | Tipo de teste exigido | Expectativa de cobertura | Padrão de local | Comando |
| ------ | --------------------- | ------------------------ | --------------- | ------- |
| Domínio (`backend/dominio`) | unit | Todas as ramificações; um teste por regra e por mensagem (GEL-11 a GEL-13, GEL-36, GEL-47, GEL-48, GEL-58 a GEL-70, GEL-72, GEL-73, GEL-78 a GEL-81, GEL-101, GEL-102) | `backend/dominio/test/**/*.test.ts` | `pnpm --filter @pelada/dominio test` |
| Contrato (`backend/contrato`) | unit | Cada schema: aceita o válido, recusa cada limite e campo extra (`strictObject`); snapshot de compatibilidade | `backend/contrato/test/**/*.test.ts` | `pnpm --filter @pelada/contrato test` |
| Banco: migrations, funções, RLS, grants | integration (Postgres real, como `pelada_app`) | Cada função e cada grant: todos os ramos; isolamento com duas contas e grupo arquivado; concorrência de slug e de período | `backend/api/test/{migracoes,isolamento}/**/*.test.ts` | `pnpm --filter @pelada/api test` |
| Repositórios da API | integration | Caminhos de cada função, erro, auditoria na mesma transação e traduções de 23505 | `backend/api/test/repositorios/**/*.test.ts` | `pnpm --filter @pelada/api test` |
| Rotas e middlewares da API | e2e no pool workerd | Toda rota da tabela do C6: caminho feliz, cada código de erro da spec, 401, 404 cruzado e 409 de grupo arquivado | `backend/api/test/rotas/**/*.test.ts` | `pnpm --filter @pelada/api test` |
| Scripts e checagens (`backend/scripts`) | unit com fixtures | A checagem falha numa fixture que viola e passa no repositório | `backend/scripts/checagens/test/*.test.mjs` | `pnpm test:checagens` |
| Front: dados e telas | unit (jsdom + Testing Library + axe) | Cada tela: estados do mockup, mensagens da spec e axe sem violação | `frontend/web/src/**/*.test.{ts,tsx}` | `pnpm --filter @pelada/web test` |
| Front: fluxo e comparação visual | e2e (Playwright, build + Worker local) e visual (limite de 1%) | O "Independent Test" de criar grupo e jogador; toda tela do módulo em PC e celular | `frontend/web/e2e/*.spec.ts`, `visual.mjs` | `pnpm --filter @pelada/web e2e` e `visual` |
| Tipos, relógio copiado e configuração | none (gate de build) | — | — | gate de build |

## Gate Check Commands

> Os mesmos da fundação, confirmados no `package.json` da raiz e no `.specs/projeto/testes.json`.

| Nível do gate | Quando usar | Comando |
| ------------- | ----------- | ------- |
| Quick | Tarefas só com testes unitários, no pacote tocado | `pnpm --filter <pacote> test` |
| Full | Tarefas com integration ou e2e. Exige o banco local de pé e `DATABASE_URL_TESTE` | `pnpm test && pnpm test:checagens` |
| Build | Fim de fase, config e tarefas de e2e do web | `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:checagens && pnpm --filter @pelada/web build && pnpm --filter @pelada/web e2e && pnpm --filter @pelada/web visual` |

---

## Execution Plan

As fases rodam em sequência; dentro da fase, as tarefas rodam em ordem.

### Phase 1: Domínio: slug e elenco

Regras puras do grupo e do jogador. Sem relógio, sem I/O.

```
T1 → T2 → T3 → T4 → T5
```

### Phase 2: Domínio: períodos de atividade

Regras (a) a (h) do legado, em funções puras que recebem `hoje`.

```
T6 → T7 → T8 → T9 → T10 → T11
```

### Phase 3: Contrato

Formas e limites compartilhados entre API e web (AD-009).

```
T12 → T13 → T14 → T15 → T16
```

### Phase 4: Banco: migrations da feature

Três migrations aditivas e novas (G-14); nenhuma já aplicada é editada. Banco local de pé.

```
T17 → T18 → T19 → T20
```

### Phase 5: Base da API

Relógio, tipos, sessão e proteção do grupo arquivado.

```
T21 → T22 → T23 → T24 → T25 → T26
```

### Phase 6: API de grupos

Repositório e rotas do grupo. Cada rota entra em `test/isolamento/casos.ts` na tarefa que a cria (G-04, GEL-106).

```
T27 → T28 → T29 → T30 → T31 → T32
```

### Phase 7: API de jogadores

Cadastro, lista, edição e exclusão.

```
T33 → T34 → T35 → T36 → T37
```

### Phase 8: API de períodos

Toda escrita de período em transação, com o jogador travado (GEL-109).

```
T38 → T39 → T40 → T41 → T42 → T43 → T44 → T45
```

### Phase 9: API de habilidades, notas e transversais

Habilidades do grupo, notas, auditoria, ids cruzados e seed.

```
T46 → T47 → T48 → T49 → T50 → T51 → T52
```

### Phase 10: Front: dados e telas do grupo

Telas t08, t27, t09 e t20 seguem `.specs/features/grupos-e-elenco/mockup/` e usam só tokens.

```
T53 → T54 → T55 → T56 → T57 → T58 → T59 → T60
```

### Phase 11: Front: elenco e habilidades

Telas t15, t16 e t17.

```
T61 → T62 → T63 → T64 → T65 → T66 → T67
```

### Phase 12: Front: rotas, comparação visual e fluxo

Ligação das telas, comparação com o mockup e o teste de ponta a ponta.

```
T68 → T69 → T70
```

---

## Task Breakdown

### Phase 1: Domínio: slug e elenco

### T1: Base do slug

**What**: `slugBase(nome)` pura: decompõe acentos, minúsculas, hífens, corte em 40, mínimo `grupo`, reservadas `-grupo`.
**Estimativa**: 1h
**Risco**: alto
**Where**: `backend/dominio/src/grupos/slug.ts`
**Depends on**: None
**Reuses**: `legado:backend/dominio/src/grupos/slug.ts` e testes (sem `gerarSlug`: o sufixo é do banco)
**Requirement**: GEL-11, GEL-12, GEL-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] "Pelada de Quinta" → `pelada-de-quinta`; "!!!" e "AB" → `grupo`; "Admin" → `admin-grupo`; as 9 reservadas testadas
- [x] Corte em 40 caracteres sem hífen final; acento, cedilha e emoji removidos
- [x] `slugBase` exportada de `@pelada/dominio`
- [x] Gate quick passa: `pnpm --filter @pelada/dominio test`; testes ligados a GEL-11 a GEL-13 (AD-002)

**Tests**: unit
**Gate**: quick

---

### T2: Apelido: ordenação e busca

**What**: `compararApelido(a, b)` e `chaveBusca(texto)`: sem acento e sem caixa, para ordenar a lista e buscar.
**Estimativa**: 45 min
**Risco**: alto
**Where**: `backend/dominio/src/elenco/apelido.ts`
**Depends on**: T1
**Reuses**: `legado:backend/dominio/src/elenco/apelido.ts`
**Requirement**: GEL-47, GEL-48

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] "José" e "jose" têm a mesma `chaveBusca`; a ordenação põe "Álvaro" antes de "Beto"
- [x] `chaveBusca("")` não quebra e devolve vazio
- [x] Exportadas de `@pelada/dominio`
- [x] Gate quick passa: `pnpm --filter @pelada/dominio test`

**Tests**: unit
**Gate**: quick

---

### T3: Nível a partir das notas

**What**: `calcularNivel(notas)`: média × 100 com meio para cima; sem nota, 550 e `semNota`.
**Estimativa**: 1h
**Risco**: alto
**Where**: `backend/dominio/src/elenco/nivel.ts`
**Depends on**: T2
**Reuses**: `legado:backend/dominio/src/elenco/nivel.ts`
**Requirement**: GEL-101, GEL-102, GEL-104

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] 8, 7, 6, 7, 8, 5 → 683; sem nota → `{ nivel: 550, semNota: true }`
- [x] Meio para cima: média 6,845 → 685 (caso de arredondamento testado)
- [x] Uma única nota (10 → 1000) e todas iguais
- [x] Gate quick passa: `pnpm --filter @pelada/dominio test`

**Tests**: unit
**Gate**: quick

---

### T4: Habilidades iniciais

**What**: `HABILIDADES_INICIAIS` na ordem da spec.
**Estimativa**: 30 min
**Risco**: baixo
**Where**: `backend/dominio/src/elenco/habilidades-iniciais.ts`
**Depends on**: T3
**Reuses**: `legado:backend/dominio/src/elenco/habilidades-iniciais.ts`
**Requirement**: GEL-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Lista exata: Visão de Jogo, Passe, Preparo Físico, Drible, Chute, Desarme, nessa ordem
- [x] Exportada de `@pelada/dominio`
- [x] Gate quick passa: `pnpm --filter @pelada/dominio test`

**Tests**: unit
**Gate**: quick

---

### T5: Limite do ano de nascimento

**What**: `anoNascimentoMaximo(hoje)`: ano de hoje − 10, para a fábrica do contrato.
**Estimativa**: 30 min
**Risco**: alto
**Where**: `backend/dominio/src/elenco/idade.ts`
**Depends on**: T4
**Reuses**: `legado:backend/dominio/src/elenco/idade.ts`
**Requirement**: GEL-36

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `2026-10-29` → 2016; `2027-01-01` → 2017 (o limite acompanha a virada do ano)
- [x] Data inválida é recusada com erro claro
- [x] Exportada de `@pelada/dominio`
- [x] Gate quick passa: `pnpm --filter @pelada/dominio test`

**Tests**: unit
**Gate**: quick

---

### Phase 2: Domínio: períodos de atividade

### T6: Tipos e intervalo [início, fim)

**What**: Tipos `Periodo` e `PeriodoEntrada`, `formatarData(iso)` (dd/mm/aaaa) e a comparação de intervalos semiabertos.
**Estimativa**: 1h
**Risco**: alto
**Where**: `backend/dominio/src/atividade/atividade.ts`
**Depends on**: T5
**Reuses**: `legado:backend/dominio/src/atividade/atividade.ts`
**Requirement**: GEL-61

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Sair e voltar no mesmo dia não sobrepõe: [01/10, 05/10) e [05/10, ∞)
- [x] Períodos que se tocam por um dia sobrepõem
- [x] `formatarData("2026-10-05")` → `05/10/2026`
- [x] Gate quick passa: `pnpm --filter @pelada/dominio test`

**Tests**: unit
**Gate**: quick

---

### T7: Validação de datas e ordem

**What**: `validarPeriodos`: data real, não futura, saída depois do início, retorno depois da saída anterior, saída antes do próximo retorno e sobreposição, com as mensagens do legado.
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/dominio/src/atividade/validar-periodos.ts`
**Depends on**: T6
**Reuses**: `legado:backend/dominio/src/atividade/validar-periodos.ts`
**Requirement**: GEL-63, GEL-64, GEL-65, GEL-66, GEL-67

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Uma asserção por mensagem: "Informe uma data válida.", "A data não pode ser no futuro.", as quatro de ordem com a data em dd/mm/aaaa, "Os períodos não podem se sobrepor."
- [x] `2026-02-30` e `2026-13-01` são datas inválidas; 29/02 em ano bissexto é válido
- [x] Devolve só a primeira falha, na ordem do GEL-62
- [x] Gate quick passa: `pnpm --filter @pelada/dominio test`

**Tests**: unit
**Gate**: quick

---

### T8: Presença que sai do período

**What**: `coberturaRetirada`: acha presenças (presente, lesionado, expulso) que estavam dentro de um período e ficariam fora, e calcula a data mínima ou máxima.
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/dominio/src/atividade/cobertura-periodos.ts`
**Depends on**: T7
**Reuses**: `legado:backend/dominio/src/atividade/cobertura-periodos.ts`
**Requirement**: GEL-68

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Presença em 01/10 e saída proposta em 30/09 → falha com data mínima 02/10 (dia seguinte à última presença retirada)
- [x] Retorno depois da primeira presença → falha com data máxima igual ao dia dela
- [x] Presença que já estava fora de período não bloqueia; situação ausente não conta
- [x] Gate quick passa: `pnpm --filter @pelada/dominio test`

**Tests**: unit
**Gate**: quick

---

### T9: Avaliação de inativar, reativar e corrigir

**What**: `avaliarPeriodos(entrada, hoje)`: aplica as regras na ordem do GEL-62 (data, campo corrigível, futuro, ordem, sobreposição, presença, início da pontuação) para inativar, reativar e corrigir.
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/dominio/src/atividade/avaliar-periodos.ts`
**Depends on**: T8
**Reuses**: `legado:backend/dominio/src/atividade/avaliar-periodos.ts`, `periodos-corrigiveis.ts`
**Requirement**: GEL-58, GEL-62, GEL-69, GEL-70, GEL-72, GEL-73

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Corrigir saída de período aberto → "Este período não tem data de saída."; corrigir o início do primeiro → mensagem do GEL-73
- [x] Saída do primeiro período antes do início da pontuação → mensagem do GEL-69
- [x] Com duas falhas ao mesmo tempo, vence a primeira na ordem do GEL-62 (teste dedicado)
- [x] A função não lê relógio: `hoje` entra por parâmetro; `pnpm lint` confirma a regra `DOMINIO_PROIBIDAS`
- [x] Gate quick passa: `pnpm --filter @pelada/dominio test`

**Tests**: unit
**Gate**: quick

---

### T10: Avaliação da data de início

**What**: `avaliarInicio(entrada, hoje)`: piso de 01/01/2000, não futuro, não depois da saída do primeiro período; devolve se o primeiro período recua.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `backend/dominio/src/atividade/alterar-inicio.ts`
**Depends on**: T9
**Reuses**: Regras da `alterar-data-inicio` do legado (`legado:backend/dominio/src/atividade/`)
**Requirement**: GEL-78, GEL-79, GEL-80, GEL-81

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] 31/12/1999 → "A data de início não pode ser anterior a 01/01/2000."; 01/01/2000 passa
- [x] Data depois da saída do primeiro período → mensagem do GEL-80 com a data da saída
- [x] Data anterior ao início do primeiro período → `recuarPrimeiroPeriodo: true`; períodos encerrados não mudam
- [x] Gate quick passa: `pnpm --filter @pelada/dominio test`

**Tests**: unit
**Gate**: quick

---

### T11: Exportar o domínio

**What**: Exporta de `backend/dominio/src/index.ts` tudo que as tarefas T1 a T10 criaram e confere a API pública.
**Estimativa**: 30 min
**Risco**: baixo
**Where**: `backend/dominio/src/index.ts`
**Depends on**: T10
**Reuses**: `backend/dominio/test/pacote.test.ts`
**Requirement**: GEL-70, GEL-104

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Teste de pacote lista as exportações novas (`slugBase`, `compararApelido`, `chaveBusca`, `calcularNivel`, `HABILIDADES_INICIAIS`, `anoNascimentoMaximo`, `avaliarPeriodos`, `avaliarInicio`, `formatarData`)
- [x] `pnpm lint` passa: nenhum arquivo do domínio importa I/O, relógio ou zod
- [x] Gate quick passa: `pnpm --filter @pelada/dominio test`

**Tests**: unit
**Gate**: quick

---

### Phase 3: Contrato

### T12: Contrato do grupo

**What**: `dadosGrupo`, `criarGrupoCorpo`, `editarGrupoCorpo` (strict, recusam `slug` e `urlPublica`), `arquivarCorpo`, `grupoDetalhe` e `gruposResposta`.
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/contrato/src/grupo.ts`
**Depends on**: T11
**Reuses**: `legado:backend/contrato/src/grupo.ts`; `DIAS_DA_SEMANA` e `LIMITES` de `backend/contrato/src/`
**Requirement**: GEL-03, GEL-04, GEL-05, GEL-06, GEL-07, GEL-19, GEL-23

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Nome de 2 e 61 caracteres recusado com "O nome precisa ter de 3 a 60 caracteres."; espaços das pontas não contam
- [x] Dia, frequência e horário inválidos recusados no campo certo; "Informe o horário." (ausente) e "Horário inválido." (fora de HH:MM, inclusive 24:00 e 12:60)
- [x] Corpo com `slug` ou `urlPublica` é recusado (strict)
- [x] `arquivarCorpo` exige `nomeConfirmacao` string; o texto da divergência (GEL-23) fica na rota
- [x] Gate quick passa: `pnpm --filter @pelada/contrato test`

**Tests**: unit
**Gate**: quick

---

### T13: Contrato do jogador

**What**: `jogadorCorpo(hoje)` e `editarJogadorCorpo(hoje)`, `jogadorItem` e `jogadorDetalhe`.
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/contrato/src/elenco.ts`
**Depends on**: T12
**Reuses**: `legado:backend/contrato/src/elenco.ts`; fábrica por `hoje` (`elenco.ts:111-122` do legado)
**Requirement**: GEL-34, GEL-36, GEL-37, GEL-38, GEL-39, GEL-40, GEL-43

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Apelido de 1 e 31 caracteres recusado com "O apelido precisa ter de 2 a 30 caracteres."
- [x] Ano 1939 e `hoje − 9` recusados com "O ano precisa estar entre 1940 e 2016." (em 2026); ausente e não inteiro também
- [x] Telefone com máscara vira 11 dígitos; vazio e nulo viram ausente; 10 dígitos, DDD com zero e sem o 9 são recusados com "Informe o telefone como (DD) 9XXXX-XXXX."
- [x] Pontuação -1, 10000 e 1,5 recusadas; omitida no cadastro vale 0 e na edição mantém o valor (campo ausente no resultado)
- [x] Posição fora das 7 recusada; `dataEntrada` opcional no cadastro e inexistente na edição (strict)
- [x] Gate quick passa: `pnpm --filter @pelada/contrato test`

**Tests**: unit
**Gate**: quick

---

### T14: Contrato de períodos

**What**: `dataCorpo`, `corrigirPeriodoCorpo`, `inicioCorpo` e a resposta de correção (`alterado`).
**Estimativa**: 1h
**Risco**: baixo
**Where**: `backend/contrato/src/periodos.ts`
**Depends on**: T13
**Reuses**: `legado:backend/contrato/src/elenco.ts`
**Requirement**: GEL-52, GEL-55, GEL-71, GEL-74, GEL-77

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `dataCorpo` aceita corpo sem data (usa hoje na rota) e recusa campo extra
- [x] `corrigirPeriodoCorpo` aceita só `saida`, só `retorno` ou os dois; recusa corpo vazio de campos
- [x] `inicioCorpo` exige `data`; as datas são só texto AAAA-MM-DD (a validade é do domínio)
- [x] Gate quick passa: `pnpm --filter @pelada/contrato test`

**Tests**: unit
**Gate**: quick

---

### T15: Contrato de habilidades e notas

**What**: `habilidadeCorpo`, `habilidadeItem`, `notaCorpo` e a resposta de nota (`nivel`, `semNota`).
**Estimativa**: 1h
**Risco**: alto
**Where**: `backend/contrato/src/habilidades.ts`
**Depends on**: T14
**Reuses**: `legado:backend/contrato/src/elenco.ts`
**Requirement**: GEL-90, GEL-99

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Nome de 1 e 31 caracteres recusado com "O nome precisa ter de 2 a 30 caracteres."
- [x] Nota 0, 11, 5,5 e texto recusadas no campo `nota`; 1, 10 e `null` aceitas
- [x] Gate quick passa: `pnpm --filter @pelada/contrato test`

**Tests**: unit
**Gate**: quick

---

### T16: Snapshot de compatibilidade e exportações

**What**: Exporta os arquivos novos do contrato e atualiza `compatibilidade.json` (G-20).
**Estimativa**: 45 min
**Risco**: baixo
**Where**: `backend/contrato/src/index.ts`
**Depends on**: T15
**Reuses**: `backend/contrato/test/compatibilidade.test.ts`
**Requirement**: AD-009

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `compatibilidade.test.ts` passa com o snapshot atualizado e falharia sem ele (provado removendo um campo)
- [x] `sem-eval.test.ts` continua verde: os arquivos novos importam o `z` de `zod.ts`
- [x] Gate quick passa: `pnpm --filter @pelada/contrato test`

**Tests**: unit
**Gate**: quick

---

### Phase 4: Banco: migrations da feature

### T17: Migration: arquivado escondido pela RLS

**What**: Troca `grupos_visiveis()`: grupo arquivado só é visível ao criador que ainda tem vínculo (AD-014).
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/api/src/infraestrutura/db/migracoes/1792844280000_grupos-visiveis-arquivado.sql`
**Depends on**: None
**Reuses**: `backend/api/src/infraestrutura/db/migracoes/*_conta-convites.sql` (padrão de função); `test/apoio/como-role.ts`
**Requirement**: GEL-25, GEL-107, GEL-112

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Como `pelada_app` com a conta criadora: vê o grupo arquivado; com outro admin do mesmo grupo: não vê (zero linhas em `grupos` e em `jogadores`)
- [x] Grupo ativo continua visível aos dois admins; o ramo do slug público não mudou (grupo arquivado por slug segue a regra anterior)
- [x] Mesmos `SECURITY DEFINER`, `search_path` fixo e grants da função anterior; `funcoes-definer.test.ts` verde
- [x] Suíte de isolamento e `rls.test.ts` inteiros verdes depois da troca
- [x] `checar-migracao-aditiva` passa: migration nova, nenhuma editada
- [x] Gate full passa

**Tests**: integration
**Gate**: full

---

### T18: Migration: função grupo_criar

**What**: `grupo_criar(...)` `SECURITY DEFINER`: cria grupo, vínculo admin com `acessa_financeiro`, habilidades na ordem, auditoria `grupo_criar`/`grupo_criado`; sufixo livre do slug e até 3 tentativas na colisão.
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/api/src/infraestrutura/db/migracoes/1792844340000_grupo-criar.sql`
**Depends on**: T17
**Reuses**: `convite_criar` em `1792843*_conta-convites.sql`
**Requirement**: GEL-01, GEL-02, GEL-09, GEL-10, GEL-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Como `pelada_app`: devolve `(id, slug)`; o grupo tem `criado_por` = conta, vínculo com `acessa_financeiro` verdadeiro, 6 habilidades na ordem de GEL-02 e uma linha `grupo_criado` na auditoria com a conta como autora
- [x] Slug `pelada-de-quinta` ocupado (inclusive por grupo arquivado) → `pelada-de-quinta-2`, depois `-3`
- [x] Sem `app_conta_id()` a função falha; falha no meio (habilidade inválida) desfaz grupo e vínculo (GEL-09)
- [x] `EXECUTE` só para `pelada_app`; `search_path` fixo; `funcoes-definer.test.ts` verde com a função nova
- [x] Gate full passa

**Tests**: integration
**Gate**: full

---

### T19: Prova de concorrência do slug

**What**: Duas criações simultâneas do mesmo nome terminam com slugs diferentes.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `backend/api/test/migracoes/grupo-criar-concorrencia.test.ts`
**Depends on**: T18
**Reuses**: `test/apoio/{banco,como-role}.ts`
**Requirement**: GEL-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Duas conexões `pelada_app` (contas diferentes) chamam `grupo_criar` com o mesmo `slug_base` ao mesmo tempo, repetido 20 vezes: sempre dois slugs distintos e nenhuma falha
- [x] Com a base já ocupada até `-3`, a terceira tentativa esgotada devolve erro (não cria grupo parcial)
- [x] Gate full passa

**Tests**: integration
**Gate**: full

---

### T20: Migration: grants por coluna em grupos

**What**: Tira o `UPDATE` geral de `grupos` do `pelada_app` e concede só `nome`, `dia_semana`, `frequencia`, `horario`, `arquivado_em`.
**Estimativa**: 1h
**Risco**: alto
**Where**: `backend/api/src/infraestrutura/db/migracoes/1792844400000_grupos-grants-coluna.sql`
**Depends on**: T19
**Reuses**: `test/migracoes/roles.test.ts`
**Requirement**: GEL-16, GEL-112

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `UPDATE grupos SET criado_por = ...` como `pelada_app` falha com permissão negada; o mesmo para `situacao_comercial`, `trial_inicio` e `slug`
- [x] `UPDATE` de `nome` e `arquivado_em` continua funcionando; a trigger de slug imutável continua barrando
- [x] `roles.test.ts` verde (sem asserção removida: a lista de colunas escrevíveis ganha o caso novo)
- [x] Gate full passa

**Tests**: integration
**Gate**: full

---

### Phase 5: Base da API

### T21: Relógio da API

**What**: `Relogio` (`hoje()` em São Paulo, `mes()`, `agoraIso()`), copiado do legado.
**Estimativa**: 45 min
**Risco**: baixo
**Where**: `backend/api/src/infraestrutura/relogio/index.ts`
**Depends on**: T20
**Reuses**: `legado:backend/api/src/infraestrutura/relogio/index.ts`
**Requirement**: AD-015

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `hoje()` às 22h de São Paulo (01h UTC do dia seguinte) devolve o dia de São Paulo
- [x] Relógio fixo para testes (`relogioFixo(data)`)
- [x] Gate full passa

**Tests**: unit
**Gate**: full

---

### T22: Relógio no contexto do Hono

**What**: `AppEnv` ganha `relogio`; `criarApp(opcoes)` aceita `opcoes.relogio`; o padrão é o relógio real.
**Estimativa**: 1h
**Risco**: baixo
**Where**: `backend/api/src/entrada/app.ts`
**Depends on**: T21
**Reuses**: `entrada/env.ts`, `test/rotas/app.test.ts`
**Requirement**: AD-015

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Uma rota de teste lê `c.get('relogio').hoje()` e devolve a data fixa passada em `criarApp({ relogio })`
- [x] Sem a opção, usa o relógio real (data no formato AAAA-MM-DD)
- [x] Gate full passa

**Tests**: integration
**Gate**: full

---

### T23: Tipos Kysely da feature

**What**: `grupos` completo, `jogadores`, `periodos_ativos`, `habilidades`, `notas`; `presencas`, `partidas` e `pagamentos_mes` só leitura.
**Estimativa**: 1h
**Risco**: baixo
**Where**: `backend/api/src/infraestrutura/db/tipos.ts`
**Depends on**: T22
**Reuses**: `linha-de-base.esquema.txt`
**Requirement**: AD-015

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `pnpm typecheck` passa com os tipos novos contra o esquema (`esquema.ts`)
- [x] Colunas e nulabilidade conferem com `linha-de-base.esquema.txt`
- [x] Gate build passa

**Tests**: none
**Gate**: build

---

### T24: Sessão lista só grupos ativos

**What**: `GET /api/sessao` passa a listar só grupos ativos (`arquivado_em IS NULL`).
**Estimativa**: 1h
**Risco**: alto
**Where**: `backend/api/src/infraestrutura/db/repositorios/contas.ts`
**Depends on**: T23
**Reuses**: `contas.ts:81-91`
**Requirement**: GEL-25

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Conta criadora com um grupo arquivado e um ativo: a sessão devolve só o ativo
- [x] Conta com vínculo em grupo ativo continua vendo o grupo
- [x] `sessao.test.ts` verde; teste novo com grupo arquivado
- [x] Gate full passa

**Tests**: integration
**Gate**: full

---

### T25: Middleware exigirGrupoAtivo

**What**: Responde 409 `grupo_arquivado` a todo método de escrita sob `/api/grupos/:grupoId/*`, exceto `POST …/reativar`; GET e HEAD passam.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `backend/api/src/entrada/middlewares/grupo-ativo.ts`
**Depends on**: T24
**Reuses**: `vinculo.ts:12-18`, `entrada/erros.ts`
**Requirement**: GEL-26

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Grupo arquivado: `PATCH`, `POST`, `PUT` e `DELETE` → 409 com o código `grupo_arquivado`; `GET` → passa
- [x] `POST /api/grupos/:grupoId/reativar` passa mesmo arquivado
- [x] Grupo ativo: nenhum método é barrado
- [x] Código `grupo_arquivado` registrado em `entrada/erros.ts`
- [x] Gate full passa

**Tests**: integration
**Gate**: full

---

### T26: Ligar exigirGrupoAtivo às rotas existentes

**What**: Monta o middleware depois do `exigirVinculo` em todas as rotas de grupo (admins e convites já existentes).
**Estimativa**: 1h
**Risco**: alto
**Where**: `backend/api/src/entrada/app.ts`
**Depends on**: T25
**Reuses**: `entrada/rotas/{admins,convites}.ts`
**Requirement**: GEL-26

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Em grupo arquivado, `POST /api/grupos/:id/admins/convites` (e demais escritas das rotas existentes) responde 409; `GET` das mesmas responde como antes
- [x] `admins.test.ts`, `convites.test.ts` e `vinculo-middleware.test.ts` verdes
- [x] Gate full passa

**Tests**: integration
**Gate**: full

---

### Phase 6: API de grupos

### T27: Repositório: criar, listar e ler grupo

**What**: `grupos.criar` (chama `grupo_criar`), `grupos.listarDaConta` (ativos e arquivados do criador) e `grupos.ler` (contagens e `souCriador`).
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/api/src/infraestrutura/db/repositorios/grupos.ts`
**Depends on**: T16, T26
**Reuses**: `repositorios/admins.ts` (padrão)
**Requirement**: GEL-01, GEL-20, GEL-27

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Criar como `pelada_app` devolve id e slug e cria 6 habilidades; `listarDaConta` separa ativos de arquivados e só mostra arquivado ao criador
- [x] `ler` devolve jogadores ativos, habilidades, admins e `souCriador` (verdadeiro só para o criador)
- [x] Primeiro parâmetro `grupoId` onde couber (`checar-grupo-id` verde)
- [x] Gate full passa

**Tests**: integration
**Gate**: full

---

### T28: Repositório: editar, arquivar e reativar

**What**: `grupos.editar`, `arquivar` e `reativar`: travam a linha do grupo, exigem `criado_por` e vínculo atual (`FOR KEY SHARE`), são idempotentes e auditam.
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/api/src/infraestrutura/db/repositorios/grupos.ts`
**Depends on**: T27
**Reuses**: `repositorios/admins.ts:47` (trava de vínculo)
**Requirement**: GEL-18, GEL-22, GEL-23, GEL-24, GEL-28, GEL-29, GEL-30

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Arquivar pelo criador grava `arquivado_em` e `grupo_arquivado` na auditoria; nada é apagado (jogadores, habilidades e notas intactos, GEL-30)
- [x] Arquivar por admin não criador → erro `so_quem_criou`; criador removido do grupo → sem linha (404)
- [x] Arquivar arquivado e reativar ativo → sucesso sem mudar nada e sem nova linha de auditoria
- [x] Nome de confirmação com caixa ou espaço diferente → erro de nome; reativar apaga `arquivado_em` e audita `grupo_reativado`
- [x] Gate full passa

**Tests**: integration
**Gate**: full

---

### T29: Rotas POST e GET /api/grupos

**What**: Cria grupo (201 com id, slug e link público) e lista os grupos da conta.
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/api/src/entrada/rotas/grupos.ts`
**Depends on**: T28
**Reuses**: `entrada/rotas/admins.ts`, `entrada/corpo.ts`
**Requirement**: GEL-01, GEL-03, GEL-04, GEL-05, GEL-06, GEL-07, GEL-08, GEL-09, GEL-10, GEL-17, GEL-106, GEL-112

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] 201 com `linkPublico` = `<URL_PUBLICA>/g/<slug>`; sem sessão → 401 e nada criado; corpo com `slug` → 422
- [x] Cada 422 com a mensagem do GEL no campo certo; nome "Pelada de Quinta" duas vezes → `pelada-de-quinta` e `pelada-de-quinta-2`; renomear depois não muda o slug
- [x] Rodando como `pelada_app` (não como owner): a criação funciona sob a RLS
- [x] Rota nova com `nao_se_aplica` e motivo em `casos.ts` para os dois métodos; `meta.test.ts` verde
- [x] Gate full passa

**Tests**: e2e
**Gate**: full

---

### T30: Rotas GET e PATCH /api/grupos/:grupoId

**What**: Detalhe e edição do grupo.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `backend/api/src/entrada/rotas/grupos.ts`
**Depends on**: T29
**Reuses**: `entrada/rotas/grupos.ts` (T29)
**Requirement**: GEL-16, GEL-18, GEL-19, GEL-20, GEL-21, GEL-106

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `PATCH` válido → 200 com slug e link públicos inalterados; `slug` no corpo → 422
- [x] `GET` devolve contagens e `souCriador`; conta sem vínculo → 404 nas duas rotas
- [x] Casos `grupo` das duas rotas em `casos.ts`
- [x] Gate full passa

**Tests**: e2e
**Gate**: full

---

### T31: Rotas de arquivar e reativar

**What**: `POST …/arquivar` e `POST …/reativar` com as respostas da spec.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `backend/api/src/entrada/rotas/grupos.ts`
**Depends on**: T30
**Reuses**: `entrada/rotas/grupos.ts`
**Requirement**: GEL-22, GEL-23, GEL-24, GEL-25, GEL-26, GEL-29, GEL-106

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Duas contas admin: a não criadora recebe 403 `so_quem_criou`; a criadora arquiva com o nome exato; nome errado → 422 "O nome digitado não confere com o nome do grupo." no campo `nomeConfirmacao`
- [x] Depois de arquivar, a outra conta recebe 404 em `GET /api/grupos/:id`; o criador recebe 409 `grupo_arquivado` em `PATCH` e consegue `reativar`
- [x] Repetir arquivar ou reativar → 200 sem auditoria nova
- [x] Casos `grupo` das duas rotas em `casos.ts`
- [x] Gate full passa

**Tests**: e2e
**Gate**: full

---

### T32: Isolamento do grupo arquivado

**What**: Prova de isolamento com grupo arquivado: criador vê, outro admin não, slug público inalterado.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `backend/api/test/isolamento/arquivado.test.ts`
**Depends on**: T31
**Reuses**: `test/apoio/cenario-dois-grupos.ts`
**Requirement**: GEL-25, GEL-27, GEL-107

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Em todas as tabelas com `grupo_id` (jogadores, habilidades, notas, períodos): o criador lê, o outro admin lê zero linhas
- [x] `GET /api/grupos` do outro admin não lista o grupo arquivado; o do criador lista em `arquivados`
- [x] O ramo do slug público de `grupos_visiveis()` não mudou
- [x] Gate full passa

**Tests**: integration
**Gate**: full

---

### Phase 7: API de jogadores

### T33: Repositório: listar e ler jogadores

**What**: `jogadores.listar` (uma consulta de jogadores com período aberto e uma de notas; nível pelo domínio) e `jogadores.ler` (com períodos e notas).
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `backend/api/src/infraestrutura/db/repositorios/jogadores.ts`
**Depends on**: T32
**Reuses**: `legado:backend/api/src/infraestrutura/db/repositorios/jogadores.ts`
**Requirement**: GEL-46, GEL-50

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Jogador com período aberto é `ativo` com `desde` = início do período; sem período aberto é `inativo` com `desde` = última saída
- [x] Nível e `semNota` vêm do domínio; a lista usa 2 consultas (não N+1), conferido por contagem de consultas no teste
- [x] `ler` de jogador de outro grupo → nulo
- [x] Gate full passa

**Tests**: integration
**Gate**: full

---

### T34: Repositório: criar jogador

**What**: `jogadores.criar`: jogador, primeiro período e `inicio_pontuacao` na data de entrada; apelido repetido; auditoria `jogador_criado`.
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/api/src/infraestrutura/db/repositorios/jogadores.ts`
**Depends on**: T33
**Reuses**: `legado:backend/api/src/infraestrutura/db/repositorios/jogadores.ts`
**Requirement**: GEL-31, GEL-32, GEL-35, GEL-38, GEL-45

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Criar sem data de entrada usa `hoje`; o período aberto e o `inicio_pontuacao` têm a data de entrada
- [x] "Toninho" e "toninho" colidem (422 com a mensagem do GEL-35); "José" e "Jose" coexistem
- [x] Corrida de dois INSERTs com o mesmo apelido: o segundo cai no índice único e vira o mesmo 422 (23505 traduzido pelo nome da constraint)
- [x] Telefone ausente grava nulo; auditoria `jogador_criado` sem telefone nem ano
- [x] Gate full passa

**Tests**: integration
**Gate**: full

---

### T35: Repositório: editar e excluir jogador

**What**: `jogadores.editar` (pontuação inicial auditada) e `jogadores.excluir` (recusa com histórico).
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/api/src/infraestrutura/db/repositorios/jogadores.ts`
**Depends on**: T34
**Reuses**: `legado:backend/api/src/infraestrutura/db/repositorios/jogadores.ts`
**Requirement**: GEL-41, GEL-42, GEL-43, GEL-44, GEL-84, GEL-85

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Mudar a pontuação grava `jogador_pontuacao_inicial_alterada` com valor anterior e novo; omitir mantém; editar não mexe em `inicio_pontuacao` nem em períodos
- [x] Excluir jogador sem histórico apaga jogador e períodos e audita `jogador_excluido`
- [x] Excluir com presença, com nota ou com pagamento mensal → erro `jogador_com_historico` e nada apagado (um teste por tipo de histórico)
- [x] Jogador de outro grupo → nulo (404 na rota)
- [x] Gate full passa

**Tests**: integration
**Gate**: full

---

### T36: Rotas GET e POST jogadores

**What**: Lista e cadastro de jogador.
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/api/src/entrada/rotas/jogadores.ts`
**Depends on**: T35
**Reuses**: `entrada/rotas/admins.ts`
**Requirement**: GEL-31, GEL-33, GEL-34, GEL-36, GEL-37, GEL-39, GEL-40, GEL-46, GEL-106

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Cadastro válido → 201; `dataEntrada` no futuro → 422 "A data não pode ser no futuro." no campo `dataEntrada` (hoje do `Relogio`, às 22h de São Paulo)
- [x] Cada 422 da spec com a mensagem e o campo certos (apelido, ano, posição, telefone, pontuação); campo desconhecido → 422
- [x] `GET` devolve ativos e inativos com nível; sem sessão → 401; outro grupo → 404
- [x] Casos `grupo` dos dois métodos em `casos.ts`
- [x] Gate full passa

**Tests**: e2e
**Gate**: full

---

### T37: Rotas GET, PATCH e DELETE jogador

**What**: Ficha, edição e exclusão.
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/api/src/entrada/rotas/jogadores.ts`
**Depends on**: T36
**Reuses**: `entrada/rotas/jogadores.ts` (T36)
**Requirement**: GEL-41, GEL-44, GEL-45, GEL-84, GEL-85, GEL-106

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `PATCH` válido → 200; `dataEntrada` no corpo → 422; id de jogador de outro grupo → 404
- [x] `DELETE` sem histórico → 204; com histórico → 409 com `jogador_com_historico`, a mensagem "<apelido> tem histórico de partidas e não pode ser excluído." e a sugestão `inativar`
- [x] Casos `grupo` dos três métodos em `casos.ts`
- [x] Gate full passa

**Tests**: e2e
**Gate**: full

---

### Phase 8: API de períodos

### T38: Repositório: inativar

**What**: `jogadores.inativar`: `FOR UPDATE` no jogador, leitura de períodos e presenças, `avaliarPeriodos`, encerra o período aberto e audita `jogador_inativado`.
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/api/src/infraestrutura/db/repositorios/jogadores.ts`
**Depends on**: T37
**Reuses**: `legado:backend/api/src/infraestrutura/db/repositorios/jogadores.ts:247-257` (trava)
**Requirement**: GEL-51, GEL-52, GEL-53, GEL-58, GEL-109

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Inativar jogador ativo com data válida fecha o período nessa data; sem data usa `hoje`; já inativo → erro `ja_inativo` sem alterar
- [x] Presença em 01/10 e saída em 30/09 → 422 com a mensagem do GEL-68 e a data mínima 02/10 (presença criada direto no banco pelo teste)
- [x] Auditoria `jogador_inativado` na mesma transação: se a auditoria falha, o período não muda
- [x] Gate full passa

**Tests**: integration
**Gate**: full

---

### T39: Repositório: reativar

**What**: `jogadores.reativar`: abre novo período sem mexer em `inicio_pontuacao` nem na pontuação inicial; audita com a data de retorno e a saída anterior.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `backend/api/src/infraestrutura/db/repositorios/jogadores.ts`
**Depends on**: T38
**Reuses**: `jogadores.ts` (T38)
**Requirement**: GEL-54, GEL-55, GEL-56, GEL-57

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Retorno em 12/10 depois de saída em 05/10 cria o período [12/10, ∞); `inicio_pontuacao` igual ao anterior
- [x] Retorno antes da saída anterior → 422 "O retorno não pode ser antes da saída anterior (05/10/2026)."; sair e voltar no mesmo dia aceita
- [x] Já ativo → erro `ja_ativo`; auditoria `jogador_reativado` com as duas datas
- [x] Gate full passa

**Tests**: integration
**Gate**: full

---

### T40: Repositório: corrigir período

**What**: `jogadores.corrigirPeriodo`: nova saída e/ou novo retorno; igual ao atual não grava; audita antes e depois.
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/api/src/infraestrutura/db/repositorios/jogadores.ts`
**Depends on**: T39
**Reuses**: `jogadores.ts` (T38)
**Requirement**: GEL-71, GEL-72, GEL-73, GEL-74, GEL-75

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Saída corrigida de 05/10 para 03/10 grava e audita `jogador_periodo_corrigido` com as datas antes e depois
- [x] Datas iguais → `alterado: false` sem escrita e sem auditoria
- [x] Saída de período aberto e início do primeiro período → as mensagens dos GEL-72 e GEL-73; período de outro jogador ou grupo → nulo (404)
- [x] Gate full passa

**Tests**: integration
**Gate**: full

---

### T41: Repositório: alterar data de início

**What**: `jogadores.alterarInicio`: único escritor de `inicio_pontuacao` além do cadastro; recua o primeiro período quando preciso.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `backend/api/src/infraestrutura/db/repositorios/jogadores.ts`
**Depends on**: T40
**Reuses**: `jogadores.ts` (T38)
**Requirement**: GEL-77, GEL-81, GEL-82, GEL-83

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Recuar de 05/02 para 01/02 move o início do primeiro período e deixa os encerrados; audita `jogador_inicio_alterado` com anterior e nova
- [x] Data igual à atual → 200 sem gravar e sem auditar
- [x] Data depois da saída do primeiro período → 422 com a mensagem do GEL-80
- [x] Gate full passa

**Tests**: integration
**Gate**: full

---

### T42: Rotas de inativar e reativar

**What**: `POST …/jogadores/:id/inativar` e `…/reativar`.
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/api/src/entrada/rotas/periodos.ts`
**Depends on**: T41
**Reuses**: `entrada/rotas/jogadores.ts`
**Requirement**: GEL-51, GEL-52, GEL-53, GEL-54, GEL-55, GEL-56, GEL-58, GEL-106

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Inativar → 200; segunda vez → 409 "O jogador já está inativo."; reativar ativo → 409 "O jogador já está ativo."
- [x] Data inválida, futura e de ordem → 422 com as mensagens do domínio no campo `data`; hoje vem do `Relogio`
- [x] Jogador de outro grupo → 404; grupo arquivado → 409 `grupo_arquivado`
- [x] Casos `grupo` das duas rotas em `casos.ts`
- [x] Gate full passa

**Tests**: e2e
**Gate**: full

---

### T43: Rotas de corrigir período e data de início

**What**: `PATCH …/jogadores/:id/periodos/:periodoId` e `PUT …/jogadores/:id/inicio`.
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/api/src/entrada/rotas/periodos.ts`
**Depends on**: T42
**Reuses**: `entrada/rotas/periodos.ts` (T42)
**Requirement**: GEL-71, GEL-72, GEL-73, GEL-74, GEL-75, GEL-77, GEL-78, GEL-79, GEL-80, GEL-82, GEL-106

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `PATCH` válido → 200; datas iguais → 200 com `alterado: false` e "Nada a alterar."; período de outro jogador → 404
- [x] `PUT` com 31/12/1999 → 422 do GEL-78; data futura → GEL-79; igual à atual → 200 sem auditoria
- [x] Casos `grupo` das duas rotas em `casos.ts`
- [x] Gate full passa

**Tests**: e2e
**Gate**: full

---

### T44: Prova de concorrência de períodos

**What**: Duas escritas de período do mesmo jogador ao mesmo tempo se aplicam em sequência.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `backend/api/test/repositorios/periodos-concorrencia.test.ts`
**Depends on**: T43
**Reuses**: `test/apoio/banco.ts`
**Requirement**: GEL-109, GEL-110

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Duas conexões `pelada_app` inativam o mesmo jogador ao mesmo tempo: uma conclui e a outra recebe `ja_inativo` (validada sobre o resultado da primeira)
- [ ] Inativar e corrigir saída em paralelo: o resultado final respeita as regras de ordem, sem períodos sobrepostos
- [ ] Repetido 20 vezes sem resultado inconsistente
- [ ] Gate full passa

**Tests**: integration
**Gate**: full

---

### T45: Checagem dos escritores de período

**What**: `checar-escritores-periodo`: falha se `periodos_ativos` ou `inicio_pontuacao` forem escritos fora de `repositorios/jogadores.ts` e das migrations.
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/scripts/checagens/checar-escritores-periodo.mjs`
**Depends on**: T44
**Reuses**: `checagens/checar-grupo-id.mjs` e `checagens/test/checar-grupo-id.test.mjs` (modelo)
**Requirement**: GEL-83, GEL-111

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Fixture com `insertInto('periodos_ativos')` num arquivo fora do repositório → a checagem sai com erro; o mesmo para `updateTable`, `deleteFrom`, SQL cru e `inicio_pontuacao`
- [ ] O repositório real e as migrations passam; o repositório atual do app passa
- [ ] Entra no `pnpm test:checagens` e no job `base` do CI (`.github/workflows/ci.yml`)
- [ ] Gate full passa

**Tests**: unit
**Gate**: full

---

### Phase 9: API de habilidades, notas e transversais

### T46: Repositório de habilidades

**What**: `habilidades.listar | criar | renomear | excluir`: ordem de cadastro, nome único sem caixa, exclusão apaga notas e audita.
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/api/src/infraestrutura/db/repositorios/habilidades.ts`
**Depends on**: T45
**Reuses**: `legado:backend/api/src/infraestrutura/db/repositorios/` (habilidades)
**Requirement**: GEL-88, GEL-89, GEL-91, GEL-92, GEL-93, GEL-96

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Habilidade nova vai ao fim da ordem; renomear mantém notas e posição
- [ ] "Drible" e "drible" colidem (422 com a mensagem do GEL-91); corrida cai no índice único e vira o mesmo 422
- [ ] Excluir apaga as notas de todos os jogadores nessa habilidade e audita `habilidade_excluida`
- [ ] Habilidade de outro grupo → nulo (404)
- [ ] Gate full passa

**Tests**: integration
**Gate**: full

---

### T47: Rotas de habilidades

**What**: `GET`, `POST`, `PATCH` e `DELETE /api/grupos/:grupoId/habilidades[/:id]`.
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/api/src/entrada/rotas/habilidades.ts`
**Depends on**: T46
**Reuses**: `entrada/rotas/admins.ts`
**Requirement**: GEL-88, GEL-89, GEL-90, GEL-91, GEL-92, GEL-93, GEL-96, GEL-106

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] 200, 201, 200 e 204 nos caminhos felizes; nome de 1 e 31 caracteres → 422 do GEL-90; repetido → 422 do GEL-91
- [ ] Id de outro grupo → 404; sem vínculo → 404; grupo arquivado → 409 nas escritas
- [ ] Casos `grupo` dos quatro métodos em `casos.ts`
- [ ] Gate full passa

**Tests**: e2e
**Gate**: full

---

### T48: Repositório de notas

**What**: `notas.salvar`: `INSERT … ON CONFLICT DO UPDATE` ou `DELETE` com `null`; devolve o nível recalculado.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `backend/api/src/infraestrutura/db/repositorios/notas.ts`
**Depends on**: T47
**Reuses**: `repositorios/jogadores.ts` (nível)
**Requirement**: GEL-97, GEL-98, GEL-102, GEL-105

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Salvar nota cria; salvar de novo substitui (uma linha só); `null` apaga e não falha se não existir
- [ ] Depois de 6 notas 8, 7, 6, 7, 8, 5 o nível devolvido é 683; apagando todas, 550 e `semNota`
- [ ] Jogador inativo recebe nota; jogador ou habilidade de outro grupo → nulo
- [ ] Gate full passa

**Tests**: integration
**Gate**: full

---

### T49: Rota de notas

**What**: `PUT /api/grupos/:grupoId/jogadores/:id/notas/:habilidadeId`.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `backend/api/src/entrada/rotas/notas.ts`
**Depends on**: T48
**Reuses**: `entrada/rotas/jogadores.ts`
**Requirement**: GEL-97, GEL-98, GEL-99, GEL-100, GEL-105, GEL-106

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Nota 8 → 200 com `{ nivel, semNota }`; `null` → 200; nota 0, 11, 5,5 → 422 no campo `nota`
- [ ] Jogador ou habilidade de outro grupo → 404; jogador inativo → 200
- [ ] Caso `grupo` em `casos.ts`
- [ ] Gate full passa

**Tests**: e2e
**Gate**: full

---

### T50: Auditoria sem dado pessoal

**What**: Prova que o `resumo` dos eventos da feature só tem ids, datas, números e nomes de evento.
**Estimativa**: 1,5h
**Risco**: alto
**Where**: `backend/api/test/repositorios/auditoria-feature.test.ts`
**Depends on**: T49
**Reuses**: `repositorios/auditoria.ts`
**Requirement**: GEL-113

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Cadastrar jogador com telefone e ano de nascimento, editar a pontuação, inativar, reativar, corrigir e alterar o início: nenhum `resumo` contém o telefone nem o ano
- [ ] Os nomes de evento da spec existem (grupo_criado, grupo_arquivado, grupo_reativado, jogador_criado, jogador_excluido, jogador_pontuacao_inicial_alterada, jogador_inativado, jogador_reativado, jogador_periodo_corrigido, jogador_inicio_alterado, habilidade_excluida)
- [ ] Gate full passa

**Tests**: integration
**Gate**: full

---

### T51: Ids de outro grupo respondem 404

**What**: Prova que jogador, período e habilidade de outro grupo respondem 404 em toda rota que recebe esses ids.
**Estimativa**: 2h
**Risco**: alto
**Where**: `backend/api/test/isolamento/ids-cruzados.test.ts`
**Depends on**: T50
**Reuses**: `test/apoio/cenario-dois-grupos.ts`
**Requirement**: GEL-107, GEL-108

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Conta admin do grupo A, ids do grupo B: 404 em jogador (GET, PATCH, DELETE, inativar, reativar, inicio, notas), período (PATCH) e habilidade (PATCH, DELETE, notas) e nada do grupo B muda
- [ ] Uma asserção de estado do grupo B por rota (linha continua igual)
- [ ] Teste roda como `pelada_app`
- [ ] Gate full passa

**Tests**: integration
**Gate**: full

---

### T52: Seed com grupo, elenco e notas

**What**: O seed cria o grupo de exemplo pela `grupo_criar` e jogadores com períodos e notas (um inativo).
**Estimativa**: 1,5h
**Risco**: baixo
**Where**: `backend/api/src/infraestrutura/db/repositorios/seed-local.ts`
**Depends on**: T51
**Reuses**: `backend/scripts/seed-local.ts`
**Requirement**: GEL-01, GEL-46

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `pnpm seed` num banco migrado cria o grupo, 4 jogadores (1 inativo com dois períodos) e notas
- [ ] Rodar o seed duas vezes não duplica nada
- [ ] Teste do seed verde (`backend/scripts/test`)
- [ ] Gate full passa

**Tests**: integration
**Gate**: full

---

### Phase 10: Front: dados e telas do grupo

### T53: Dados de grupos

**What**: Hooks `useGrupos`, `useGrupo` e mutações (criar, editar, arquivar, reativar) que invalidam a lista.
**Estimativa**: 1,5h
**Risco**: baixo
**Where**: `frontend/web/src/dados/grupos.ts`
**Depends on**: T16, T32
**Reuses**: `frontend/web/src/dados/{cliente,consultas,erros}.ts`
**Requirement**: GEL-27, GEL-118

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Cada mutação chama a rota certa com o corpo do contrato e invalida `grupos` e `grupo`
- [ ] 422 com `campos` chega à tela no formato do `ResumoErros`
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T54: Dados de elenco

**What**: Hooks `useJogadores`, `useJogador` e mutações (criar, editar, excluir, inativar, reativar, corrigir período, alterar início).
**Estimativa**: 2h
**Risco**: baixo
**Where**: `frontend/web/src/dados/elenco.ts`
**Depends on**: T53
**Reuses**: `legado:frontend/web/src/dados/elenco.ts`
**Requirement**: GEL-46, GEL-118

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Cada mutação chama a rota certa e invalida a lista e a ficha
- [ ] 409 `jogador_com_historico` chega com a sugestão `inativar`
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T55: Dados de habilidades

**What**: Hooks `useHabilidades` e mutações (criar, renomear, excluir).
**Estimativa**: 1h
**Risco**: baixo
**Where**: `frontend/web/src/dados/habilidades.ts`
**Depends on**: T54
**Reuses**: `legado:frontend/web/src/dados/habilidades.ts`
**Requirement**: GEL-88

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Cada mutação chama a rota certa e invalida a lista de habilidades e a de jogadores (o nível pode mudar na exclusão)
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T56: Dados de notas e exibição do nível

**What**: Mutação de nota e `formatarNivel(nivel)`: uma casa decimal, meio para cima (683 → "6,8"), "sem nota".
**Estimativa**: 1h
**Risco**: baixo
**Where**: `frontend/web/src/dados/notas.ts`
**Depends on**: T55
**Reuses**: `legado:frontend/web/src/dados/notas.ts`
**Requirement**: GEL-97, GEL-103

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `formatarNivel(683)` → "6,8"; 685 → "6,9"; `semNota` → "sem nota"
- [ ] A mutação invalida a ficha e a lista
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T57: Tela: seus grupos (t08)

**What**: `SeusGrupos` passa a usar `GET /api/grupos`, mostra a recorrência, o estado vazio com "Criar grupo" e a seção "Arquivados" com Reativar.
**Estimativa**: 2h
**Risco**: baixo
**Where**: `frontend/web/src/telas/grupos/SeusGrupos.tsx`
**Depends on**: T56
**Reuses**: `frontend/web/src/telas/grupos/SeusGrupos.tsx` (estado atual)
**Requirement**: GEL-27, GEL-114, GEL-117

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Estados do mockup t08: carregando, erro, vazio, sucesso, arquivado, reativar e reativado, cada um com teste
- [ ] Arquivados só aparecem para quem tem a lista `arquivados`; Reativar chama a mutação
- [ ] axe sem violação; só tokens (`checar-tokens.py` passa)
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T58: Tela: novo grupo (t27)

**What**: Formulário com nome, dia, frequência e horário; sem "Primeiro admin"; ao criar, vai ao início do grupo.
**Estimativa**: 2h
**Risco**: baixo
**Where**: `frontend/web/src/telas/novo-grupo/NovoGrupo.tsx`
**Depends on**: T57
**Reuses**: `legado:frontend/web/src/telas/grupos/` (formulário), componentes de `campos/`
**Requirement**: GEL-01, GEL-03, GEL-06, GEL-114, GEL-118

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Estados do mockup t27: vazio, carregando e erro; "Corrija N campos: …" com a mensagem ao lado de cada campo
- [ ] Envio válido chama a mutação e navega para `/app/grupos/:id`
- [ ] axe sem violação; só tokens
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T59: Tela: início do grupo (t09)

**What**: Resumo do grupo com jogadores, habilidades, admins e links para as telas; sem o item "Pontuação".
**Estimativa**: 1,5h
**Risco**: baixo
**Where**: `frontend/web/src/telas/grupo/InicioDoGrupo.tsx`
**Depends on**: T58
**Reuses**: `legado:frontend/web/src/telas/inicio/`
**Requirement**: GEL-20, GEL-114

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Estados t09: sem jogadores e sucesso ("6 habilidades", "1 admin")
- [ ] Sem item "Pontuação"; links para jogadores, habilidades, admins e dados do grupo
- [ ] axe sem violação; só tokens
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T60: Tela: dados do grupo e arquivar (t20)

**What**: Edita nome, dia, frequência e horário, copia o link do ranking e arquiva com o nome digitado (só para quem criou).
**Estimativa**: 2h
**Risco**: baixo
**Where**: `frontend/web/src/telas/dados-grupo/DadosDoGrupo.tsx`
**Depends on**: T59
**Reuses**: `legado:frontend/web/src/telas/grupo/`
**Requirement**: GEL-18, GEL-19, GEL-22, GEL-23, GEL-114, GEL-118

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Estados t20: sucesso, salvo ("Dados salvos"), erro, carregando, nao-criador (sem a zona de arquivar), arquivar e arquivar-erro
- [ ] Arquivar só habilita com o nome exato; 422 do nome aparece no campo; o link é copiado sem URL fixa no código
- [ ] axe sem violação; só tokens
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### Phase 11: Front: elenco e habilidades

### T61: Tela: jogadores (t15)

**What**: Lista com Ativos e Inativos e contagem, busca sem acento, estado vazio e "Novo jogador".
**Estimativa**: 2h
**Risco**: baixo
**Where**: `frontend/web/src/telas/jogadores/Jogadores.tsx`
**Depends on**: T60, T52
**Reuses**: `legado:frontend/web/src/telas/jogadores/`
**Requirement**: GEL-46, GEL-47, GEL-48, GEL-49, GEL-114

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Com 3 jogadores (1 inativo): "Ativos (2) Inativos (1)"; buscar "jose" acha "José"
- [ ] Listas ordenadas por apelido sem acento e sem caixa; vazio de ativos mostra a ação "Novo jogador" e o de inativos "Nenhum jogador inativo."
- [ ] axe sem violação; só tokens
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T62: Tela: novo jogador (t16)

**What**: Formulário de cadastro: apelido, ano, posição, telefone com máscara, pontuação inicial e data de entrada.
**Estimativa**: 2h
**Risco**: baixo
**Where**: `frontend/web/src/telas/jogador/NovoJogador.tsx`
**Depends on**: T61
**Reuses**: `legado:frontend/web/src/telas/jogador/`
**Requirement**: GEL-31, GEL-33, GEL-34, GEL-36, GEL-39, GEL-114, GEL-118

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Estado t16 novo: erros por campo com as mensagens da spec e "Corrija N campos: …"
- [ ] Envio válido navega para a lista e o jogador aparece em Ativos "desde <hoje>"
- [ ] axe sem violação; só tokens
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T63: Tela: ficha do jogador, dados e notas

**What**: Edição dos dados, notas por habilidade com `CampoNota` e nível ("Nível 6,8" ou "sem nota").
**Estimativa**: 2h
**Risco**: baixo
**Where**: `frontend/web/src/telas/jogador/FichaJogador.tsx`
**Depends on**: T62
**Reuses**: `legado:frontend/web/src/telas/jogador/`
**Requirement**: GEL-41, GEL-97, GEL-103, GEL-114

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Estados t16: edicao, carregando, erro
- [ ] Dar 8, 7, 6, 7, 8 e 5 mostra "Nível 6,8"; apagar todas mostra "sem nota"; jogador inativo ainda edita notas
- [ ] axe sem violação; só tokens
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T64: Ficha do jogador: inativar e reativar

**What**: Diálogos de inativar (com o aviso do GEL-59) e de reativar, com data e erro de período; texto "<apelido> reativado desde <dd/mm/aaaa>.".
**Estimativa**: 2h
**Risco**: baixo
**Where**: `frontend/web/src/telas/jogador/PeriodosJogador.tsx`
**Depends on**: T63
**Reuses**: `legado:frontend/web/src/telas/jogador/` (sem as prévias de acumulado, C7)
**Requirement**: GEL-59, GEL-60, GEL-114, GEL-118

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Estados t16: inativar, inativo, reativar, reativar-erro, reativado
- [ ] O aviso "Ele sai do ranking, do lançamento, do simulador e do financeiro…" aparece antes de confirmar, com Cancelar e Inativar
- [ ] 422 de período aparece no campo da data; axe sem violação; só tokens
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T65: Ficha do jogador: corrigir datas e data de início

**What**: Lista de períodos com "Corrigir datas" e "Alterar data de início".
**Estimativa**: 2h
**Risco**: baixo
**Where**: `frontend/web/src/telas/jogador/CorrigirDatas.tsx`
**Depends on**: T64
**Reuses**: `legado:frontend/web/src/telas/jogador/`
**Requirement**: GEL-76, GEL-77, GEL-114, GEL-118

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Estados t16: corrigir, corrigir-erro, corrigido ("Datas corrigidas."), inicio, inicio-erro
- [ ] Início do primeiro período não é editável pela correção (mostra o caminho "Alterar data de início")
- [ ] axe sem violação; só tokens
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T66: Ficha do jogador: excluir

**What**: Confirmação "Excluir <apelido>?" com o texto novo e a recusa com "Inativar em vez disso".
**Estimativa**: 1,5h
**Risco**: baixo
**Where**: `frontend/web/src/telas/jogador/ExcluirJogador.tsx`
**Depends on**: T65
**Reuses**: `legado:frontend/web/src/telas/jogador/`
**Requirement**: GEL-86, GEL-87, GEL-114

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Estados t16: excluir e exclusao-recusada
- [ ] Texto exato "O cadastro é apagado. Só é possível excluir quem não tem partidas, notas nem pagamentos."
- [ ] Recusa 409 mostra a mensagem e o botão que abre o diálogo de inativar; axe sem violação; só tokens
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T67: Tela: habilidades (t17)

**What**: Lista, criação, renomeação e exclusão com os textos da spec.
**Estimativa**: 2h
**Risco**: baixo
**Where**: `frontend/web/src/telas/habilidades/Habilidades.tsx`
**Depends on**: T66
**Reuses**: `legado:frontend/web/src/telas/habilidades/`
**Requirement**: GEL-94, GEL-95, GEL-114

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Estados do mockup t17 do projeto: vazio ("Nenhuma habilidade", "O simulador vai usar nível 5,5 para todos."), sucesso, erro, carregando
- [ ] Exclusão confirma com "Excluir “<nome>”?" e "…apaga as notas de todos os jogadores nessa habilidade."
- [ ] axe sem violação; só tokens
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### Phase 12: Front: rotas, comparação visual e fluxo

### T68: Rotas do app

**What**: Registra as rotas de `/app/grupos/...` sob a `RotaProtegida`.
**Estimativa**: 1h
**Risco**: baixo
**Where**: `frontend/web/src/app/rotas.tsx`
**Depends on**: T67
**Reuses**: `frontend/web/src/app/rotas.tsx`
**Requirement**: GEL-114

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Cada rota da spec abre a tela certa; sem sessão cai em entrar
- [ ] `/app/grupos/:grupoId/admins` e as demais rotas da conta continuam funcionando (`rotas.test.tsx` verde)
- [ ] Gate quick passa: `pnpm --filter @pelada/web test`

**Tests**: unit
**Gate**: quick

---

### T69: Comparação visual com o mockup

**What**: Telas novas em `telas-ativas.txt` e mapeadas em `telas.json`; `checar-tokens.py` na pasta do front.
**Estimativa**: 2h
**Risco**: baixo
**Where**: `frontend/web/e2e/telas-ativas.txt`
**Depends on**: T68
**Reuses**: `frontend/web/e2e/config-fundacao.mjs`, `.specs/mockup/telas.json`
**Requirement**: GEL-115, GEL-116

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `pnpm --filter @pelada/web visual` sem divergência acima do limite (1%) nas 34 telas do módulo e nas t09, t15, t17, t27 em PC e celular
- [ ] `python .claude/scripts/checar-tokens.py frontend/web/src` passa
- [ ] `telas-ativas.test.mjs` atualizado só com o acréscimo das telas novas (nenhuma asserção removida)
- [ ] Gate build passa

**Tests**: e2e
**Gate**: build

---

### T70: Fluxo ponta a ponta no navegador

**What**: Playwright: conta nova cria o grupo, cadastra o primeiro jogador e arquiva e reativa.
**Estimativa**: 2h
**Risco**: baixo
**Where**: `frontend/web/e2e/grupos-elenco.spec.ts`
**Depends on**: T69
**Reuses**: `frontend/web/e2e/acesso.spec.ts`
**Requirement**: GEL-01, GEL-31, GEL-114

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Conta sem grupos cria "Pelada de Quinta" e cadastra "Toninho" no viewport de celular em menos de 2 minutos de interação (sem esperas fixas)
- [ ] O grupo aparece em "Seus grupos" e o início mostra "6 habilidades" e "1 admin"
- [ ] Arquivar com o nome digitado leva o grupo a "Arquivados"; Reativar o devolve
- [ ] Gate build passa

**Tests**: e2e
**Gate**: build

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8 → Phase 9 → Phase 10 → Phase 11 → Phase 12

Phase 1:  T1 → T2 → T3 → T4 → T5
Phase 2:  T6 → T7 → T8 → T9 → T10 → T11
Phase 3:  T12 → T13 → T14 → T15 → T16
Phase 4:  T17 → T18 → T19 → T20
Phase 5:  T21 → T22 → T23 → T24 → T25 → T26
Phase 6:  T27 → T28 → T29 → T30 → T31 → T32
Phase 7:  T33 → T34 → T35 → T36 → T37
Phase 8:  T38 → T39 → T40 → T41 → T42 → T43 → T44 → T45
Phase 9:  T46 → T47 → T48 → T49 → T50 → T51 → T52
Phase 10:  T53 → T54 → T55 → T56 → T57 → T58 → T59 → T60
Phase 11:  T61 → T62 → T63 → T64 → T65 → T66 → T67
Phase 12:  T68 → T69 → T70
```

Execução estritamente sequencial, sem paralelismo dentro da fase. Os lotes (até 14h de Estimativa, fases inteiras) saem de `python .claude/scripts/progresso.py --lote`.

## Requirement Traceability (resumo)

118 de 118 requisitos GEL mapeados a tarefas.

| Requirement | Tarefas |
| ----------- | ------- |
| GEL-01 | T18, T27, T29, T52, T58, T70 |
| GEL-02 | T4, T18 |
| GEL-03 | T12, T29, T58 |
| GEL-04 | T12, T29 |
| GEL-05 | T12, T29 |
| GEL-06 | T12, T29, T58 |
| GEL-07 | T12, T29 |
| GEL-08 | T29 |
| GEL-09 | T18, T29 |
| GEL-10 | T18, T29 |
| GEL-100 | T49 |
| GEL-101 | T3 |
| GEL-102 | T3, T48 |
| GEL-103 | T56, T63 |
| GEL-104 | T3, T11 |
| GEL-105 | T48, T49 |
| GEL-106 | T29, T30, T31, T36, T37, T42, T43, T47, T49 |
| GEL-107 | T17, T32, T51 |
| GEL-108 | T51 |
| GEL-109 | T38, T44 |
| GEL-11 | T1 |
| GEL-110 | T44 |
| GEL-111 | T45 |
| GEL-112 | T17, T20, T29 |
| GEL-113 | T50 |
| GEL-114 | T57, T58, T59, T60, T61, T62, T63, T64, T65, T66, T67, T68, T70 |
| GEL-115 | T69 |
| GEL-116 | T69 |
| GEL-117 | T57 |
| GEL-118 | T53, T54, T58, T60, T62, T64, T65 |
| GEL-12 | T1 |
| GEL-13 | T1 |
| GEL-14 | T18 |
| GEL-15 | T19 |
| GEL-16 | T20, T30 |
| GEL-17 | T29 |
| GEL-18 | T28, T30, T60 |
| GEL-19 | T12, T30, T60 |
| GEL-20 | T27, T30, T59 |
| GEL-21 | T30 |
| GEL-22 | T28, T31, T60 |
| GEL-23 | T12, T28, T31, T60 |
| GEL-24 | T28, T31 |
| GEL-25 | T17, T24, T31, T32 |
| GEL-26 | T25, T26, T31 |
| GEL-27 | T27, T32, T53, T57 |
| GEL-28 | T28 |
| GEL-29 | T28, T31 |
| GEL-30 | T28 |
| GEL-31 | T34, T36, T62, T70 |
| GEL-32 | T34 |
| GEL-33 | T36, T62 |
| GEL-34 | T13, T36, T62 |
| GEL-35 | T34 |
| GEL-36 | T5, T13, T36, T62 |
| GEL-37 | T13, T36 |
| GEL-38 | T13, T34 |
| GEL-39 | T13, T36, T62 |
| GEL-40 | T13, T36 |
| GEL-41 | T35, T37, T63 |
| GEL-42 | T35 |
| GEL-43 | T13, T35 |
| GEL-44 | T35, T37 |
| GEL-45 | T34, T37 |
| GEL-46 | T33, T36, T52, T54, T61 |
| GEL-47 | T2, T61 |
| GEL-48 | T2, T61 |
| GEL-49 | T61 |
| GEL-50 | T33 |
| GEL-51 | T38, T42 |
| GEL-52 | T14, T38, T42 |
| GEL-53 | T38, T42 |
| GEL-54 | T39, T42 |
| GEL-55 | T14, T39, T42 |
| GEL-56 | T39, T42 |
| GEL-57 | T39 |
| GEL-58 | T9, T38, T42 |
| GEL-59 | T64 |
| GEL-60 | T64 |
| GEL-61 | T6 |
| GEL-62 | T9 |
| GEL-63 | T7 |
| GEL-64 | T7 |
| GEL-65 | T7 |
| GEL-66 | T7 |
| GEL-67 | T7 |
| GEL-68 | T8 |
| GEL-69 | T9 |
| GEL-70 | T9, T11 |
| GEL-71 | T14, T40, T43 |
| GEL-72 | T9, T40, T43 |
| GEL-73 | T9, T40, T43 |
| GEL-74 | T14, T40, T43 |
| GEL-75 | T40, T43 |
| GEL-76 | T65 |
| GEL-77 | T14, T41, T43, T65 |
| GEL-78 | T10, T43 |
| GEL-79 | T10, T43 |
| GEL-80 | T10, T43 |
| GEL-81 | T10, T41 |
| GEL-82 | T41, T43 |
| GEL-83 | T41, T45 |
| GEL-84 | T35, T37 |
| GEL-85 | T35, T37 |
| GEL-86 | T66 |
| GEL-87 | T66 |
| GEL-88 | T46, T47, T55 |
| GEL-89 | T46, T47 |
| GEL-90 | T15, T47 |
| GEL-91 | T46, T47 |
| GEL-92 | T46, T47 |
| GEL-93 | T46, T47 |
| GEL-94 | T67 |
| GEL-95 | T67 |
| GEL-96 | T46, T47 |
| GEL-97 | T48, T49, T56, T63 |
| GEL-98 | T48, T49 |
| GEL-99 | T15, T49 |
