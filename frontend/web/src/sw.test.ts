import { beforeEach, describe, expect, it, vi } from 'vitest';

// FUN-33. O SW roda num worker; aqui ele é carregado com `self` falso e o Workbox simulado.
const precacheAndRoute = vi.fn();
const clientsClaim = vi.fn();
vi.mock('workbox-precaching', () => ({
  precacheAndRoute,
  cleanupOutdatedCaches: vi.fn(),
  createHandlerBoundToURL: vi.fn(),
  matchPrecache: vi.fn(),
}));
vi.mock('workbox-routing', () => ({ registerRoute: vi.fn(), NavigationRoute: vi.fn() }));
vi.mock('workbox-core', () => ({ clientsClaim }));

const skipWaiting = vi.fn();
const ouvintes = new Map<string, () => void>();
const manifestoDoBuild = [{ url: '/index.html', revision: 'abc' }];

beforeEach(async () => {
  vi.resetModules();
  ouvintes.clear();
  precacheAndRoute.mockClear();
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
});
