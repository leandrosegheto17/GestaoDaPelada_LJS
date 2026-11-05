# Financeiro — Tarefas

**Modo**: enxuto
**Passada**: rascunho
**Base**: .specs/features/financeiro/spec.md (aprovada em 2026-11-04), conferido em 2026-11-04. Contratos: fundação v2 (`.specs/features/fundacao/`), `conta-e-acesso`, `grupos-e-elenco` e `partidas-e-ranking` v2 (`tasks.md` de cada uma, nada executado ainda) e a spec da `simulador` (`.specs/features/simulador/spec.md`, SIM-68).
**Branch pai**: feature/simulador (a ordem de execução segue o roteiro). Se a `simulador` já estiver integrada na `main` quando o `/executar` começar, a Branch pai passa a ser `main`.
**Feature**: 6 de 8 do roteiro (AD-001, AD-015). Requisitos `FIN-*`.

> Convenções: `S:` = `.specs/features/financeiro/spec.md`; `F:` = `.specs/features/fundacao/tasks.md`; `FD:` = `.specs/features/fundacao/design.md`; `CA:` = `.specs/features/conta-e-acesso/tasks.md`; `GE:` = `.specs/features/grupos-e-elenco/tasks.md`; `PR:` = `.specs/features/partidas-e-ranking/tasks.md`; `SIM:` = `.specs/features/simulador/spec.md`; `M:` = `backend/api/src/infraestrutura/db/migracoes/` (as 23 migrações copiadas pela fundação, iguais a `GestaoDaPelada_LJS` @ `e557292`, AD-003); `L:` = legado `C:\Leandro\Projetos\GestaodaPelada` @ `ece227e0`, só leitura. Do zero (AD-002): código e testes do legado e do LJS são só consulta; não há `reuso.md`. ADs desta feature: AD-074 a AD-079 e AD-118 (`.specs/STATE.md`). Nome de teste de tarefa de risco alto cita o `FIN-NN`.

## Delta

1. **Sem código ainda**: as features 1 a 5 não foram executadas; toda referência a arquivo é ao `Where` da tarefa dona (`F:`, `CA:`, `GE:`, `PR:`). As 3 tabelas e as constraints da spec conferem com `M:1792843200000_linha-de-base.sql:233-269` (PK `(jogador_id, mes)`, `UNIQUE (lancamento_id)`, FK do lançamento `ON DELETE RESTRICT`); grants de `pelada_app` (SELECT, INSERT, UPDATE, DELETE nas 3 e em `vinculos_admin`) em `M:1792843260000_roles.sql:20-31`; RLS herdada em `M:1792843320000_rls.sql:32-61` (o SEC-003 vigente: lê com slug, escreve sem checar `acessa_financeiro`).
2. **Suposições da spec sobre a feature 3, conferidas no `GE:`**: período `[início, fim)` (`GE:626`, `GE:641`) ✔; criadora nasce com `acessa_financeiro = true` (`GE:399`, `GE:411`) e convidado sem (`CA:511`) ✔; 409 `grupo_arquivado` vem do `exigirGrupoAtivo` global em todo método ≠ GET sob `/api/grupos/:grupoId/*` (`GE:903`), então cobre as escritas do financeiro sem código novo ✔; leitura de arquivado por não criadora = 404 pelo `exigirVinculo` sob `grupos_visiveis()` (`CA:797`, `GE:1131`) ✔; exclusão de jogador com pagamento = 409 `jogador_com_historico` pela FK (`GE:490`, `GE:1245`) ✔, e a FK ignora a RLS, então as policies novas não a afetam (T0 prova); `GET /api/grupos/:grupoId` em `rotas/grupo.ts` (`GE:1080`, ampliado em `PR:1538`) ✔; relógio `hoje()` em São Paulo (`GE:831`) ✔; tipos de `pagamentos_mes` só leitura (`GE:878`) → T11 os torna graváveis.
3. **Cartão de saldo na t09 não existe em nenhuma feature anterior**: a `grupos-e-elenco` não tem item Financeiro (`GE:1849`) e a `partidas-e-ranking` prova que **não** há item Financeiro (`PR:2075`, teste `PAR-160`). T30 e T43 o criam (campo `saldoFinanceiroCentavos` no detalhe do grupo, ausente para quem não tem acesso, AD-079) e mudam testes existentes do `PAR-160` (`PR:2075`) e do formato do detalhe (`GE:1080`, `PR:1538`), com a autorização de 2026-11-04 da `financeiro` em `## Autorizações` do `STATE.md`.
4. **`recursoLiberado` (AD-049)**: nenhuma feature planejada o cria antes; a `simulador` o cria (SIM-68, `SIM:273`) e é a Branch pai. T24 acrescenta o recurso `financeiro` e o aplica só às escritas (AD-074); se ao abrir o lote ele não existir, T24 o cria no caminho que o `tasks.md` da `simulador` definir.
5. **`contas_nomes_do_grupo` (AD-036, `PR:1063`) só lista autoras de pesos e partidas**: o "Última alteração: <nome>" do t23 (FIN-32) precisa das autoras de `lancamentos`. T10 a estende só para quem tem acesso ao financeiro (AD-076).
6. **Decisão nova (FIN-41)**: a trava da coluna cobre também o `INSERT` direto em `vinculos_admin` com `acessa_financeiro = true` por quem não tem acesso, porque o `pelada_app` tem INSERT e um erro da API concederia a permissão por esse caminho; as funções `SECURITY DEFINER` de convite e de criar grupo não passam pela policy `TO pelada_app` (AD-075).
7. **Decisão nova (ordem)**: `exigirVinculo` (404) → `exigirGrupoAtivo` (409, global, `GE:903`) → `exigirFinanceiro` (403 `sem_permissao_financeiro`) → trava de plano nas escritas (403 `plano_pro`). Escrita de admin sem acesso em grupo arquivado responde 409 (AD-077). Serialização: configuração por `pg_advisory_xact_lock` por grupo, como o legado (`L:backend/api/src/infraestrutura/db/repositorios/financeiro/config.ts:19-39`, porque `FOR UPDATE` não trava sem linha); marcar trava o jogador com `travarVarios` (`PR:1185`, mesmo `FOR UPDATE` dos escritores de período, `GE:1457`) e usa a PK para o 409 (AD-078).
8. **Mockup**: t22, t23 e t24 e as respostas já estão em `.specs/mockup/` (`telas.json:124-136`, `:274-278`); as rotas ainda são `/admin/g-quinta/...` → T45 (AD-054). A t09 `sem-financeiro` (`telas.json:35`) é o fluxo do "$" do ranking do legado (`?negado=financeiro`), que a spec não tem: fica fora; a t09 `sucesso` entra na comparação nesta feature e fecha a AD-029 (AD-118, T46). O t19 não tem o interruptor no mockup: revisão manual (FIN-51, T44).
9. **Ensaio (AD-033, AD-073)**: as migrações T9 e T10 só mexem em policies, uma função e grants, sem dado; T15 ensaia sobre o dump da produção e para se o dump vier vazio. Estende o script do ensaio da `partidas-e-ranking` (`PR:1684`).

## Critérios

| ID | Resumo | Tarefa |
|---|---|---|
| FIN-01 | `PUT config` grava mensalidade (ou nulo), saldo inicial e data; 200 | T7, T16, T25 |
| FIN-02 | Data do saldo inicial no futuro: 422 no campo | T7, T25 |
| FIN-03 | Valor não inteiro, fora da faixa, texto ou campo extra: 422 | T7, T25 |
| FIN-04 | Auditoria `financeiro_config_alterada` antes e depois, na transação | T16, T25 |
| FIN-05 | Mudar a mensalidade não muda lançamentos já criados | T16 |
| FIN-06 | Gravações simultâneas da configuração em série | T16 |
| FIN-07 | `GET financeiro/mes` com mês, hoje, navegação, config, saldo, resumo, pagamentos, lançamentos | T5, T7, T17, T26, T36 |
| FIN-08 | Sem configuração: 200 com nulos; tela "Caixa não configurado" | T17, T26, T38 |
| FIN-09 | Mês fora do histórico: 422 "Mês fora do histórico do caixa." | T5, T26 |
| FIN-10 | Saldo atual = inicial + entradas − saídas de [data inicial, hoje] | T3, T17 |
| FIN-11 | Resumo do mês e "não pagaram" só com ativos no mês | T4, T17 |
| FIN-12 | Ativo no mês por período [início, fim); lista por apelido sem acento | T2, T17 |
| FIN-13 | Soma só em inteiros; estouro do inteiro seguro falha a requisição | T1, T3, T4, T17 |
| FIN-14 | Lançamentos do mês do mais recente ao mais antigo, com `mensalidade` | T17, T26 |
| FIN-15 | Tela: `R$ 1.245,50`, saída com menos, linha única das mensalidades | T35, T38, T40 |
| FIN-16 | Marcar cria pagamento e entrada com hoje, descrição e valor da config; 204 | T6, T18, T27 |
| FIN-17 | Sem mensalidade: só o pagamento | T6, T18, T27 |
| FIN-18 | Mês futuro: 422 no campo `mes` | T5, T27 |
| FIN-19 | Jogador fora do mês, de outro grupo ou inexistente: 422 | T2, T18, T27 |
| FIN-20 | Já marcado, inclusive em corrida: 409 `pagamento_ja_marcado` | T18, T27 |
| FIN-21 | Pagamento, lançamento e auditoria numa transação | T18, T33 |
| FIN-22 | Desmarcar apaga pagamento e entrada (mesmo editada), audita; 204 | T19, T27 |
| FIN-23 | Sem pagamento: 404; mês malformado: 422; desmarcar simultâneo 204/404 | T19, T27 |
| FIN-24 | Tela: confirmação do desmarcar; falha volta para "Não pagou" | T39 |
| FIN-25 | `POST lancamentos` cria avulso, audita; 201 | T8, T20, T28 |
| FIN-26 | Descrição, valor, data ou campo extra inválidos: 422 | T8, T28 |
| FIN-27 | `PUT lancamentos/:id` grava, audita antes e depois; mensalidade segue vinculada | T20, T28 |
| FIN-28 | Mensalidade não vira saída: 422 no `tipo` | T20, T28 |
| FIN-29 | `DELETE` de avulso apaga e audita; 204 | T21, T28 |
| FIN-30 | Excluir entrada vinculada: 409 `lancamento_vinculado`, inclusive em corrida | T21, T28 |
| FIN-31 | Lançamento inexistente ou de outro grupo: 404 igual | T20, T28, T31 |
| FIN-32 | t23: novo com Entrada e hoje, contador, "Última alteração", Excluir | T10, T20, T41 |
| FIN-33 | Sem `acessa_financeiro`: 403 `sem_permissao_financeiro`; sem vínculo 404; tela "Sem acesso" | T23, T31, T38 |
| FIN-34 | Início do grupo com o saldo só para quem tem acesso; cartão na t09 | T30, T43, T46 |
| FIN-35 | `PATCH admins/:contaId/financeiro` concede ou retira, audita; igual sem gravar | T22, T29, T44 |
| FIN-36 | Sem acesso 403; própria conta 409 `acao_na_propria_conta`; não admin 404 | T22, T29, T44 |
| FIN-37 | Arquivado: escrita 409 `grupo_arquivado`; leitura 404 para quem não criou | T0, T31 |
| FIN-38 | Contexto público: zero linhas e escrita recusada nas 3 tabelas | T9, T12, T13 |
| FIN-39 | Admin sem acesso: zero linhas e escrita recusada, inclusive sem `WHERE` | T9, T12, T13 |
| FIN-40 | Matriz 3 tabelas × 4 comandos × 3 atores que morre com policy aberta | T12, T13 |
| FIN-41 | Banco recusa alterar `acessa_financeiro` da própria conta e por quem não tem acesso | T10, T13 |
| FIN-42 | Migração nova aditiva, timestamp > `1792844520000`, impressão digital atualizada | T9, T10, T14, T15 |
| FIN-43 | Escrita e auditoria numa transação, `SET LOCAL` antes da primeira consulta | T33 |
| FIN-44 | Auditoria sem descrição, apelido, telefone ou ano | T33 |
| FIN-45 | Financeiro liberado para todos, decisão de plano num ponto único | T24, T32 |
| FIN-46 | Telas t22, t23, t24, cartão t09 e selo/interruptor t19, só tokens | T38 a T44, T46 |
| FIN-47 | Comparação visual PC e celular; rotas `/app/grupos/...`; "Corrija N campos" e mensagem ao lado (posição) | T41, T42, T45, T46 |
| FIN-48 | Valor em reais vira centavos sem decimal; mensagem de valor inválido | T35, T42 |
| FIN-49 | Mês padrão, mês futuro e fim do saldo no fuso de São Paulo | T3, T5, T34 |
| FIN-50 | Ponto em "somente leitura": escritas 403 `plano_pro`, leituras 200 | T24, T32 |
| FIN-51 | t19: interruptor "Acessa financeiro" por admin, revisão manual registrada | T44, T46 |

