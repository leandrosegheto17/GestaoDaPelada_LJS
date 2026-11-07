# Planos e cobrança: Validação (rodada 4, retrabalho R2)

**Data**: 2026-11-06 | **Spec**: `.specs/features/planos-e-cobranca/spec.md` | **Escopo**: rodada 4 = `git diff 87d4d8e1..HEAD` (T72, A-18; só `assinar.test.ts`) mais regressão | **Árvore**: `c289f0a9` (HEAD `4aefc69b`) | **Verificador**: independente
**Result**: PASS ✅ (A-01 a A-18 fechados; A-15, SEC-003, SEC-005 de banco e SEC-007 parcial são risco aceito na AD-141, decisão do usuário)

Rodadas anteriores: R1 (72 de 74 critérios conformes, A-01 a A-15) em `d06e52f4`; R2 (A-01 a A-14, 17 mutações mortas) e R3 (A-16, A-17; 6 mutações) com as tabelas completas em `1485d94c` (`git show 1485d94c:.specs/features/planos-e-cobranca/validation.md`). Não recontadas aqui. Caminhos: A=`backend/api`.

## Rodada 4: A-18

| ID | Evidência (`arquivo:linha`, asserção) | Resultado |
|---|---|---|
| A-18 | `A/test/aplicacao/assinar.test.ts:409-436`, asserção em `:432` (PLA-60): 9 assinaturas recentes da conta (10 min), 1 da conta de 2 h atrás e 1 recente de outra conta (`contaC`) no mesmo grupo; `expect((await assinar(...)).resultado).toBe('criada')` | fechado |
| A-17 (par) | `assinar.test.ts:371,390`: 10 da conta em outro grupo dão `muitas_tentativas` com `asaas.chamadas` `[]`; 9 dão `criada` | segue coberto |

**Sensor** (cópia fora do repositório, `val4-mut-planos`, `git archive` + junções de `node_modules`; só `test/aplicacao/assinar.test.ts`; base limpa 23/23):

| Mutação | Onde | Resultado |
|---|---|---|
| M4 contagem sem filtro de conta (`WHERE true AND criada_em …`) | `A/src/infraestrutura/db/repositorios/assinaturas.ts:164` | 1 falha, só o teste novo (A-18): morta |
| M5 janela da conta `interval '1 day'` | `assinaturas.ts:164` | 1 falha, só o teste novo (A-18): morta |
| M1 checagem por conta anulada (`false`) | `A/src/aplicacao/plano/assinar.ts:104` | 1 falha, no teste A-17 (10 bloqueiam): morta |
| M3 `>` no lugar de `>=` no teto por conta | `assinar.ts:104` | 1 falha, no teste A-17: morta |

4 mutações, 4 mortas, 0 sobreviventes (os 2 vivos da rodada 3 agora morrem). Cópia removida (junções primeiro, destinos intactos); `git status --porcelain` da worktree vazio antes do relatório; nenhum banco ou role `teste_*` em 5447.

## Regressão e processo

- **Testes existentes**: `git diff HEAD~1 HEAD -- backend` tem 29 linhas adicionadas e 0 removidas, só um `describe` novo em `assinar.test.ts`; nenhum teste alterado ou enfraquecido. Fora de `tasks.md` e `validation.md`, esse teste é o único arquivo que mudou desde o commit de código `87d4d8e1` (`git diff --name-only 87d4d8e1 HEAD`).
- **Cópia limpa (worktree real)**: `assinar.test.ts` 23/23 e `rotas/assinatura.test.ts` 12/12 = 35/35 no banco 5447; `tsc --noEmit` do api sem erro.
- **Processo**: T72 (`tasks.md:2178`, Phase 23) é só teste, Risco alto, Criticidade crítica, cita PLA-60 e A-18; o nome do teste cita o ID. Sem divergência spec × design nova.

## Gate (reaproveitado)

`Gate:` da Phase 22 em `tasks.md:299` (lint, format, typecheck, vitest por pacote, checagens, build do web e e2e 72/74, com as pendências aceitas pelo usuário) @ árvore `df3213e0…` (commit de código `87d4d8e1`). Árvore atual `c289f0a9`: a única mudança de código desde então é o teste novo em `assinar.test.ts`, que passa (23/23); o resto do gate não foi repetido, pois nada de produção mudou.

## Achados abertos

Nenhum. A-18 fechado.
