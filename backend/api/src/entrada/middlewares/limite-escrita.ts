import type { MiddlewareHandler } from 'hono';
import type { Ambiente } from '../ambiente.ts';
import { limiteTaxa } from './limite-taxa.ts';

/**
 * `LIMITE_ESCRITA` por conta nas escritas de `/api/grupos*` (T23; SEC-003). O binding é o da
 * fundação (FUN-26, 60 por minuto, wrangler.jsonc); a chave é `conta:<id>` da sessão, então uma
 * conta não gasta a cota de outra, nem de outra pessoa atrás do mesmo IP.
 *
 * - POST, PUT, PATCH e DELETE em `/api/grupos` e abaixo: acima da cota, 429 com `Retry-After`,
 *   sem abrir transação nem chamar a rota (nada é gravado);
 * - GET e HEAD não contam;
 * - sem sessão: não conta, e a rota responde o seu 401 (a chave seria de ninguém);
 * - um middleware só, sobre `c.req.path`, para não contar duas vezes quando dois padrões do
 *   roteador casam o mesmo caminho.
 *
 * Registrar em `criarApp` depois do `exigirCabecalhoPelada` (o 403 sem `X-Pelada` vem antes e
 * não gasta cota, ACE-49) e do `carregarSessao` (a conta precisa estar no contexto), antes da
 * cadeia das rotas de grupo.
 */

const METODOS_ESCRITA = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const CAMINHO_GRUPOS = /^\/api\/grupos(?:\/|$)/;

/** A requisição é uma escrita sob `/api/grupos*`. */
export function eEscritaDeGrupo(metodo: string, caminho: string): boolean {
  return METODOS_ESCRITA.has(metodo.toUpperCase()) && CAMINHO_GRUPOS.test(caminho);
}

/** Chave do limitador para a conta. */
export function chaveConta(contaId: string): string {
  return `conta:${contaId}`;
}

const limite = limiteTaxa('LIMITE_ESCRITA', (c) =>
  c.var.contaId ? chaveConta(c.var.contaId) : undefined,
);

export const limitarEscritasDeGrupo: MiddlewareHandler<Ambiente> = async (c, next) => {
  if (!eEscritaDeGrupo(c.req.method, c.req.path)) {
    await next();
    return;
  }
  return limite(c, next);
};
