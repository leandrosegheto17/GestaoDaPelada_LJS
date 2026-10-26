import { describe, expect, it, vi } from 'vitest';
import { registrarServiceWorker } from './registro';

// FUN-33: o app registra o SW do build, só em produção e só onde o navegador suporta.
describe('registrarServiceWorker', () => {
  const navegadorComSw = () => ({ serviceWorker: { register: vi.fn(() => Promise.resolve({})) } });

  it('em produção registra /sw.js no escopo /', async () => {
    const navegador = navegadorComSw();
    await registrarServiceWorker({ producao: true, navegador });
    expect(navegador.serviceWorker.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  it('em desenvolvimento não registra', async () => {
    const navegador = navegadorComSw();
    await registrarServiceWorker({ producao: false, navegador });
    expect(navegador.serviceWorker.register).not.toHaveBeenCalled();
  });

  it('sem suporte a service worker não faz nada nem lança', async () => {
    await expect(registrarServiceWorker({ producao: true, navegador: {} })).resolves.toBeUndefined();
  });

  it('falha no registro não derruba o app', async () => {
    const navegador = { serviceWorker: { register: vi.fn(() => Promise.reject(new Error('falhou'))) } };
    await expect(registrarServiceWorker({ producao: true, navegador })).resolves.toBeUndefined();
  });
});
