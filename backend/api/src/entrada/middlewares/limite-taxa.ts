import type { Context, MiddlewareHandler } from 'hono';
import { chaveDoIp } from '../../infraestrutura/sessao/chave-ip.ts';
import type { AppEnv } from '../app.ts';
import { muitasRequisicoes } from '../erros.ts';

/** Contrato mínimo do binding de Rate Limiting do Workers. */
export interface Limitador {
  limit(opcoes: { key: string }): Promise<{ success: boolean }>;
}

export interface OpcoesLimiteTaxa {
  /** Chave do limitador; `undefined` deixa passar sem contar. Padrão: a chave do IP (FUN-26). */
  chave?: (c: Context<AppEnv>) => string | undefined;
  /** Segundos no cabeçalho `Retry-After` do 429 (o período do binding). Sem ele, o 429 sai sem o cabeçalho. */
  retryAfterSegundos?: number;
}

/**
 * Limite de taxa por IP (FUN-26), ou pela chave de `opcoes.chave` (a conta da sessão no `LIMITE_ESCRITA`, SEC-003). O IP só serve de chave do limitador: não é guardado, logado nem devolvido.
 * Sem o binding em ambiente local (URL_PUBLICA não https) não limita em silêncio; em ambiente implantado a
 * ausência é registrada uma vez, sem IP. Se o próprio limitador falha, deixa passar e registra só que ele estava
 * indisponível.
 */
export function criarLimiteTaxa(
  obter: (c: Context<AppEnv>) => Limitador | undefined,
  opcoes: OpcoesLimiteTaxa = {},
): MiddlewareHandler<AppEnv> {
  let ausenciaRegistrada = false;
  const chaveDe = opcoes.chave ?? ((c: Context<AppEnv>) => chaveDoIp(c.req.header('CF-Connecting-IP')));
  return async (c, proximo) => {
    const chave = chaveDe(c);
    if (chave === undefined) return proximo();
    const limitador = obter(c);
    if (!limitador && !ausenciaRegistrada && String(c.env?.URL_PUBLICA ?? '').startsWith('https:')) {
      ausenciaRegistrada = true;
      console.error('limitador ausente');
    }
    if (limitador) {
      try {
        const { success } = await limitador.limit({ key: chave });
        if (!success) {
          if (opcoes.retryAfterSegundos !== undefined) c.header('Retry-After', String(opcoes.retryAfterSegundos));
          return muitasRequisicoes(c);
        }
      } catch {
        console.error('limitador indisponível');
      }
    }
    return proximo();
  };
}
