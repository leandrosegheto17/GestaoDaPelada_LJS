import { describe, expect, it } from 'vitest';
import type { Env } from '../../src/entrada/ambiente.ts';
import { criarApp } from '../../src/entrada/app.ts';

/**
 * Segurança padrão de app web (fundacao /validar, A-12; CLAUDE.md "Segurança padrão de app web"): 421 para Host
 * inesperado, 403 para escrita de outra origem (Sec-Fetch-Site e Origin, sem diferenciar maiúsculas), CSP e
 * Referrer-Policy em toda resposta de /api. Um teste por método e por variante: cada um falha se a guarda sair.
 */
const permite = { limit: async () => ({ success: true }) };
const base = {
  VERSAO: 'v',
  HYPERDRIVE: { connectionString: '' },
  LIMITE_ENTRAR: permite,
  LIMITE_PUBLICO: permite,
  LIMITE_WEBHOOK: permite,
  LIMITE_ESCRITA: permite,
};
const envProd = { ...base, URL_PUBLICA: 'https://gestaodapelada.exemplo.test' } as unknown as Env;
const envLocal = { ...base, URL_PUBLICA: '', EMAIL_DEV: '1' } as unknown as Env;
const envSemHost = { ...base, URL_PUBLICA: '' } as unknown as Env;

function app() {
  return criarApp({
    registrarExtras: (api) => {
      api.all('/teste/escrita', (c) => c.json({ ok: true }));
    },
  });
}
const PROD = 'https://gestaodapelada.exemplo.test';
const ESCRITAS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;
const pelada = { 'X-Pelada': '1' };
const CSP = "default-src 'none'; frame-ancestors 'none'";

