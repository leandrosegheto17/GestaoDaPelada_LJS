# Relatório do `/validar` e lote de retrabalho

## `validation.md` (compacto, até ~40 linhas)

```markdown
# Validação: <feature> — PASS ✅ | FAIL ❌ (rodada <n>)

- **Data**: <AAAA-MM-DD> · **Branch**: feature/<slug> @ <commit curto> · **Árvore**: <git rev-parse HEAD^{tree}>
- **Critérios**: <N/N com asserção> · **Gate**: <comando> = <X passaram, 0 falharam>
- **Sensor**: <N mutações, N mortas, N sobreviveram (equivalentes: N)>
- **Revisão de código**: <skill revisao-codigo, modo curto: bloqueios N, sugestões N | do PR do projeto>
- **Segurança**: <auditor-seguranca: sem crítico ou alto | achados N | não se aplica: motivo>

## Critérios

| Critério | `arquivo:linha` e asserção | Resultado |
|---|---|---|
| FUN-01 | `tests/x.test.ts:42` — `expect(total).toBe(107.35)` | ✅ |

## Achados

| ID | `arquivo:linha` | Achado e evidência | Correção sugerida | Criticidade | Situação |
|---|---|---|---|---|---|
| A-01 | `src/x.ts:31` | ... | ... | crítica | aberto |

(Rodada de retrabalho: a coluna Situação passa a `fechado` ou `reaberto`.)

## Lacunas e o que não foi validado

- <lacuna de precisão da spec | E2E não executado: motivo | nenhuma>
```

Sem achado: remova a tabela de achados e escreva "Nenhum achado".

## Phase de retrabalho no `tasks.md`

O `progresso.py` trata toda Phase cujo título contém **Retrabalho** como lote próprio (não junta com o anterior). Acrescente ao Execution Plan e ao Task Breakdown, continuando a numeração de tarefas e de Phases:

```markdown
### Phase 5: Retrabalho R1

​```
T21 -> T22
​```
```

```markdown
### T21: Corrigir <achado> (A-01)

**What**: <o que fazer, em uma frase>
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Depends on**: —
**Reuses**: <molde ou decisão, com arquivo:linha>
**Requirement**: <FUN-NN do critério afetado> · Achado: A-01 (validation.md)
**Tests**: <o teste que reproduz o achado e falha antes da correção>
**Gate**: <comando>

- [ ] Concluída
```

Regras do retrabalho:

- Uma tarefa por achado (achados parecidos no mesmo arquivo podem dividir uma). Acima de 2h, divida.
- Cada tarefa começa pelo teste que reproduz o achado, que deve falhar pelo motivo certo.
- Criticidade da tarefa = a do achado; o lote é crítico se alguma tarefa é crítica.
- As tarefas e a Phase de rodadas anteriores continuam no arquivo, concluídas: o histórico fica.
