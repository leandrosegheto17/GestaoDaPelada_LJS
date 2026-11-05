// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  adicionarDestino,
  guardaMemoria,
  registrarTrocaDeAssinatura,
  removerDestino,
  type AssinaturaDoNavegador,
  type DependenciasTroca,
} from '../../src/pwa/sw-assinatura.ts';

/**
 * Service worker: troca da assinatura pelo navegador (notificacoes T35; NOT-19, NOT-70). A guarda dos destinos é a de
 * memória e o `fetch` grava cada pedido.
 */

const ANTIGA = 'https://fcm.googleapis.com/fcm/send/antiga';
const NOVA = 'https://fcm.googleapis.com/fcm/send/nova';

const assinatura = (endpoint: string, auth: string, p256dh = 'BPchave'): AssinaturaDoNavegador => ({
  toJSON: () => ({ endpoint, keys: { p256dh, auth } }),
});

interface Pedido {
  url: string;
  metodo: string;
  cabecalhos: Record<string, string>;
  credenciais: RequestCredentials | undefined;
  corpo: unknown;
}

function montar(status: (url: string, metodo: string) => number = () => 204) {
  const guarda = guardaMemoria();
  const pedidos: Pedido[] = [];
  const deps: DependenciasTroca = {
    guarda,
    buscar: async (url, init) => {
      pedidos.push({
        url,
        metodo: init.method ?? 'GET',
        cabecalhos: init.headers as Record<string, string>,
        credenciais: init.credentials,
        corpo: JSON.parse(String(init.body)),
      });
      return new Response(null, { status: status(url, init.method ?? 'GET') });
    },
  };
  const ouvintes = new Map<string, (e: unknown) => void>();
  registrarTrocaDeAssinatura({ addEventListener: (t, o) => void ouvintes.set(t, o) }, deps);
  const disparar = async (evento: object) => {
    const esperas: Promise<unknown>[] = [];
    ouvintes.get('pushsubscriptionchange')?.({
      ...evento,
      waitUntil: (p: Promise<unknown>) => esperas.push(p),
    });
    await Promise.all(esperas);
  };
  return { guarda, pedidos, disparar };
}

