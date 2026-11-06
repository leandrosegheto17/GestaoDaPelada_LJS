import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../src/entrada/ambiente.ts';
import { criarApp } from '../../src/entrada/app.ts';
import { VERSAO_TESTE } from './constantes.ts';

const BASE = 'https://exemplo.test';

/** Binding que falha em qualquer acesso: prova que a rota não toca o banco. */
const bancoParado = new Proxy(
  {},
  {
    get() {
      throw new Error('o banco foi tocado');
    },
  },
);

const permite = { limit: async () => ({ success: true }) };

describe('GET /api/health', () => {
  it('FUN-21: responde 200 com status ok e a versão do ambiente', async () => {
    const r = await SELF.fetch(`${BASE}/api/health`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/application\/json/);
    expect(await r.json()).toEqual({ status: 'ok', versao: VERSAO_TESTE });
  });

  it('FUN-21: funciona com o banco parado (HYPERDRIVE inalcançável)', async () => {
    const env = {
      VERSAO: 'sha-abc',
      URL_PUBLICA: '',
      HYPERDRIVE: bancoParado,
      LIMITE_ENTRAR: permite,
      LIMITE_PUBLICO: permite,
      LIMITE_WEBHOOK: permite,
      LIMITE_ESCRITA: permite,
    } as unknown as Env;
    const r = await criarApp().request('/api/health', {}, env);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: 'ok', versao: 'sha-abc' });
  });
});

describe('assets da SPA', () => {
  it('FUN-20: GET / entrega o index.html do build', async () => {
    // O pool do Worker manda o SELF direto ao Worker; quem serve os assets na nuvem é o roteador de assets, que aqui
    // é o binding ASSETS (mesma pasta e mesma regra de SPA do wrangler.jsonc).
    const r = await env.ASSETS.fetch(`${BASE}/`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/text\/html/);
    expect(await r.text()).toContain('data-teste="spa-de-teste"');
  });

  it('FUN-20: GET /rota-qualquer cai na SPA', async () => {
    const r = await env.ASSETS.fetch(`${BASE}/rota-qualquer/funda`);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('data-teste="spa-de-teste"');
  });

  it('FUN-20: /api/* que não existe não cai na SPA: o Worker responde 404 em JSON', async () => {
    const r = await SELF.fetch(`${BASE}/api/nao-existe`);
    expect(r.status).toBe(404);
    expect(r.headers.get('content-type')).toMatch(/application\/json/);
    expect(await r.text()).not.toContain('spa-de-teste');
  });
});
