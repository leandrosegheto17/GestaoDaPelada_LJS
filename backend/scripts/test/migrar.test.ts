import { randomBytes } from 'node:crypto';
import { readdirSync } from 'node:fs';
import pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { comConexao, executarCli } from '../src/conectar.ts';
import { comandoMigrar } from '../src/migrar.ts';

/** Quantas migrações existem na pasta (as features acrescentam às 23 herdadas). */
const TOTAL_MIGRACOES = readdirSync(
  new URL('../../api/src/infraestrutura/db/migracoes/', import.meta.url),
).filter((f) => f.endsWith('.sql')).length;

const URL_BASE =
  process.env.DATABASE_URL_TESTE ?? 'postgres://postgres:postgres@127.0.0.1:5432/pelada';

async function comBancoVazio(fn: (url: string) => Promise<void>): Promise<void> {
  const nome = `teste_${randomBytes(6).toString('hex')}`;
  await comConexao(URL_BASE, (c) => c.query(`CREATE DATABASE ${nome}`));
  try {
    const u = new URL(URL_BASE);
    u.pathname = `/${nome}`;
    await fn(u.toString());
  } finally {
    await comConexao(URL_BASE, (c) => c.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`));
  }
}

describe('pnpm migrar', () => {
  it('FUN-19: host remoto sem a permissão do deploy aborta antes de conectar', async () => {
    const conectar = vi.spyOn(pg.Client.prototype, 'connect');
    try {
      await expect(
        comandoMigrar({
          DATABASE_URL_MIGRACAO: 'postgres://u:p@ep-x.sa-east-1.aws.neon.tech/neondb',
        }),
      ).rejects.toThrow(/não permitido/);
      await expect(
        comandoMigrar({
          DATABASE_URL_MIGRACAO: 'postgres://u:p@ep-x.sa-east-1.aws.neon.tech/neondb',
          PELADA_PERMITIR_HOST_REMOTO: '0',
        }),
      ).rejects.toThrow(/não permitido/);
      expect(conectar).not.toHaveBeenCalled();
    } finally {
      conectar.mockRestore();
    }
  });

  it('FUN-07: sem DATABASE_URL_MIGRACAO, falha com a orientação', async () => {
    await expect(comandoMigrar({})).rejects.toThrow(/DATABASE_URL_MIGRACAO/);
  });

  it('FUN-55: com o Postgres parado, sai com código 1 e pede docker compose up -d', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const antes = process.exitCode;
    try {
      await executarCli(async () => {
        await comandoMigrar({
          DATABASE_URL_MIGRACAO: 'postgres://postgres:postgres@127.0.0.1:1/pelada',
        });
      });
      expect(process.exitCode).toBe(1);
      expect(String(erro.mock.calls[0]?.[0])).toContain('docker compose up -d');
    } finally {
      process.exitCode = antes;
      erro.mockRestore();
    }
  });

  it('FUN-07: num banco local vazio aplica todas as migrações', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await comBancoVazio(async (url) => {
        const aplicadas = await comandoMigrar({ DATABASE_URL_MIGRACAO: url });
        expect(aplicadas).toHaveLength(TOTAL_MIGRACOES);
        const n = await comConexao(
          url,
          async (c) =>
            (await c.query<{ n: number }>('SELECT count(*)::int AS n FROM pgmigrations')).rows[0]
              ?.n,
        );
        expect(n).toBe(TOTAL_MIGRACOES);
      });
    } finally {
      log.mockRestore();
    }
  });
});
