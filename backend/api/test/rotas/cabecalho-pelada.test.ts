import { describe, expect, it } from 'vitest';
import type { Env, LimiteDeTaxa } from '../../src/entrada/ambiente.ts';
import { criarApp } from '../../src/entrada/app.ts';
import { limiteTaxa } from '../../src/entrada/middlewares/limite-taxa.ts';

/**
 * Cabeçalho `X-Pelada` antes dos limitadores (T18; ACE-49). A escrita sem o cabeçalho é
 * recusada com 403 antes de qualquer limitador; leitura passa sem ele.
 */

/** Binding falso com cota de `limite` chamadas (o "10 por minuto" do wrangler.jsonc), contando as chamadas. */
function bindingComCota(limite: number): LimiteDeTaxa & { chamadas(): number } {
  let usadas = 0;
  return {
    chamadas: () => usadas,
    limit: async () => {
      usadas += 1;
      return { success: usadas <= limite };
    },
  };
}

const permite: LimiteDeTaxa = { limit: async () => ({ success: true }) };

function montar(escrita: LimiteDeTaxa = permite) {
  let handler = 0;
  const app = criarApp({
    registrarExtras: (api) => {
      api.on(
        ['POST', 'PUT', 'PATCH', 'DELETE'],
        '/teste/escrita',
        limiteTaxa('LIMITE_ESCRITA'),
        (c) => {
          handler += 1;
          return c.json({ ok: true });
        },
      );
      api.get('/teste/leitura', limiteTaxa('LIMITE_ESCRITA'), (c) => c.json({ ok: true }));
    },
  });
  const env = {
    VERSAO: 'v',
    URL_PUBLICA: '',
    HYPERDRIVE: { connectionString: '' },
    LIMITE_ENTRAR: permite,
    LIMITE_PUBLICO: permite,
    LIMITE_WEBHOOK: permite,
    LIMITE_ESCRITA: escrita,
  } as unknown as Env;
  const pedir = (caminho: string, init: RequestInit = {}) =>
    app.request(`/api${caminho}`, init, env);
  return { pedir, handler: () => handler };
}

describe('exigirCabecalhoPelada', () => {
  it('ACE-49: 11 POST sem X-Pelada recebem 403 sem gastar a cota, e o 12.º, com o cabeçalho, não recebe 429', async () => {
    const cota = bindingComCota(10);
    const { pedir, handler } = montar(cota);
    for (let i = 0; i < 11; i += 1) {
      const r = await pedir('/teste/escrita', {
        method: 'POST',
        headers: { 'cf-connecting-ip': '203.0.113.7' },
      });
      expect(r.status).toBe(403);
      expect(await r.json()).toMatchObject({ codigo: 'origem_recusada' });
    }
    expect(cota.chamadas()).toBe(0);
    expect(handler()).toBe(0);

    const ultima = await pedir('/teste/escrita', {
      method: 'POST',
      headers: { 'cf-connecting-ip': '203.0.113.7', 'X-Pelada': '1' },
    });
    expect(ultima.status).not.toBe(429);
    expect(ultima.status).toBe(200);
    expect(handler()).toBe(1);
  });

  it.each(['PUT', 'PATCH', 'DELETE'])(
    'ACE-49: %s sem X-Pelada recebe 403 e não chama o handler',
    async (metodo) => {
      const { pedir, handler } = montar();
      const r = await pedir('/teste/escrita', { method: metodo });
      expect(r.status).toBe(403);
      expect(handler()).toBe(0);
    },
  );

  it.each(['PUT', 'PATCH', 'DELETE'])('ACE-49: %s com X-Pelada: 1 passa', async (metodo) => {
    const { pedir } = montar();
    const r = await pedir('/teste/escrita', { method: metodo, headers: { 'X-Pelada': '1' } });
    expect(r.status).toBe(200);
  });

  it.each(['', '0', 'true', '+1', '11'])(
    'ACE-49: POST com X-Pelada "%s" (valor diferente de 1) recebe 403',
    async (valor) => {
      const { pedir, handler } = montar();
      const r = await pedir('/teste/escrita', { method: 'POST', headers: { 'X-Pelada': valor } });
      expect(r.status).toBe(403);
      expect(handler()).toBe(0);
    },
  );

  it('ACE-49: o nome do cabeçalho não diferencia maiúsculas', async () => {
    const { pedir } = montar();
    const r = await pedir('/teste/escrita', { method: 'POST', headers: { 'x-pelada': '1' } });
    expect(r.status).toBe(200);
  });

  it('ACE-49: GET sem o cabeçalho passa', async () => {
    const { pedir } = montar();
    const r = await pedir('/teste/leitura');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });

  it('ACE-49: HEAD sem o cabeçalho passa', async () => {
    const { pedir } = montar();
    const r = await pedir('/teste/leitura', { method: 'HEAD' });
    expect(r.status).toBe(200);
  });

  it('ACE-49: a recusa vale também para rota que não existe, e leva os cabeçalhos da API', async () => {
    const { pedir } = montar();
    const r = await pedir('/nao-existe', { method: 'POST' });
    expect(r.status).toBe(403);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