Nenhum critério fica fora. Os casos limite de `S:207-218` estão nas tarefas dos critérios que eles citam.

## Linha de base

- **Comando da suíte** (o de `.specs/projeto/testes.json` ao fim da fundação, `F:409`): `docker compose up -d --wait && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:checagens && pnpm --filter @pelada/web build && pnpm --filter @pelada/web e2e && pnpm --filter @pelada/web visual`.
- **Resultado hoje** (2026-11-04): não roda. `ls backend frontend` = inexistentes; o `testes.json` atual é a dispensa temporária (repositório sem código) e as features 1 a 5 ainda não foram executadas.
- **Falhas preexistentes**: nenhuma conhecida; a linha de base é o gate final da `simulador`. O `/executar` roda a suíte uma vez antes do lote 1 e registra aqui o resultado. A T0 é a rede de proteção do que a migração desta feature muda no banco.

## Test Coverage Matrix

> Gerada da Base, dos contratos das features 1 a 5 e das regras de teste do `.claude/CLAUDE.md`. Padrão forte: todo critério e todo caso limite com teste.

| Camada | Tipo de teste exigido | Expectativa de cobertura | Padrão de local | Comando |
|---|---|---|---|---|
| Domínio (`backend/dominio/src/caixa`) | unit | Todos os ramos de FIN-09 a FIN-13, FIN-16 a FIN-19 e FIN-49 e os casos limite de `S:209-215`; sem relógio (regra de `GE:527`) | `backend/dominio/test/caixa/*.test.ts` | `pnpm --filter @pelada/dominio test` |
| Contrato (`backend/contrato`) | unit | Cada schema: válido, cada limite (1, 99.999.999, −99.999.999, 80 caracteres), não inteiro, texto, campo extra, campo de vínculo | `backend/contrato/test/financeiro*.test.ts` | `pnpm --filter @pelada/contrato test` |
| Banco: migração, RLS, grants e função | integration | Postgres real como `pelada_app` (`comoApp`, `F:909`); matriz política × comando abaixo; trava da coluna; checagem aditiva; impressão digital | `backend/api/test/banco/financeiro-*.test.ts`, `backend/api/test/isolamento/financeiro-rls.test.ts` | `pnpm --filter @pelada/api test` |
| Repositórios | integration | Cada caminho, auditoria na mesma transação, rollback em falha forçada, corridas com duas conexões (config, marcar, desmarcar, excluir vinculado), 23505 e 23503 → 409 | `backend/api/test/repositorios/financeiro-*.test.ts` | `pnpm --filter @pelada/api test` |
| Middlewares e rotas | e2e | Pool `workerd` com Postgres local e relógio fixo: caminho feliz e cada código de erro da spec, 404 cruzado, 403 sem acesso, 409 de arquivado, trava de plano forçada | `backend/api/test/rotas/financeiro-*.test.ts` | `pnpm --filter @pelada/api test` |
| Isolamento de rotas | e2e | Toda rota nova: conta do grupo A contra o B (404), admin sem acesso (403), arquivado | `backend/api/test/isolamento/rotas.test.ts` | `pnpm --filter @pelada/api test` |
| Front: dados e telas | unit | jsdom + Testing Library + axe: cada estado do mockup e cada mensagem da spec; dinheiro sem `parseFloat` | `frontend/web/src/**/*.test.{ts,tsx}` | `pnpm --filter @pelada/web test` |
| Front: comparação visual | e2e | t22 (6 estados), t23 (4), t24 (2) e t09 `sucesso` × PC e celular até 1%; "ao lado do campo" com `boundingBox` | `frontend/web/e2e/visual.mjs`, `frontend/web/e2e/telas-ativas.json` | `pnpm --filter @pelada/web visual` |
| Front: jornadas | e2e | Jornadas desta feature contra o `wrangler dev` com o seed | `frontend/web/e2e/financeiro.spec.ts` | `pnpm --filter @pelada/web e2e` |
| Ensaio da migração | integration | Dump da produção restaurado: contagem igual, schema esperado, segunda execução sem DDL | `backend/scripts/src/ensaio-migracao.ts` | `pnpm --filter @pelada/scripts ensaio` |

**Matriz política × comando** (FIN-40; como `pelada_app`, grupos A e B; atores: **X** = conta do grupo B contra linhas de A (FUN-17), **P** = só o contexto público do slug de A (FIN-38), **N** = admin de A com `acessa_financeiro` falso (FIN-39); controle positivo: **C** = criadora de A, com acesso, lê e escreve). Cada célula é um teste que morre com a policy aberta (`USING (true)`), sem `WITH CHECK` ou com a restritiva removida; o conteúdo de A fica idêntico depois de cada escrita recusada.

| Tabela × ator | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `config_financeira` × X | zero linhas de A (T12) | linha com `grupo_id` de A recusada (T12) | sem `WHERE` e com `WHERE grupo_id = A`: zero linhas (T13) | sem `WHERE`: zero linhas (T13) |
| `config_financeira` × P | zero linhas (T12) | recusado (T12) | zero linhas ou recusado (T13) | zero linhas ou recusado (T13) |
| `config_financeira` × N | zero linhas (T12) | recusado pelo `WITH CHECK` (T12) | sem `WHERE`: zero linhas; C mover para B recusado (T13) | sem `WHERE`: zero linhas (T13) |
| `lancamentos` × X | zero linhas de A (T12) | recusado (T12) | sem `WHERE`: zero linhas (T13) | sem `WHERE`: zero linhas (T13) |
| `lancamentos` × P | zero linhas (T12) | recusado (T12) | zero linhas ou recusado (T13) | zero linhas ou recusado (T13) |
| `lancamentos` × N | zero linhas (T12) | recusado (T12) | sem `WHERE`: zero linhas; trocar `grupo_id` recusado (T13) | sem `WHERE`: zero linhas (T13) |
| `pagamentos_mes` × X | zero linhas de A (T12) | recusado (T12) | sem `WHERE`: zero linhas (T13) | sem `WHERE`: zero linhas (T13) |
| `pagamentos_mes` × P | zero linhas (T12) | recusado (T12) | zero linhas ou recusado (T13) | zero linhas ou recusado (T13) |
| `pagamentos_mes` × N | zero linhas (T12) | recusado (T12) | sem `WHERE`: zero linhas (T13) | sem `WHERE`: zero linhas (T13) |
| `vinculos_admin.acessa_financeiro` (FIN-41) | inalterado: admins do grupo leem (T0) | N inserindo vínculo com `true`: recusado; C: aceito (T13) | N alterando outro: zero linhas; C alterando a própria: zero linhas; C alterando outro: aceito (T13) | inalterado (remoção de admin da CA, T0) |
| `pelada_backup_ro` | lê tudo nas 3 tabelas (T12, policy herdada intacta) | — | — | — |

## Gate Check Commands

| Nível do gate | Quando usar | Comando |
|---|---|---|
| Quick | Tarefas só com teste unitário, no pacote tocado | `pnpm --filter <pacote> test` |
| Full | Tarefas com integration ou e2e; exige o Postgres local | `docker compose up -d --wait && pnpm typecheck && pnpm test && pnpm test:checagens` |
| Build | Telas, comparação visual e o fim da feature | O comando da seção Linha de base |

## Execution Plan

As Phases rodam em ordem; dentro de cada uma, em sequência. Criticidade: Phases 1 a 14 **críticas**, 15 a 20 **comuns**. Total: 49 tarefas (T0 a T48), 20 Phases, 74,5h. Lotes previstos (até 6h, Phases inteiras; `progresso.py --lote` confirma): L1 = P1 + P2 (5,5h, crítico); L2 = P3 (4h, crítico); L3 = P4 (3h, crítico); L4 = P5 (4,5h, crítico); L5 = P6 (5h, crítico); L6 = P7 + P8 (6h, crítico); L7 = P9 (3,5h, crítico); L8 = P10 (5h, crítico); L9 = P11 (2,5h, crítico); L10 = P12 (5h, crítico); L11 = P13 (4h, crítico); L12 = P14 (6h, crítico); L13 = P15 (4h, comum); L14 = P16 (4,5h, comum); L15 = P17 + P18 (6h, comum); L16 = P19 + P20 (6h, comum). 16 lotes: 12 críticos, 4 comuns. Lotes com tarefa de `Domínio: sim`: L1, L2, L6, L7, L8.

### Phase 1: Rede de proteção do banco (crítica, 2h)

```
T0
```

### Phase 2: Domínio: centavos, ativo no mês e saldo (crítica, 3,5h)

```
T1 → T2 → T3
```

### Phase 3: Domínio: resumo, mês e mensalidade (crítica, 4h)

```
T4 → T5 → T6
```

### Phase 4: Contrato (crítica, 3h)

```
T7 → T8
```

### Phase 5: Migrações de RLS e trava da coluna (crítica, 4,5h)

```
T9 → T10 → T11
```

### Phase 6: Matriz política × comando e impressão digital (crítica, 5h)

```
T12 → T13 → T14
```

### Phase 7: Ensaio sobre o dump da produção (crítica, 2h)

```
T15
```

### Phase 8: Repositórios: configuração e mês (crítica, 4h)

```
T16 → T17
```

### Phase 9: Repositórios: pagamentos (crítica, 3,5h)

```
T18 → T19
```

### Phase 10: Repositórios: lançamentos e acesso (crítica, 5h)

```
T20 → T21 → T22
```

### Phase 11: Middlewares: permissão e trava de plano (crítica, 2,5h)

```
T23 → T24
```

### Phase 12: Rotas: configuração, mês e pagamentos (crítica, 5h)

```
T25 → T26 → T27
```

### Phase 13: Rotas: lançamentos, acesso e início do grupo (crítica, 4h)

```
T28 → T29 → T30
```

### Phase 14: Provas transversais: isolamento, plano, transação e fuso (crítica, 6h)

```
T31 → T32 → T33 → T34
```

### Phase 15: Web: dinheiro, dados e rotas (comum, 4h)

```
T35 → T36 → T37
```

### Phase 16: Web: financeiro do mês (t22) (comum, 4,5h)

```
T38 → T39 → T40
```

### Phase 17: Web: lançamento (t23) e configuração (t24) (comum, 3,5h)

```
T41 → T42
```

### Phase 18: Web: início (t09) e admins (t19) (comum, 2,5h)

```
T43 → T44
```

### Phase 19: Comparação visual (comum, 3h)

```
T45 → T46
```

### Phase 20: Seed e jornadas (comum, 3h)

```
T47 → T48
```

## Task Breakdown

#### Phase 1: Rede de proteção do banco

### T0: Caracterização no banco do que a migração do financeiro troca e precisa manter

