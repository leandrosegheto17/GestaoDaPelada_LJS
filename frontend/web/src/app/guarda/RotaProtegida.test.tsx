import { QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, waitFor } from '@testing-library/react';
import { screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarClienteConsultas } from '../../dados/consultas';
import { useSair } from '../../dados/sessao';
import { RotaProtegida } from './RotaProtegida';

const EU = {
  id: 'c1',
  nome: 'Ana',
  email: 'ana@exemplo.com.br',
  grupos: [{ id: 'g1', nome: 'Quinta', slug: 'quinta', acessaFinanceiro: false }],
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

function responderSessao(resposta: () => Response | Promise<Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(() => Promise.resolve().then(resposta)),
  );
}

function montar(rota: string) {
  const cliente = criarClienteConsultas({ aoSessaoExpirada: () => undefined });
  const roteador = createMemoryRouter(
    [
      {
        element: <RotaProtegida />,
        children: [
          { path: '/app/*', element: <p>Tela do app</p> },
          { path: '/entrar', element: <p>Tela de entrada</p> },
        ],
      },
    ],
    { initialEntries: [rota] },
  );
  render(
    <QueryClientProvider client={cliente}>
      <RouterProvider router={roteador} />
    </QueryClientProvider>,
  );
  return roteador;
}

const semSessao = () => json({ erro: { codigo: 'sessao_expirada', mensagem: 'Sua sessão expirou.' } }, 401);

describe('RotaProtegida', () => {
  it('sem sessão em /app/conta leva a /entrar com a volta (ACE-19)', async () => {
    responderSessao(semSessao);
    const roteador = montar('/app/conta');
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/entrar'));
    expect(roteador.state.location.search).toBe('?volta=%2Fapp%2Fconta');
  });

  it('com sessão, a tela do app abre', async () => {
    responderSessao(() => json(EU));
    montar('/app/conta');
    expect(await screen.findByText('Tela do app')).toBeInTheDocument();
  });

  it('logado em /entrar vai a /app (ACE-65)', async () => {
    responderSessao(() => json(EU));
    const roteador = montar('/entrar');
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/app'));
  });

  it('erro de rede ao ler a sessão deixa a tela filha abrir, sem redirecionar', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('sem rede')));
    const roteador = montar('/app/conta');
    expect(await screen.findByText('Tela do app', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(roteador.state.location.pathname).toBe('/app/conta');
  });
});

describe('useSair', () => {
  it('envia POST /api/sessao/sair com X-Pelada e esvazia o cache', async () => {
    const f = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal('fetch', f);
    const cliente = criarClienteConsultas({ aoSessaoExpirada: () => undefined });
    cliente.setQueryData(['qualquer'], { dado: 'da conta' });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSair(), { wrapper });
    result.current.mutate();
    await waitFor(() => expect(cliente.getQueryCache().getAll()).toHaveLength(0));
    const [url, init] = f.mock.calls[0]!;
    expect(new URL(String(url)).pathname).toBe('/api/sessao/sair');
    expect(new Headers(init?.headers).get('x-pelada')).toBe('1');
    expect(init?.method).toBe('POST');
  });
});
