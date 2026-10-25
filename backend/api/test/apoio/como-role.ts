import type pg from 'pg';

/** Erro do Postgres com o código SQLSTATE. */
export interface ErroPg {
  code?: string;
  message: string;
}

/**
 * Executa `acao` numa transação com `SET LOCAL ROLE <role>` e desfaz tudo no fim.
 * Os privilégios e as policies valem como se a conexão fosse da própria role.
 */
export async function comoRole<T>(cliente: pg.ClientBase, role: string, acao: () => Promise<T>): Promise<T> {
  await cliente.query('BEGIN');
  try {
    await cliente.query(`SET LOCAL ROLE ${role}`);
    return await acao();
  } finally {
    await cliente.query('ROLLBACK');
  }
}

/** Tenta o comando num savepoint e devolve o código do erro (ou `null` se passou), sem abortar a transação. */
export async function codigoDoErro(
  cliente: pg.ClientBase,
  sql: string,
  params: unknown[] = [],
): Promise<string | null> {
  await cliente.query('SAVEPOINT tentativa');
  try {
    await cliente.query(sql, params);
    await cliente.query('RELEASE SAVEPOINT tentativa');
    return null;
  } catch (erro) {
    await cliente.query('ROLLBACK TO SAVEPOINT tentativa');
    return (erro as ErroPg).code ?? 'sem-codigo';
  }
}
