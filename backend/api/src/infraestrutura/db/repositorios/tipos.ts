import { Buffer } from 'node:buffer';
import type { Kysely } from 'kysely';
import type { Banco } from '../transacao.ts';

/**
 * Tipos comuns dos repositórios de conta (T22, T23). Cada repositório recebe o `Db` da
 * transação da requisição (`c.var.db`, posto pelo `comBanco`) e nunca abre transação própria.
 */

export type Db = Kysely<Banco>;

/** Hash (SHA-256) para um parâmetro `bytea`: o driver `pg` grava `Buffer` como `bytea`. */
export function bytea(hash: Uint8Array): Buffer {
  return Buffer.from(hash);
}
