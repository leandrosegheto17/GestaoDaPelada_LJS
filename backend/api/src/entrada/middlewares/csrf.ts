import type { MiddlewareHandler } from 'hono';
import { requisicaoRecusada } from '../erros.ts';

const ESCRITAS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Toda escrita em `/api/*` exige o cabeçalho `X-Pelada: 1` (defesa contra CSRF). */
export const exigirCabecalhoPelada: MiddlewareHandler = async (c, proximo) => {
  if (ESCRITAS.has(c.req.method) && c.req.header('X-Pelada') !== '1') {
    return requisicaoRecusada(c);
  }
  await proximo();
};
