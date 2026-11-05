import { describe, expect, it } from 'vitest';
import {
  conferirSemCache,
  MENSAGEM_CACHE_LIGADO,
  MENSAGEM_JSON_INVALIDO,
  MENSAGEM_SEM_CACHING,
} from '../hyperdrive.ts';

/** Configuração no formato da API da Cloudflare (`wrangler hyperdrive get --json`). */
function config(caching?: unknown): string {
  const base: Record<string, unknown> = {
    id: '0123456789abcdef0123456789abcdef',
    name: 'gestaodapelada-v2-dev',
    origin: { host: 'ep-exemplo.neon.tech', port: 5432, database: 'pelada', user: 'pelada_app', scheme: 'postgres' },
  };
  if (caching !== undefined) base.caching = caching;
  return JSON.stringify(base);
}

describe('conferirSemCache', () => {
  it('FUN-18: caching.disabled true passa', () => {
    expect(conferirSemCache(config({ disabled: true }))).toEqual({ ok: true });
  });

  it('FUN-18: caching.disabled false reprova com mensagem clara', () => {
    const r = conferirSemCache(config({ disabled: false, max_age: 60, stale_while_revalidate: 15 }));
    expect(r).toEqual({ ok: false, mensagem: MENSAGEM_CACHE_LIGADO });
    expect(MENSAGEM_CACHE_LIGADO).toMatch(/cache do Hyperdrive está ligado/);
  });

  it('FUN-18: sem a chave caching reprova', () => {
    expect(conferirSemCache(config())).toEqual({ ok: false, mensagem: MENSAGEM_SEM_CACHING });
  });

  it('FUN-18: caching sem disabled reprova', () => {
    expect(conferirSemCache(config({ max_age: 60 }))).toEqual({ ok: false, mensagem: MENSAGEM_SEM_CACHING });
  });

  for (const [nome, valor] of [
    ['texto "true"', 'true'],
    ['número 1', 1],
    ['nulo', null],
  ] as const) {
    it(`FUN-18: disabled ${nome} (não booleano verdadeiro) reprova`, () => {
      expect(conferirSemCache(config({ disabled: valor }))).toEqual({ ok: false, mensagem: MENSAGEM_CACHE_LIGADO });
    });
  }

  for (const [nome, texto] of [
    ['texto qualquer', 'não é json'],
    ['vazio', ''],
    ['JSON cortado', '{"caching": {"disabled": tr'],
    ['lista', '[{"caching":{"disabled":true}}]'],
    ['nulo', 'null'],
    ['número', '42'],
    ['caching nulo', '{"caching": null}'],
  ] as const) {
    it(`FUN-18: JSON inválido (${nome}) reprova sem lançar erro`, () => {
      let r: ReturnType<typeof conferirSemCache> | undefined;
      expect(() => {
        r = conferirSemCache(texto);
      }).not.toThrow();
      expect(r?.ok).toBe(false);
    });
  }

  it('FUN-18: JSON que não é objeto reprova com a mensagem de JSON inválido', () => {
    expect(conferirSemCache('não é json')).toEqual({ ok: false, mensagem: MENSAGEM_JSON_INVALIDO });
    expect(conferirSemCache('[]')).toEqual({ ok: false, mensagem: MENSAGEM_JSON_INVALIDO });
  });
});
