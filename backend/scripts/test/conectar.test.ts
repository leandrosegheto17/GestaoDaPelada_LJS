import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { comConexao, conectar, ErroBancoFora, executarCli } from '../src/conectar.ts';

const URL_TESTE =
  process.env.DATABASE_URL_TESTE ?? 'postgres://postgres:postgres@127.0.0.1:5432/pelada';
const PORTA_FECHADA = 'postgres://postgres:postgres@127.0.0.1:1/pelada';

describe('conectar', () => {
  it('FUN-55: porta fechada falha com a mensagem do docker compose', async () => {
    await expect(conectar(PORTA_FECHADA)).rejects.toThrow(ErroBancoFora);
    await expect(conectar(PORTA_FECHADA)).rejects.toThrow(/docker compose up -d/);
  });

  it('FUN-55: localhost com porta fechada também cita o docker compose', async () => {
    await expect(conectar('postgres://postgres:postgres@localhost:1/pelada')).rejects.toThrow(
      /docker compose up -d/,
    );
  });

  it('FUN-55: na linha de comando, sai com código 1 e imprime a mensagem', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const antes = process.exitCode;
    try {
      await executarCli(async () => {
        await conectar(PORTA_FECHADA);
      });
      expect(process.exitCode).toBe(1);
      expect(String(erro.mock.calls[0]?.[0])).toContain('docker compose up -d');
    } finally {
      process.exitCode = antes;
      erro.mockRestore();
    }
  });

  it('FUN-55: com o Postgres de pé, conecta e fecha sem deixar conexão aberta', async () => {
    const nome = `teste-conectar-${randomUUID()}`;
    const url = new URL(URL_TESTE);
    url.searchParams.set('application_name', nome);
    const r = await comConexao(url.toString(), async (c) => (await c.query('SELECT 1 AS um')).rows);
    expect(r).toEqual([{ um: 1 }]);
    const abertas = await comConexao(URL_TESTE, async (c) => {
      const res = await c.query(
        'SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name = $1',
        [nome],
      );
      return res.rows[0].n as number;
    });
    expect(abertas).toBe(0);
  });

  it('FUN-55: fecha a conexão mesmo quando o corpo lança erro', async () => {
    const nome = `teste-conectar-${randomUUID()}`;
    const url = new URL(URL_TESTE);
    url.searchParams.set('application_name', nome);
    await expect(
      comConexao(url.toString(), async () => {
        throw new Error('falha de propósito');
      }),
    ).rejects.toThrow('falha de propósito');
    const abertas = await comConexao(URL_TESTE, async (c) => {
      const res = await c.query(
        'SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name = $1',
        [nome],
      );
      return res.rows[0].n as number;
    });
    expect(abertas).toBe(0);
  });
});
