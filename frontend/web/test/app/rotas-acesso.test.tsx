import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { criarRotas, type HandleTela } from '../../src/app/rotas.tsx';
import { criarCliente } from '../../src/dados/cliente.ts';
import { ProvedorCliente } from '../../src/dados/ContextoCliente.tsx';
import { TEXTO_CONTA_EXCLUIDA } from '../../src/paginas/Mensagens.tsx';

afterEach(() => {
  cleanup();
});

const SESSAO = { id: 'c1', nome: 'Ana', email: 'ana@exemplo.test', grupos: [] };

function abrir(caminho: string, logado: boolean) {
  const consultas = new QueryClient();
  const fetch = (async () =>
    logado
      ? new Response(JSON.stringify(SESSAO), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      : new Response(JSON.stringify({ erro: 'Entre para continuar.', codigo: 'sem_sessao' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })) as unknown as typeof globalThis.fetch;
  const roteador = createMemoryRouter(criarRotas(), { initialEntries: [caminho] });
  const api = criarCliente({ consultas, navegar: (d) => void roteador.navigate(d), fetch });
  render(
    <QueryClientProvider client={consultas}>
      <ProvedorCliente cliente={api}>
        <RouterProvider router={roteador} />
      </ProvedorCliente>
    </QueryClientProvider>,
  );
  const tela = () => (roteador.state.matches.at(-1)?.route.handle as HandleTela | undefined)?.tela;
  const caminhoAtual = () => roteador.state.location.pathname;
  return { tela, caminhoAtual };
}

/** Rotas públicas: abrem sem sessão e ficam onde estão. */
const PUBLICAS = [
  ['/entrar', 'entrar'],
  ['/cadastro', 'cadastro'],
  ['/confirmar', 'confirmar'],
  ['/entrar/esqueci', 'esqueci'],
  ['/entrar/nova-senha', 'nova-senha'],
  ['/convite', 'convite'],
  ['/termos', 'termos'],
  ['/privacidade', 'privacidade'],
] as const;

/** Rotas de `/app`: com sessão, cada uma abre a sua tela. */
const DO_APP = [
  ['/app', 'app'],
  ['/app/conta', 'conta'],
  ['/app/conta/senha', 'senha'],
  ['/app/grupos/g-quinta/admins', 'admins'],
] as const;

describe('rotas do app de acesso', () => {
  for (const [caminho, esperada] of PUBLICAS) {
    it(`sem sessão, ${caminho} renderiza a tela ${esperada}`, async () => {
      const { tela, caminhoAtual } = abrir(caminho, false);
      expect(await screen.findByRole('main')).toBeTruthy();
      await waitFor(() => expect(tela()).toBe(esperada));
      expect(caminhoAtual()).toBe(caminho);
    });
  }

  for (const [caminho, esperada] of DO_APP) {
    it(`com sessão, ${caminho} renderiza a tela ${esperada}`, async () => {
      const { tela, caminhoAtual } = abrir(caminho, true);
      await waitFor(() => expect(tela()).toBe(esperada));
      expect(await screen.findByRole('main')).toBeTruthy();
      expect(caminhoAtual()).toBe(caminho);
    });

    it(`sem sessão, ${caminho} passa pela guarda e vai a /entrar`, async () => {
      const { tela, caminhoAtual } = abrir(caminho, false);
      await waitFor(() => expect(tela()).toBe('entrar'));
      expect(caminhoAtual()).toBe('/entrar');
    });
  }

  it('ACE-65: com sessão, /entrar e /cadastro vão a /app', async () => {
    for (const caminho of ['/entrar', '/cadastro']) {
      const { tela, caminhoAtual } = abrir(caminho, true);
      await waitFor(() => expect(tela()).toBe('app'));
      expect(caminhoAtual()).toBe('/app');
      cleanup();
    }
  });

  it('ACE-58: /termos e /privacidade abrem sem sessão e também com sessão', async () => {
    for (const logado of [false, true]) {
      for (const [caminho, esperada] of [
        ['/termos', 'termos'],
        ['/privacidade', 'privacidade'],
      ] as const) {
        const { tela, caminhoAtual } = abrir(caminho, logado);
        await waitFor(() => expect(tela()).toBe(esperada));
        expect(caminhoAtual()).toBe(caminho);
        cleanup();
      }
    }
  });

  // planos-e-cobranca T53 (autorizado em `## Autorizações` do STATE.md): a faixa agora fica na landing (PLA-63), com as
  // mesmas asserções sobre ela.
  it('ACE-28, PLA-63: /?aviso=conta-excluida mostra a landing com a faixa "Sua conta foi excluída"', async () => {
    abrir('/?aviso=conta-excluida', false);
    expect(await screen.findByRole('heading', { level: 1, name: 'Gestão da Pelada' })).toBeTruthy();
    const faixa = screen.getByRole('status');
    expect(faixa.textContent).toBe(TEXTO_CONTA_EXCLUIDA);
    expect(TEXTO_CONTA_EXCLUIDA).toBe('Sua conta foi excluída.');
    expect(faixa.className).toContain('faixa--sucesso');
  });

  it('ACE-28: / sem o aviso não mostra a faixa', async () => {
    abrir('/', false);
    await screen.findByRole('heading', { level: 1, name: 'Gestão da Pelada' });
    expect(screen.queryByText(TEXTO_CONTA_EXCLUIDA)).toBeNull();
  });

  it('rota desconhecida dentro de /app, com sessão, cai no 404', async () => {
    abrir('/app/qualquer', true);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Página não encontrada' }),
    ).toBeTruthy();
  });
});