**What**: Rede de proteção (T0, skill `rede-de-protecao`): testes no Postgres, como `pelada_app`, do comportamento atual: (a) as constraints das 3 tabelas (CHECKs de valor e descrição, PK `(jogador_id, mes)`, `UNIQUE (lancamento_id)`, FK `ON DELETE RESTRICT` do lançamento vinculado); (b) conta de outro grupo não lê nem escreve (fica verde até o fim); (c) SEC-003 vigente: slug de A lê as 3 tabelas e admin de A sem acesso lê e escreve (os testes deste item são os que T9 inverte, com motivo no commit); (d) `pelada_app` altera `vinculos_admin.acessa_financeiro` da própria conta (o que T10 inverte); (e) exclusão de jogador com pagamento dá 23503 (GEL-85) e `admins_listar` devolve `acessa_financeiro` (ficam verdes até o fim); (f) arquivado: não criadora não vê as linhas (FIN-37).
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/banco/financeiro-rede.test.ts`
**Depends on**: None
**Reuses**: `comoApp` e o cenário de dois grupos (`F:909`); cenário de grupos e elenco (`GE:348`); `M:1792843200000_linha-de-base.sql:233-269`; `M:1792843260000_roles.sql:20-31`; `M:1792843320000_rls.sql:32-61`; `M:1792843680000_conta-admins-listar.sql:8-20`; molde da rede da `partidas-e-ranking` (`PR:430`)
**Requirement**: FIN-37, FIN-38, FIN-39, FIN-41 (linha de base)
**Status**: rascunhada
**Nota do rascunho**: a evidência da rede (uma sabotagem por item) está listada no topo do teste; o /executar roda e registra aqui.

**Done when**:

- [ ] Teste `FIN-13`: `valor_centavos` 0 e 100.000.000 recusados; descrição só com espaços recusada (item a, fica verde)
- [ ] Teste `FIN-20`: segundo pagamento do mesmo jogador e mês dá 23505 (item a, fica verde)
- [ ] Teste `FIN-30`: apagar o lançamento de um pagamento dá 23503 (item a, fica verde)
- [ ] Teste `FIN-38` e `FIN-39` (antes): slug de A e admin sem acesso leem as linhas de A (item c, marcados para T9 inverter)
- [ ] Teste `FIN-41` (antes): `pelada_app` muda `acessa_financeiro` da própria conta (item d, marcado para T10 inverter)
- [ ] Teste `FIN-37`: com A arquivado, a não criadora vê zero linhas nas 3 tabelas
- [ ] Evidência da rede: uma sabotagem por item (ex.: `DROP CONSTRAINT` do `UNIQUE (lancamento_id)` numa cópia) deixa o teste vermelho; registrada nesta tarefa
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 2: Domínio: centavos, ativo no mês e saldo

### T1: Soma em centavos com estouro detectado

**What**: `somarCentavos(valores)` e `subtrairCentavos(a, b)` em inteiros, que lançam `ErroEstouroCentavos` quando o resultado sai de `Number.isSafeInteger`; nunca arredondam nem dividem.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/caixa/centavos.ts`
**Depends on**: T0
**Reuses**: Regra do domínio sem relógio e sem I/O (`GE:527`, `F:385`); regra de `L:backend/dominio/src/caixa/saldos.ts:27-79` (só consulta)
**Requirement**: FIN-13
**Status**: rascunhada
**Nota do rascunho**: rascunhada fora da ordem, sem a T0 (que depende do cenário da grupos-e-elenco), a pedido do usuário em 2026-11-05. O `index.ts` do domínio ainda não exporta o caixa: o /executar acrescenta as exportações (outra sessão edita o arquivo).

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `FIN-13`: soma de 200 entradas de 99.999.999 dá o valor exato (passa do teto do cliente)
- [ ] Teste `FIN-13`: soma que passa de `MAX_SAFE_INTEGER` lança, sem devolver valor truncado
- [ ] Teste `FIN-13`: valor não inteiro lança
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T2: Ativo no mês

**What**: `ativoNoMes(periodos, mes)`: verdadeiro se algum período `[início, fim)` contém ao menos um dia do mês; `ativosNoMes(jogadores, mes)` devolve cada jogador uma vez, ordenado por `compararApelido`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/caixa/atividade-mes.ts`
**Depends on**: T1
**Reuses**: Intervalo `[início, fim)` de `backend/dominio/src/atividade/datas.ts` (`GE:626`); `primeiroDia` e `ultimoDia` de `backend/dominio/src/datas.ts` (`PR:457`); `compararApelido` (`GE:575`); regra de `L:backend/dominio/src/atividade/atividade.ts:3-36`
**Requirement**: FIN-12, FIN-11, FIN-19
**Status**: rascunhada

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `FIN-12`: período `[2026-10-31, aberto)` é ativo em outubro; `[2026-09-01, 2026-10-01)` não é
- [ ] Teste `FIN-12`: saiu em 10/10 e voltou em 20/10 conta uma vez
- [ ] Teste `FIN-12`: ["Zé", "ana", "Álvaro"] sai em Álvaro, ana, Zé
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T3: Saldo atual

**What**: `saldoAtual(config, lancamentos, hoje)`: saldo inicial + entradas − saídas com data entre a data do saldo inicial e `hoje`, inclusive; `hoje` anterior à data inicial devolve o saldo inicial; usa T1.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/caixa/saldos.ts`
**Depends on**: T2
**Reuses**: `somarCentavos` (T1); regra de `L:backend/dominio/src/caixa/saldos.ts:34-40`; AD-055 (data futura só conta quando chega)
**Requirement**: FIN-10, FIN-13, FIN-49
**Status**: rascunhada
**Nota do rascunho**: fora da ordem, a pedido do usuário. O código entrou por engano no commit `7137e7d` de outra sessão. Datas comparadas como texto `AAAA-MM-DD`, sem os tipos da feature 3.

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `FIN-10`: lançamento anterior à data inicial e lançamento de amanhã não contam; o de hoje conta
- [ ] Teste `FIN-10`: saldo inicial negativo sai negativo
- [ ] Teste `FIN-10`: hoje antes da data inicial devolve o saldo inicial
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 3: Domínio: resumo, mês e mensalidade

### T4: Resumo do mês e "não pagaram"

**What**: `resumoDoMes(lancamentos, ativos, pagamentos, mes)`: entradas e saídas com data no mês, resultado, "não pagaram" = ativos no mês sem pagamento; pagamento de quem não era ativo não desconta; lista de pagamentos só dos ativos, com `pagou`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/caixa/resumo.ts`
**Depends on**: T3
**Reuses**: T1 e T2; regra de `L:backend/dominio/src/caixa/saldos.ts:42-79`
**Requirement**: FIN-11, FIN-12, FIN-13
**Status**: rascunhada
**Nota do rascunho**: fora da ordem, sem a T2: `resumoDoMes` recebe os ativos já filtrados e ordenados por `ativosNoMes` e só remove repetidos. O código entrou no commit `7137e7d` de outra sessão.

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `FIN-11`: 20 ativos, 16 pagos, mensalidade 7.500 e saída 90.000 dão entradas 120.000, saídas 90.000, resultado 30.000 e 4 não pagaram (Independent Test de `S:90`)
- [ ] Teste `FIN-11`: pagamento de jogador inativo no mês não reduz "não pagaram" e não entra na lista
- [ ] Teste `FIN-16`: pagamento de setembro marcado em outubro conta nas entradas de outubro
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T5: Mês do caixa: histórico, navegação e mês futuro

**What**: `mesesDoCaixa(dataSaldoInicial, hoje)` (do mês da data inicial ao mês de hoje), `mesNoHistorico`, `navegacao(mes)` (anterior e seguinte ou nulo) e `mesFuturo(mes, hoje)`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/caixa/mes.ts`
**Depends on**: T4
**Reuses**: `mesDe`, `mesAnterior`, `mesSeguinte`, `compararMeses` (`PR:457`); molde da navegação do ranking (`PR:738`); regra de `L:backend/api/src/aplicacao/financeiro/mes.ts:20-89`
**Requirement**: FIN-07, FIN-09, FIN-18, FIN-49
**Status**: rascunhada
**Lacunas**: (1) outro mês sem configuração: tratado como fora do histórico (422); (2) data do saldo inicial em mês posterior ao de hoje: histórico só com o mês de hoje (`backend/dominio/src/caixa/mes.ts`).

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `FIN-09`: com data inicial 2026-07-15 e hoje 2026-10-03, julho e outubro navegáveis, junho e novembro fora
- [ ] Teste `FIN-07`: no primeiro mês `mesAnterior` é nulo; no mês de hoje `mesSeguinte` é nulo
- [ ] Teste `FIN-18`: novembro é futuro com hoje 2026-10-31; outubro não
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T6: Entrada da mensalidade

**What**: `entradaDaMensalidade(config, apelido, mes, hoje)`: devolve `{ tipo: 'entrada', data: hoje, descricao: 'Mensalidade <apelido> MM/AAAA', valorCentavos: config.mensalidadeCentavos }` ou nulo sem mensalidade (ou sem configuração).
**Estimativa**: 1h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/caixa/mensalidade.ts`
**Depends on**: T5
**Reuses**: regra de `L:backend/dominio/src/caixa/mensalidade.ts:10-28`
**Requirement**: FIN-16, FIN-17
**Status**: rascunhada
**Nota do rascunho**: fora da ordem, sem a T5. O código entrou no commit `7137e7d` de outra sessão.

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `FIN-16`: Toninho em 2026-10 marcado em 2026-11-02 dá "Mensalidade Toninho 10/2026", data 2026-11-02, valor da configuração
- [ ] Teste `FIN-17`: mensalidade nula ou sem configuração devolve nulo
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 4: Contrato

### T7: Contrato da configuração e do mês

**What**: Schemas `.strict()` `configFinanceiraCorpo` (`mensalidadeCentavos` inteiro 1 a 99.999.999 ou nulo, `saldoInicialCentavos` inteiro −99.999.999 a 99.999.999, `dataSaldoInicial` data real), `configFinanceiraResposta`, `mesFinanceiroConsulta` (`mes` opcional `AAAA-MM`, "Mês inválido.") e `mesFinanceiroResposta` (saldo e somas como inteiro seguro sem teto).
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/contrato/src/financeiro.ts`
**Depends on**: T6
**Reuses**: Primitivos `.strict()` e inteiros da CA (`CA:550`); molde do contrato de pesos (`PR:865`); limites de `L:backend/contrato/src/limites.ts:17-19` e `L:backend/contrato/src/financeiro.ts:8-103`
**Requirement**: FIN-01, FIN-03, FIN-07, FIN-13
**Status**: rascunhada
**Nota do rascunho**: fora da ordem, sem os primitivos da GE: `centavos`, a data real (`z.iso.date()`) e a mensagem "Informe uma data válida." ficam locais em `financeiro.ts`; falta `./financeiro` no `exports` do `package.json` e no `index.ts` do contrato (outra sessão edita esses arquivos). O código entrou no commit `7137e7d` de outra sessão.

**Done when**:

- [ ] Teste `FIN-03`: 1,5, "75", 0, 100.000.000 e −100.000.000 recusados com o campo; campo extra recusado
- [ ] Teste `FIN-01`: mensalidade nula aceita; limites exatos aceitos
- [ ] Teste `FIN-13`: a resposta aceita saldo de 10.000.000.000 (acima do teto de entrada)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T8: Contrato de pagamentos, lançamentos e acesso

**What**: Schemas `.strict()` `pagamentoCorpo` (`jogadorId`, `mes`), `lancamentoCorpo` (`tipo`, `data`, `descricao` 1 a 80 depois do `trim` com "A descrição precisa ter de 1 a 80 caracteres.", `valorCentavos` 1 a 99.999.999), `lancamentoResposta` (com `mensalidade`, `alteradoPor`, `alteradoEm`), `acessoFinanceiroCorpo` (`acessaFinanceiro` booleano) e os códigos `pagamento_ja_marcado`, `lancamento_vinculado`, `sem_permissao_financeiro`, `acao_na_propria_conta` e `plano_pro`, com as mensagens da spec.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/contrato/src/financeiro-lancamentos.ts`
**Depends on**: T7
**Reuses**: Códigos de erro da GE (`GE:854`); primitivos (`CA:550`)
**Requirement**: FIN-25, FIN-26, FIN-35, FIN-36
**Status**: rascunhada
**Nota do rascunho**: `centavos` passou a ser exportado de `financeiro.ts` (T7); `plano_pro` repete o código e o texto de `plano.ts` (feature 7) para não depender dela; falta `./financeiro-lancamentos` no `exports` do `package.json` e no `index.ts` do contrato (outra sessão edita esses arquivos).

**Done when**:

- [ ] Teste `FIN-26`: descrição de 81 caracteres ou só espaços dá a mensagem da spec; `pagamentoId` ou `mensalidade` no corpo é campo extra
- [ ] Teste `FIN-26`: data 2026-02-30 recusada; valor 0 recusado
- [ ] Teste `FIN-25`: corpo válido passa; descrição com espaços nas pontas sai sem eles
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 5: Migrações de RLS e trava da coluna

### T9: Migração: policies restritivas nas 3 tabelas do financeiro

**What**: Migração aditiva (gerador `F:883`, timestamp maior que `1792844520000` e que a última migração das features 4 e 5): função `app_acessa_financeiro(p_grupo_id uuid) RETURNS boolean`, `STABLE SECURITY DEFINER`, `search_path` fixo, `EXECUTE` só para `pelada_app` (conta do contexto com vínculo e `acessa_financeiro` no grupo; sem conta, falso); policies `AS RESTRICTIVE FOR ALL TO pelada_app USING (app_acessa_financeiro(grupo_id)) WITH CHECK (app_acessa_financeiro(grupo_id))` em `config_financeira`, `lancamentos` e `pagamentos_mes`. Sem DROP; as policies herdadas e a do backup ficam. Inverte os testes do item c da T0, com motivo no commit.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/migracoes/<ts>_financeiro-rls.sql`
**Depends on**: T8
**Reuses**: Gerador e checagem aditiva (`F:883`, `F:858`); molde de função de visibilidade `grupos_visiveis()` (`M:1792844280000_grupos-visiveis-arquivado.sql:9-22`); laço das policies herdadas (`M:1792843320000_rls.sql:32-61`); AD-052
**Requirement**: FIN-38, FIN-39, FIN-42
**Status**: rascunhada
**Nota do rascunho**: migração `1792845300000_financeiro-rls.sql`, com folga para as migrações das features 4 e 5 (ainda não escritas): o /executar confere que o timestamp é maior que a última delas. Testes em `backend/api/test/banco/financeiro-rls-migracao.test.ts` e `backend/scripts/checagens/test/migracao-aditiva-financeiro.test.ts` (este já cita a migração da T10). O código entrou no commit `b65363b` de outra sessão (índice do git compartilhado).

