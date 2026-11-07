import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Ambiente } from '../ambiente.ts';

/**
 * Corpo das escritas de `/api/grupos*` lido por inteiro, e limitado, antes de qualquer consulta (SV-01, SV-04).
 *
 * Antes, o corpo era lido pela rota, depois de a cadeia abrir a transação e travar a linha do grupo em
 * `FOR KEY SHARE`: um cliente lento segurava conexão `idle in transaction` e fazia o `arquivar` esperar. Aqui o corpo
 * chega primeiro; o Hono guarda os bytes e a rota lê o JSON do cache (`c.req.json()`).
 *
 * - GET, HEAD e OPTIONS: passam, sem ler corpo;
 * - escrita com corpo acima de `maxSize` (pelo `Content-Length` ou contado durante a leitura): 413, sem abrir conexão;
 * - corpo que o cliente interrompe: a leitura rejeita e o erro sobe (500 pelo `onError`), ainda sem conexão aberta.
 */

/** Teto do corpo das escritas de grupo: 16 KB (o da Base). */
export const LIMITE_CORPO_GRUPO_BYTES = 16 * 1024;

export const MENSAGEM_CORPO_GRANDE_GRUPO = 'O corpo da requisição é grande demais.';

const SEM_CORPO = new Set(['GET', 'HEAD', 'OPTIONS']);

export function lerCorpoAntes(
  maxSize: number = LIMITE_CORPO_GRUPO_BYTES,
): MiddlewareHandler<Ambiente> {
  const limite = bodyLimit({
    maxSize,
    onError: (c) => c.json({ erro: MENSAGEM_CORPO_GRANDE_GRUPO }, 413),
  });
  return async (c, next) => {
    if (SEM_CORPO.has(c.req.method.toUpperCase())) {
      await next();
      return;
    }
    return limite(c, async () => {
      if (c.req.raw.body) await c.req.arrayBuffer();
      await next();
    });
  };
}
