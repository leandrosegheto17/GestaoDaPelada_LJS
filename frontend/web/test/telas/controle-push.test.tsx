import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { paraBase64url } from '@pelada/contrato/push';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarCliente } from '../../src/dados/cliente.ts';
import { ProvedorCliente } from '../../src/dados/ContextoCliente.tsx';
import { TEXTO_AVISO } from '../../src/pwa/AvisoInstalarIphone.tsx';
import type { AmbienteNavegador } from '../../src/pwa/useModoInstalacao.ts';
import { guardaMemoria } from '../../src/pwa/sw-assinatura.ts';
import type { AssinaturaLocal, DependenciasPush, GerentePush } from '../../src/push/assinatura.ts';
import {
  ControlePush,
  TEXTO_ASSINADO_RANKING,
  TEXTO_DESLIGADO,
  TEXTO_PARAR,
  TEXTO_RECEBER_RANKING,
  TEXTO_SEM_SUPORTE,
  TITULO_DESLIGADO,
} from '../../src/telas/ranking/ControlePush.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { json, type Manipulador } from '../apoio/tela.tsx';

/**
 * Controle de avisos do ranking na t01 (notificacoes T37; NOT-01, NOT-03, NOT-04, NOT-13, NOT-15, NOT-61, NOT-71,
 * NOT-72). A API é um servidor falso como o de `apoio/tela.tsx`; o navegador (`PushManager`, `Notification`) e a guarda
 * dos destinos são dublês.
 */

const SLUG = 'pelada-de-quinta';
const CHAVE = paraBase64url(new Uint8Array(65).fill(4));
const BASE = `/api/publico/${SLUG}/push`;

const DESKTOP: AmbienteNavegador = {
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  pontosDeToque: 0,
  standalone: false,
};
const IPHONE_SAFARI: AmbienteNavegador = {
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  pontosDeToque: 5,
  standalone: false,
};

function assinaturaLocal(): AssinaturaLocal {
  return {
    options: { applicationServerKey: new Uint8Array(65).fill(4).buffer },
    toJSON: () => ({
      endpoint: 'https://fcm.googleapis.com/fcm/send/x',
      keys: { p256dh: 'BP', auth: 'au' },
    }),
    unsubscribe: async () => true,
  };
}

interface Cenario {
  disponivel?: { disponivel: boolean; chavePublica: string | null } | 'erro';
  suporta?: boolean;
  permissao?: NotificationPermission;
  resposta?: NotificationPermission;
  local?: AssinaturaLocal | null;
  assinadoNoServidor?: boolean;
  ambiente?: AmbienteNavegador;
}