**Done when**:

- [ ] Teste `FIN-38`: com só o slug de A, zero linhas nas 3 tabelas e INSERT recusado
- [ ] Teste `FIN-39`: admin sem acesso vê zero linhas; a criadora vê as de A
- [ ] Teste `FIN-42`: a checagem de migração aditiva passa; `pelada_backup_ro` continua lendo tudo
- [ ] Testes do item c da T0 invertidos com motivo no commit, mesma força
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T10: Migração: trava de `vinculos_admin.acessa_financeiro` e nomes das autoras de lançamentos

**What**: Segunda migração aditiva: policies `AS RESTRICTIVE TO pelada_app` em `vinculos_admin`: `FOR UPDATE USING (conta_id <> app_conta_id() AND app_acessa_financeiro(grupo_id)) WITH CHECK (mesma)` e `FOR INSERT WITH CHECK (NOT acessa_financeiro OR app_acessa_financeiro(grupo_id))` (AD-075); `CREATE OR REPLACE` de `contas_nomes_do_grupo` acrescentando as autoras de `lancamentos.criado_por` e `alterado_por` só quando `app_acessa_financeiro` (AD-076). Inverte o item d da T0.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/migracoes/<ts>_financeiro-trava-acesso.sql`
**Depends on**: T9
**Reuses**: `app_acessa_financeiro` (T9); `contas_nomes_do_grupo` vigente (`PR:1063`, AD-036); funções `SECURITY DEFINER` de convite e de criar grupo que inserem vínculo (`M:1792844460000_convites-grupo-arquivado.sql:49`, `:90`; `M:1792844340000_grupo-criar.sql:60`), que não podem quebrar
**Requirement**: FIN-41, FIN-42, FIN-32
**Status**: rascunhada
**Nota do rascunho**: migração `1792845360000_financeiro-trava-acesso.sql`. O corpo de `contas_nomes_do_grupo` foi escrito sem a migração da feature 4 (ainda não existe no repositório): o /executar confere que ele repete o dela e só acrescenta as autoras de lançamentos. Testes em `backend/api/test/banco/financeiro-trava-acesso.test.ts`; o item (d) da T0 foi invertido em `financeiro-rede.test.ts`. Teste de `convite_aceitar` fica para o /executar (os testes da CA já o cobrem; só `grupo_criar` foi provado aqui).

**Done when**:

- [ ] Teste `FIN-41`: a conta com acesso não muda a própria `acessa_financeiro` (zero linhas); a sem acesso não muda a de ninguém; a com acesso muda a de outro admin
- [ ] Teste `FIN-41`: INSERT direto de vínculo com `true` por conta sem acesso recusado; `grupo_criar` e `convite_aceitar` continuam criando os vínculos (testes da CA e da GE verdes)
- [ ] Teste `FIN-32`: `contas_nomes_do_grupo` traz a autora de um lançamento para a criadora e não para o admin sem acesso
- [ ] Teste do item d da T0 invertido com motivo no commit
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T11: Tipos Kysely das tabelas do financeiro

**What**: Tornar graváveis nos tipos do banco `config_financeira`, `lancamentos` e `pagamentos_mes` (hoje `pagamentos_mes` só leitura), com o teste que confere colunas e tipos contra o catálogo do banco migrado.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/tipos.ts`
**Depends on**: T10
**Reuses**: Estender `tipos.ts` (`GE:878`, `PR:1013`); colunas de `M:1792843200000_linha-de-base.sql:233-269`
**Requirement**: FIN-13
**Status**: rascunhada

**Done when**:

- [ ] Teste: os tipos batem com o catálogo nas 3 tabelas (inteiros como `number`, datas como texto `AAAA-MM-DD`)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 6: Matriz política × comando e impressão digital

### T12: Matriz SELECT e INSERT das 3 tabelas

**What**: Testes das colunas SELECT e INSERT da Matriz política × comando: 3 tabelas × 3 atores (X, P, N) mais o controle C e a leitura do `pelada_app` sem contexto; cada teste prova a recusa e que o conteúdo de A ficou idêntico.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/isolamento/financeiro-rls.test.ts`
**Depends on**: T11
**Reuses**: Matrizes de leitura e escrita da fundação (`F:981`, `F:1007`); `comoApp` (`F:909`); molde da matriz da GE (`GE:372`)
**Requirement**: FIN-38, FIN-39, FIN-40
**Status**: rascunhada
**Nota do rascunho**: a evidência (sabotagens) está listada no topo do teste; o /executar roda e registra aqui.

**Done when**:

- [ ] Testes `FIN-40`: 18 células (3 tabelas × 3 atores × SELECT e INSERT), uma por teste, com o nome da célula
- [ ] Evidência: trocar a restritiva por `USING (true)` numa cópia deixa vermelhas as células P e N; tirar o `WITH CHECK` deixa vermelhas as de INSERT; registrada nesta tarefa
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T13: Matriz UPDATE e DELETE das 3 tabelas e trava da coluna

**What**: Testes das colunas UPDATE e DELETE: 3 tabelas × 3 atores, com e sem `WHERE`, mover a linha para outro grupo pelo `WITH CHECK`; e as células de `vinculos_admin.acessa_financeiro` da matriz.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/isolamento/financeiro-rls-escrita.test.ts`
**Depends on**: T12
**Reuses**: T12; matriz de escrita da fundação (`F:1007`)
**Requirement**: FIN-39, FIN-40, FIN-41
**Status**: rascunhada
**Nota do rascunho**: a evidência (sabotagens) está listada no topo do teste; o /executar roda e registra aqui. A célula de DELETE do controle C apaga pagamentos, lançamentos e configuração nessa ordem, porque a FK do lançamento vinculado é `ON DELETE RESTRICT`.

**Done when**:

- [ ] Testes `FIN-40`: 18 células (3 tabelas × 3 atores × UPDATE e DELETE), incluindo `UPDATE` e `DELETE` sem `WHERE`, que afetam zero linhas de A
- [ ] Testes `FIN-41`: as 4 células de `vinculos_admin` da matriz
- [ ] Evidência: `USING (true)` ou restritiva sem `WITH CHECK` numa cópia deixa vermelhas as células correspondentes; registrada nesta tarefa
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T14: Impressão digital do schema com as migrações novas

**What**: Regenerar `esquema-producao.txt` com `pnpm esquema:gerar` incluindo as migrações de T9 e T10 e conferir que o teste de igualdade passa e que o `migracoes.sha256` das 23 continua intacto.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/migracoes/esquema-producao.txt`
**Depends on**: T13
**Reuses**: Referência do schema e teste de igualdade (`F:784`); hash das 23 (`F:661`); mesmo passo nas features 4 e 5
**Requirement**: FIN-42
**Status**: rascunhada
**Nota do rascunho**: só o teste foi escrito (`backend/api/test/migracoes/esquema-financeiro.test.ts`). O `esquema-producao.txt` ainda não existe (a fundação não foi executada) e regenerá-lo exige rodar `pnpm esquema:gerar`, que o rascunho não faz: o /executar o gera depois de aplicar T9 e T10, confere o diff (só a função, o grant, as 5 policies e a função de nomes) e o commita. As linhas `policy`/`funcao` esperadas no teste seguem o formato de `esquema.ts:111-149`.

**Done when**:

- [ ] Teste `FIN-42`: banco vazio migrado tem `lerEsquema` igual ao arquivo regenerado; o diff contra o anterior tem só a função, as 5 policies e a função de nomes
- [ ] Teste `FIN-42`: as 23 copiadas continuam com o mesmo SHA-256
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 7: Ensaio sobre o dump da produção

### T15: Ensaio das migrações do financeiro sobre um dump da produção (AD-033, AD-073)

**What**: Restaurar no Postgres local um dump recente da produção (artefato cifrado do `backup.yml`, decifrado pelo usuário fora do repositório: pausa para o usuário), contar as linhas por tabela, aplicar `pnpm migrar` com as migrações de T9 e T10 e conferir: mesma contagem em toda tabela, schema igual à referência de T14, uma segunda execução sem DDL, e que a criadora de cada grupo continua lendo o próprio caixa (amostra de 1 grupo, como `pelada_app` com o contexto dela). Antes do primeiro deploy da prévia com estas migrações (AD-032). Nada roda contra a `main` do Neon.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/scripts/src/ensaio-migracao.ts`
**Depends on**: T14
**Reuses**: Script do ensaio da `partidas-e-ranking` (`PR:1684`, estender); restauração da fundação (`F:584`); `lerEsquema` e referência (`F:736`, `F:784`); migrar sobre banco migrado (`F:834`); AD-033 e AD-073
**Requirement**: FIN-42, FIN-39
**Status**: rascunhada
**Nota do rascunho**: o script e o teste dele foram escritos (`backend/scripts/src/ensaio-migracao.ts`, `backend/scripts/test/ensaio-migracao.test.ts`, script `ensaio` no `package.json`). O ensaio com o dump real da produção (pausa para o usuário decifrar o backup, `pnpm --filter @pelada/scripts ensaio <backup.age> <chave.txt>`) e a `Evidência` ficam para o /executar. O script da `partidas-e-ranking` (T81 dela) ainda não existe: este nasceu sozinho e `podeGanhar` aceita `config_pesos` quando as duas se juntarem.

**Done when**:

- [ ] `Evidência`: data e origem do dump, contagem por tabela antes e depois, diff do schema e a saída da segunda execução, registrados nesta tarefa
- [ ] Teste `FIN-42`: nenhuma tabela muda de contagem
- [ ] Teste `FIN-39`: no banco ensaiado, uma conta com `acessa_financeiro` lê o caixa do grupo dela e uma sem acesso lê zero linhas
- [ ] Dump com zero linhas nas tabelas de negócio (AD-014, AD-073) bloqueia a tarefa: pare e pergunte, porque o ensaio não prova nada
- [ ] Banco de ensaio removido no `finally`; o dump decifrado não entra no git
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 8: Repositórios: configuração e mês

### T16: Repositório da configuração

