import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../app.ts';
import type { Env } from '../env.ts';

/** Os bindings de rate limit da Cloudflare só aceitam períodos de 10 ou 60 segundos; os quatro usam 60. */
const PERIODO_PADRAO_S = 60;

/** Chave quando o cabeçalho do IP não vem (só em ambiente local ou de teste). */
const CHAVE_SEM_IP = 'sem-ip';

/**
 * Limite de taxa por IP (FUN-26). A chave vem só de `cf-connecting-ip`, que a Cloudflare define e o cliente não
 * consegue forjar; `X-Forwarded-For` é ignorado. Negado: 429 com `Retry-After` e um corpo sem detalhe interno.
 */
export function limiteTaxa(
  escolher: (env: Env) => RateLimit,
  periodoS: number = PERIODO_PADRAO_S,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const chave = c.req.header('cf-connecting-ip') ?? CHAVE_SEM_IP;
    const { success } = await escolher(c.env).limit({ key: chave });
    if (!success) {
      c.header('Retry-After', String(periodoS));
      return c.json({ erro: 'muitas_requisicoes' }, 429);
    }
    await next();
  };
}
