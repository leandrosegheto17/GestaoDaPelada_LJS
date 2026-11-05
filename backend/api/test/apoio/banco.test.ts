import { describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import { bancoDeTeste, comCliente, URL_TESTE_PADRAO } from './banco.ts';

const URL_BASE = process.env.DATABASE_URL_TESTE ?? URL_TESTE_PADRAO;

async function existe(nome: string): Promise<boolean> {
  return comCliente(URL_BASE, async (c) => {
    const r = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [nome]);
    return r.rowCount === 1;
  });
}

describe('bancoDeTeste', () => {
  it('FUN-19: host remoto é recusado antes de abrir conexão', async () => {
    const conectar = vi.spyOn(pg.Client.prototype, 'connect');
    const corpo = vi.fn();
    try {
      await expect(
        bancoDeTeste(corpo, { urlBase: 'postgres://u:p@ep-abc.sa-east-1.aws.neon.tech/neondb' }),
      ).rejects.toThrow(/não permitido/);
      expect(conectar).not.toHaveBeenCalled();
      expect(corpo).not.toHaveBeenCalled();
    } finally {
      conectar.mockRestore();
    }
  });

  it('FUN-19: cria o banco, grava uma linha e o remove no fim', async () => {
    let criado = '';
    const linhas = await bancoDeTeste(async (url, nome) => {
      criado = nome;
      expect(nome).toMatch(/^teste_[0-9a-f]{12}$/);
      return comCliente(url, async (c) => {
        await c.query('CREATE TABLE t (x int)');
        await c.query('INSERT INTO t VALUES (1)');
        return (await c.query('SELECT x FROM t')).rows;
      });
    });
    expect(linhas).toEqual([{ x: 1 }]);
    expect(await existe(criado)).toBe(false);
  });

  it('FUN-19: remove o banco mesmo quando o corpo lança erro e há conexão aberta', async () => {
    let criado = '';
    let aberta: pg.Client | undefined;
    await expect(
      bancoDeTeste(async (url, nome) => {
        criado = nome;
        aberta = new pg.Client({ connectionString: url });
        await aberta.connect();
        throw new Error('falha de propósito');
      }),
    ).rejects.toThrow('falha de propósito');
    await aberta?.end().catch(() => undefined);
    expect(criado).not.toBe('');
    expect(await existe(criado)).toBe(false);
  });
});
