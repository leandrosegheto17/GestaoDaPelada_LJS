import { env } from 'cloudflare:test';
import pg from 'pg';

/** Consulta o banco do Worker de teste como owner (sem RLS), para conferir o que a pelada_app não lê. */
export async function comoOwner<T extends pg.QueryResultRow>(texto: string, valores: unknown[] = []): Promise<T[]> {
  const cliente = new pg.Client({ connectionString: env.HYPERDRIVE_OWNER_TESTE.connectionString });
  cliente.on('error', () => undefined);
  await cliente.connect();
  try {
    return (await cliente.query<T>(texto, valores)).rows;
  } finally {
    await cliente.end();
  }
}
