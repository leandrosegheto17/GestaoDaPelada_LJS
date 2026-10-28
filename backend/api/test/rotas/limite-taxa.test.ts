import { env } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import { criarApp } from '../../src/entrada/app.ts';
import type { Limitador } from '../../src/entrada/middlewares/limite-taxa.ts';
import { chamar, ehErroPadrao } from '../apoio/cliente.ts';

/** Faixa de documentação (RFC 5737). */
const IP_A = '203.0.113.1';
const IP_B = '203.0.113.2';

/** Limitador falso com contador por chave, como o binding de verdade (janela única, sem tempo). */
function limitadorDe(limite: number): Limitador & { chaves: string[] } {
  const contagem = new Map<string, number>();
  const chaves: string[] = [];
  return {
    chaves,
    limit: async ({ key }) => {
      chaves.push(key);
      const n = (contagem.get(key) ?? 0) + 1;
      contagem.set(key, n);
      return { success: n <= limite };
    },
  };
}

const ip = (valor: string) => ({ headers: { 'CF-Connecting-IP': valor } });

describe('limite de taxa por IP (FUN-26)', () => {
  it('login: a 11ª tentativa do mesmo IP dá 429 no formato padrão', async () => {
    const entrar = limitadorDe(10);
    const opcoes = { app: { limitadores: { entrar } } };
    const post = { method: 'POST', headers: { 'X-Pelada': '1', 'CF-Connecting-IP': IP_A } };
    for (let i = 0; i < 10; i++) expect((await chamar('/api/sessao/entrar', post, opcoes)).status).not.toBe(429);
    const r = await chamar('/api/sessao/entrar', post, opcoes);
    expect(r.status).toBe(429);
    expect(ehErroPadrao(r.corpo)).toBe(true);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'muitas_requisicoes' } });
    expect(r.headers.get('Cache-Control')).toBe('no-store');
  });

  it('público: o limite é por IP; outro IP não recebe 429 depois que o primeiro estourou', async () => {
    const publico = limitadorDe(1);
    const opcoes = { app: { limitadores: { publico } } };
    expect((await chamar('/api/publico/x/ranking', ip(IP_A), opcoes)).status).not.toBe(429);
    expect((await chamar('/api/publico/x/ranking', ip(IP_A), opcoes)).status).toBe(429);
    expect((await chamar('/api/publico/x/ranking', ip(IP_B), opcoes)).status).not.toBe(429);
    expect(publico.chaves).toEqual([IP_A, IP_A, IP_B]);
  });

  it('IPv6: dois endereços do mesmo /64 compartilham a chave do limitador (ACE-71)', async () => {
    const publico = limitadorDe(1);
    const opcoes = { app: { limitadores: { publico } } };
    expect((await chamar('/api/publico/x/ranking', ip('2001:db8:1:2::1'), opcoes)).status).not.toBe(429);
    expect((await chamar('/api/publico/x/ranking', ip('2001:DB8:1:2:ffff::9'), opcoes)).status).toBe(429);
    expect((await chamar('/api/publico/x/ranking', ip('2001:db8:1:3::1'), opcoes)).status).not.toBe(429);
    expect(publico.chaves[0]).toBe(publico.chaves[1]);
    expect(publico.chaves[2]).not.toBe(publico.chaves[0]);
  });

  it('rotas fora de /api/sessao/entrar e /api/publico/* não passam pelos limitadores', async () => {
    const entrar = limitadorDe(0);
    const publico = limitadorDe(0);
    const r = await chamar('/api/outra/coisa', {}, { app: { limitadores: { entrar, publico } } });
    expect(r.status).toBe(404);
    expect(entrar.chaves).toEqual([]);
    expect(publico.chaves).toEqual([]);
  });

  it('429 não abre conexão com o banco', async () => {
    let acessos = 0;
    const espiao = new Proxy(env, {
      get(alvo, prop, receptor) {
        if (prop === 'HYPERDRIVE') acessos++;
        return Reflect.get(alvo, prop, receptor);
      },
    });
    const r = await chamar('/api/publico/x', {}, { env: espiao, app: { limitadores: { publico: limitadorDe(0) } } });
    expect(r.status).toBe(429);
    expect(acessos).toBe(0);
  });

  it('o IP só é chave: sem cabeçalho usa chave fixa, e nunca aparece na resposta nem no log', async () => {
    const espiao = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const semIp = limitadorDe(0);
    const r1 = await chamar('/api/publico/x', {}, { app: { limitadores: { publico: semIp } } });
    const comIp = limitadorDe(0);
    const r2 = await chamar('/api/publico/x', ip(IP_A), { app: { limitadores: { publico: comIp } } });
    const log = JSON.stringify(espiao.mock.calls);
    espiao.mockRestore();
    expect(r1.status).toBe(429);
    expect(semIp.chaves).toEqual(['sem-ip']);
    expect(r2.texto).not.toContain(IP_A);
    expect(log).not.toContain(IP_A);
    expect(log).not.toContain('sem-ip');
  });

  it('falha do próprio limitador deixa passar e registra só "limitador indisponível"', async () => {
    const espiao = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const quebrado: Limitador = {
      limit: async () => {
        throw new Error('segredo-interno');
      },
    };
    const r = await chamar('/api/publico/x', {}, { app: { limitadores: { publico: quebrado } } });
    const log = JSON.stringify(espiao.mock.calls);
    espiao.mockRestore();
    expect(r.status).toBe(404);
    expect(log).toContain('limitador indisponível');
    expect(log).not.toContain('segredo-interno');
  });

  it('sem limitador injetado, usa os bindings LIMITE_ENTRAR e LIMITE_PUBLICO do ambiente', async () => {
    const entrar = limitadorDe(0);
    const publico = limitadorDe(0);
    const envFalso = { ...env, LIMITE_ENTRAR: entrar, LIMITE_PUBLICO: publico };
    const app = criarApp();
    const r1 = await app.request('/api/sessao/entrar', { method: 'POST', headers: { 'X-Pelada': '1' } }, envFalso);
    const r2 = await app.request('/api/publico/x', {}, envFalso);
    expect([r1.status, r2.status]).toEqual([429, 429]);
    expect(entrar.chaves).toHaveLength(1);
    expect(publico.chaves).toHaveLength(1);
  });

  describe('binding ausente', () => {
    async function chamarSemBinding(urlPublica: string, vezes: number): Promise<void> {
      const app = criarApp();
      const semBindings = { ...env, LIMITE_ENTRAR: undefined, LIMITE_PUBLICO: undefined, URL_PUBLICA: urlPublica };
      for (let i = 0; i < vezes; i++) {
        await app.request(
          '/api/sessao/entrar',
          { method: 'POST', headers: { 'CF-Connecting-IP': '203.0.113.9', 'X-Pelada': '1' } },
          semBindings,
        );
      }
    }

    it('implantado (https): registra "limitador ausente" uma vez, sem IP', async () => {
      const espiao = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await chamarSemBinding('https://app.exemplo.dev', 3);
      const chamadas = espiao.mock.calls;
      espiao.mockRestore();
      expect(chamadas).toEqual([['limitador ausente']]);
    });

    it('local (http://localhost): não limita e não registra nada', async () => {
      const espiao = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await chamarSemBinding('http://localhost:8787', 2);
      const chamadas = espiao.mock.calls;
      espiao.mockRestore();
      expect(chamadas).toEqual([]);
    });
  });
});
