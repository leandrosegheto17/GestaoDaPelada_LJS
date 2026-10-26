import type { MiddlewareHandler } from 'hono';

/** Toda resposta de `/api/*`, inclusive 401, 404 e 500, proíbe o navegador de adivinhar o tipo. */
export const semSniff: MiddlewareHandler = async (c, proximo) => {
  await proximo();
  c.header('X-Content-Type-Options', 'nosniff');
};
