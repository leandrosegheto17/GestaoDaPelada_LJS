import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { criarApp } from '../../src/entrada/app.ts';
import { BancoIndisponivel, criarClienteLazy } from '../../src/infraestrutura/db/cliente.ts';

let n = 0;
const nomeUnico = () => `teste-cliente-${Date.now()}-${n++}`;

/** Quantas sessões com esse application_name existem agora, vistas por uma conexão à parte. */
async function sessoes(applicationName: string): Promise<number> {
  const lazy = criarClienteLazy(() => env.HYPERDRIVE.connectionString);
  const obs = await lazy.conectar();
  try {
    const { rows } = await obs.query<{ n: string }>(
      'select count(*) as n from pg_stat_activity where application_name = $1',
      [applicationName],
    );
    return Number(rows[0]!.n);
  } finally {
    await lazy.fechar();
  }
}

describe('cliente pg por requisição', () => {
  it('FUN-16: requisição que não consulta o banco não abre conexão', async () => {
    const applicationName = nomeUnico();
    const cliente = criarClienteLazy(() => env.HYPERDRIVE.connectionString, { applicationName });
    expect(cliente.aberto()).toBe(false);
    expect(await sessoes(applicationName)).toBe(0);
    await cliente.fechar();
    expect(await sessoes(applicationName)).toBe(0);
  });

  it('FUN-16: abre na primeira consulta, reaproveita a conexão e fecha ao terminar', async () => {
    const applicationName = nomeUnico();
    const cliente = criarClienteLazy(() => env.HYPERDRIVE.connectionString, { applicationName });
    const a = await cliente.conectar();
    const b = await cliente.conectar();
    expect(a).toBe(b);
    expect(cliente.aberto()).toBe(true);
    expect(await sessoes(applicationName)).toBe(1);
    await cliente.fechar();
    expect(await sessoes(applicationName)).toBe(0);
    await cliente.fechar(); // seguro chamar duas vezes
  });

  it('FUN-16: erro de conexão vira BancoIndisponivel sem a URL na mensagem', async () => {
    const cliente = criarClienteLazy(() => 'postgres://usuario:segredo-da-url@127.0.0.1:1/banco');
    const erro = await cliente.conectar().catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(BancoIndisponivel);
    const texto =
      JSON.stringify(erro) + String((erro as Error).message) + String((erro as Error).stack);
    expect(texto).not.toContain('segredo-da-url');
    expect(texto).not.toContain('127.0.0.1');
    await cliente.fechar();
  });

  it('FUN-16: a API responde 503 sem vazar a URL quando o banco está inalcançável', async () => {
    const app = criarApp((a) => {
      a.get('/api/teste/banco', async () => {
        await criarClienteLazy(
          () => 'postgres://usuario:segredo-da-url@127.0.0.1:1/banco',
        ).conectar();
        return new Response('nunca');
      });
    });
    const r = await app.request('/api/teste/banco', {}, env);
    expect(r.status).toBe(503);
    const corpo = await r.text();
    expect(JSON.parse(corpo)).toEqual({ erro: 'banco_indisponivel' });
    expect(corpo).not.toContain('segredo-da-url');
  });
});
