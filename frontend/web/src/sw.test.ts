import { beforeEach, describe, expect, it, vi } from 'vitest';

// FUN-33. O SW roda num worker; aqui ele é carregado com `self` falso e o Workbox simulado.
const precacheAndRoute = vi.fn();
const clientsClaim = vi.fn();
const createHandlerBoundToURL = vi.fn();
const matchPrecache = vi.fn();
const registerRoute = vi.fn();
const NavigationRoute = vi.fn();
vi.mock('workbox-precaching', () => ({
  precacheAndRoute,
  cleanupOutdatedCaches: vi.fn(),
  createHandlerBoundToURL,
  matchPrecache,
}));
vi.mock('workbox-routing', () => ({ registerRoute, NavigationRoute }));
vi.mock('workbox-core', () => ({ clientsClaim }));

const skipWaiting = vi.fn();
const ouvintes = new Map<string, () => void>();
const manifestoDoBuild = [{ url: '/index.html', revision: 'abc' }];

beforeEach(async () => {
  vi.resetModules();
  ouvintes.clear();
  precacheAndRoute.mockClear();
  registerRoute.mockClear();
  NavigationRoute.mockClear();
  createHandlerBoundToURL.mockReset();
  matchPrecache.mockReset();
  vi.stubGlobal('self', {
    __WB_MANIFEST: manifestoDoBuild,
    skipWaiting,
    addEventListener: (tipo: string, fn: () => void) => ouvintes.set(tipo, fn),
  });
  await import('./sw');
});

describe('service worker', () => {
  it('faz o precache do shell que o build injeta', () => {
    expect(precacheAndRoute).toHaveBeenCalledWith(manifestoDoBuild);
  });

  it('registra os handlers push e notificationclick, sem fazer nada', () => {
    expect(ouvintes.has('push')).toBe(true);
    expect(ouvintes.has('notificationclick')).toBe(true);
    expect(ouvintes.get('push')?.()).toBeUndefined();
    expect(ouvintes.get('notificationclick')?.()).toBeUndefined();
  });

  it('assume o controle dos clientes ao instalar', () => {
    expect(clientsClaim).toHaveBeenCalled();
    ouvintes.get('install')?.();
    expect(skipWaiting).toHaveBeenCalled();
  });

  // FUN-34
  describe('navegação', () => {
    type Tratador = (opcoes: { request: Request }) => Promise<Response>;
    const tratador = (): Tratador => {
      expect(registerRoute).toHaveBeenCalledTimes(1);
      const [rota] = NavigationRoute.mock.calls[0] ?? [];
      return rota as Tratador;
    };
    const opcoes = { request: new Request('https://app.exemplo.invalid/qualquer-rota') };

    it('sem cache e sem rede, devolve o offline.html do precache', async () => {
      createHandlerBoundToURL.mockReturnValue(() => Promise.reject(new Error('sem cache e sem rede')));
      matchPrecache.mockResolvedValue(new Response('pagina offline'));
      // O handler é criado ao carregar o SW; recarrega para pegar o mock configurado.
      vi.resetModules();
      registerRoute.mockClear();
      NavigationRoute.mockClear();
      await import('./sw');
      const resposta = await tratador()(opcoes);
      expect(await resposta.text()).toBe('pagina offline');
      expect(matchPrecache).toHaveBeenCalledWith('/offline.html');
    });

    it('com o shell disponível, devolve o shell', async () => {
      createHandlerBoundToURL.mockReturnValue(() => Promise.resolve(new Response('shell')));
      vi.resetModules();
      registerRoute.mockClear();
      NavigationRoute.mockClear();
      await import('./sw');
      const resposta = await tratador()(opcoes);
      expect(await resposta.text()).toBe('shell');
    });

    it('não captura a API nem o .well-known', async () => {
      const [, filtros] = NavigationRoute.mock.calls[0] ?? [];
      const { denylist } = filtros as { denylist: RegExp[] };
      expect(denylist.some((r) => r.test('/api/health'))).toBe(true);
      expect(denylist.some((r) => r.test('/.well-known/x'))).toBe(true);
      expect(denylist.some((r) => r.test('/grupos'))).toBe(false);
    });
  });
});
