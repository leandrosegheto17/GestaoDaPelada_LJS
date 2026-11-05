import { paraBase64url } from '@pelada/contrato/push';
import { describe, expect, it, vi } from 'vitest';
import type { ClienteApi } from '../../src/dados/cliente.ts';
import {
  assinar,
  cancelar,
  estado,
  suportePush,
  type AssinaturaLocal,
  type DependenciasPush,
  type GerentePush,
} from '../../src/push/assinatura.ts';
import { adicionarDestino, guardaMemoria } from '../../src/pwa/sw-assinatura.ts';

/**
 * Módulo de assinatura de push (notificacoes T36; NOT-02, NOT-04, NOT-16, NOT-62, NOT-70). `PushManager`,
 * `Notification` e a API são dublês; a guarda dos destinos é a de memória.
 */

const CHAVE = new Uint8Array(65).fill(4);
const CHAVE_PUBLICA = paraBase64url(CHAVE);
const OUTRA_CHAVE = new Uint8Array(65).fill(9);
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/aparelho';
const RANKING = { tipo: 'ranking', slug: 'pelada-de-quinta' } as const;

function assinaturaLocal(chave: Uint8Array = CHAVE): AssinaturaLocal & { cancelada: boolean } {
  const a = {
    cancelada: false,
    options: { applicationServerKey: chave.buffer.slice(0) as ArrayBuffer },
    toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: 'BPchave', auth: 'segredo' } }),
    unsubscribe: async () => {
      a.cancelada = true;
      return true;
    },
  };
  return a;
}

function montar(opcoes: {
  suporta?: boolean;
  permissao?: NotificationPermission;
  resposta?: NotificationPermission;
  local?: AssinaturaLocal | null;
  assinadoNoServidor?: boolean;
}) {
  let local = opcoes.local ?? null;
  const pedirPermissao = vi.fn(async () => opcoes.resposta ?? 'granted');
  const subscribe = vi.fn(async () => {
    local = assinaturaLocal();
    return local;
  });
  const gerente: GerentePush = { getSubscription: async () => local, subscribe };
  const chamadas: Array<{ metodo: string; caminho: string; corpo: unknown }> = [];
  const registrar =
    (metodo: string) =>
    async <T>(caminho: string, corpo?: unknown): Promise<T> => {
      chamadas.push({ metodo, caminho, corpo });
      return (
        caminho.endsWith('/estado') ? { assinado: opcoes.assinadoNoServidor ?? true } : undefined
      ) as T;
    };
  const api = {
    get: registrar('GET'),
    post: registrar('POST'),
    put: registrar('PUT'),
    patch: registrar('PATCH'),
    delete: registrar('DELETE'),
    requisitar: vi.fn(),
  } as unknown as ClienteApi;
  const guarda = guardaMemoria();
  const deps: DependenciasPush = {
    api,
    guarda,
    navegador: {
      suporta: opcoes.suporta ?? true,
      permissao: () => opcoes.permissao ?? 'default',
      pedirPermissao,
      gerente: async () => gerente,
    },
  };
  return { deps, chamadas, pedirPermissao, subscribe, guarda, local: () => local };
}

describe('assinar (NOT-02, NOT-04)', () => {
  it('NOT-02: pede a permissão, assina com userVisibleOnly e a chave, faz o POST e guarda o destino', async () => {
    const m = montar({});
    expect(await assinar(RANKING, CHAVE_PUBLICA, m.deps)).toBe('assinado');
    expect(m.pedirPermissao).toHaveBeenCalledOnce();
    expect(m.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: CHAVE,
    });
    expect(m.chamadas).toEqual([
      {
        metodo: 'POST',
        caminho: '/api/publico/pelada-de-quinta/push',
        corpo: { endpoint: ENDPOINT, chaves: { p256dh: 'BPchave', auth: 'segredo' } },
      },
    ]);
    expect(m.guarda.entradas.get(ENDPOINT)).toEqual([RANKING]);
  });

  it.each(['denied', 'default'] as const)(
    'NOT-04: permissão %s devolve desligado sem fetch nem subscribe',
    async (resposta) => {
      const m = montar({ resposta });
      expect(await assinar(RANKING, CHAVE_PUBLICA, m.deps)).toBe('desligado');
      expect(m.chamadas).toEqual([]);
      expect(m.subscribe).not.toHaveBeenCalled();
    },
  );

  it('NOT-70: um segundo grupo reaproveita a assinatura local e grava o destino a mais', async () => {
    const m = montar({ local: assinaturaLocal() });
    await assinar({ tipo: 'ranking', slug: 'outro-grupo' }, CHAVE_PUBLICA, m.deps);
    expect(m.subscribe).not.toHaveBeenCalled();
    expect(m.chamadas.map((c) => c.caminho)).toEqual(['/api/publico/outro-grupo/push']);
  });

  it('NOT-62: assinatura local com outra chave é cancelada antes de assinar de novo', async () => {
    const antiga = assinaturaLocal(OUTRA_CHAVE);
    const m = montar({ local: antiga });
    await adicionarDestino(m.guarda, ENDPOINT, { tipo: 'ranking', slug: 'velho' });
    await assinar(RANKING, CHAVE_PUBLICA, m.deps);
    expect(antiga.cancelada).toBe(true);
    expect(m.subscribe).toHaveBeenCalledOnce();
    expect(m.guarda.entradas.get(ENDPOINT)).toEqual([RANKING]);
  });

  it('NOT-02: sem suporte, sem_suporte e nenhuma permissão pedida', async () => {
    const m = montar({ suporta: false });
    expect(await assinar(RANKING, CHAVE_PUBLICA, m.deps)).toBe('sem_suporte');
    expect(m.pedirPermissao).not.toHaveBeenCalled();
  });
});

