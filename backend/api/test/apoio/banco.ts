import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { exigirHostPermitido } from '@pelada/scripts/host';

/**
 * Cria o database `teste_<aleatório>`, entrega a URL ao corpo e o remove no `finally`.
 * Recusa host fora da lista antes de conectar (FUN-19).
 */
export async function bancoDeTeste<T>(corpo: (url: string) => Promise<T>): Promise<T> {
  const base = process.env.DATABASE_URL_TESTE;
  if (!base) throw new Error('DATABASE_URL_TESTE não definida');
  exigirHostPermitido(base);

  const nome = `teste_${randomBytes(6).toString('hex')}`;
  const urlDoBanco = new URL(base);
  urlDoBanco.pathname = `/${nome}`;

  const admin = new pg.Client({ connectionString: base });
  await admin.connect();
  try {
    await admin.query(`create database ${nome}`);
    try {
      return await corpo(urlDoBanco.toString());
    } finally {
      await admin.query(`drop database if exists ${nome} with (force)`);
    }
  } finally {
    await admin.end();
  }
}
