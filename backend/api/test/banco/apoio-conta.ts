import pg from 'pg';

/**
 * Apoio dos testes das funções de conta no banco (Phases 2 e 3). Cada caso roda numa transação
 * do superusuário desfeita ao fim, alternando entre `pelada_app` (quem chama as funções, como a
 * API) e o superusuário (quem lê as tabelas de apoio, que `pelada_app` não lê). Como o `now()`
 * é o do início da transação, "o tempo que passou" é simulado recuando as datas gravadas.
 */

/** Roda `fn` numa transação do superusuário e a desfaz no fim, também quando `fn` lança erro. */
export async function numaTransacao<T>(db: pg.Client, fn: () => Promise<T>): Promise<T> {
  await db.query('BEGIN');
  try {
    return await fn();
  } finally {
    await db.query('ROLLBACK');
  }
}

/** Passa a rodar como `pelada_app` com a conta dada (ou sem conta), até o fim da transação ou `comoSuper`. */
export async function comoAppAqui(db: pg.Client, conta: string | null = null): Promise<void> {
  await db.query('SET LOCAL ROLE pelada_app');
  await db.query(
    `SELECT set_config('app.conta_id', $1, true), set_config('app.slug_publico', '', true)`,
    [conta ?? ''],
  );
}

/** Volta ao superusuário da conexão (sem RLS) dentro da transação. */
export async function comoSuper(db: pg.Client): Promise<void> {
  await db.query('RESET ROLE');
}

/** Primeira linha de uma consulta, ou erro se não houver. */
export async function umaLinha<T extends pg.QueryResultRow>(
  db: pg.Client,
  sql: string,
  valores: unknown[] = [],
): Promise<T> {
  const r = await db.query<T>(sql, valores);
  const linha = r.rows[0];
  if (!linha) throw new Error(`Consulta sem linha: ${sql}`);
  return linha;
}

/** Contagem simples, como superusuário. */
export async function contar(db: pg.Client, sql: string, valores: unknown[] = []): Promise<number> {
  const r = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM (${sql}) q`, valores);
  return r.rows[0]?.n ?? -1;
}

/** Abre uma conexão nova ao mesmo banco (para os testes de concorrência), fechada por `fechar`. */
export async function outraConexao(url: string): Promise<pg.Client> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  return c;
}
