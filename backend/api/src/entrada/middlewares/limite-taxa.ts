import type { Context, MiddlewareHandler } from 'hono';
import type { AppEnv } from '../app.ts';
import { muitasRequisicoes } from '../erros.ts';

/** Contrato mínimo do binding de Rate Limiting do Workers. */
export interface Limitador {
  limit(opcoes: { key: string }): Promise<{ success: boolean }>;
}

/** Quando a requisição não traz o IP (fora da Cloudflare), todos dividem a mesma chave: falha fechada. */
const CHAVE_SEM_IP = 'sem-ip';

/**
 * Limite de taxa por IP (FUN-26). O IP só serve de chave do limitador: não é guardado, logado nem devolvido.
 * Sem o binding em ambiente local (URL_PUBLICA não https) não limita em silêncio; em ambiente implantado a
 * ausência é registrada uma vez, sem IP. Se o próprio limitador falha, deixa passar e registra só que ele estava
 * indisponível.
 */
export function criarLimiteTaxa(obter: (c: Context<AppEnv>) => Limitador | undefined): MiddlewareHandler<AppEnv> {
  let ausenciaRegistrada = false;
  return async (c, proximo) => {
    const limitador = obter(c);
    if (!limitador && !ausenciaRegistrada && String(c.env?.URL_PUBLICA ?? '').startsWith('https:')) {
      ausenciaRegistrada = true;
      console.error('limitador ausente');
    }
    if (limitador) {
      try {
        const { success } = await limitador.limit({ key: c.req.header('CF-Connecting-IP') ?? CHAVE_SEM_IP });
        if (!success) return muitasRequisicoes(c);
      } catch {
        console.error('limitador indisponível');
      }
    }
    return proximo();
  };
}
