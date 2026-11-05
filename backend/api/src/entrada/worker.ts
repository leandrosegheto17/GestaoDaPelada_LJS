import type { Env } from './ambiente.ts';
import { criarApp } from './app.ts';
import { criarWorker } from './observabilidade.ts';

const app = criarApp();

/**
 * Entrada do Worker (wrangler.jsonc `main`). Só /api/* chega aqui; o resto são os assets.
 * O Sentry entra só com `SENTRY_DSN` (FUN-24, FUN-25).
 */
export default criarWorker({
  fetch: (requisicao: Request, env: Env, ctx: unknown) =>
    app.fetch(requisicao, env, ctx as Parameters<typeof app.fetch>[2]),
});