describe('estado (NOT-02, NOT-04, NOT-62, NOT-71)', () => {
  it('NOT-02: ler o estado nunca pede a permissão', async () => {
    for (const permissao of ['default', 'granted', 'denied'] as const) {
      const m = montar({ permissao, local: assinaturaLocal() });
      await estado(RANKING, CHAVE_PUBLICA, m.deps);
      expect(m.pedirPermissao).not.toHaveBeenCalled();
    }
  });

  it('NOT-04: permissão negada devolve desligado sem fetch', async () => {
    const m = montar({ permissao: 'denied', local: assinaturaLocal() });
    expect(await estado(RANKING, CHAVE_PUBLICA, m.deps)).toBe('desligado');
    expect(m.chamadas).toEqual([]);
  });

  it('NOT-71: permissão concedida e sem a linha no servidor volta a nao_assinado', async () => {
    const m = montar({ permissao: 'granted', local: assinaturaLocal(), assinadoNoServidor: false });
    expect(await estado(RANKING, CHAVE_PUBLICA, m.deps)).toBe('nao_assinado');
    expect(m.chamadas).toEqual([
      {
        metodo: 'POST',
        caminho: '/api/publico/pelada-de-quinta/push/estado',
        corpo: { endpoint: ENDPOINT, chaves: { auth: 'segredo' } },
      },
    ]);
  });

  it('NOT-71: com a linha no servidor, assinado', async () => {
    const m = montar({ permissao: 'granted', local: assinaturaLocal() });
    expect(await estado(RANKING, CHAVE_PUBLICA, m.deps)).toBe('assinado');
  });

  it('NOT-62: chave pública nova cancela a assinatura local antiga e volta a nao_assinado', async () => {
    const antiga = assinaturaLocal(OUTRA_CHAVE);
    const m = montar({ permissao: 'granted', local: antiga });
    await adicionarDestino(m.guarda, ENDPOINT, RANKING);
    expect(await estado(RANKING, CHAVE_PUBLICA, m.deps)).toBe('nao_assinado');
    expect(antiga.cancelada).toBe(true);
    expect(m.guarda.entradas.has(ENDPOINT)).toBe(false);
    expect(m.chamadas).toEqual([]);
  });

  it('NOT-02: sem assinatura local, nao_assinado sem fetch', async () => {
    const m = montar({ permissao: 'granted' });
    expect(await estado(RANKING, CHAVE_PUBLICA, m.deps)).toBe('nao_assinado');
    expect(m.chamadas).toEqual([]);
  });
});

describe('cancelar (NOT-16, NOT-70)', () => {
  it('NOT-16: faz o DELETE com endpoint e auth e chama unsubscribe()', async () => {
    const local = assinaturaLocal();
    const m = montar({ local });
    await adicionarDestino(m.guarda, ENDPOINT, RANKING);
    expect(await cancelar(RANKING, m.deps)).toBe('nao_assinado');
    expect(m.chamadas).toEqual([
      {
        metodo: 'DELETE',
        caminho: '/api/publico/pelada-de-quinta/push',
        corpo: { endpoint: ENDPOINT, chaves: { auth: 'segredo' } },
      },
    ]);
    expect(local.cancelada).toBe(true);
    expect(m.guarda.entradas.has(ENDPOINT)).toBe(false);
  });

  it('NOT-70: com outro grupo ainda assinado no aparelho, não chama unsubscribe()', async () => {
    const local = assinaturaLocal();
    const m = montar({ local });
    await adicionarDestino(m.guarda, ENDPOINT, RANKING);
    await adicionarDestino(m.guarda, ENDPOINT, { tipo: 'ranking', slug: 'outro-grupo' });
    await cancelar(RANKING, m.deps);
    expect(local.cancelada).toBe(false);
    expect(m.guarda.entradas.get(ENDPOINT)).toEqual([{ tipo: 'ranking', slug: 'outro-grupo' }]);
  });

  it('NOT-16: o da conta vai a /api/conta/push', async () => {
    const m = montar({ local: assinaturaLocal() });
    await cancelar({ tipo: 'conta' }, m.deps);
    expect(m.chamadas.map((c) => `${c.metodo} ${c.caminho}`)).toEqual(['DELETE /api/conta/push']);
  });
});

describe('suportePush', () => {
  it('NOT-02: sem PushManager, Notification ou serviceWorker, não há suporte', () => {
    expect(suportePush({ navigator: {} } as unknown as typeof globalThis)).toBe(false);
    expect(
      suportePush({
        PushManager: class {},
        Notification: class {},
        navigator: { serviceWorker: {} },
      } as unknown as typeof globalThis),
    ).toBe(true);
  });

  it('NOT-02: importar o módulo não pede permissão', async () => {
    const pedir = vi.fn();
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: pedir });
    try {
      await import('../../src/push/assinatura.ts');
      expect(pedir).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