**What**: `financeiro.lerConfig(db, grupoId)` e `financeiro.salvarConfig(db, grupoId, dados, contaId, agora)`: `pg_advisory_xact_lock` por grupo, lê a anterior, `INSERT … ON CONFLICT (grupo_id) DO UPDATE`, e `auditoria.registrar` `financeiro_config_alterada` com os três campos antes e depois, na mesma transação (AD-078).
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/financeiro/config.ts`
**Depends on**: T15
**Reuses**: `auditoria.registrar` (`CA:844`); molde de repositório com auditoria (`PR:1159`); regra da trava de `L:backend/api/src/infraestrutura/db/repositorios/financeiro/config.ts:19-39` (só consulta)
**Requirement**: FIN-01, FIN-04, FIN-05, FIN-06
**Status**: rascunhada
**Nota do rascunho**: `SPEC_DEVIATION`: a assinatura ficou `salvarConfig(db, grupoId, dados)`, sem `contaId` e `agora`, porque `auditoria.registrar` (`convites.ts:24`) já usa `app_conta_id()` e `now()` e a tabela não tem autoria. O repositório sai como `configFinanceira` (`lerConfig`, `salvarConfig`) e devolve `{ antes, depois }`; as rotas (T25) usam essa forma.

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `FIN-01`: primeira gravação cria; a segunda substitui, uma linha por grupo
- [ ] Teste `FIN-04`: a auditoria tem antes nulo na primeira e o depois da primeira como antes da segunda; falha forçada na auditoria desfaz a gravação
- [ ] Teste `FIN-05`: mudar a mensalidade não muda o valor de lançamento de mensalidade existente
- [ ] Teste `FIN-06`: duas conexões gravando ao mesmo tempo (ainda sem linha) ficam em série e o antes da segunda é o depois da primeira
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T17: Repositório de leitura do mês

**What**: `financeiro.lerMes(db, grupoId, mes, hoje)`: configuração, lançamentos do intervalo do saldo e do mês (mais recente primeiro, com `mensalidade` = existe pagamento com esse `lancamento_id`), pagamentos do mês, jogadores com períodos que tocam o mês; monta a resposta com o domínio (T3, T4, T5). Somas no domínio sobre os valores inteiros, nunca `SUM` convertido em `numeric`.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/financeiro/mes.ts`
**Depends on**: T16
**Reuses**: Domínio T2 a T5; leitura de períodos de `jogadores-leitura.ts` (`GE:1179`); regra de `L:backend/api/src/aplicacao/financeiro/mes.ts:20-89`
**Requirement**: FIN-07, FIN-08, FIN-10, FIN-11, FIN-12, FIN-13, FIN-14
**Status**: rascunhada
**Nota do rascunho**: o repositório sai como `financeiroMes.lerMes(db, grupoId, mes, hoje)`; o mês chega validado pela rota (FIN-09, T26). Importa `@pelada/dominio` (`ativosNoMes`, `resumoDoMes`, `saldoAtual`, `navegacao`) e o tipo de `@pelada/contrato` (`MesFinanceiroResposta`): o /executar precisa acrescentar as exportações do caixa no `index.ts` do domínio e `./financeiro` no `exports` e no `index.ts` do contrato (ver notas de T1 a T8). O estouro do inteiro seguro é provado no domínio (T1); aqui não há teste de estouro, que exigiria ~90 milhões de linhas.

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `FIN-08`: sem configuração, nulos, listas vazias e navegação nula
- [ ] Teste `FIN-14`: ordem do mais recente ao mais antigo, com `mensalidade` verdadeiro só nos vinculados
- [ ] Teste `FIN-12`: jogador de outro grupo nunca aparece; ativo só no fim do mês aparece
- [ ] Teste `FIN-13`: soma com valores reais do banco que passa de 99.999.999 sai exata
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 9: Repositórios: pagamentos

### T18: Marcar pagamento

**What**: `financeiro.marcar(db, grupoId, jogadorId, mes, contaId, hoje, agora)`: trava o jogador com `travarVarios` (AD-038, AD-078), confere ativo no mês (T2; senão `jogador_fora_do_mes` → 422), lê a configuração, insere o lançamento (T6) quando há mensalidade, insere o pagamento vinculado e audita `pagamento_marcado` (mês e valor); 23505 da PK → 409 `pagamento_ja_marcado`.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/financeiro/pagamentos.ts`
**Depends on**: T17
**Reuses**: `travarVarios` (`PR:1185`); tradutor de 23505 (`GE:854`); T6; regra de `L:backend/api/src/aplicacao/financeiro/marcar-pagamento.ts:7-63`
**Requirement**: FIN-16, FIN-17, FIN-19, FIN-20, FIN-21
**Status**: rascunhada
**Nota do rascunho**: `SPEC_DEVIATION`: assinatura `financeiroPagamentos.marcar(db, grupoId, jogadorId, mes, hoje)`, sem `contaId` e `agora` (autora de `app_conta_id()`, momento de `now()`, como em T16). `travarVarios` (`PR:1185`) ainda não existe no repositório: o jogador é travado com `SELECT … FOR UPDATE` direto, o mesmo bloqueio dos escritores de período; o /executar troca por `travarVarios` se ele existir. O 23505 da PK é traduzido por `SAVEPOINT` (`ja_marcado`), depois da conferência por consulta, que a trava do jogador já garante.

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `FIN-16`: cria pagamento e lançamento vinculado com o valor da configuração e a data de hoje
- [ ] Teste `FIN-17`: sem mensalidade, só o pagamento com `lancamento_id` nulo
- [ ] Teste `FIN-20`: duas conexões marcando o mesmo jogador e mês: uma grava, a outra 409, um lançamento só
- [ ] Teste `FIN-21`: falha forçada na auditoria desfaz pagamento e lançamento
- [ ] Teste `FIN-19`: inativo no mês, de outro grupo e inexistente recusados sem gravar
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T19: Desmarcar pagamento

**What**: `financeiro.desmarcar(db, grupoId, jogadorId, mes, contaId)`: `DELETE … RETURNING` do pagamento (sem linha → 404), depois o lançamento vinculado, e `pagamento_desmarcado` com o valor removido (o atual, mesmo editado), na mesma transação.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/financeiro/pagamentos-desmarcar.ts`
**Depends on**: T18
**Reuses**: T18; regra de `L:backend/api/src/aplicacao/financeiro/desmarcar-pagamento.ts:5-28`
**Requirement**: FIN-22, FIN-23
**Status**: rascunhada
**Nota do rascunho**: exportado como `financeiroPagamentosDesmarcar.desmarcar(db, grupoId, jogadorId, mes)`, sem `contaId` (a autora da auditoria vem de `app_conta_id()`, como em T16 e T18).

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `FIN-22`: apaga pagamento e lançamento editado para outro valor; a auditoria traz o valor editado
- [ ] Teste `FIN-22`: jogador inativado depois de pagar continua desmarcável
- [ ] Teste `FIN-23`: duas conexões desmarcando: uma remove, a outra recebe "não encontrado", sem erro
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 10: Repositórios: lançamentos e acesso

### T20: Lançamentos: criar, ler e editar

**What**: `lancamentos.criar` (avulso, `lancamento_criado` com tipo, data e valor), `lancamentos.ler` (com `mensalidade`, apelido e mês do pagamento vinculado, e o nome de quem alterou por `contas_nomes_do_grupo`; sem nome = "Conta excluída"), `lancamentos.editar` (vinculado com `tipo = 'saida'` → 422 "A mensalidade é sempre uma entrada."; `lancamento_editado` com valor antes e depois). Sempre `grupoId` no `WHERE`; outro grupo = não encontrado.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/financeiro/lancamentos.ts`
**Depends on**: T19
**Reuses**: `contas_nomes_do_grupo` estendida (T10, `PR:1063`); "Conta excluída" de ACE-28 (`CA:470`); regra de `L:backend/api/src/aplicacao/financeiro/lancamentos/criar.ts:7-31` e `editar.ts:7-41`
**Requirement**: FIN-25, FIN-27, FIN-28, FIN-31, FIN-32
**Status**: rascunhada
**Nota do rascunho**: exportado como `lancamentos.criar|ler|editar(db, grupoId, …)`, sem `contaId` (autora de `app_conta_id()`, como em T16). `ler` devolve também `vinculo` (jogador, apelido e mês) para a mensagem do 409 da T21. A conta excluída já tem o nome "Conta excluída" na própria linha de `contas` (`conta_excluir` a anonimiza), então `contas_nomes_do_grupo` a devolve assim; o repositório ainda cai no mesmo texto se a função não devolver a conta.

**Done when**:

- [ ] Teste `FIN-25`: cria com `mensalidade` falso, autora e momento; auditoria sem a descrição
- [ ] Teste `FIN-27`: editar a mensalidade mantém o vínculo; auditoria com valor antes e depois
- [ ] Teste `FIN-28`: mensalidade para saída recusada sem gravar
- [ ] Teste `FIN-31`: id de outro grupo e id inexistente dão o mesmo "não encontrado"
- [ ] Teste `FIN-32`: autora com conta excluída sai como "Conta excluída"
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T21: Lançamentos: excluir avulso e recusar o vinculado

**What**: `lancamentos.excluir(db, grupoId, id, contaId)`: `SELECT … FOR UPDATE` do lançamento, confere pagamento vinculado (→ 409 `lancamento_vinculado` com "Esta entrada é a mensalidade de <apelido> MM/AAAA. Desmarque o pagamento no mês para removê-la."), apaga e audita `lancamento_excluido`; o 23503 da FK (`ON DELETE RESTRICT`) também vira 409, para a corrida.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/financeiro/lancamentos-excluir.ts`
**Depends on**: T20
**Reuses**: FK de `M:1792843200000_linha-de-base.sql:267`; regra de `L:backend/api/src/aplicacao/financeiro/lancamentos/excluir.ts:5-36`
**Requirement**: FIN-29, FIN-30
**Status**: rascunhada
**Nota do rascunho**: exportado como `lancamentosExcluir.excluir(db, grupoId, id, opcoes)`, sem `contaId` (autora de `app_conta_id()`). Devolve `vinculado` com apelido e mês; a rota (T28) monta o 409 com `mensagemLancamentoVinculado`. A opção `pularChecagemDoVinculo` existe só para o teste da corrida (23503 da FK).

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `FIN-29`: avulso apagado e auditado com tipo, data e valor
- [ ] Teste `FIN-30`: vinculado recusado com a mensagem e o apelido; nada apagado
- [ ] Teste `FIN-30`: com a checagem pulada (simulação da corrida), o 23503 vira o mesmo 409
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T22: Conceder e retirar o acesso ao financeiro

**What**: `admins.alterarFinanceiro(db, grupoId, contaId, alvoId, valor)`: alvo = própria conta → 409 `acao_na_propria_conta`; alvo sem vínculo → 404; valor igual → devolve sem gravar nem auditar; senão `UPDATE` e `financeiro_concedido` ou `financeiro_retirado`; devolve `admins.listar`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/financeiro/acesso.ts`
**Depends on**: T21
**Reuses**: `admins.listar` e `auditoria.registrar` (`CA:844`); trava do banco (T10); regra de `L:backend/api/src/aplicacao/grupos/admins/financeiro.ts:6-30`
**Requirement**: FIN-35, FIN-36
**Status**: rascunhada
**Nota do rascunho**: `SPEC_DEVIATION`: `acessoFinanceiro.alterarFinanceiro(db, grupoId, alvoId, valor, opcoes)`, sem `contaId` (a própria conta é `app_conta_id()`), e mora em `financeiro/acesso.ts`, não em `admins` (`convites.ts`), para não editar o arquivo da CA. Resultado extra `sem_permissao` quando o banco (T10) afeta zero linhas; `pularChecagemDaPropriaConta` existe só para o teste FIN-41. `numAffectedRows` do Kysely `sql` é a contagem usada: o /executar confere que vem preenchido no driver do projeto.

**Done when**:

- [ ] Teste `FIN-35`: conceder e retirar gravam e auditam; valor igual não grava nem audita
- [ ] Teste `FIN-36`: própria conta recusada; alvo de outro grupo ou não admin = não encontrado
- [ ] Teste `FIN-41`: com a checagem da própria conta removida do repositório numa cópia, o banco ainda recusa (zero linhas)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 11: Middlewares: permissão e trava de plano

### T23: Middleware `exigirFinanceiro`

**What**: `exigirFinanceiro`, depois do `exigirVinculo` e do `exigirGrupoAtivo` (AD-077): lê `acessa_financeiro` do vínculo da conta no grupo na transação da requisição; falso → 403 `sem_permissao_financeiro` com "Você não tem acesso ao financeiro deste grupo."; entrega `c.var.acessaFinanceiro`.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/middlewares/financeiro.ts`
**Depends on**: T22
**Reuses**: `exigirVinculo` (`CA:795`); `exigirGrupoAtivo` (`GE:901`); regra de `L:backend/api/src/entrada/middlewares/grupo.ts:34-43`
**Requirement**: FIN-33
**Status**: rascunhada
**Nota do rascunho**: lê o acesso por `app_acessa_financeiro` (T9), a mesma função da RLS. Ligado pelo `travarFinanceiro(api)` em `app.ts`, nos caminhos `…/financeiro/*` e `…/admins/:contaId/financeiro`; `acessaFinanceiro` entrou em `Variaveis` (`ambiente.ts`). O 403 é montado local (`corpoSemPermissaoFinanceiro`), porque `corpoDoErro` só aceita os códigos de `acesso.ts`.

