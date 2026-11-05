import type { MiddlewareHandler } from 'hono';
import type { Ambiente } from '../ambiente.ts';

/**
 * Cabeçalhos de toda resposta de /api/* (FUN-22). Cada um é posto antes do handler (vale para
 * as respostas criadas pelo contexto) e confirmado depois, na resposta final, que pode ser a do
 * `notFound` ou do `onError`.
 */
function cabecalho(nome: string, valor: string): MiddlewareHandler<Ambiente> {
  return async (c, next) => {
    c.header(nome, valor);
    await next();
    c.res.headers.set(nome, valor);
  };
}

/** `Cache-Control: no-store`: nenhuma resposta da API fica em cache. */
export const semCache = cabecalho('Cache-Control', 'no-store');

/** `X-Content-Type-Options: nosniff`. */
export const semSniff = cabecalho('X-Content-Type-Options', 'nosniff');
