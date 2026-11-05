import type { MiddlewareHandler } from 'hono';
import type { Ambiente, NomeLimite } from '../ambiente.ts';

/** Chave usada quando a requisição não traz `cf-connecting-ip` (só fora da Cloudflare). */
export const CHAVE_SEM_IP = 'sem-ip';

/** Espera sugerida no 429, igual ao período dos bindings (60 s, wrangler.jsonc). */
export const ESPERA_SEGUNDOS = 60;

export const MENSAGEM_LIMITE = 'Muitas requisições. Tente de novo em instantes.';

/**
 * Limite de taxa por IP (FUN-26), com o binding do wrangler.jsonc. Negado: 429 com
 * `Retry-After` e um corpo sem detalhe interno, sem chamar o handler.
 */
export function limiteTaxa(binding: NomeLimite): MiddlewareHandler<Ambiente> {
  return async (c, next) => {
    const chave = c.req.header('cf-connecting-ip') || CHAVE_SEM_IP;
    const { success } = await c.env[binding].limit({ key: chave });
    if (!success) {
      return c.json({ erro: MENSAGEM_LIMITE }, 429, { 'Retry-After': String(ESPERA_SEGUNDOS) });
    }
    await next();
  };
}
