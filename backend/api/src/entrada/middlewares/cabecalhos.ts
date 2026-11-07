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

/**
 * `Content-Security-Policy` da API (A-12): a API só devolve JSON, então nada pode carregar nem ser embutido a partir
 * dela. O front tem a CSP própria no `_headers` dos assets.
 */
export const csp = cabecalho(
  'Content-Security-Policy',
  "default-src 'none'; frame-ancestors 'none'",
);

/** `Referrer-Policy: same-origin` (`no-referrer` faria o Chromium mandar `Origin: null` nas escritas). */
export const politicaReferrer = cabecalho('Referrer-Policy', 'same-origin');
