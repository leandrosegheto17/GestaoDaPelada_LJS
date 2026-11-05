import { randomBytes } from 'node:crypto';
import { migrar } from '@pelada/api/migrar';
import type pg from 'pg';
import { comConexao } from '../../src/conectar.ts';

export const URL_BASE =
  process.env.DATABASE_URL_TESTE ?? 'postgres://postgres:postgres@127.0.0.1:5432/pelada';

export function urlDoBanco(base: string, banco: string): string {
  const u = new URL(base);
  u.pathname = `/${banco}`;
  return u.toString();
}

/**
 * Banco `teste_*` migrado e descartável: apagado no `finally`, mesmo quando a migração ou o
 * teste falham. Não mexe em roles do cluster (quem mexe restaura por conta própria).
 */
export async function comBancoMigrado(fn: (url: string) => Promise<void>): Promise<void> {
  const nome = `teste_${randomBytes(6).toString('hex')}`;
  await comConexao(URL_BASE, (c) => c.query(`CREATE DATABASE ${nome}`));
  try {
    const url = urlDoBanco(URL_BASE, nome);
    await migrar(url);
    await fn(url);
  } finally {
    await comConexao(URL_BASE, (c) => c.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`));
  }
}

/** Entra por `conta_entrar` (como o owner, que a executa) e devolve o resultado. */
export async function entrarComo(
  url: string,
  email: string,
  senha: string,
): Promise<string | undefined> {
  return comConexao(url, async (c: pg.Client) => {
    const r = await c.query<{ resultado: string }>(
      'SELECT resultado FROM conta_entrar($1, $2, $3, $4)',
      [email, senha, randomBytes(32), randomBytes(32)],
    );
    return r.rows[0]?.resultado;
  });
}
