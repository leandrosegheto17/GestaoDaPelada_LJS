import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { CHAVE_SESSAO, destinoSeguro, GuardaApp, GuardaPublica } from '../../src/app/guarda.tsx';
import { criarCliente } from '../../src/dados/cliente.ts';
import { ProvedorCliente } from '../../src/dados/ContextoCliente.tsx';

afterEach(() => {
  cleanup();
});

const SESSAO = { id: 'c1', nome: 'Ana', email: 'ana@exemplo.test', grupos: [] };

type Servidor = { estado: 'ativa' | 'sem_sessao' | 'sessao_expirada' };

function respostaSessao(s: Servidor): Response {
  if (s.estado === 'ativa') {
    return new Response(JSON.stringify(SESSAO), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ erro: 'x', codigo: s.estado }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

function EntrarFalso({ servidor }: { servidor: Servidor }) {
  const consultas = useQueryClient();
  return (
    <main>
      <h1>Entrar</h1>
      <button
        type="button"
        onClick={() => {
          servidor.estado = 'ativa';
          void consultas.invalidateQueries({ queryKey: CHAVE_SESSAO });
        }}
      >
        Fazer login
      </button>
    </main>
  );
}

function abrir(caminho: string, servidor: Servidor) {
  const consultas = new QueryClient();
  const fetch = (async () => respostaSessao(servidor)) as unknown as typeof globalThis.fetch;
  const roteador = createMemoryRouter(
    [
      {
        element: <GuardaPublica />,
        children: [{ path: '/entrar', element: <EntrarFalso servidor={servidor} /> }],
      },
      {
        path: '/app',
        element: <GuardaApp />,
        children: [
          { index: true, element: <h1>Início do app</h1> },
          { path: 'conta', element: <h1>Minha conta</h1> },
        ],
      },
    ],
    { initialEntries: [caminho] },
  );
  const api = criarCliente({ consultas, navegar: (d) => void roteador.navigate(d), fetch });
  render(
    <QueryClientProvider client={consultas}>
      <ProvedorCliente cliente={api}>
        <RouterProvider router={roteador} />
      </ProvedorCliente>
    </QueryClientProvider>,
  );
  const local = () => `${roteador.state.location.pathname}${roteador.state.location.search}`;
  return { roteador, local };
}

describe('guarda de rota', () => {
  it('ACE-19: /app/conta sem sessão vai a /entrar e, depois do login, volta a /app/conta', async () => {
    const servidor: Servidor = { estado: 'sem_sessao' };
    const { local } = abrir('/app/conta', servidor);
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeTruthy();
    expect(local()).toBe(`/entrar?volta=${encodeURIComponent('/app/conta')}`);

    fireEvent.click(screen.getByRole('button', { name: 'Fazer login' }));
    expect(await screen.findByRole('heading', { name: 'Minha conta' })).toBeTruthy();
    expect(local()).toBe('/app/conta');
  });

  it('ACE-19: a rota pedida volta com a busca (query string)', async () => {
    const servidor: Servidor = { estado: 'sem_sessao' };
    const { local } = abrir('/app/conta?aba=senha', servidor);
    await screen.findByRole('heading', { name: 'Entrar' });
    expect(new URLSearchParams(local().split('?')[1]).get('volta')).toBe('/app/conta?aba=senha');
  });

  it('ACE-19: destino externo em volta é ignorado e o login vai a /app', async () => {
    const servidor: Servidor = { estado: 'sem_sessao' };
    const { local } = abrir(`/entrar?volta=${encodeURIComponent('//outro.site')}`, servidor);
    await screen.findByRole('heading', { name: 'Entrar' });
    fireEvent.click(screen.getByRole('button', { name: 'Fazer login' }));
    expect(await screen.findByRole('heading', { name: 'Início do app' })).toBeTruthy();
    expect(local()).toBe('/app');
  });

  it('ACE-19: destinoSeguro só aceita rotas do app', () => {
    for (const ruim of [
      null,
      undefined,
      '',
      '//outro.site',
      'https://outro.site/app',
      '/appx',
      '/app//outro.site',
      '/app\\outro',
      '/entrar',
      'app/conta',
      '/app/\u0000',
    ]) {
      expect(destinoSeguro(ruim)).toBe('/app');
    }
    for (const bom of ['/app', '/app/conta', '/app/conta?aba=1', '/app?x=1', '/app#topo']) {
      expect(destinoSeguro(bom)).toBe(bom);
    }
  });

  it('ACE-65: com sessão, /entrar vai a /app', async () => {
    const { local } = abrir('/entrar', { estado: 'ativa' });
    expect(await screen.findByRole('heading', { name: 'Início do app' })).toBeTruthy();
    expect(local()).toBe('/app');
  });

  it('ACE-20: sessão expirada em /app vai a /entrar com o aviso e a rota pedida', async () => {
    const { local } = abrir('/app/conta', { estado: 'sessao_expirada' });
    await screen.findByRole('heading', { name: 'Entrar' });
    const p = new URLSearchParams(local().split('?')[1]);
    expect(local().startsWith('/entrar?')).toBe(true);
    expect(p.get('aviso')).toBe('sessao-expirada');
    expect(p.get('volta')).toBe('/app/conta');
  });

  it('ACE-19: com sessão, /app/conta abre direto', async () => {
    const { local } = abrir('/app/conta', { estado: 'ativa' });
    expect(await screen.findByRole('heading', { name: 'Minha conta' })).toBeTruthy();
    await waitFor(() => expect(local()).toBe('/app/conta'));
  });
});
