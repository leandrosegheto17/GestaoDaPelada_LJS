import pg from 'pg';

export const MENSAGEM_BANCO_FORA = 'Postgres local fora do ar. Rode `docker compose up -d`.';

export class BancoForaDoArError extends Error {
  constructor() {
    super(MENSAGEM_BANCO_FORA);
    this.name = 'BancoForaDoArError';
  }
}

function recusada(erro: unknown): boolean {
  const e = erro as { code?: string; errors?: { code?: string }[] };
  return e.code === 'ECONNREFUSED' || (e.errors?.some((x) => x.code === 'ECONNREFUSED') ?? false);
}

/** Conecta; diante de ECONNREFUSED, falha dizendo como subir o banco (FUN-55). */
export async function conectar(
  url: string,
  opcoes: { application_name?: string } = {},
): Promise<pg.Client> {
  const cliente = new pg.Client({ connectionString: url, ...opcoes });
  try {
    await cliente.connect();
  } catch (erro) {
    await cliente.end().catch(() => undefined);
    if (recusada(erro)) throw new BancoForaDoArError();
    throw erro;
  }
  return cliente;
}