**Done when**:

- [ ] Teste `FIN-33`: admin sem acesso recebe 403 com o código e a mensagem; com acesso passa
- [ ] Teste `FIN-33`: sem vínculo, o 404 do `exigirVinculo` vem antes
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T24: Recurso `financeiro` no ponto único de trava de plano

**What**: Acrescentar o recurso `financeiro` ao `recursoLiberado(grupoId, recurso)` criado pela `simulador` (SIM-68, AD-049, AD-074), que hoje libera todos sem ler `situacao_comercial`, e o middleware `exigirRecursoNaEscrita('financeiro')`: em método ≠ GET e HEAD, recurso negado → 403 `plano_pro` com `recurso: 'financeiro'`, sem abrir escrita. O teste força o ponto em "somente leitura" pela injeção que a `simulador` usar no `criarApp`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/middlewares/plano.ts`
**Depends on**: T23
**Reuses**: `recursoLiberado` da `simulador` (SIM-68, `SIM:273`; caminho e injeção no `tasks.md` dela, conferir ao abrir o lote: se não existir, criá-lo aqui e registrar no commit); contrato da feature 7 (`.specs/features/planos-e-cobranca/spec.md:79`, `:135`); AD-051
**Requirement**: FIN-45, FIN-50
**Status**: rascunhada
**Nota do rascunho**: `SPEC_DEVIATION`: sem arquivo `middlewares/plano.ts`; o ponto único da simulador mora em `middlewares/recurso.ts`, e lá entraram o recurso `financeiro` no `RecursoPro` e o `exigirRecursoNaEscrita`. O `travarFinanceiro` (T23) liga os dois em sequência nos caminhos do financeiro. O "rg situacao_comercial" virou um teste que lê `rotas/financeiro*` e `middlewares/financeiro.ts`.

**Done when**:

- [ ] Teste `FIN-45`: hoje todo grupo tem o recurso `financeiro` liberado, sem consulta a `situacao_comercial`
- [ ] Teste `FIN-50`: com o ponto forçado em "somente leitura", POST responde 403 `plano_pro` e GET passa
- [ ] Teste: `rg "situacao_comercial" backend/api/src/entrada/rotas` sem resultado nas rotas do financeiro
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 12: Rotas: configuração, mês e pagamentos

### T25: `PUT /api/grupos/:grupoId/financeiro/config`

**What**: Rota atrás de `exigirSessao`, `exigirVinculo`, `exigirGrupoAtivo`, `exigirFinanceiro` e `exigirRecursoNaEscrita`: valida o corpo (T7), recusa `dataSaldoInicial` depois de `relogio.hoje()` com "A data do saldo inicial não pode ser no futuro.", grava (T16) e responde 200 com os três campos. Usa o `LIMITE_ESCRITA` (`GE:928`).
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/financeiro-config.ts`
**Depends on**: T24
**Reuses**: Molde da rota de pesos (`PR:1412`); leitor de corpo (`GE:854`); relógio (`GE:831`); rota de `L:backend/api/src/aplicacao/financeiro/config.ts:7-42`
**Requirement**: FIN-01, FIN-02, FIN-03, FIN-04
**Status**: rascunhada
**Nota do rascunho**: `rotasFinanceiroConfig()` ligada no `app.ts`. O "GET do mês reflete" fica no teste da T26 (a rota nasce lá); aqui o teste confere a linha gravada. `test/rotas/apoio-financeiro.ts` (app com relógio fixo em 2026-10-15, pedido com sessão, `restaurarCaixa`) é reaproveitado por T26 e T27.

**Done when**:

- [ ] Teste `FIN-01`: 200 com os três campos; o GET do mês reflete
- [ ] Teste `FIN-02`: amanhã no relógio fixo dá 422 no campo `dataSaldoInicial` e nada gravado
- [ ] Teste `FIN-03`: corpo com texto ou campo extra dá 422 com os campos
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T26: `GET /api/grupos/:grupoId/financeiro/mes`

**What**: Rota de leitura (`READ ONLY` pelo `comBanco`) atrás de `exigirFinanceiro`: `mes` padrão = `mesDe(relogio.hoje())`; mês malformado → 422 "Mês inválido."; com configuração, fora do histórico → 422 "Mês fora do histórico do caixa." no campo `mes`; responde com `lerMes` (T17) e a data de hoje.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/financeiro-mes.ts`
**Depends on**: T25
**Reuses**: Molde de `GET partidas?mes` (`PR:1436`); `comBanco` (`F:1203`); T5
**Requirement**: FIN-07, FIN-08, FIN-09, FIN-14
**Status**: rascunhada
**Nota do rascunho**: `rotasFinanceiroMes()` ligada no `app.ts`. O 422 de fora do histórico só vale **com configuração** (texto da tarefa); sem ela, qualquer mês bem formado dá 200 com os nulos (o `[LACUNA]` de `caixa/mes.ts:48` fica para o /executar decidir). O `index.ts` do domínio ganhou só `mesNoHistorico as mesNoHistoricoDoCaixa` (o nome já é do ranking), `mesFuturo` e as duas mensagens; o resto das exportações do caixa segue para o /executar (nota da T17). O teste também prova o reflexo do PUT da T25 (FIN-01).

**Done when**:

- [ ] Teste `FIN-07`: sem `mes`, o mês do relógio, com todos os campos da resposta
- [ ] Teste `FIN-08`: sem configuração, 200 com nulos
- [ ] Teste `FIN-09`: mês antes da data inicial e mês futuro dão 422 com a mensagem no campo
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T27: `POST` e `DELETE /api/grupos/:grupoId/financeiro/pagamentos`

**What**: `POST …/pagamentos` (corpo T8; mês futuro → 422 "Não dá para marcar o pagamento de um mês que ainda não começou."; jogador fora → 422 "O jogador precisa estar ativo no grupo nesse mês." em `jogadorId`; 409 `pagamento_ja_marcado` com "O pagamento deste mês já está marcado."; 204) e `DELETE …/pagamentos/:jogadorId/:mes` (mês malformado → 422 "Mês inválido."; 404; 204).
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/financeiro-pagamentos.ts`
**Depends on**: T26
**Reuses**: T18, T19; rotas de `L:backend/api/src/entrada/rotas/grupos/financeiro/pagamentos-desmarcar.ts:8-27`; molde de `POST partidas` (`PR:1461`)
**Requirement**: FIN-16, FIN-17, FIN-18, FIN-19, FIN-20, FIN-22, FIN-23
**Status**: rascunhada
**Nota do rascunho**: `rotasFinanceiroPagamentos()` ligada no `app.ts`. No DELETE, o mês é conferido antes do id (422 tem precedência); id que não é uuid dá 404. O `restaurarCaixa` do apoio passou a repor o lançamento e o pagamento do cenário (Bira, 2026-01), que o teste de desmarcar apaga.

**Done when**:

- [ ] Teste `FIN-16`: 204 e o mês mostra a entrada "Mensalidade Toninho 10/2026"
- [ ] Teste `FIN-18`: novembro com hoje em outubro dá 422 no campo `mes`
- [ ] Teste `FIN-19`: jogador do grupo B dá 422 com a mensagem em `jogadorId`
- [ ] Teste `FIN-20`: segunda marcação dá 409 com código e mensagem
- [ ] Teste `FIN-23`: desmarcar o inexistente dá 404; `2026-13` dá 422; dois DELETE simultâneos dão 204 e 404, nenhum 500
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 13: Rotas: lançamentos, acesso e início do grupo

### T28: Rotas de lançamentos

**What**: `POST …/financeiro/lancamentos` (201), `GET`, `PUT` (200) e `DELETE` (204) de `…/financeiro/lancamentos/:id`, com os 422, o 409 `lancamento_vinculado` e o 404 igual para inexistente e de outro grupo (id malformado também 404).
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/financeiro-lancamentos.ts`
**Depends on**: T27
**Reuses**: T20, T21; molde de `GET, PUT e DELETE partidas/:data` (`PR:1487`)
**Requirement**: FIN-25, FIN-26, FIN-27, FIN-28, FIN-29, FIN-30, FIN-31
**Status**: rascunhada
**Nota do rascunho**: `rotasFinanceiroLancamentos()` ligada no `app.ts`. A resposta omite o `vinculo` do repositório (contrato `.strict()`). No PUT, o id malformado dá 404 antes de ler o corpo.

**Done when**:

- [ ] Teste `FIN-25`: 201 com o lançamento, `mensalidade` falso, quem alterou e quando
- [ ] Teste `FIN-26`: descrição de 81 caracteres dá 422 com a mensagem; campo de vínculo no corpo dá 422
- [ ] Teste `FIN-28`: PUT de mensalidade para saída dá 422 no campo `tipo`
- [ ] Teste `FIN-30`: DELETE da mensalidade dá 409 com a orientação
- [ ] Teste `FIN-31`: GET, PUT e DELETE de id do grupo B dão 404 igual ao inexistente
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T29: `PATCH /api/grupos/:grupoId/admins/:contaId/financeiro`

**What**: Estender as rotas de admins com o `PATCH` atrás de `exigirFinanceiro` e `exigirRecursoNaEscrita`: corpo T8, T22, responde 200 com a lista de admins (`adminsResposta` com `acessaFinanceiro`); 409 `acao_na_propria_conta` com "Você não pode alterar a sua própria permissão."; 404 para alvo não admin.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/admins.ts`
**Depends on**: T28
**Reuses**: Estender `rotas/admins.ts` da CA (`CA:1020`); `adminsResposta` (`CA:574`); rota de `L:backend/api/src/entrada/rotas/grupos/admins/financeiro.ts:12-44`
**Requirement**: FIN-35, FIN-36
**Status**: rascunhada
**Nota do rascunho**: o PATCH usa o `lerCorpoDoGrupo` (422 com `mensagens`, como as demais rotas do financeiro), não o `lerCorpo` das rotas de acesso. O mapeamento da lista virou `adminsResposta(lista)` local, usado pelo GET (mesmo formato) e pelo PATCH. `sem_permissao` do repositório (banco recusou) vira 403 `sem_permissao_financeiro`.

**Done when**:

- [ ] Teste `FIN-35`: a criadora concede ao convidado; a lista volta com `acessaFinanceiro` verdadeiro; repetir não audita de novo
- [ ] Teste `FIN-36`: convidado sem acesso recebe 403; com acesso, na própria conta, 409; alvo de outro grupo, 404
- [ ] Os testes existentes das rotas de admins da CA e da GE continuam verdes
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T30: Saldo no `GET /api/grupos/:grupoId`

**What**: Acrescentar ao detalhe do grupo `saldoFinanceiroCentavos` (inteiro ou nulo sem configuração), calculado com T3 e `relogio.hoje()`, **só** quando a conta tem `acessa_financeiro`; para quem não tem, a chave não vai na resposta (AD-079). Muda o schema `grupoDetalhe` e testes existentes de formato (`GE:1080`, `PR:1538`), com a autorização de 2026-11-04 da `financeiro` em `## Autorizações` do `STATE.md`; motivo no commit.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/grupo.ts`
**Depends on**: T29
**Reuses**: Rota de `GE:1080`, ampliada em `PR:1538`; contrato `grupoDetalhe` (`GE:753`); T17 (leitura do saldo)
**Requirement**: FIN-34
**Status**: rascunhada
**Nota do rascunho**: `SPEC_DEVIATION`: o `grupoDetalhe` não muda (a partidas-e-ranking o deixou só para o PATCH, `previas.ts:56-60`); o campo vai no fragmento `campoSaldoDoGrupo` e no `grupoDetalheComSaldo` (`contrato/src/financeiro.ts`), e quando o GET passar a responder `grupoDetalheComPartidas` (`PR:1538`) ele estende o mesmo fragmento. O saldo vem de `financeiroMes.saldoDoGrupo` (acrescentado ao `mes.ts` da T17), que lê `app_acessa_financeiro` antes de tudo. Teste existente mudado com a autorização de 2026-11-04: `test/grupos/rotas-grupo.test.ts` (lista exata de chaves da criadora ganha `saldoFinanceiroCentavos`). O teste do `PAR-160` (`PR:2075`) ainda não existe no repositório.

**Done when**:

- [ ] Teste `FIN-34`: criadora recebe o saldo; sem configuração, `null`
- [ ] Teste `FIN-34`: convidado sem acesso recebe o detalhe sem a chave `saldoFinanceiroCentavos`
- [ ] Os testes existentes da rota passam a aceitar o campo novo (autorização de 2026-11-04), mesma força, sem asserção removida
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 14: Provas transversais: isolamento, plano, transação e fuso

### T31: Isolamento das rotas do financeiro

**What**: Acrescentar à suíte de isolamento de rotas todas as rotas novas: conta do grupo B → 404; admin de A sem acesso → 403 `sem_permissao_financeiro` em toda rota `/financeiro*` e no `PATCH` de acesso; A arquivado: não criadora 404 em tudo, criadora 409 `grupo_arquivado` nas escritas e 200 nas leituras.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/isolamento/rotas.test.ts`
**Depends on**: T30
**Reuses**: Suíte de isolamento da CA, estendida pela GE e pela PR (`CA:1070`, `GE:1607`, `PR:1658`); prova do arquivado (`GE:1131`)
**Requirement**: FIN-31, FIN-33, FIN-37
**Status**: rascunhada
**Nota do rascunho**: `PEDIDOS_DO_FINANCEIRO` (9 rotas) alimenta a tabela do ACE-48 e os testes FIN-33 e FIN-37; o teste "toda rota com `/financeiro` tem pedido" falha com rota nova. B ganha acesso ao financeiro de H no `beforeAll`, para o "B com H na rota" chegar ao 404 da rota. As rotas do simulador e das escalações ainda não estão na tabela (são da `simulador`): o ACE-48 já falharia por elas, fora do escopo daqui.

