import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { exigirHostPermitido, HOSTS_LOCAIS } from '@pelada/scripts/host';

export const URL_ADMIN_PADRAO = 'postgres://postgres:postgres@127.0.0.1:5432/postgres';

export interface BancoDeTeste {
  url: string;
  remover: () => Promise<void>;
}

/** Cria `teste_<aleatório>` num Postgres local (FUN-19). Quem chama deve chamar `remover` no finally. */
export async function bancoDeTeste(): Promise<BancoDeTeste> {
  const base = process.env.DATABASE_URL_TESTE ?? URL_ADMIN_PADRAO;
  exigirHostPermitido(base, HOSTS_LOCAIS);
  const nome = `teste_${randomBytes(6).toString('hex')}`;
  const admin = new URL(base);
  admin.pathname = '/postgres';
  const alvo = new URL(base);
  alvo.pathname = `/${nome}`;

  const c = new pg.Client({ connectionString: admin.toString() });
  await c.connect();
  try {
    await c.query(`create database ${nome}`);
  } finally {
    await c.end();
  }
  return {
    url: alvo.toString(),
    remover: async () => {
      const r = new pg.Client({ connectionString: admin.toString() });
      await r.connect();
      try {
        await r.query(`drop database if exists ${nome} with (force)`);
      } finally {
        await r.end();
      }
    },
  };
}

/** Cria o banco, roda `corpo` e remove o banco no finally, mesmo se o corpo lançar. */
export async function comBancoDeTeste<T>(corpo: (url: string) => Promise<T>): Promise<T> {
  const banco = await bancoDeTeste();
  try {
    return await corpo(banco.url);
  } finally {
    await banco.remover();
  }
}