function abrir(c: Cenario = {}) {
  let local = c.local ?? null;
  let permissao = c.permissao ?? 'default';
  const pedirPermissao = vi.fn(async () => {
    permissao = c.resposta ?? 'granted';
    return permissao;
  });
  const gerente: GerentePush = {
    getSubscription: async () => local,
    subscribe: async () => {
      local = assinaturaLocal();
      return local;
    },
  };
  const api: Record<string, Manipulador> = {
    [`GET ${BASE}`]: () =>
      c.disponivel === 'erro'
        ? json(500, { erro: 'x' })
        : json(200, c.disponivel ?? { disponivel: true, chavePublica: CHAVE }),
    [`POST ${BASE}`]: () => json(201, { assinado: true }),
    [`DELETE ${BASE}`]: () => json(204),
    [`POST ${BASE}/estado`]: () => json(200, { assinado: c.assinadoNoServidor ?? true }),
  };
  const chamadas: string[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    const chave = `${(init?.method ?? 'GET').toUpperCase()} ${String(url)}`;
    chamadas.push(chave);
    const m = api[chave];
    return m ? m(undefined) : json(404, { erro: 'x', codigo: 'nao_encontrado' });
  }) as unknown as typeof globalThis.fetch;
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const cliente = criarCliente({ consultas, navegar: () => undefined, fetch });
  const deps: DependenciasPush = {
    api: cliente,
    guarda: guardaMemoria(),
    navegador: {
      suporta: c.suporta ?? true,
      permissao: () => permissao,
      pedirPermissao,
      gerente: async () => gerente,
    },
  };
  const r = render(
    <QueryClientProvider client={consultas}>
      <ProvedorCliente cliente={cliente}>
        <main>
          <ControlePush slug={SLUG} deps={deps} ambiente={c.ambiente ?? DESKTOP} />
        </main>
      </ProvedorCliente>
    </QueryClientProvider>,
  );
  return { ...r, chamadas, pedirPermissao };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('ControlePush (t01)', () => {
  it('NOT-01: com push disponível e sem assinatura, mostra "Receber avisos do ranking"; axe sem violação', async () => {
    const { container } = abrir();
    expect(await screen.findByRole('button', { name: TEXTO_RECEBER_RANKING })).toBeTruthy();
    await esperarSemViolacoes(container);
  });

  it('NOT-13, NOT-15: assinar leva ao "assinado" com "Parar de receber avisos"; parar volta a "Receber"', async () => {
    const { chamadas, pedirPermissao } = abrir();
    fireEvent.click(await screen.findByRole('button', { name: TEXTO_RECEBER_RANKING }));
    expect(await screen.findByText(TEXTO_ASSINADO_RANKING)).toBeTruthy();
    expect(pedirPermissao).toHaveBeenCalledOnce();
    expect(chamadas).toContain(`POST ${BASE}`);

    fireEvent.click(screen.getByRole('button', { name: TEXTO_PARAR }));
    expect(await screen.findByRole('button', { name: TEXTO_RECEBER_RANKING })).toBeTruthy();
    expect(chamadas).toContain(`DELETE ${BASE}`);
  });

  it('NOT-15: com assinatura ativa ao abrir, mostra "Parar de receber avisos"', async () => {
    abrir({ permissao: 'granted', local: assinaturaLocal() });
    expect(await screen.findByRole('button', { name: TEXTO_PARAR })).toBeTruthy();
  });

  it('NOT-71: permissão granted com estado assinado false mostra "Receber avisos do ranking"', async () => {
    abrir({ permissao: 'granted', local: assinaturaLocal(), assinadoNoServidor: false });
    expect(await screen.findByRole('button', { name: TEXTO_RECEBER_RANKING })).toBeTruthy();
    expect(screen.queryByRole('button', { name: TEXTO_PARAR })).toBeNull();
  });

  it('NOT-04: permissão negada no toque mostra os avisos desligados e como ligar, sem POST', async () => {
    const { chamadas } = abrir({ resposta: 'denied' });
    fireEvent.click(await screen.findByRole('button', { name: TEXTO_RECEBER_RANKING }));
    expect(await screen.findByText(TITULO_DESLIGADO)).toBeTruthy();
    expect(screen.getByText(TEXTO_DESLIGADO)).toBeTruthy();
    expect(chamadas).not.toContain(`POST ${BASE}`);
  });

  it('NOT-04: permissão já negada ao abrir mostra desligado, sem botão; axe sem violação', async () => {
    const { container } = abrir({ permissao: 'denied' });
    expect(await screen.findByText(TITULO_DESLIGADO)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    await esperarSemViolacoes(container);
  });

  it('NOT-01: sem suporte, só o aviso de que o navegador não recebe', async () => {
    abrir({ suporta: false });
    expect(await screen.findByText(TEXTO_SEM_SUPORTE)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it.each([
    ['disponivel false', { disponivel: false, chavePublica: null }],
    ['GET que falha', 'erro'],
  ] as const)('NOT-61: %s não renderiza nada', async (_nome, disponivel) => {
    const { container, chamadas } = abrir({ disponivel });
    await waitFor(() => expect(chamadas).toContain(`GET ${BASE}`));
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('section')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('NOT-03 (posição): no iOS fora do standalone, o aviso de instalação ocupa o contêiner do controle, sem botão nem pedido de permissão', async () => {
    const { pedirPermissao } = abrir({ ambiente: IPHONE_SAFARI });
    const regiao = await screen.findByRole('region', { name: 'Avisos do ranking' });
    expect(within(regiao).getByRole('note')).toBeTruthy();
    expect(within(regiao).getByText(TEXTO_AVISO)).toBeTruthy();
    expect(within(regiao).queryByRole('button', { name: TEXTO_RECEBER_RANKING })).toBeNull();
    expect(screen.queryByRole('button', { name: TEXTO_RECEBER_RANKING })).toBeNull();
    expect(pedirPermissao).not.toHaveBeenCalled();
  });

  it('NOT-03: no iOS instalado (standalone), o controle normal aparece', async () => {
    abrir({ ambiente: { ...IPHONE_SAFARI, standalone: true } });
    expect(await screen.findByRole('button', { name: TEXTO_RECEBER_RANKING })).toBeTruthy();
  });
});
