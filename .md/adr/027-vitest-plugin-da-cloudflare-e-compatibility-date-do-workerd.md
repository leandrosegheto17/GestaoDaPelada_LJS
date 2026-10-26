# ADR-027: Testes da API com @cloudflare/vitest-plugin e compatibility_date na data máxima do workerd

- **Status:** Accepted (design da fundação, T16)
- **Data:** 2026-10-25
- **Decisores:** Coordenador
- **Requisitos:** FUN-02
- **Supersedes:** ADR-018

## Contexto

O ADR-018 baixou a `compatibility_date` para 2026-08-15 porque o `@cloudflare/vitest-pool-workers` 0.23.0 embutia um workerd que recusava datas posteriores. Esse pacote foi descontinuado. O sucessor oficial é o `@cloudflare/vitest-plugin`, migrado pelo codemod oficial, com um workerd mais novo.

## Decisão

1. Os testes da API usam o **`@cloudflare/vitest-plugin`** (`backend/api/vitest.config.ts`). O pacote antigo sai.
2. A `compatibility_date` do `wrangler.jsonc` é a **data máxima aceita pelo workerd do plugin instalado** (hoje `2026-10-19`, workerd `1.20261019.x`), junto com `nodejs_compat`. Subir a data é feito só junto de um plugin cujo workerd a aceite.
3. O ADR-018 deixa de valer: teste e produção continuam alinhados, agora na data nova.

## Consequências

**Positivas**

- Sai a dependência descontinuada, e a produção roda um runtime atual.

**Negativas**

- Cada atualização do plugin pode exigir revisar a data.

## Alternativas consideradas

1. **Manter o pool antigo e a data de 2026-08-15.** Recusada: pacote descontinuado e produção num runtime defasado.
2. **Rodar os testes fora do workerd.** Recusada: perde a prova do comportamento real (Hyperdrive, `pg`, cabeçalhos).
