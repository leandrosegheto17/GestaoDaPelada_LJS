import pg from 'pg';

export const MENSAGEM_BANCO_FORA =
  'Não foi possível conectar ao Postgres local. Rode `docker compose up -d`.';

function recusada(erro: unknown): boolean {
  const e = erro as { code?: string; errors?: unknown[] };
  if (e?.code === 'ECONNREFUSED') return true;
  return Array.isArray(e?.errors) && e.errors.some(recusada);
}

export async function conectar(
  url: string,
  opcoes: { applicationName?: string } = {},
): Promise<pg.Client> {
  const cliente = new pg.Client({
    connectionString: url,
    ...(opcoes.applicationName ? { application_name: opcoes.applicationName } : {}),
  });
  try {
    await cliente.connect();
  } catch (erro) {
    if (recusada(erro)) throw new Error(MENSAGEM_BANCO_FORA, { cause: erro });
    throw erro;
  }
  return cliente;
}

/** Roda um comando de linha e devolve o código de saída (0 ou 1), escrevendo o erro na saída de erro. */
export async function comSaida(
  fn: () => Promise<void>,
  escrever: (mensagem: string) => void = (m) => console.error(m),
): Promise<number> {
  try {
    await fn();
    return 0;
  } catch (erro) {
    escrever((erro as Error).message);
    return 1;
  }
}
