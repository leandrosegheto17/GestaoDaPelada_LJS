import { Kysely, PostgresDialect, type PostgresPool, type PostgresPoolClient } from 'kysely';
import type { ClienteRequisicao } from './cliente.ts';

import type { Banco } from './tipos.ts';

/** Tabelas tipadas do Kysely (T21): as da grupos-e-elenco, em `tipos.ts`. As outras usam o `sql` do Kysely. */
export type { Banco };

/**
 * Kysely sobre o cliente da requisição (design C4): toda consulta passa pela mesma conexão,
 * dentro da transação aberta pelo `comBanco`. O "pool" entrega sempre essa conexão e não a
 * libera nem a fecha: quem fecha é o `comBanco`, no `waitUntil`.
 *
 * Não use `db.transaction()` aqui dentro: a requisição já está numa transação.
 */
export function kyselyDoCliente(cliente: ClienteRequisicao): Kysely<Banco> {
  const conexao = {
    query: (sql: string, parametros: ReadonlyArray<unknown>) => cliente.consultar(sql, [...parametros]),
    release: () => undefined,
  } as unknown as PostgresPoolClient;
  const pool: PostgresPool = {
    connect: async () => conexao,
    end: async () => undefined,
  };
  return new Kysely<Banco>({ dialect: new PostgresDialect({ pool }) });
}