**Done when**:

- [ ] Teste `FIN-33`: para cada rota do financeiro registrada, o admin sem acesso recebe 403 (lista lida do roteador, rota nova sem caso falha)
- [ ] Teste `FIN-37`: com A arquivado, cada escrita da criadora dá 409 e cada leitura 200; a não criadora recebe 404
- [ ] Teste `FIN-31`: conta B recebe 404 em todas
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T32: Trava de plano em todas as escritas do financeiro

**What**: Com o ponto único forçado em "somente leitura", cada escrita (config, marcar, desmarcar, criar, editar e excluir lançamento, conceder e retirar acesso) responde 403 `plano_pro` sem gravar, e cada leitura (mês, lançamento, saldo no início) responde 200.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/rotas/financeiro-plano.test.ts`
**Depends on**: T31
**Reuses**: T24; lista de rotas do roteador (T31)
**Requirement**: FIN-45, FIN-50
**Status**: rascunhada
**Nota do rascunho**: o retrato antes e depois traz as contagens de `config_financeira`, `lancamentos`, `pagamentos_mes` e `auditoria` de G, os valores da configuração, a soma dos lançamentos e o acesso de O. A lista das 8 escritas é fixa no teste; a cobertura "toda rota do financeiro" pelo roteador fica no T31.

**Done when**:

- [ ] Teste `FIN-50`: 8 escritas com 403 `plano_pro` e contagem das 3 tabelas e de `auditoria` igual
- [ ] Teste `FIN-50`: 3 leituras com 200
- [ ] Teste `FIN-45`: sem forçar, as mesmas escritas passam
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T33: Transação e auditoria sem dado pessoal

**What**: Provar pelas rotas que cada escrita e a sua auditoria estão numa transação da requisição (falha forçada depois da escrita desfaz as duas) com o `SET LOCAL` antes da primeira consulta, e que nenhuma linha de `auditoria` do financeiro contém a descrição, o apelido, o telefone ou o ano de nascimento.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/rotas/auditoria-financeiro.test.ts`
**Depends on**: T32
**Reuses**: Molde da auditoria sem dado pessoal (`GE:1584`); prova do `comBanco` (`F:1203`)
**Requirement**: FIN-21, FIN-43, FIN-44
**Status**: rascunhada
**Nota do rascunho**: a falha forçada é uma trigger de teste `BEFORE INSERT ON auditoria` só para a ação da vez, criada como superusuário e removida no `finally` (e no `afterAll`). O `SET LOCAL` antes da primeira consulta é provado pelo autor de cada evento (`autor_conta_id` = C, de `app_conta_id()`) e pelas escritas passarem pela RLS do financeiro; a prova direta do `comBanco` segue em `F:1203`. O texto da linha sai sem `momento` e sem o `id` sequencial antes da busca dos marcadores.

**Done when**:

- [ ] Teste `FIN-43`: para cada escrita, falha forçada na auditoria dá 500 e nada fica gravado
- [ ] Teste `FIN-44`: com descrição "Churrasco do Zé", apelido "Toninho", telefone `11987654321` e ano 1987, nenhuma linha de auditoria contém os quatro
- [ ] Teste `FIN-44`: os eventos têm só ids, nome, mês, datas, tipo e valores
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T34: Virada de mês no fuso de São Paulo

**What**: Com o relógio fixo em 2026-10-31 23:30 de São Paulo (2026-11-01 02:30 UTC) e em 2026-11-01 00:05, conferir o mês padrão do `GET mes`, o 422 de mês futuro na marcação e o fim do saldo atual.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/rotas/financeiro-fuso.test.ts`
**Depends on**: T33
**Reuses**: Relógio injetado (`GE:831`); T5
**Requirement**: FIN-49
**Status**: rascunhada
**Nota do rascunho**: os dois relógios são `2026-11-01T02:30:00Z` e `2026-11-01T03:05:00Z` (São Paulo em UTC−3, sem horário de verão). O fim do saldo é conferido no `GET mes` e no detalhe do grupo (T30).

**Done when**:

- [ ] Teste `FIN-49`: às 23:30 de 31/10 em São Paulo o mês padrão é outubro e marcar novembro dá 422
- [ ] Teste `FIN-49`: lançamento de 01/11 não entra no saldo às 23:30 de 31/10 e entra às 00:05
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 15: Web: dinheiro, dados e rotas

### T35: Dinheiro no front

**What**: `formatarReais(centavos)` (`R$ 1.245,50`, saída com menos) e `lerReais(texto)` ("350,00", "350", "1.245,50" → centavos inteiros por texto, sem `parseFloat` nem `Number` com vírgula; inválido → erro "Informe um valor em reais, ex.: 350,00.").
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/dados/dinheiro.ts`
**Depends on**: T34
**Reuses**: Molde de utilitário de exibição (`GE:1726`); regra de `L:backend/contrato/src/primitivos.ts:35-42`
**Requirement**: FIN-15, FIN-48
**Status**: rascunhada
**Nota do rascunho**: `SPEC_DEVIATION`: o negativo sai "− R$ 900,00" (U+2212 e um espaço), como o mockup (`t22-financeiro--sucesso.html:52`), não "−R$ 900,00" do texto da tarefa ("conforme o mockup"). `lerReais` devolve `{ ok, centavos }` ou `{ ok: false, mensagem }` e aceita o sinal de menos (saldo inicial negativo, FIN-03). Teste em `frontend/web/test/dados/dinheiro.test.ts`, onde o projeto põe os testes do front (a matriz diz `src/**`).

**Done when**:

- [ ] Teste `FIN-48`: "350,00" → 35000; "0,1" → 10; "12,345", "abc" e "1,2,3" dão a mensagem
- [ ] Teste `FIN-15`: 124550 → "R$ 1.245,50"; −90000 → "−R$ 900,00" conforme o mockup
- [ ] Teste `FIN-48`: o arquivo não usa `parseFloat` nem `toFixed` (checagem por texto)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T36: Dados do financeiro no front