describe('pushsubscriptionchange (NOT-19)', () => {
  it('NOT-19: com a antiga e a nova, um DELETE e um POST no slug guardado, com X-Pelada: 1', async () => {
    const { guarda, pedidos, disparar } = montar((_u, m) => (m === 'POST' ? 201 : 204));
    await adicionarDestino(guarda, ANTIGA, { tipo: 'ranking', slug: 'pelada-de-quinta' });
    await disparar({
      oldSubscription: assinatura(ANTIGA, 'authVelho'),
      newSubscription: assinatura(NOVA, 'authNovo', 'BPnova'),
    });
    expect(pedidos).toEqual([
      {
        url: '/api/publico/pelada-de-quinta/push',
        metodo: 'DELETE',
        cabecalhos: { 'Content-Type': 'application/json', 'X-Pelada': '1' },
        credenciais: 'same-origin',
        corpo: { endpoint: ANTIGA, chaves: { auth: 'authVelho' } },
      },
      {
        url: '/api/publico/pelada-de-quinta/push',
        metodo: 'POST',
        cabecalhos: { 'Content-Type': 'application/json', 'X-Pelada': '1' },
        credenciais: 'same-origin',
        corpo: { endpoint: NOVA, chaves: { p256dh: 'BPnova', auth: 'authNovo' } },
      },
    ]);
    expect(guarda.entradas.get(ANTIGA)).toBeUndefined();
    expect(guarda.entradas.get(NOVA)).toEqual([{ tipo: 'ranking', slug: 'pelada-de-quinta' }]);
  });

  it('NOT-19: sem a nova, só o DELETE, e os destinos da antiga saem da guarda', async () => {
    const { guarda, pedidos, disparar } = montar();
    await adicionarDestino(guarda, ANTIGA, { tipo: 'ranking', slug: 'pelada-de-quinta' });
    await disparar({ oldSubscription: assinatura(ANTIGA, 'authVelho'), newSubscription: null });
    expect(pedidos.map((p) => p.metodo)).toEqual(['DELETE']);
    expect(guarda.entradas.size).toBe(0);
  });

  it('NOT-19: sem slug guardado, nenhum fetch', async () => {
    const { pedidos, disparar } = montar();
    await disparar({
      oldSubscription: assinatura(ANTIGA, 'authVelho'),
      newSubscription: assinatura(NOVA, 'authNovo'),
    });
    expect(pedidos).toEqual([]);
  });

  it('NOT-19: sem a antiga, nenhum fetch', async () => {
    const { guarda, pedidos, disparar } = montar();
    await adicionarDestino(guarda, ANTIGA, { tipo: 'ranking', slug: 'pelada-de-quinta' });
    await disparar({ oldSubscription: null, newSubscription: assinatura(NOVA, 'authNovo') });
    expect(pedidos).toEqual([]);
  });

  it('NOT-19, NOT-70: vários grupos e a conta no mesmo endpoint: cada destino troca a sua', async () => {
    const { guarda, pedidos, disparar } = montar((_u, m) => (m === 'POST' ? 201 : 204));
    await adicionarDestino(guarda, ANTIGA, { tipo: 'ranking', slug: 'grupo-a' });
    await adicionarDestino(guarda, ANTIGA, { tipo: 'ranking', slug: 'grupo-b' });
    await adicionarDestino(guarda, ANTIGA, { tipo: 'conta' });
    await disparar({
      oldSubscription: assinatura(ANTIGA, 'authVelho'),
      newSubscription: assinatura(NOVA, 'authNovo'),
    });
    expect(pedidos.map((p) => `${p.metodo} ${p.url}`)).toEqual([
      'DELETE /api/publico/grupo-a/push',
      'POST /api/publico/grupo-a/push',
      'DELETE /api/publico/grupo-b/push',
      'POST /api/publico/grupo-b/push',
      'DELETE /api/conta/push',
      'POST /api/conta/push',
    ]);
    expect(guarda.entradas.get(NOVA)).toHaveLength(3);
  });

  it('NOT-19: o POST que falha num destino não impede os outros, e esse destino não passa para a nova', async () => {
    const { guarda, pedidos, disparar } = montar((url, m) =>
      m === 'POST' && url.includes('grupo-a') ? 503 : 201,
    );
    await adicionarDestino(guarda, ANTIGA, { tipo: 'ranking', slug: 'grupo-a' });
    await adicionarDestino(guarda, ANTIGA, { tipo: 'ranking', slug: 'grupo-b' });
    await disparar({
      oldSubscription: assinatura(ANTIGA, 'authVelho'),
      newSubscription: assinatura(NOVA, 'authNovo'),
    });
    expect(pedidos).toHaveLength(4);
    expect(guarda.entradas.get(NOVA)).toEqual([{ tipo: 'ranking', slug: 'grupo-b' }]);
  });

  it('NOT-19: evento sem waitUntil não lança', () => {
    const ouvintes = new Map<string, (e: unknown) => void>();
    registrarTrocaDeAssinatura(
      { addEventListener: (t, o) => void ouvintes.set(t, o) },
      { guarda: guardaMemoria(), buscar: async () => new Response(null) },
    );
    expect(() => ouvintes.get('pushsubscriptionchange')?.({})).not.toThrow();
    expect(() => ouvintes.get('pushsubscriptionchange')?.(undefined)).not.toThrow();
  });
});

describe('destinos guardados', () => {
  it('NOT-70: o mesmo destino não entra duas vezes; remover o último apaga a entrada', async () => {
    const guarda = guardaMemoria();
    await adicionarDestino(guarda, ANTIGA, { tipo: 'ranking', slug: 'grupo-a' });
    await adicionarDestino(guarda, ANTIGA, { tipo: 'ranking', slug: 'grupo-a' });
    await adicionarDestino(guarda, ANTIGA, { tipo: 'conta' });
    expect(guarda.entradas.get(ANTIGA)).toHaveLength(2);
    await removerDestino(guarda, ANTIGA, { tipo: 'ranking', slug: 'grupo-a' });
    expect(guarda.entradas.get(ANTIGA)).toEqual([{ tipo: 'conta' }]);
    await removerDestino(guarda, ANTIGA, { tipo: 'conta' });
    expect(guarda.entradas.has(ANTIGA)).toBe(false);
  });
});
