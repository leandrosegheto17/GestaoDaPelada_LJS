import { describe, expect, it } from 'vitest';
import type { Env, LimiteDeTaxa, NomeLimite } from '../../src/entrada/ambiente.ts';
import { criarApp } from '../../src/entrada/app.ts';
import { CHAVE_SEM_IP, limiteTaxa, MENSAGEM_LIMITE } from '../../src/entrada/middlewares/limite-taxa.ts';

/** Binding falso: responde o que o teste mandar e guarda as chaves recebidas. */
function bindingFalso(permite: boolean): LimiteDeTaxa & { chaves: string[] } {
  const chaves: string[] = [];
  return {
    chaves,
    limit: async ({ key }) => {
      chaves.push(key);
      return { success: permite };
    },
  };
}

const sempre = bindingFalso(true);

function montar(binding: NomeLimite, falso: LimiteDeTaxa) {
  let chamadas = 0;
  const app = criarApp({
    registrarExtras: (api) =>
      api.post('/teste/limitada', limiteTaxa(binding), (c) => {
        chamadas += 1;
        return c.json({ ok: true });
      }),
  });
  const env = {
    VERSAO: 'v',
    URL_PUBLICA: '',
    HYPERDRIVE: { connectionString: '' },
    LIMITE_ENTRAR: sempre,
    LIMITE_PUBLICO: sempre,
    LIMITE_WEBHOOK: sempre,
    LIMITE_ESCRITA: sempre,
    [binding]: falso,
  } as unknown as Env;
  const pedir = (cabecalhos: Record<string, string> = {}) =>
    // X-Pelada: 1 desde a T18 (ACE-49): sem ele a escrita é recusada antes do limitador.
    app.request('/api/teste/limitada', { method: 'POST', headers: { 'x-pelada': '1', ...cabecalhos } }, env);
  return { pedir, chamadas: () => chamadas };
}

describe('limiteTaxa', () => {
  it('FUN-26: binding que nega gera 429 com Retry-After e corpo sem detalhe interno, sem chamar o handler', async () => {
    const nega = bindingFalso(false);
    const { pedir, chamadas } = montar('LIMITE_ENTRAR', nega);
    const r = await pedir({ 'cf-connecting-ip': '203.0.113.7' });
    expect(r.status).toBe(429);
    expect(r.headers.get('retry-after')).toBe('60');
    expect(await r.json()).toEqual({ erro: MENSAGEM_LIMITE });
    expect(chamadas()).toBe(0);
  });

  it('FUN-26: o 429 também leva os cabeçalhos da API', async () => {
    const { pedir } = montar('LIMITE_ENTRAR', bindingFalso(false));
    const r = await pedir();
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('FUN-26: binding que permite deixa a requisição passar', async () => {
    const { pedir, chamadas } = montar('LIMITE_ESCRITA', bindingFalso(true));
    const r = await pedir({ 'cf-connecting-ip': '203.0.113.7' });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(chamadas()).toBe(1);
  });

  it('FUN-26: a chave do limite é o IP de cf-connecting-ip', async () => {
    const falso = bindingFalso(true);
    const { pedir } = montar('LIMITE_PUBLICO', falso);
    await pedir({ 'cf-connecting-ip': '198.51.100.23', 'x-forwarded-for': '10.0.0.1' });
    expect(falso.chaves).toEqual(['198.51.100.23']);
  });

  it('FUN-26: sem cf-connecting-ip, a chave é o valor fixo', async () => {
    const falso = bindingFalso(true);
    const { pedir } = montar('LIMITE_WEBHOOK', falso);
    await pedir({ 'x-forwarded-for': '10.0.0.1' });
    await pedir({ 'cf-connecting-ip': '' });
    expect(falso.chaves).toEqual([CHAVE_SEM_IP, CHAVE_SEM_IP]);
  });

  it('FUN-26: o middleware usa o binding pedido, e não outro', async () => {
    const entrar = bindingFalso(false);
    const { pedir } = montar('LIMITE_ENTRAR', entrar);
    await pedir({ 'cf-connecting-ip': '203.0.113.9' });
    expect(entrar.chaves).toEqual(['203.0.113.9']);
    expect(sempre.chaves).not.toContain('203.0.113.9');
  });
});
