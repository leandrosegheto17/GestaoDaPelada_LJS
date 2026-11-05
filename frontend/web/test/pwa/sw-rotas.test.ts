// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CABECALHO_DO_CACHE,
  CACHE_RANKING_PUBLICO,
  ehRankingPublico,
  marcarRespostaDoCache,
  MAX_RANKINGS_GUARDADOS,
} from '../../src/pwa/servico.ts';

/**
 * Rotas do service worker (partidas-e-ranking T71; PAR-153; G-17): a regra `ehRankingPublico` e o que o `sw.ts`
 * registra de fato. O Workbox é trocado por dublês que guardam o que foi registrado; o `self` do SW é um alvo falso.
 */

const ORIGEM = 'https://gestaodapelada-v2.exemplo.workers.dev';
const url = (caminho: string, origem = ORIGEM) => new URL(caminho, origem);

const registro = vi.hoisted(() => ({
  rotas: [] as Array<{ casar: unknown; tratador: unknown; metodo: unknown }>,
  estrategias: [] as Array<{ tipo: string; opcoes: Record<string, unknown> }>,
  plugins: [] as Array<{ tipo: string; opcoes: unknown }>,
}));

vi.mock('workbox-precaching', () => ({
  cleanupOutdatedCaches: vi.fn(),
  precacheAndRoute: vi.fn(),
  matchPrecache: vi.fn(),
}));

vi.mock('workbox-routing', () => ({
  NavigationRoute: class {
    readonly tipo = 'navegacao';
    constructor(
      readonly tratador: unknown,
      readonly opcoes: unknown,
    ) {}
  },
  registerRoute: vi.fn((casar: unknown, tratador?: unknown, metodo?: unknown) => {
    registro.rotas.push({ casar, tratador, metodo });
  }),
}));

vi.mock('workbox-strategies', () => ({
  NetworkFirst: class {
    constructor(readonly opcoes: Record<string, unknown>) {
      registro.estrategias.push({ tipo: 'NetworkFirst', opcoes });
    }
  },
}));

vi.mock('workbox-cacheable-response', () => ({
  CacheableResponsePlugin: class {
    constructor(readonly opcoes: unknown) {
      registro.plugins.push({ tipo: 'CacheableResponsePlugin', opcoes });
    }
  },
}));

vi.mock('workbox-expiration', () => ({
  ExpirationPlugin: class {
    constructor(readonly opcoes: unknown) {
      registro.plugins.push({ tipo: 'ExpirationPlugin', opcoes });
    }
  },
}));

describe('ehRankingPublico', () => {
  it('PAR-153: só a rota do ranking público casa', () => {
    expect(ehRankingPublico(url('/api/publico/pelada-de-quinta/ranking'), ORIGEM)).toBe(true);
    expect(ehRankingPublico(url('/api/publico/pelada-de-quinta/ranking?mes=2026-10'), ORIGEM)).toBe(true);
  });

  it('PAR-153: /pdf, /eventos, /api/grupos/..., /api/sessao e outra origem não casam', () => {
    for (const caminho of [
      '/api/publico/pelada-de-quinta/pdf',
      '/api/publico/pelada-de-quinta/pdf?mes=2026-10',
      '/api/publico/pelada-de-quinta/eventos',
      '/api/grupos/g-quinta',
      '/api/grupos/g-quinta/partidas?mes=2026-10',
      '/api/sessao',
      '/api/publico/pelada-de-quinta/ranking/extra',
      '/api/publico/Pelada-De-Quinta/ranking',
      '/api/publico//ranking',
      `/api/publico/${'a'.repeat(65)}/ranking`,
      '/g/pelada-de-quinta',
    ]) {
      expect({ caminho, casa: ehRankingPublico(url(caminho), ORIGEM) }).toEqual({ caminho, casa: false });
    }
    expect(ehRankingPublico(url('/api/publico/pelada-de-quinta/ranking', 'https://outro.exemplo'), ORIGEM)).toBe(false);
    expect(ehRankingPublico(url('/api/publico/pelada-de-quinta/ranking', 'http://gestaodapelada-v2.exemplo.workers.dev'), ORIGEM)).toBe(false);
  });

  it('PAR-153: a resposta do cache leva X-Pelada-Cache: 1, com o mesmo status e corpo', async () => {
    const guardada = new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    const usada = await marcarRespostaDoCache.cachedResponseWillBeUsed({ cachedResponse: guardada });
    expect(usada?.headers.get(CABECALHO_DO_CACHE)).toBe('1');
    expect(usada?.headers.get('Content-Type')).toBe('application/json');
    expect(await usada?.text()).toBe('{"ok":true}');
    expect(await marcarRespostaDoCache.cachedResponseWillBeUsed({ cachedResponse: null })).toBeNull();
  });
});

describe('sw.ts', () => {
  beforeAll(async () => {
    const ouvintes: string[] = [];
    vi.stubGlobal('self', {
      __WB_MANIFEST: [],
      location: { origin: ORIGEM },
      addEventListener: (tipo: string) => ouvintes.push(tipo),
      skipWaiting: async () => undefined,
    });
    await import('../../src/pwa/sw.ts');
  });

  it('PAR-153: o SW registra só a navegação e o ranking público', () => {
    expect(registro.rotas).toHaveLength(2);
    const [navegacao, ranking] = registro.rotas;
    expect((navegacao?.casar as { tipo?: string }).tipo).toBe('navegacao');
    expect(typeof ranking?.casar).toBe('function');
    expect(ranking?.metodo).toBe('GET');
  });

  it('PAR-153: a rota do ranking casa só o GET do ranking da mesma origem', () => {
    const casar = registro.rotas[1]?.casar as (o: { url: URL; request: { method: string } }) => boolean;
    const get = { method: 'GET' };
    expect(casar({ url: url('/api/publico/pelada-de-quinta/ranking'), request: get })).toBe(true);
    expect(casar({ url: url('/api/publico/pelada-de-quinta/ranking'), request: { method: 'POST' } })).toBe(false);
    expect(casar({ url: url('/api/publico/pelada-de-quinta/pdf'), request: get })).toBe(false);
    expect(casar({ url: url('/api/publico/pelada-de-quinta/eventos'), request: get })).toBe(false);
    expect(casar({ url: url('/api/grupos/g-quinta'), request: get })).toBe(false);
    expect(casar({ url: url('/api/publico/pelada-de-quinta/ranking', 'https://outro.exemplo'), request: get })).toBe(false);
  });

  it('PAR-153: rede primeiro, cache próprio, só 200 e no máximo 50 entradas', () => {
    expect(registro.estrategias).toHaveLength(1);
    const estrategia = registro.estrategias[0];
    expect(estrategia?.tipo).toBe('NetworkFirst');
    expect(estrategia?.opcoes.cacheName).toBe(CACHE_RANKING_PUBLICO);
    expect(registro.plugins).toEqual([
      { tipo: 'CacheableResponsePlugin', opcoes: { statuses: [200] } },
      { tipo: 'ExpirationPlugin', opcoes: { maxEntries: MAX_RANKINGS_GUARDADOS } },
    ]);
    expect(MAX_RANKINGS_GUARDADOS).toBe(50);
    expect(estrategia?.opcoes.plugins).toContain(marcarRespostaDoCache);
  });
});