describe('A-12: Host da requisição (421)', () => {
  it('FUN-22: com EMAIL_DEV=1, loopback e o host da URL_PUBLICA passam', async () => {
    const env = { ...base, URL_PUBLICA: 'http://127.0.0.1:8788', EMAIL_DEV: '1' } as unknown as Env;
    for (const host of ['http://127.0.0.1:8787', 'http://localhost:8787', 'http://[::1]:8787']) {
      const r = await app().request(`${host}/api/health`, {}, env);
      expect(r.status, host).toBe(200);
    }
    const proprio = {
      ...base,
      URL_PUBLICA: 'https://local.exemplo.test',
      EMAIL_DEV: '1',
    } as unknown as Env;
    const r = await app().request('https://LOCAL.exemplo.test/api/health', {}, proprio);
    expect(r.status).toBe(200);
  });

  it('FUN-22: com EMAIL_DEV=1, outro host (DNS rebinding) responde 421, inclusive em /api/dev/emails', async () => {
    for (const url of [
      'http://rebind.example:8787/api/health',
      'http://rebind.example:8787/api/dev/emails',
      'http://127.0.0.1.rebind.example/api/health',
      'http://localhost.rebind.example/api/health',
    ]) {
      const r = await app().request(url, {}, envLocal);
      expect(r.status, url).toBe(421);
    }
  });

  it('FUN-22: com EMAIL_DEV=1, vale o cabeçalho Host, não o host da URL (wrangler dev usa o da rota)', async () => {
    const ok = await app().request(
      'https://gestaodapelada.ljssoftware.exemplo/api/health',
      { headers: { Host: '127.0.0.1:8851' } },
      envLocal,
    );
    expect(ok.status).toBe(200);
    const ruim = await app().request(
      'http://127.0.0.1:8787/api/health',
      { headers: { Host: 'rebind.example' } },
      envLocal,
    );
    expect(ruim.status).toBe(421);
  });

  it('FUN-22: com EMAIL_DEV diferente de 1 nada é restrito: workers.dev, domínio próprio e URL_PUBLICA passam', async () => {
    for (const host of [
      'https://gestaodapelada-v2.prod-ljs.workers.dev',
      'https://dominio-proprio.exemplo.test',
      PROD,
    ]) {
      const r = await app().request(`${host}/api/health`, {}, envProd);
      expect(r.status, host).toBe(200);
    }
    const r = await app().request('https://qualquer.example/api/health', {}, envSemHost);
    expect(r.status).toBe(200);
  });

  it('FUN-22: a recusa por host também tem os cabeçalhos de segurança', async () => {
    const r = await app().request('http://rebind.example/api/health', {}, envLocal);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

describe('A-12: origem das escritas (403)', () => {
  for (const metodo of ESCRITAS) {
    it(`FUN-22: ${metodo} com Origin de outro site responde 403`, async () => {
      const r = await app().request(
        `${PROD}/api/teste/escrita`,
        { method: metodo, headers: { ...pelada, Origin: 'https://atacante.example' } },
        envProd,
      );
      expect(r.status).toBe(403);
    });

    it(`FUN-22: ${metodo} com Sec-Fetch-Site cross-site, same-site ou desconhecido responde 403`, async () => {
      for (const valor of ['cross-site', 'same-site', 'CROSS-SITE', 'desconhecido']) {
        const r = await app().request(
          `${PROD}/api/teste/escrita`,
          { method: metodo, headers: { ...pelada, 'Sec-Fetch-Site': valor } },
          envProd,
        );
        expect(r.status, `${metodo} ${valor}`).toBe(403);
      }
    });

    it(`FUN-22: ${metodo} do próprio site passa (Origin igual, Sec-Fetch-Site same-origin ou none, ou sem os dois)`, async () => {
      for (const cabecalhos of [
        { Origin: PROD },
        { Origin: 'HTTPS://GESTAODAPELADA.EXEMPLO.TEST' },
        { 'Sec-Fetch-Site': 'same-origin' },
        { 'Sec-Fetch-Site': 'SAME-ORIGIN' },
        { 'Sec-Fetch-Site': 'none' },
        {},
      ]) {
        const r = await app().request(
          `${PROD}/api/teste/escrita`,
          { method: metodo, headers: { ...pelada, ...cabecalhos } },
          envProd,
        );
        expect(r.status, `${metodo} ${JSON.stringify(cabecalhos)}`).toBe(200);
      }
    });
  }

  it('FUN-22: a origem é comparada com o cabeçalho Host (wrangler dev), com porta', async () => {
    const url = 'https://rota-do-wrangler.exemplo.test/api/teste/escrita';
    const ok = await app().request(
      url,
      {
        method: 'POST',
        headers: { ...pelada, Host: '127.0.0.1:8851', Origin: 'http://127.0.0.1:8851' },
      },
      envSemHost,
    );
    expect(ok.status).toBe(200);
    const outraPorta = await app().request(
      url,
      {
        method: 'POST',
        headers: { ...pelada, Host: '127.0.0.1:8851', Origin: 'http://127.0.0.1:9999' },
      },
      envSemHost,
    );
    expect(outraPorta.status).toBe(403);
  });

  it('FUN-22: Origin null (documento sem origem) em escrita responde 403', async () => {
    const r = await app().request(
      `${PROD}/api/teste/escrita`,
      { method: 'POST', headers: { ...pelada, Origin: 'null' } },
      envProd,
    );
    expect(r.status).toBe(403);
  });

  it('FUN-22: GET e HEAD de outra origem não são recusados (só a escrita muda estado)', async () => {
    for (const metodo of ['GET', 'HEAD']) {
      const r = await app().request(
        `${PROD}/api/health`,
        {
          method: metodo,
          headers: { Origin: 'https://atacante.example', 'Sec-Fetch-Site': 'cross-site' },
        },
        envProd,
      );
      expect(r.status, metodo).toBe(200);
    }
  });

  it('FUN-22: a recusa por origem também tem os cabeçalhos de segurança', async () => {
    const r = await app().request(
      `${PROD}/api/teste/escrita`,
      { method: 'POST', headers: { ...pelada, 'Sec-Fetch-Site': 'cross-site' } },
      envProd,
    );
    expect(r.headers.get('content-security-policy')).toBe(CSP);
  });
});

describe('A-12: CSP e Referrer-Policy em /api', () => {
  it('FUN-22: 200, 404 e 500 de /api têm CSP restritiva e Referrer-Policy same-origin', async () => {
    const a = criarApp({
      registrarExtras: (api) =>
        api.get('/teste/erro', () => {
          throw new Error('x');
        }),
    });
    for (const caminho of ['/api/health', '/api/nao-existe', '/api/teste/erro']) {
      const r = await a.request(`${PROD}${caminho}`, {}, envProd);
      expect(r.headers.get('content-security-policy'), caminho).toBe(CSP);
      expect(r.headers.get('referrer-policy'), caminho).toBe('same-origin');
    }
  });

  it('FUN-22: o handler não consegue trocar a CSP nem a Referrer-Policy', async () => {
    const a = criarApp({
      registrarExtras: (api) =>
        api.get('/teste/troca', (c) =>
          c.json({}, 200, {
            'Content-Security-Policy': 'default-src *',
            'Referrer-Policy': 'no-referrer',
          }),
        ),
    });
    const r = await a.request(`${PROD}/api/teste/troca`, {}, envProd);
    expect(r.headers.get('content-security-policy')).toBe(CSP);
    expect(r.headers.get('referrer-policy')).toBe('same-origin');
  });
});
