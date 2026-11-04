import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { criarApp } from '../../src/entrada/app.ts';

/** Binding que falha em qualquer uso: prova que a rota não toca o banco. */
const hyperdriveInalcancavel = new Proxy(
  {},
  {
    get() {
      throw new Error('o banco não pode ser tocado');
    },
  },
) as Hyperdrive;

describe('GET /api/health', () => {
  it('FUN-21: responde 200 com status ok e a versão da variável do ambiente', async () => {
    const r = await exports.default.fetch('http://pelada.test/api/health');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: 'ok', versao: env.VERSAO });
  });

  it('FUN-21: a versão vem da variável VERSAO do ambiente que a chama', async () => {
    const r = await criarApp().request('/api/health', {}, { ...env, VERSAO: 'abc1234' });
    expect(await r.json()).toEqual({ status: 'ok', versao: 'abc1234' });
  });

  it('FUN-21: funciona com o banco parado (HYPERDRIVE inalcançável)', async () => {
    const r = await criarApp().request(
      '/api/health',
      {},
      { ...env, HYPERDRIVE: hyperdriveInalcancavel },
    );
    expect(r.status).toBe(200);
    expect((await r.json()) as { status: string }).toMatchObject({ status: 'ok' });
  });
});

describe('assets do build', () => {
  it('FUN-20: GET / entrega o index.html do build', async () => {
    const r = await env.ASSETS.fetch('http://pelada.test/');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/html');
    expect(await r.text()).toBe(env.INDEX_HTML_ESPERADO);
  });

  it('FUN-20: uma rota qualquer fora de /api cai na SPA', async () => {
    const r = await env.ASSETS.fetch('http://pelada.test/rota-qualquer/de/tela');
    expect(r.status).toBe(200);
    expect(await r.text()).toBe(env.INDEX_HTML_ESPERADO);
  });

  it('FUN-20: /api/inexistente passa pelo Worker (404 em JSON), não pela SPA', async () => {
    const r = await exports.default.fetch('http://pelada.test/api/inexistente');
    expect(r.status).toBe(404);
    expect(r.headers.get('content-type')).toContain('application/json');
  });
});
