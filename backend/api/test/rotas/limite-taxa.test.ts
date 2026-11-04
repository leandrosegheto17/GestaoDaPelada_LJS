import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { criarApp } from '../../src/entrada/app.ts';
import { limiteTaxa } from '../../src/entrada/middlewares/limite-taxa.ts';

/** Binding falso: guarda as chaves recebidas e responde o que o teste mandou. */
function bindingFalso(permite: boolean) {
  const chaves: string[] = [];
  const binding: RateLimit = {
    limit: async ({ key }) => {
      chaves.push(key);
      return { success: permite };
    },
  };
  return { binding, chaves };
}

function appCom(binding: RateLimit) {
  return criarApp((a) => {
    a.get(
      '/api/teste/limitada',
      limiteTaxa(() => binding),
      (c) => c.json({ ok: true }),
    );
  });
}

describe('limiteTaxa', () => {
  it('FUN-26: binding que nega gera 429 com Retry-After e corpo sem detalhe interno', async () => {
    const { binding } = bindingFalso(false);
    const r = await appCom(binding).request('/api/teste/limitada', {}, env);
    expect(r.status).toBe(429);
    expect(Number(r.headers.get('Retry-After'))).toBeGreaterThan(0);
    const corpo = await r.text();
    expect(JSON.parse(corpo)).toEqual({ erro: 'muitas_requisicoes' });
    expect(corpo).not.toMatch(/binding|LIMITE|namespace/i);
  });

  it('FUN-26: o 429 também leva no-store e nosniff', async () => {
    const { binding } = bindingFalso(false);
    const r = await appCom(binding).request('/api/teste/limitada', {}, env);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('FUN-26: binding que permite deixa a requisição passar até a rota', async () => {
    const { binding } = bindingFalso(true);
    const r = await appCom(binding).request('/api/teste/limitada', {}, env);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });

  it('FUN-26: a chave do limite é o IP do cabeçalho cf-connecting-ip', async () => {
    const { binding, chaves } = bindingFalso(true);
    await appCom(binding).request(
      '/api/teste/limitada',
      { headers: { 'cf-connecting-ip': '203.0.113.7' } },
      env,
    );
    expect(chaves).toEqual(['203.0.113.7']);
  });

  it('FUN-26: sem cf-connecting-ip, usa um valor fixo; um X-Forwarded-For do cliente não vira chave', async () => {
    const { binding, chaves } = bindingFalso(true);
    const app = appCom(binding);
    await app.request('/api/teste/limitada', {}, env);
    await app.request(
      '/api/teste/limitada',
      { headers: { 'x-forwarded-for': '198.51.100.9' } },
      env,
    );
    expect(chaves).toEqual(['sem-ip', 'sem-ip']);
  });

  it('FUN-26: o binding é escolhido a partir do ambiente da requisição', async () => {
    const { binding, chaves } = bindingFalso(true);
    const app = criarApp((a) => {
      a.get(
        '/api/teste/limitada',
        limiteTaxa((e) => e.LIMITE_ENTRAR),
        (c) => c.json({ ok: true }),
      );
    });
    const r = await app.request('/api/teste/limitada', {}, { ...env, LIMITE_ENTRAR: binding });
    expect(r.status).toBe(200);
    expect(chaves).toHaveLength(1);
  });
});
