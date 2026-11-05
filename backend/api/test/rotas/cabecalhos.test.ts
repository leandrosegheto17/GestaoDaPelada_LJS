import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../src/entrada/ambiente.ts';
import { criarApp } from '../../src/entrada/app.ts';

const BASE = 'https://exemplo.test';

function esperaCabecalhos(r: Response): void {
  expect(r.headers.get('cache-control')).toBe('no-store');
  expect(r.headers.get('x-content-type-options')).toBe('nosniff');
}

const permite = { limit: async () => ({ success: true }) };
const env = {
  VERSAO: 'v',
  URL_PUBLICA: '',
  HYPERDRIVE: { connectionString: '' },
  LIMITE_ENTRAR: permite,
  LIMITE_PUBLICO: permite,
  LIMITE_WEBHOOK: permite,
  LIMITE_ESCRITA: permite,
} as unknown as Env;

describe('cabeçalhos de /api/*', () => {
  it('FUN-22: a rota de saúde (200) tem no-store e nosniff', async () => {
    const r = await SELF.fetch(`${BASE}/api/health`);
    expect(r.status).toBe(200);
    esperaCabecalhos(r);
  });

  it('FUN-22: o 404 de /api/* tem no-store e nosniff', async () => {
    const r = await SELF.fetch(`${BASE}/api/nao-existe`);
    expect(r.status).toBe(404);
    esperaCabecalhos(r);
  });

  it('FUN-22: o 500 de /api/* tem no-store e nosniff, sem detalhe interno no corpo', async () => {
    const app = criarApp({
      registrarExtras: (api) =>
        api.get('/teste/erro', () => {
          throw new Error('detalhe interno que não pode vazar');
        }),
    });
    const r = await app.request('/api/teste/erro', {}, env);
    expect(r.status).toBe(500);
    esperaCabecalhos(r);
    const corpo = await r.text();
    expect(corpo).not.toContain('detalhe interno');
  });

  it('FUN-22: resposta montada à mão pelo handler (new Response) também recebe os cabeçalhos', async () => {
    const app = criarApp({
      registrarExtras: (api) => api.get('/teste/cru', () => new Response('cru', { status: 200 })),
    });
    const r = await app.request('/api/teste/cru', {}, env);
    expect(r.status).toBe(200);
    esperaCabecalhos(r);
  });

  it('FUN-22: o handler não consegue trocar o Cache-Control da API', async () => {
    const app = criarApp({
      registrarExtras: (api) =>
        api.get('/teste/cache', (c) => c.json({ ok: true }, 200, { 'Cache-Control': 'public, max-age=600' })),
    });
    const r = await app.request('/api/teste/cache', {}, env);
    esperaCabecalhos(r);
  });
});
