import pg from 'pg';
import { afterEach, expect, test, vi } from 'vitest';
import { bancoDeTeste, comBancoDeTeste, URL_ADMIN_PADRAO } from './banco.js';

afterEach(() => vi.unstubAllEnvs());

async function bancosOrfaos() {
  const c = new pg.Client({ connectionString: URL_ADMIN_PADRAO });
  await c.connect();
  try {
    const r = await c.query("select datname from pg_database where left(datname, 6) = 'teste_'");
    return r.rows.map((l) => l.datname as string);
  } finally {
    await c.end();
  }
}

test('FUN-19: DATABASE_URL_TESTE em host remoto lança erro e não abre conexão', async () => {
  vi.stubEnv('DATABASE_URL_TESTE', 'postgres://u:p@ep-x.sa-east-1.aws.neon.tech/db');
  await expect(bancoDeTeste()).rejects.toThrow(/não permitido/);
});

test('FUN-19: cria o banco, grava uma linha e o remove, sem teste_* órfão', async () => {
  let nome = '';
  await comBancoDeTeste(async (url) => {
    nome = new URL(url).pathname.slice(1);
    expect(nome).toMatch(/^teste_/);
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    await c.query('create table t (n int)');
    await c.query('insert into t values (1)');
    expect((await c.query('select n from t')).rows).toEqual([{ n: 1 }]);
    await c.end();
  });
  expect(nome).not.toBe('');
  expect(await bancosOrfaos()).not.toContain(nome);
});

test('FUN-19: o corpo do teste lança erro e o banco é removido mesmo assim', async () => {
  let nome = '';
  await expect(
    comBancoDeTeste(async (url) => {
      nome = new URL(url).pathname.slice(1);
      throw new Error('falha do corpo');
    }),
  ).rejects.toThrow('falha do corpo');
  expect(nome).toMatch(/^teste_/);
  expect(await bancosOrfaos()).not.toContain(nome);
});
