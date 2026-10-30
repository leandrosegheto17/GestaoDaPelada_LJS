import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarClienteConsultas } from '../dados/consultas';
import { violacoes } from '../../test/apoio/axe';
import { criarRotas } from './rotas';

const EU = {
  id: 'c1',
  nome: 'Ana',
  email: 'ana@exemplo.com.br',
  grupos: [],
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

function simularApi(resposta: () => Response) {
  const f = vi.fn<typeof fetch>(() => Promise.resolve(resposta()));
  vi.stubGlobal('fetch', f);
  return f;
}

const semSessao = () => json({ erro: { codigo: 'sessao_expirada', mensagem: 'Sua sessão expirou.' } }, 401);

function abrir(caminho: string) {
  const roteador = createMemoryRouter(criarRotas([]), { initialEntries: [caminho] });
  render(
    <QueryClientProvider client={criarClienteConsultas({ aoSessaoExpirada: () => undefined })}>
      <RouterProvider router={roteador} />
    </QueryClientProvider>,
  );
  return roteador;
}

describe('rotas públicas (ACE-58)', () => {
  it.each(['/termos', '/privacidade', '/cadastro', '/confirmar', '/entrar/esqueci', '/entrar/nova-senha', '/convite'])(
    '%s abre sem sessão e sem consultar a sessão',
    async (caminho) => {
      const f = simularApi(semSessao);
      const roteador = abrir(caminho);
      expect(await screen.findByRole('main')).toBeVisible();
      expect(roteador.state.location.pathname).toBe(caminho);
      expect(f).not.toHaveBeenCalled();
    },
  );

  it('/ continua a página provisória', async () => {
    abrir('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Em breve' })).toBeVisible();
  });
});

describe('guarda de /app e /entrar (ACE-19, ACE-65)', () => {
  it.each(['/app', '/app/conta', '/app/conta/senha', '/app/grupos/g1/admins'])(
    'sem sessão, %s vai a /entrar com a volta',
    async (caminho) => {
      simularApi(semSessao);
      const roteador = abrir(caminho);
      await waitFor(() => expect(roteador.state.location.pathname).toBe('/entrar'));
      expect(new URLSearchParams(roteador.state.location.search).get('volta')).toBe(caminho);
    },
  );

  it('com sessão, /app abre', async () => {
    simularApi(() => json(EU));
    const roteador = abrir('/app');
    expect(await screen.findByRole('main')).toBeVisible();
    expect(roteador.state.location.pathname).toBe('/app');
  });

  it('com sessão, /entrar vai a /app', async () => {
    simularApi(() => json(EU));
    const roteador = abrir('/entrar');
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/app'));
  });

  it('sem sessão, /entrar abre', async () => {
    simularApi(semSessao);
    const roteador = abrir('/entrar');
    expect(await screen.findByRole('main')).toBeVisible();
    expect(roteador.state.location.pathname).toBe('/entrar');
  });
});

describe('rota inexistente', () => {
  it('mostra a tela de erro do projeto, não a padrão do React Router', async () => {
    abrir('/nao-existe');
    expect(await screen.findByRole('heading', { level: 1, name: 'Página não encontrada' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ir para o início' })).toHaveAttribute('href', '/');
    expect(screen.queryByText(/404|Not Found|Unexpected Application Error/i)).toBeNull();
  });

  it('não tem violações de acessibilidade', async () => {
    abrir('/nao-existe');
    await screen.findByRole('heading', { level: 1 });
    expect(await violacoes(document.body)).toEqual([]);
  });
});

describe('início do grupo (t09; ligado antes da T68)', () => {
  const GRUPO = {
    id: 'g1',
    nome: 'Pelada de Quinta',
    slug: 'pelada-de-quinta',
    linkPublico: 'https://app.invalid/g/pelada-de-quinta',
    diaSemana: 'quinta',
    frequencia: 'semanal',
    horario: '20:00',
    jogadoresAtivos: 0,
    habilidades: 6,
    admins: 1,
    souCriador: true,
  };

  it('sem sessão, /app/grupos/g1 vai a /entrar com a volta', async () => {
    simularApi(semSessao);
    const roteador = abrir('/app/grupos/g1');
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/entrar'));
    expect(new URLSearchParams(roteador.state.location.search).get('volta')).toBe('/app/grupos/g1');
  });

  it('com sessão, /app/grupos/g1 abre o início do grupo, com o atalho para Admins', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>((entrada) => {
        const url = String(entrada);
        if (url.endsWith('/api/grupos/g1')) return Promise.resolve(json(GRUPO));
        if (url.endsWith('/api/grupos/g1/jogadores')) return Promise.resolve(json({ jogadores: [] }));
        return Promise.resolve(json(EU));
      }),
    );
    const roteador = abrir('/app/grupos/g1');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Início do admin: Pelada de Quinta' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Admins/ })).toHaveAttribute('href', '/app/grupos/g1/admins');
    expect(roteador.state.location.pathname).toBe('/app/grupos/g1');
  });
});