**What**: Funções do cliente para `financeiro/mes`, `config`, `pagamentos`, `lancamentos` e o `PATCH` de acesso, com os erros tipados (`sem_permissao_financeiro`, `pagamento_ja_marcado`, `lancamento_vinculado`, `acao_na_propria_conta`, `plano_pro`, 422 com `campos`).
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/dados/financeiro.ts`
**Depends on**: T35
**Reuses**: Cliente HTTP (`CA:1169`); molde de dados do elenco (`GE:1703`)
**Requirement**: FIN-07
**Status**: rascunhada
**Nota do rascunho**: os códigos do financeiro não são do `CODIGOS_ERRO` da conta e acesso, então o `ErroApi.codigo` vem vazio; `erroDoFinanceiro(erro)` lê o corpo bruto (`ErroApi.corpo`), inclusive o `plano_pro` na forma da AD-091. O `package.json` do contrato ganhou `./financeiro` e `./financeiro-lancamentos` em `exports` (o `index.ts` raiz ainda não exporta o caixa, nota da T17). `[LACUNA]` para o /executar: o contrato exige `z.uuid()` nos ids de `pagamentoDoMes` e `lancamentoDoMes`, mas `.specs/mockup/respostas/financeiro-2026-10.json` usa `j-alemao` e afins; ou o contrato passa a `z.string().min(1)` como `grupo.ts:86`, ou a resposta do mockup troca os ids, antes das telas (T38) e da comparação visual (T46). O `useGrupo` (`dados/grupos.ts`) não mudou aqui: o GET do grupo ganhou o início da partidas-e-ranking e o saldo, e o parser dele é da T43.

**Done when**:

- [ ] Teste: cada função chama a rota certa e traduz cada código de erro
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T37: Rotas do app do financeiro

**What**: Estender o roteador com `/app/grupos/:grupoId/financeiro`, `…/financeiro/lancamentos/novo`, `…/financeiro/lancamentos/:id` e `…/financeiro/config`, sob a guarda de `/app/*`.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/app/rotas.tsx`
**Depends on**: T36
**Reuses**: Estender `rotas.tsx` (`GE:2068`, `PR:1926`); AD-054
**Requirement**: FIN-47
**Status**: rascunhada
**Nota do rascunho**: as telas `FinanceiroMes`, `Lancamento` e `ConfigCaixa` nascem aqui como esqueleto (só a `Casca` com o título), para o roteador não importar arquivo de tarefa posterior; T38, T41 e T42 as completam. `handle.tela`: `financeiro`, `novo-lancamento`, `lancamento`, `config-caixa`. Teste em `frontend/web/test/app/rotas-financeiro.test.tsx`.

**Done when**:

- [ ] Teste: cada rota renderiza a tela correspondente; sem sessão vai a `/entrar`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 16: Web: financeiro do mês (t22)

### T38: Tela Financeiro do mês (t22)

**What**: `FinanceiroMes`: saldo atual, navegação de mês por `?mes=`, resumo (entradas, saídas, resultado, "Não pagaram N jogadores"), lista de lançamentos com links de edição, ações "Novo lançamento" e "Configurar caixa"; estados `vazio-config` ("Caixa não configurado" + "Configurar caixa"), `vazio-mes` e `sem-permissao` ("Sem acesso" + Voltar).
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/financeiro/FinanceiroMes.tsx`
**Depends on**: T37
**Reuses**: `.specs/mockup/telas/t22-financeiro--{sucesso,vazio-config,vazio-mes,sem-permissao}.html`; `TelaMensagem` e `Lista` (`CA:1286`); molde da navegação de mês da t10 (`PR:1951`)
**Requirement**: FIN-08, FIN-15, FIN-33, FIN-46
**Status**: rascunhada
**Nota do rascunho**: resolve o `[LACUNA]` da T36: os ids das respostas do contrato (`pagamentoDoMes.jogadorId`, `lancamentoDoMes.id`, `lancamentoResposta.id`) passam a `idResposta` = `z.string().min(1)`, como `grupo.ts:86`, para as respostas do mockup (`j-alemao`, `l-m01`) passarem; os corpos seguem exigindo uuid. Estilos novos em `telas/financeiro/financeiro.module.css` (de `base.css`, só tokens). A lista de pagamentos mostra só "Pagou"/"Não pagou" e os lançamentos saem um por linha: o interruptor é da T39 e a linha agrupada, da T40. O 422 do `?mes=` fora do histórico mostra a mensagem com "Ir para o mês atual" (a spec não desenha esse estado na tela). A navegação de mês é própria (o molde da t10, `PR:1951`, ainda não existe).

**Done when**:

- [ ] Teste `FIN-15`: com `respostas/financeiro-2026-10.json`, os valores e o "−" das saídas como no mockup
- [ ] Teste `FIN-08`: sem configuração, "Caixa não configurado" e a ação
- [ ] Teste `FIN-33`: 403 mostra "Sem acesso" com Voltar
- [ ] Teste `FIN-46`: axe sem violação em cada estado
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T39: Lista de pagamentos: marcar e desmarcar

**What**: `ListaPagamentos`: cada ativo com "Pagou"/"Não pagou"; marcar com atualização otimista que volta para "Não pagou" com "Não foi possível marcar o pagamento de <apelido>. Tente de novo." na falha; desmarcar com o diálogo "Desmarcar o pagamento de <apelido>? A entrada "<descrição>" (R$ <valor>) será removida do caixa.".
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/financeiro/ListaPagamentos.tsx`
**Depends on**: T38
**Reuses**: `t22-financeiro--{desmarcar,erro-pagamento}.html`; `Dialogo` e `Faixa` (`CA:1286`)
**Requirement**: FIN-24
**Status**: rascunhada
**Nota do rascunho**: `ListaPagamentos` entra na t22 no lugar da lista simples da T38. A entrada do diálogo sai do lançamento do mês com `mensalidade` e a descrição "Mensalidade <apelido> MM/AAAA"; sem ele, a mensalidade configurada. Lacunas: a resposta do mês não liga pagamento a lançamento, e a spec não define o texto do diálogo para pagamento sem entrada (sai só o título) nem a mensagem da falha ao desmarcar (sai a mensagem da API na faixa); ver `[LACUNA]` em `ListaPagamentos.tsx`.

**Done when**:

- [ ] Teste `FIN-24`: falha na marcação volta o item e mostra a mensagem
- [ ] Teste `FIN-24`: desmarcar mostra o texto exato do diálogo; cancelar não chama a API
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T40: Linha agrupada das mensalidades do mês

**What**: `GrupoMensalidades`: as entradas de mensalidade do mês numa linha ("16 mensalidades de 10/2026", intervalo de datas e total), que se abre (`aria-expanded`) para mostrar cada uma.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/financeiro/GrupoMensalidades.tsx`
**Depends on**: T39
**Reuses**: `t22-financeiro--sucesso.html` (linha agrupada); `formatarReais` (T35)
**Requirement**: FIN-15
**Status**: rascunhada
**Nota do rascunho**: a linha é um botão com `aria-expanded` (o mockup a desenha como link para o t23; a tarefa manda abrir). Fica na posição da mensalidade mais antiga, antes do primeiro avulso de data anterior (`ordemDaLista`, `t22-financeiro--sucesso.html:52-54`). O item de lançamento e os auxiliares de data e valor saíram da `FinanceiroMes` para `ItemLancamento.tsx`, para não haver import circular.

**Done when**:

- [ ] Teste `FIN-15`: 16 mensalidades de outubro numa linha com o intervalo e o total; abrir mostra as 16
- [ ] Teste `FIN-15`: uma mensalidade só diz "1 mensalidade de 10/2026"
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 17: Web: lançamento (t23) e configuração (t24)

### T41: Tela Lançamento (t23)

**What**: `Lancamento`: novo com Entrada marcada, a data de hoje da API e o contador "0 de 80"; edição com "Última alteração: <nome>, dd/mm hh:mm" e Excluir com "Excluir lançamento? "<descrição>" (R$ <valor>) sai do caixa."; erro 422 com "Corrija N campos: <rótulos>" e a mensagem ao lado de cada campo; 409 `lancamento_vinculado` mostra a orientação.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/financeiro/Lancamento.tsx`
**Depends on**: T40
**Reuses**: `t23-lancamento--{novo,edicao,erro,excluir}.html`; `Campo`, `ResumoErros`, `Dialogo` (`CA:1239`, `CA:1263`, `CA:1286`); mensagem ao lado do campo (`GE:2138`); `CampoData` (`GE:1751`)
**Requirement**: FIN-32, FIN-47
**Status**: rascunhada
**Nota do rascunho**: o tipo usa o `CampoSeletor` segmentado com a `legend` "Tipo" visível (no mockup ela é `sr`); se a comparação visual (T46) acusar, o /executar esconde a legenda. O valor passa por `lerReais` antes da API (texto inválido marca o campo sem chamar a API). Salvo ou excluído, volta a `/financeiro` (mês atual; a spec não diz o mês). A data do novo vem do `hoje` do `GET …/financeiro/mes` atual. Os auxiliares `reaisParaCampo`, `resumoDosErros` e `errosConhecidos` ficam exportados para a T42. Teste em `frontend/web/test/telas/financeiro-lancamento.test.tsx`.

**Done when**:

- [ ] Teste `FIN-32`: novo abre com Entrada, a data de hoje da resposta e "0 de 80"; digitar atualiza o contador
- [ ] Teste `FIN-32`: edição mostra "Última alteração: Leandro, 15/10 20:41" e "Conta excluída" sem nome
- [ ] Teste `FIN-47`: 422 com 2 campos mostra "Corrija 2 campos: Descrição, Valor"
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T42: Tela Configurar caixa (t24)

**What**: `ConfigCaixa`: mensalidade (opcional), saldo inicial em reais e data; converte por `lerReais` (T35) com "Informe um valor em reais, ex.: 350,00." no campo; 422 da API com o resumo e as mensagens ao lado; salvo volta à t22.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/financeiro/ConfigCaixa.tsx`
**Depends on**: T41
**Reuses**: `t24-config--{vazio,erro}.html`; T41 (mesmos componentes); `respostas/erro-validacao-config.json`
**Requirement**: FIN-48, FIN-47, FIN-02

**Done when**:

- [ ] Teste `FIN-48`: "350,00" envia `saldoInicialCentavos: 35000`; "35,0,0" mostra a mensagem sem chamar a API
- [ ] Teste `FIN-47`: 422 de data futura mostra o resumo e a mensagem no campo da data
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 18: Web: início (t09) e admins (t19)

### T43: Cartão Financeiro no início do grupo (t09)

**What**: Estender `InicioGrupo` com o item "Financeiro" e "Saldo R$ …" (ou "Caixa não configurado" com saldo nulo) só quando a resposta traz `saldoFinanceiroCentavos`; sem a chave, nenhum item. Muda o teste `PAR-160` da `partidas-e-ranking` (`PR:2075`), com a autorização de 2026-11-04 da `financeiro` em `## Autorizações` do `STATE.md`; motivo no commit.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/grupo/InicioGrupo.tsx`
**Depends on**: T42
**Reuses**: Estender a tela de `GE:1847` e `PR:2073`; item de `.specs/mockup/telas/t09-inicio--sucesso.html:31`
**Requirement**: FIN-34, FIN-46

**Done when**:

- [ ] Teste `FIN-34`: com saldo 124550, item "Financeiro" com "Saldo R$ 1.245,50" e link para `/app/grupos/<id>/financeiro`
- [ ] Teste `FIN-34`: sem a chave, nenhum item Financeiro
- [ ] O teste `PAR-160` passa a exigir "sem Financeiro" só sem a chave (autorização de 2026-11-04), mesma força, sem asserção removida
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T44: Selo e interruptor "Acessa financeiro" nos admins (t19)

**What**: Estender `Admins`: para quem tem acesso, um interruptor por admin (`role="switch"`, rótulo "Acessa financeiro: <nome>", `aria-checked`), o da própria conta marcado conforme a permissão, desabilitado e com texto de ajuda; para quem não tem acesso, só o selo "Financeiro" nos que têm. Troca chama o `PATCH` e redesenha com a lista devolvida; 409 e 403 mostram a mensagem.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/admins/Admins.tsx`
**Depends on**: T43
**Reuses**: Estender a tela de `CA:1582` e `GE:2091`; selo de `.specs/mockup/telas/t19-admins--sucesso.html:19`; interruptor do legado `L:.md/mockup/telas/t19-admins--sucesso.html` (só consulta), com os tokens de `.specs/mockup/tokens.css` (AD-053)
**Requirement**: FIN-51, FIN-35, FIN-36

**Done when**:

- [ ] Teste `FIN-51`: com acesso, um `switch` por admin com o rótulo; o próprio desabilitado com o texto de ajuda
- [ ] Teste `FIN-51`: sem acesso, só selos, nenhum `switch`
- [ ] Teste `FIN-35`: alternar chama o `PATCH` e mostra o estado devolvido
- [ ] Teste: axe sem violação; os testes existentes da tela (CA e GE) continuam verdes
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 19: Comparação visual

### T45: Rotas do `telas.json` do financeiro (AD-054)

**What**: Trocar as rotas das entradas t22, t23 e t24 (`telas.json:124-136`) de `/admin/g-quinta/financeiro…` para `/app/grupos/g-quinta/financeiro…`, marcá-las `real` com as respostas de sessão e do mês, e ligar as entradas de `passos` de `:274-278` (desmarcar, erro de pagamento, erro e excluir do t23, erro do t24).
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `.specs/mockup/telas.json`
**Depends on**: T44
**Reuses**: Formato das entradas `real` (`telas.json:193`, AD-021); runner com `passos` e campos novos (`CA:1609`, `PR:2344`); AD-054
**Requirement**: FIN-47

**Done when**:

- [ ] Teste: o runner lê as 12 entradas sem erro de esquema
- [ ] Nenhuma entrada fora do financeiro alterada (`git diff` só nessas linhas)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: build

---

### T46: Comparação visual do financeiro e revisão do t19

**What**: Ativar t22 (`sucesso`, `vazio-config`, `vazio-mes`, `sem-permissao`, `desmarcar`, `erro-pagamento`), t23 (`novo`, `edicao`, `erro`, `excluir`) e t24 (`vazio`, `erro`) em PC e celular, até 1%; asserção espacial de "mensagem ao lado de cada campo" no t23 `erro` e no t24 `erro` (`boundingBox` da mensagem colada ao campo); revisão manual registrada do interruptor do t19 contra o mockup do legado e o guia (FIN-51); t09 `sucesso` (mockup do projeto, com o cartão Financeiro) em PC e celular, fechando a AD-029 (AD-118); t09 `sem-financeiro` fica fora.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/e2e/telas-ativas.json`
**Depends on**: T45
**Reuses**: Lista de telas ativas (`CA:1657`, `PR:2369`); AD-118 e AD-029 (t09 `sucesso` entra, `sem-financeiro` fora); asserção espacial de `GE:2138`; Stylelint de tokens (`F:1374`)
**Requirement**: FIN-46, FIN-47, FIN-51, FIN-34

**Done when**:

- [ ] Teste `FIN-47`: as 12 telas × 2 viewports em até 1%
- [ ] Teste `FIN-34`: t09 `sucesso` × 2 viewports em até 1% (AD-118; entrada `telas.json:193` passa ao mockup do projeto `telas/t09-inicio--sucesso.html` com a resposta do grupo com saldo)
- [ ] Teste `FIN-47`: a mensagem de cada campo do t23 e do t24 está à direita ou logo abaixo do campo, dentro da mesma linha do formulário (`boundingBox`)
- [ ] Teste `FIN-46`: Stylelint de tokens sem erro nos CSS novos
- [ ] Revisão manual do t19 (PC e celular) registrada nesta tarefa, com data e resultado (FIN-51)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: build

---

#### Phase 20: Seed e jornadas

### T47: Seed com o caixa do exemplo

**What**: Acrescentar ao seed, no grupo `g-quinta`, a configuração (R$ 75,00, saldo inicial e data das respostas do mockup), os pagamentos e lançamentos de outubro de `respostas/financeiro-2026-10.json` (inclusive "Aluguel da quadra outubro") e um admin convidado sem acesso.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `backend/scripts/src/seed.ts`
**Depends on**: T46
**Reuses**: Seed de `GE:2164` e `PR:2319`; `.specs/mockup/respostas/financeiro-2026-10.json`
**Requirement**: FIN-07

**Done when**:

- [ ] Teste: depois do seed, o `GET mes` de 2026-10 com relógio fixo dá os totais da resposta do mockup
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T48: Jornadas do financeiro ponta a ponta

**What**: Testes Playwright das jornadas novas desta feature (`.specs/projeto/jornadas.md`, numeradas pela sessão principal) contra o `wrangler dev` com o seed: caixa do mês (configurar, marcar, lançar saída, ver saldo, desmarcar) e permissão do financeiro (convidado sem acesso, concessão, própria conta).
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/e2e/financeiro.spec.ts`
**Depends on**: T47
**Reuses**: Jornadas de `CA:1683`, `GE:2188` e `PR:2441`; `pnpm dev` (`F:1812`)
**Requirement**: FIN-01, FIN-16, FIN-22, FIN-25, FIN-33, FIN-34, FIN-35, FIN-36

**Done when**:

- [ ] Um teste por jornada, com o nome da jornada
- [ ] Cada jornada termina com a asserção do Resultado esperado dela
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full
