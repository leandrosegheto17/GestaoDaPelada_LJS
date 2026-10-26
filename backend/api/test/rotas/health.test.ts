import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { chamar } from '../apoio/cliente.ts';

describe('GET /api/health (FUN-20)', () => {
  it('responde 200 com status ok e a versão do deploy', async () => {
    const r = await chamar('/api/health', {}, { env: { ...env, VERSAO: 'abc123def' } });
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toMatch(/^application\/json/);
    expect(r.corpo).toEqual({ status: 'ok', versao: 'abc123def' });
  });

  it('usa a VERSAO do wrangler.jsonc quando o deploy não injeta outra', async () => {
    const r = await chamar('/api/health');
    expect(r.corpo).toEqual({ status: 'ok', versao: env.VERSAO });
  });

  it('não toca o banco: o binding HYPERDRIVE nem é lido', async () => {
    let acessos = 0;
    const espiao = new Proxy(env, {
      get(alvo, prop, receptor) {
        if (prop === 'HYPERDRIVE') acessos++;
        return Reflect.get(alvo, prop, receptor);
      },
    });
    const r = await chamar('/api/health', {}, { env: espiao });
    expect(r.status).toBe(200);
    expect(acessos).toBe(0);
  });

  it('HEAD também responde 200', async () => {
    expect((await chamar('/api/health', { method: 'HEAD' })).status).toBe(200);
  });

  it('nunca recebe 429, mesmo com os limitadores esgotados', async () => {
    const esgotado = { limit: async () => ({ success: false }) };
    const r = await chamar('/api/health', {}, { app: { limitadores: { entrar: esgotado, publico: esgotado } } });
    expect(r.status).toBe(200);
  });
});
