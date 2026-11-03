import pg from 'pg';
import { afterEach, expect, test } from 'vitest';
import { bancoDeTeste } from './banco.js';

const original = process.env.DATABASE_URL_TESTE;
afterEach(() => {
  process.env.DATABASE_URL_TESTE = original;
});

async function existe(nome: string): Promise<boolean> {
  const c = new pg.Client({ connectionString: original });
  await c.connect();
  try {
    const r = await c.query('select 1 from pg_database where datname = $1', [nome]);
    return r.rowCount === 1;
  } finally {
    await c.end();
  }
}

const nomeDe = (url: string) => new URL(url).pathname.slice(1);

test('FUN-19: host remoto em DATABASE_URL_TESTE lança erro antes de conectar', async () => {
  process.env.DATABASE_URL_TESTE = 'postgres://u:s@ep-x.us-east-2.aws.neon.tech/neondb';
  let chamou = false;
  await expect(
    bancoDeTeste(async () => {
      chamou = true;
    }),
  ).rejects.toThrow(/host/i);
  expect(chamou).toBe(false);
});

test('FUN-19: cria o banco, grava uma linha e remove ao final', async () => {
  let nome = '';
  await bancoDeTeste(async (url) => {
    nome = nomeDe(url);
    expect(nome).toMatch(/^teste_/);
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    await c.query('create table t (n int)');
    await c.query('insert into t values (1)');
    const r = await c.query('select n from t');
    expect(r.rows).toEqual([{ n: 1 }]);
    await c.end();
  });
  expect(await existe(nome)).toBe(false);
});

test('FUN-19: remove o banco mesmo quando o corpo do teste lança erro', async () => {
  let nome = '';
  await expect(
    bancoDeTeste(async (url) => {
      nome = nomeDe(url);
      const c = new pg.Client({ connectionString: url });
      c.on('error', () => {}); // o drop com force encerra esta conexão
      await c.connect(); // conexão deixada aberta de propósito
      throw new Error('falha no corpo');
    }),
  ).rejects.toThrow('falha no corpo');
  expect(nome).toMatch(/^teste_/);
  expect(await existe(nome)).toBe(false);
});
