import { env, exports } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';
import { criarApp } from '../../src/entrada/app.ts';

const app = criarApp((a) => {
  a.get('/api/teste/erro', () => {
    throw new Error('segredo-interno');
  });
  a.get('/api/teste/ok', (c) => c.json({ ok: true }));
});

describe('cabeçalhos de /api/*', () => {
  it.each([
    ['200 (rota de teste)', '/api/teste/ok', 200],
    ['200 (saúde)', '/api/health', 200],
    ['404 (inexistente)', '/api/inexistente', 404],
    ['500 (erro)', '/api/teste/erro', 500],
  ] as const)('FUN-22: %s tem no-store e nosniff', async (_nome, caminho, status) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = await app.request(caminho, {}, env);
    vi.restoreAllMocks();
    expect(r.status).toBe(status);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('FUN-22: o erro 500 não vaza a mensagem interna', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = await app.request('/api/teste/erro', {}, env);
    vi.restoreAllMocks();
    expect(await r.text()).not.toContain('segredo-interno');
  });

  it('FUN-22: a saúde pelo Worker real também tem os dois cabeçalhos', async () => {
    const r = await exports.default.fetch('http://pelada.test/api/health');
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});
