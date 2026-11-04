import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import pg from 'pg';
import { expect, test } from 'vitest';
import { conectar } from '../src/conectar.js';

const URL_LOCAL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/pelada';
const APP = 'pelada-teste-conectar';

test('FUN-55: porta fechada sai com código 1 e cita docker compose up -d', () => {
  const cli = join(import.meta.dirname, '..', 'src', 'conectar-cli.ts');
  const r = spawnSync(process.execPath, [cli, 'postgres://u:p@127.0.0.1:1/pelada'], {
    encoding: 'utf8',
  });
  expect(r.status).toBe(1);
  expect(r.stderr).toContain('docker compose up -d');
});

test('FUN-55: com o Postgres de pé conecta e fecha sem deixar conexão aberta', async () => {
  const observador = new pg.Client({ connectionString: URL_LOCAL });
  await observador.connect();
  const abertas = async () =>
    Number(
      (
        await observador.query(
          'select count(*)::int as n from pg_stat_activity where application_name = $1',
          [APP],
        )
      ).rows[0].n,
    );
  try {
    const cliente = await conectar(URL_LOCAL, { application_name: APP });
    expect(await abertas()).toBe(1);
    await cliente.end();
    await new Promise((ok) => setTimeout(ok, 200));
    expect(await abertas()).toBe(0);
  } finally {
    await observador.end();
  }
});
