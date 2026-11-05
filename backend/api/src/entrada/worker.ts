import type { Env } from './ambiente.ts';
import { criarApp } from './app.ts';
import { limparNotificacoes } from '../aplicacao/notificacoes/limpar.ts';
import { consumirAvisos, type LoteDaFila } from './consumidor-avisos.ts';
import { criarWorker } from './observabilidade.ts';

const app = criarApp();

/**
 * Entrada do Worker (wrangler.jsonc `main`). Só /api/* chega aqui; o resto são os assets.
 * O Sentry entra só com `SENTRY_DSN` (FUN-24, FUN-25). O `queue` consome a fila `avisos` (notificacoes T17; AD-098), e
 * o `scheduled` é o Cron diário da limpeza (notificacoes T26; `triggers.crons` no wrangler.jsonc).
 */
export default criarWorker({
  fetch: (requisicao: Request, env: Env, ctx: unknown) =>
    app.fetch(requisicao, env, ctx as Parameters<typeof app.fetch>[2]),
  queue: (lote: unknown, env: Env) => consumirAvisos(lote as LoteDaFila, env),
  scheduled: async (_evento: unknown, env: Env) => {
    await limparNotificacoes(env);
  },
});
