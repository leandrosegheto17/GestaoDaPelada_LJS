import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { paraBase64url } from '@pelada/contrato/push';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarCliente } from '../../src/dados/cliente.ts';
import { ProvedorCliente } from '../../src/dados/ContextoCliente.tsx';
import { guardaMemoria } from '../../src/pwa/sw-assinatura.ts';
import type {
  AssinaturaLocal,
  DependenciasPush,
  GerentePush,
} from '../../src/push/assinatura.ts';
import {
  AvisosCobranca,
  TEXTO_RECEBER_COBRANCA,
  TITULO_AVISOS_COBRANCA,
} from '../../src/telas/minha-conta/AvisosCobranca.tsx';
import { TEXTO_PARAR } from '../../src/telas/ranking/ControlePush.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { json } from '../apoio/tela.tsx';

/**
 * Avisos de cobrança em Minha conta (notificacoes T38; NOT-44, NOT-72). A API é um servidor falso; o navegador e a
 * guarda dos destinos são dublês, como no teste do controle do ranking (T37).
 */

const CHAVE = paraBase64url(new Uint8Array(65).fill(4));

function abrir(opcoes: { oferecer?: boolean; suporta?: boolean; falha?: boolean } = {}) {
  let local: AssinaturaLocal | null = null;
  let permissao: NotificationPermission = 'default';
  const pedirPermissao = vi.fn(async () => {
    permissao = 'granted';
    return permissao;
  });
  const gerente: GerentePush = {
    getSubscription: async () => local,
    subscribe: async () => {
      local = {
        options: { applicationServerKey: new Uint8Array(65).fill(4).buffer },
        toJSON: () => ({
          endpoint: 'https://fcm.googleapis.com/fcm/send/conta',
          keys: { p256dh: 'BP', auth: 'au' },
        }),
        unsubscribe: async () => true,
      };
      return local;
    },
  };
  const chamadas: string[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    const chave = `${(init?.method ?? 'GET').toUpperCase()} ${String(url)}`;
    chamadas.push(chave);
    if (chave === 'GET /api/conta/push')
      return opcoes.falha
        ? json(500, { erro: 'x' })
        : json(200, {
            oferecer: opcoes.oferecer ?? true,
            chavePublica: (opcoes.oferecer ?? true) ? CHAVE : null,
          });
    if (chave === 'POST /api/conta/push') return json(201, { assinado: true });
    if (chave === 'DELETE /api/conta/push') return json(204);
    return json(404, { erro: 'x', codigo: 'nao_encontrado' });
  }) as unknown as typeof globalThis.fetch;
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const cliente = criarCliente({ consultas, navegar: () => undefined, fetch });
  const deps: DependenciasPush = {
    api: cliente,
    guarda: guardaMemoria(),
    navegador: {
      suporta: opcoes.suporta ?? true,
      permissao: () => permissao,
      pedirPermissao,
      gerente: async () => gerente,
    },
  };
  const r = render(
    <QueryClientProvider client={consultas}>
      <ProvedorCliente cliente={cliente}>
        <main>
          <AvisosCobranca deps={deps} />
        </main>
      </ProvedorCliente>
    </QueryClientProvider>,
  );
  return { ...r, chamadas, pedirPermissao };
}

afterEach(() => {
  cleanup();
});

describe('AvisosCobranca (t32)', () => {
  it('NOT-44: a criadora vê a seção com "Receber avisos de cobrança neste aparelho"; axe sem violação', async () => {
    const { container } = abrir();
    expect(await screen.findByRole('heading', { name: TITULO_AVISOS_COBRANCA })).toBeTruthy();
    expect(screen.getByRole('button', { name: TEXTO_RECEBER_COBRANCA })).toBeTruthy();
    await esperarSemViolacoes(container);
  });

  it('NOT-44: o toque pede a permissão e assina a conta; depois, "Parar de receber avisos"', async () => {
    const { chamadas, pedirPermissao } = abrir();
    expect(pedirPermissao).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: TEXTO_RECEBER_COBRANCA }));
    expect(await screen.findByRole('button', { name: TEXTO_PARAR })).toBeTruthy();
    expect(pedirPermissao).toHaveBeenCalledOnce();
    expect(chamadas).toContain('POST /api/conta/push');
  });

  it.each([
    ['admin convidada (oferecer false)', { oferecer: false }],
    ['navegador sem suporte', { suporta: false }],
    ['GET que falha', { falha: true }],
  ] as const)('NOT-44: %s não vê a seção', async (_nome, opcoes) => {
    const { chamadas, container } = abrir(opcoes);
    await waitFor(() => expect(chamadas).toContain('GET /api/conta/push'));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('heading', { name: TITULO_AVISOS_COBRANCA })).toBeNull();
    expect(container.querySelector('section')).toBeNull();
  });
});
