// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  FORA_DO_FALLBACK,
  PAGINA_OFFLINE,
  precacheDoApp,
  registrarEventos,
  responderNavegacao,
  SHELL,
} from '../../src/pwa/servico.ts';
import type { EntradaPrecache } from '../../src/pwa/servico.ts';

/**
 * Service worker (FUN-34, FUN-35): handlers de `push` e `notificationclick`, precache do shell
 * e da página offline, e fallback de navegação sem rede.
 */

function urls(lista: EntradaPrecache[]): string[] {
  return lista.map((e) => (typeof e === 'string' ? e : e.url));
}

function alvoFalso() {
  const ouvintes = new Map<string, (evento: unknown) => void>();
  return {
    ouvintes,
    addEventListener: (tipo: string, ouvinte: (evento: unknown) => void) => {
      ouvintes.set(tipo, ouvinte);
    },
  };
}

describe('service worker', () => {
  it('FUN-34: registra listeners de push e notificationclick', () => {
    const alvo = alvoFalso();
    registrarEventos(alvo);
    expect([...alvo.ouvintes.keys()].sort()).toEqual(['notificationclick', 'push']);
  });

  it('FUN-34: os handlers de push e notificationclick não lançam erro com evento vazio', () => {
    const alvo = alvoFalso();
    registrarEventos(alvo);
    for (const tipo of ['push', 'notificationclick']) {
      const ouvinte = alvo.ouvintes.get(tipo);
      expect(ouvinte).toBeTypeOf('function');
      expect(() => ouvinte?.({})).not.toThrow();
      expect(() => ouvinte?.(undefined)).not.toThrow();
    }
  });

  it('FUN-34: a lista de precache inclui o shell e offline.html, mesmo sem vir do build', () => {
    const lista = precacheDoApp([{ url: 'assets/app-abc.js', revision: null }]);
    expect(urls(lista)).toContain('assets/app-abc.js');
    expect(urls(lista)).toContain(SHELL);
    expect(urls(lista)).toContain(PAGINA_OFFLINE);
  });

  it('FUN-34: o que o build já trouxe não entra duas vezes no precache', () => {
    const lista = precacheDoApp([
      { url: 'index.html', revision: '1' },
      { url: '/offline.html', revision: '2' },
    ]);
    expect(lista).toHaveLength(2);
  });

  it('FUN-35: navegação sem rede numa rota fora do cache responde offline.html', async () => {
    const pagina = new Response('<h1>Sem conexão</h1>', { headers: { 'Content-Type': 'text/html' } });
    const doCache = vi.fn(async (url: string) => (url === PAGINA_OFFLINE ? pagina : undefined));
    const resposta = await responderNavegacao(new Request('https://app.test/grupos/abc'), {
      buscar: () => Promise.reject(new TypeError('Failed to fetch')),
      doCache,
    });
    expect(doCache).toHaveBeenCalledWith(PAGINA_OFFLINE);
    expect(resposta).toBe(pagina);
    expect(await resposta.text()).toContain('Sem conexão');
  });

  it('FUN-35: com rede, a navegação devolve a resposta da rede e não consulta a página offline', async () => {
    const daRede = new Response('ok');
    const doCache = vi.fn(async () => new Response('offline'));
    const resposta = await responderNavegacao(new Request('https://app.test/x'), {
      buscar: async () => daRede,
      doCache,
    });
    expect(resposta).toBe(daRede);
    expect(doCache).not.toHaveBeenCalled();
  });

  it('FUN-35: erro do servidor (500) passa como veio, sem a página offline', async () => {
    const resposta = await responderNavegacao(new Request('https://app.test/x'), {
      buscar: async () => new Response('falhou', { status: 500 }),
      doCache: async () => new Response('offline'),
    });
    expect(resposta.status).toBe(500);
  });

  it('FUN-35: sem rede e sem a página no cache, responde 503 em texto', async () => {
    const resposta = await responderNavegacao(new Request('https://app.test/x'), {
      buscar: () => Promise.reject(new TypeError('Failed to fetch')),
      doCache: async () => undefined,
    });
    expect(resposta.status).toBe(503);
    expect(resposta.headers.get('Content-Type')).toContain('text/plain');
  });

  it('FUN-35: navegações de /api ficam fora do fallback', () => {
    expect(FORA_DO_FALLBACK.some((r) => r.test('/api/health'))).toBe(true);
    expect(FORA_DO_FALLBACK.some((r) => r.test('/grupos/abc'))).toBe(false);
  });
});
