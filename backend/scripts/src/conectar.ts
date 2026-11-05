import pg from 'pg';

export const MENSAGEM_BANCO_FORA =
  'O Postgres local não está de pé. Rode `docker compose up -d` e tente de novo.';

export class ErroBancoFora extends Error {
  override name = 'ErroBancoFora';
  constructor() {
    super(MENSAGEM_BANCO_FORA);
  }
}

function recusado(erro: unknown): boolean {
  if (typeof erro !== 'object' || erro === null) return false;
  const e = erro as { code?: string; errors?: unknown[] };
  if (e.code === 'ECONNREFUSED') return true;
  // Node tenta ::1 e 127.0.0.1 para "localhost" e junta as falhas num AggregateError.
  return Array.isArray(e.errors) && e.errors.some(recusado);
}

/** Abre uma conexão; diante de ECONNREFUSED, falha com o passo que falta (FUN-55). */
export async function conectar(url: string): Promise<pg.Client> {
  const cliente = new pg.Client({ connectionString: url });
  try {
    await cliente.connect();
    return cliente;
  } catch (erro) {
    await cliente.end().catch(() => undefined);
    if (recusado(erro)) throw new ErroBancoFora();
    throw erro;
  }
}

/** Roda `fn` com uma conexão e a fecha sempre, mesmo em erro. */
export async function comConexao<T>(url: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const cliente = await conectar(url);
  try {
    return await fn(cliente);
  } finally {
    await cliente.end();
  }
}

/** Entrada dos comandos de linha: imprime a mensagem e sai com código 1 em erro. */
export async function executarCli(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (erro) {
    console.error(erro instanceof Error ? erro.message : String(erro));
    process.exitCode = 1;
  }
}
