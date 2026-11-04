import type { MiddlewareHandler } from 'hono';

/** `Cache-Control: no-store` em toda resposta da API, inclusive 404 e erro (FUN-22). */
export const semCache: MiddlewareHandler = async (c, next) => {
  c.header('Cache-Control', 'no-store');
  await next();
};

/** `X-Content-Type-Options: nosniff` em toda resposta da API, inclusive 404 e erro (FUN-22). */
export const semSniff: MiddlewareHandler = async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  await next();
};
