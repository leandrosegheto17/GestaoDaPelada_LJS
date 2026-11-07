import { describe, expect, it } from 'vitest';
import type { Env } from '../../src/entrada/ambiente.ts';
import { criarApp } from '../../src/entrada/app.ts';

/**
 * Segurança padrão de app web (fundacao /validar, A-12, AD-131; CLAUDE.md "Segurança padrão de app web"): 403 para
 * escrita de outra origem (Sec-Fetch-Site e Origin, sem diferenciar maiúsculas), CSP e Referrer-Policy em toda
 * resposta de /api. O 421 por Host não existe no Worker (o wrangler dev troca o Host pelo da rota). Um teste por método
 * e por variante: cada um falha se a guarda sair.
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
const envLocal = {
  ...base,
  URL_PUBLICA: 'http://127.0.0.1:8851',
  EMAIL_DEV: '1',
} as unknown as Env;
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

describe('A-12: origem das escritas (403)', () => {
  for (const metodo of ESCRITAS) {
    it(`AD-131: ${metodo} com Origin de outro site responde 403`, async () => {
      const r = await app().request(
        `${PROD}/api/teste/escrita`,
        { method: metodo, headers: { ...pelada, Origin: 'https://atacante.example' } },
        envProd,
      );
      expect(r.status).toBe(403);
    });

    it(`AD-131: ${metodo} com Sec-Fetch-Site cross-site, same-site ou desconhecido responde 403`, async () => {
      for (const valor of ['cross-site', 'same-site', 'CROSS-SITE', 'desconhecido']) {
        const r = await app().request(
          `${PROD}/api/teste/escrita`,
          { method: metodo, headers: { ...pelada, 'Sec-Fetch-Site': valor } },
          envProd,
        );
        expect(r.status, `${metodo} ${valor}`).toBe(403);
      }
    });

    it(`AD-131: ${metodo} do próprio site passa (Origin igual, Sec-Fetch-Site same-origin ou none, ou sem os dois)`, async () => {
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

  it('AD-131: a origem é comparada com o cabeçalho Host (wrangler dev), com porta', async () => {
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

  it('AD-131: Origin do host da URL_PUBLICA passa mesmo com o Host trocado; outro site segue recusado', async () => {
    const url = 'https://rota-do-wrangler.exemplo.test/api/teste/escrita';
    const ok = await app().request(
      url,
      { method: 'POST', headers: { ...pelada, Origin: 'http://127.0.0.1:8851' } },
      envLocal,
    );
    expect(ok.status).toBe(200);
    const ruim = await app().request(
      url,
      { method: 'POST', headers: { ...pelada, Origin: 'http://127.0.0.1:9999' } },
      { ...envLocal, EMAIL_DEV: '0' } as unknown as Env,
    );
    expect(ruim.status).toBe(403);
  });

  it('AD-131: com EMAIL_DEV=1 qualquer loopback é origem própria (vite do pnpm dev); sem ele, não', async () => {
    const url = 'https://rota-do-wrangler.exemplo.test/api/teste/escrita';
    const vite = { ...pelada, Origin: 'http://localhost:5751' };
    const dev = await app().request(url, { method: 'POST', headers: vite }, envLocal);
    expect(dev.status).toBe(200);
    const semDev = await app().request(url, { method: 'POST', headers: vite }, envSemHost);
    expect(semDev.status).toBe(403);
    const atacante = { ...pelada, Origin: 'http://rebind.example:5751' };
    const ruim = await app().request(url, { method: 'POST', headers: atacante }, envLocal);
    expect(ruim.status).toBe(403);
  });

  it('AD-131: Origin do host da URL_PUBLICA (não loopback, sem EMAIL_DEV) passa com o Host trocado', async () => {
    const url = 'https://rota-do-wrangler.exemplo.test/api/teste/escrita';
    const r = await app().request(
      url,
      { method: 'POST', headers: { ...pelada, Origin: PROD } },
      envProd,
    );
    expect(r.status).toBe(200);
    const outro = await app().request(
      url,
      { method: 'POST', headers: { ...pelada, Origin: 'https://atacante.example' } },
      envProd,
    );
    expect(outro.status).toBe(403);
  });

  it('AD-131: Origin que não é uma URL analisável responde 403, não 500', async () => {
    for (const origem of ['http://[', 'http://', '::::', '']) {
      const r = await app().request(
        `${PROD}/api/teste/escrita`,
        { method: 'POST', headers: { ...pelada, Origin: origem } },
        envProd,
      );
      expect(r.status, JSON.stringify(origem)).toBe(403);
    }
  });

  it('AD-131: Origin null (documento sem origem) em escrita responde 403', async () => {
    const r = await app().request(
      `${PROD}/api/teste/escrita`,
      { method: 'POST', headers: { ...pelada, Origin: 'null' } },
      envProd,
    );
    expect(r.status).toBe(403);
  });

  it('AD-131: GET e HEAD de outra origem não são recusados (só a escrita muda estado)', async () => {
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

  it('AD-131: a recusa por origem também tem os cabeçalhos de segurança', async () => {
    const r = await app().request(
      `${PROD}/api/teste/escrita`,
      { method: 'POST', headers: { ...pelada, 'Sec-Fetch-Site': 'cross-site' } },
      envProd,
    );
    expect(r.headers.get('content-security-policy')).toBe(CSP);
  });
});

describe('A-12: CSP e Referrer-Policy em /api', () => {
  it('AD-131: 200, 404 e 500 de /api têm CSP restritiva e Referrer-Policy same-origin', async () => {
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

  it('AD-131: o handler não consegue trocar a CSP nem a Referrer-Policy', async () => {
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
