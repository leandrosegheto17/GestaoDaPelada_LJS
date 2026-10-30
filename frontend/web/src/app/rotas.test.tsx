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

describe('rotas do grupo e do elenco (T68, GEL-114)', () => {
  const GRUPO = {
    id: 'g1',
    nome: 'Pelada de Quinta',
    slug: 'pelada-de-quinta',
    linkPublico: 'https://app.invalid/g/pelada-de-quinta',
    diaSemana: 'quinta',
    frequencia: 'semanal',
    horario: '20:00',
    jogadoresAtivos: 1,
    habilidades: 6,
    admins: 1,
    souCriador: true,
  };
  const JOGADOR = {
    id: 'j1',
    apelido: 'Toninho',
    posicao: 'atacante',
    situacao: 'ativo',
    desde: '2026-02-05',
    nivel: 550,
    semNota: true,
    anoNascimento: 1978,
    telefone: null,
    pontuacaoInicial: 0,
    inicioPontuacao: '2026-02-05',
    periodos: [{ id: 'p1', inicio: '2026-02-05', fim: null }],
    notas: [],
  };

  /** Servidor de mentira: cada URL da API devolve o formato do contrato. */
  function comSessao() {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>((entrada) => {
        const url = new URL(String(entrada), 'http://localhost').pathname;
        if (url === '/api/grupos') return Promise.resolve(json({ ativos: [], arquivados: [] }));
        if (url === '/api/grupos/g1') return Promise.resolve(json(GRUPO));
        if (url === '/api/grupos/g1/jogadores') return Promise.resolve(json({ jogadores: [] }));
        if (url === '/api/grupos/g1/jogadores/j1') return Promise.resolve(json(JOGADOR));
        if (url === '/api/grupos/g1/habilidades') return Promise.resolve(json({ habilidades: [] }));
        return Promise.resolve(json(EU));
      }),
    );
  }

  it.each([
    ['/app/grupos/novo', 'Novo grupo'],
    ['/app/grupos/g1/dados', 'Dados do grupo'],
    ['/app/grupos/g1/jogadores', 'Jogadores'],
    ['/app/grupos/g1/jogadores/novo', 'Novo jogador'],
    ['/app/grupos/g1/jogadores/j1', 'Toninho'],
    ['/app/grupos/g1/habilidades', 'Habilidades'],
  ])('com sessão, %s abre a tela "%s"', async (caminho, titulo) => {
    comSessao();
    const roteador = abrir(caminho);
    expect(await screen.findByRole('heading', { level: 1, name: titulo })).toBeInTheDocument();
    expect(roteador.state.location.pathname).toBe(caminho);
  });

  it.each([
    '/app/grupos/novo',
    '/app/grupos/g1',
    '/app/grupos/g1/dados',
    '/app/grupos/g1/jogadores',
    '/app/grupos/g1/jogadores/novo',
    '/app/grupos/g1/jogadores/j1',
    '/app/grupos/g1/habilidades',
  ])('sem sessão, %s vai a /entrar com a volta', async (caminho) => {
    simularApi(semSessao);
    const roteador = abrir(caminho);
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/entrar'));
    expect(new URLSearchParams(roteador.state.location.search).get('volta')).toBe(caminho);
  });

  it('/app/grupos/novo abre o formulário de novo grupo, não o início de um grupo chamado "novo"', async () => {
    comSessao();
    abrir('/app/grupos/novo');
    expect(await screen.findByRole('button', { name: 'Criar grupo' })).toBeInTheDocument();
  });

  it('/app/grupos/g1/jogadores/novo abre o cadastro, não a ficha de um jogador chamado "novo"', async () => {
    comSessao();
    abrir('/app/grupos/g1/jogadores/novo');
    expect(await screen.findByLabelText('Apelido')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Habilidades e nível' })).toBeNull();
  });

  it('/app/grupos/g1/admins continua abrindo a tela de admins', async () => {
    comSessao();
    const roteador = abrir('/app/grupos/g1/admins');
    expect(await screen.findByRole('main')).toBeVisible();
    expect(roteador.state.location.pathname).toBe('/app/grupos/g1/admins');
  });
});
