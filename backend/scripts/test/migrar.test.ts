import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import pg from 'pg';
import { describe, expect, test } from 'vitest';
import { comBancoDeTeste, comTravaDeMigracao } from '../../api/test/apoio/banco.ts';

const cli = join(import.meta.dirname, '..', 'src', 'migrar.ts');

function rodar(env: Record<string, string>) {
  const r = spawnSync(process.execPath, [cli], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', ...env },
    timeout: 60_000,
  });
  return { status: r.status, erro: r.stderr, saida: r.stdout };
}

describe('pnpm migrar', () => {
  test('FUN-19: host remoto sem a permissão do deploy aborta antes de conectar', () => {
    const r = rodar({
      DATABASE_URL_MIGRACAO: 'postgres://u:senha@ep-x.sa-east-1.aws.neon.tech/db',
    });
    expect(r.status).toBe(1);
    expect(r.erro).toContain('não permitido');
    expect(r.erro).not.toContain('senha');
    expect(r.erro).not.toMatch(/ENOTFOUND|ETIMEDOUT/);
  });

  test('FUN-19: sem DATABASE_URL_MIGRACAO aborta com mensagem clara', () => {
    const r = rodar({});
    expect(r.status).toBe(1);
    expect(r.erro).toContain('DATABASE_URL_MIGRACAO');
  });

  test('FUN-55: com o Postgres fora do ar sai com código 1 e pede docker compose up -d', () => {
    const r = rodar({ DATABASE_URL_MIGRACAO: 'postgres://postgres:postgres@127.0.0.1:1/pelada' });
    expect(r.status).toBe(1);
    expect(r.erro).toContain('docker compose up -d');
  });

  test('FUN-07: num banco local vazio aplica as 23 migrações', async () => {
    await comBancoDeTeste(async (url) => {
      const r = await comTravaDeMigracao(async () => rodar({ DATABASE_URL_MIGRACAO: url }));
      expect(r.status, r.erro).toBe(0);
      const c = new pg.Client({ connectionString: url });
      await c.connect();
      const { rows } = await c.query('select count(*)::int as n from pgmigrations');
      await c.end();
      expect(rows[0].n).toBe(23);
    });
  }, 120_000);
});
