import type { MiddlewareHandler } from 'hono';

/** Nada de `/api/*` pode ser guardado em cache, inclusive 404 e 500 (FUN-21). */
export const semCache: MiddlewareHandler = async (c, proximo) => {
  await proximo();
  c.header('Cache-Control', 'no-store');
};
