import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import pg from 'pg';
import { expect, test } from 'vitest';
import { bancoDeTeste } from '../../api/test/apoio/banco.ts';
import { executarMigrar } from '../src/migrar.ts';

const script = resolve(import.meta.dirname, '../src/migrar.ts');

function rodar(env: Record<string, string>) {
  return spawnSync('node', [script], {
    encoding: 'utf8',
    timeout: 60_000,
    env: { PATH: process.env.PATH ?? '', ...env },
  });
}

test('FUN-19: host remoto sem a variável de permissão do deploy aborta antes de conectar', async () => {
  let chamou = false;
  await expect(
    executarMigrar(
      { DATABASE_URL_MIGRACAO: 'postgres://u:s@ep-x.us-east-2.aws.neon.tech/neondb' },
      async () => {
        chamou = true;
        return [];
      },
    ),
  ).rejects.toThrow(/host/i);
  expect(chamou).toBe(false);
});

test('FUN-19: com a variável de permissão do deploy o host remoto passa pela trava', async () => {
  let url = '';
  await executarMigrar(
    {
      DATABASE_URL_MIGRACAO: 'postgres://u:s@ep-x.us-east-2.aws.neon.tech/neondb',
      PELADA_DEPLOY: '1',
    },
    async (u) => {
      url = u;
      return [];
    },
  );
  expect(url).toContain('neon.tech');
});

test('FUN-55: sem DATABASE_URL_MIGRACAO, falha dizendo qual variável falta', async () => {
  await expect(executarMigrar({}, async () => [])).rejects.toThrow(/DATABASE_URL_MIGRACAO/);
});

test('FUN-55: com o Postgres parado, sai com código 1 e pede docker compose up -d', () => {
  const r = rodar({ DATABASE_URL_MIGRACAO: 'postgres://postgres:postgres@127.0.0.1:1/pelada' });
  expect(r.status).toBe(1);
  expect(r.stderr).toContain('docker compose up -d');
  expect(r.stderr).not.toContain('postgres:postgres');
});

test('FUN-07: o comando num banco local vazio aplica as 23 migrações', async () => {
  await bancoDeTeste(async (url) => {
    const r = rodar({ DATABASE_URL_MIGRACAO: url });
    expect(r.status, r.stderr).toBe(0);
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    try {
      const { rows } = await c.query<{ n: number }>('select count(*)::int as n from pgmigrations');
      expect(rows[0]!.n).toBe(23);
    } finally {
      await c.end();
    }
  });
}, 90_000);
