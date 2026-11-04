import { describe, expect, test, vi } from 'vitest';
import { configurar, entradasPrecache, responderNavegacao, type EscopoSw } from './sw.ts';

function escopoFalso(manifest: EscopoSw['__WB_MANIFEST'] = []) {
  const ouvintes = new Map<string, (evento: unknown) => void>();
  const escopo: EscopoSw = {
    __WB_MANIFEST: manifest,
    addEventListener: (tipo, ouvinte) => void ouvintes.set(tipo, ouvinte),
  };
  return { escopo, ouvintes };
}

describe('service worker', () => {
  test('FUN-34: registra push e notificationclick, que não lançam erro com evento vazio', () => {
    const { escopo, ouvintes } = escopoFalso();
    configurar(escopo, { precache: vi.fn(), registrarNavegacao: vi.fn() });
    expect(ouvintes.has('push')).toBe(true);
    expect(ouvintes.has('notificationclick')).toBe(true);
    expect(() => ouvintes.get('push')?.({})).not.toThrow();
    expect(() => ouvintes.get('notificationclick')?.({})).not.toThrow();
  });

  test('FUN-34: a lista de precache inclui o shell e offline.html', () => {
    const precache = vi.fn();
    const { escopo } = escopoFalso([{ url: 'assets/app-abc.js', revision: null }]);
    configurar(escopo, { precache, registrarNavegacao: vi.fn() });
    const urls = (precache.mock.calls[0]?.[0] as { url: string }[]).map((e) => e.url);
    expect(urls).toContain('index.html');
    expect(urls).toContain('offline.html');
    expect(urls).toContain('assets/app-abc.js');
  });

  test('FUN-34: entradasPrecache não duplica o que o build já listou', () => {
    const entradas = entradasPrecache([
      { url: 'index.html', revision: 'a' },
      { url: 'offline.html', revision: 'b' },
    ]);
    expect(entradas.filter((e) => e.url === 'index.html')).toHaveLength(1);
    expect(entradas.filter((e) => e.url === 'offline.html')).toHaveLength(1);
  });

  test('FUN-35: navegação sem rede numa rota fora do cache responde offline.html', async () => {
    const paginaOffline = new Response('offline');
    const resposta = await responderNavegacao(new Request('https://app.test/grupos/xyz'), {
      buscar: () => Promise.reject(new TypeError('sem rede')),
      offline: () => Promise.resolve(paginaOffline),
    });
    expect(resposta).toBe(paginaOffline);
  });

  test('FUN-35: com rede, a navegação devolve a resposta da rede', async () => {
    const darede = new Response('ok');
    const resposta = await responderNavegacao(new Request('https://app.test/'), {
      buscar: () => Promise.resolve(darede),
      offline: () => Promise.resolve(new Response('offline')),
    });
    expect(resposta).toBe(darede);
  });
});
