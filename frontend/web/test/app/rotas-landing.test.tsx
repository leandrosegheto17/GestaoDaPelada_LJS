import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { criarRotas, type HandleTela } from '../../src/app/rotas.tsx';
import { criarCliente } from '../../src/dados/cliente.ts';
import { ProvedorCliente } from '../../src/dados/ContextoCliente.tsx';

/** `/` com a landing e com sessão para `/app` (planos-e-cobranca T53; PLA-64, PLA-65; AD-094). */

afterEach(() => {
  cleanup();
});

const SESSAO = { id: 'c1', nome: 'Ana', email: 'ana@exemplo.test', grupos: [] };

function abrir(caminho: string, sessao: () => Promise<Response>) {
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const chamadas: string[] = [];
  const fetch = (async (url: string | URL | Request) => {
    const caminhoUrl = String(url).split('?')[0] ?? '';
    chamadas.push(caminhoUrl);
    if (caminhoUrl === '/api/sessao') return sessao();
    return new Response(JSON.stringify({ ativos: [], arquivados: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof globalThis.fetch;
  const roteador = createMemoryRouter(criarRotas(), { initialEntries: [caminho] });
  const api = criarCliente({ consultas, navegar: (d) => void roteador.navigate(d), fetch });
  render(
    <QueryClientProvider client={consultas}>
      <ProvedorCliente cliente={api}>
        <RouterProvider router={roteador} />
      </ProvedorCliente>
    </QueryClientProvider>,
  );
  return {
    chamadas,
    tela: () => (roteador.state.matches.at(-1)?.route.handle as HandleTela | undefined)?.tela,
    caminhoAtual: () => roteador.state.location.pathname,
  };
}

const json = (status: number, corpo: unknown) =>
  Promise.resolve(new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } }));

describe('rota /', () => {
  it('PLA-64: com sessão, / vai a /app', async () => {
    const { tela, caminhoAtual } = abrir('/', () => json(200, SESSAO));
    await waitFor(() => expect(caminhoAtual()).toBe('/app'));
    expect(tela()).toBe('app');
  });

  it('PLA-64: sem sessão, / fica na landing', async () => {
    const { tela, caminhoAtual } = abrir('/', () => json(401, { erro: 'Entre para continuar.', codigo: 'sem_sessao' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Gestão da Pelada' })).toBeTruthy();
    expect(tela()).toBe('inicio-publico');
    expect(caminhoAtual()).toBe('/');
  });

  it('PLA-65: com a API respondendo 500, a landing aparece inteira', async () => {
    const { caminhoAtual } = abrir('/', () => json(500, { erro: 'falhou' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Gestão da Pelada' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Free' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Pro' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Criar conta' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    await waitFor(() => expect(caminhoAtual()).toBe('/'));
  });

  it('PLA-65: com a API fora (rede caída), a landing aparece inteira', async () => {
    abrir('/', () => Promise.reject(new TypeError('rede')));
    expect(await screen.findByRole('heading', { level: 1, name: 'Gestão da Pelada' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Entrar' })).toBeTruthy();
  });

  it('PLA-65: enquanto a sessão não responde, a landing já aparece', async () => {
    abrir('/', () => new Promise<Response>(() => undefined));
    expect(await screen.findByRole('heading', { level: 1, name: 'Gestão da Pelada' })).toBeTruthy();
  });

  it('AD-094: a landing só chama /api/sessao', async () => {
    const { chamadas } = abrir('/', () => json(401, { erro: 'Entre para continuar.', codigo: 'sem_sessao' }));
    await screen.findByRole('heading', { level: 1, name: 'Gestão da Pelada' });
    expect(new Set(chamadas)).toEqual(new Set(['/api/sessao']));
  });
});
