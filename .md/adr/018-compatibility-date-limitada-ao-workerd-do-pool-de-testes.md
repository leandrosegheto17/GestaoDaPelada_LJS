# ADR-018 — compatibility_date limitada ao workerd do pool de testes

Status: Aceito · Data: 2026-10-17 · Origem: BK-0001

## Contexto
`wrangler.jsonc` fixava `compatibility_date` 2026-10-01. O `@cloudflare/vitest-pool-workers` 0.23.0 (última versão publicada no npm em 2026-10-17) embute workerd 1.20260815.1, que recusa datas posteriores a 2026-08-15. Forçar a data quebra o `pg` (import fora de módulo). Nenhum ADR, o SDD ou o GUARDRAILS exigem a data 2026-10-01; o ADR-014 só exige `nodejs_compat` + Hyperdrive.

## Alternativas
1. Atualizar pool/miniflare/wrangler: inviável, não há versão do pool com workerd mais novo.
2. Reduzir a data para 2026-08-15: sem mudança de dependência/lockfile; nenhuma feature do app depende de flags posteriores.

## Decisão
`compatibility_date` = `2026-08-15` (raiz do `wrangler.jsonc`; `env.teste` herda). Subir a data só junto de uma versão do pool cujo workerd a aceite.

## Consequências
Produção roda um runtime com comportamento de 2026-08-15 (estável, sem perda funcional conhecida). Teste e produção ficam alinhados. Reavaliar ao sair nova versão do pool.
