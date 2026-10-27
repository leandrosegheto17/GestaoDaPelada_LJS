import pg from 'pg';

/**
 * Define a senha de uma conta como owner, pela função `conta_definir_senha` (só o owner a executa; script do dono
 * e seed). Com `dono`, cria a conta de dono se faltar. Quem chama passa antes pela trava de host.
 */
export async function definirSenhaDaConta(
  url: string,
  dados: { email: string; senha: string; dono: boolean },
): Promise<string> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    const { rows } = await c.query<{ id: string }>('SELECT conta_definir_senha($1, $2, $3) AS id', [
      dados.email,
      dados.senha,
      dados.dono,
    ]);
    return rows[0]!.id;
  } finally {
    await c.end();
  }
}
