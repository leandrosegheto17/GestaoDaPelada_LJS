import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { abrirTela } from '../apoio/tela.tsx';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

// A landing consulta a sessão: o apoio traz o cliente e o React Query (sessão ausente = 401, como sem login).
function abrir(caminho: string) {
  return abrirTela(caminho);
}

describe('rotas da fundação', () => {
  // planos-e-cobranca T53 (autorizado em `## Autorizações` do STATE.md): a página provisória deu lugar à landing; a
  // prova continua a mesma (a rota `/` renderiza a sua tela, com título e `main`).
  it('FUN-31, PLA-64: / mostra a landing', async () => {
    abrir('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Gestão da Pelada' })).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();
  });

  it('FUN-31: /qualquer mostra o 404', async () => {
    abrir('/qualquer/coisa');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Página não encontrada' }),
    ).toBeTruthy();
  });

  for (const [id, verificar] of [
    ['erro-rede', () => screen.findByRole('alert')],
    ['carregando-lista', () => screen.findByRole('status')],
    ['indisponivel', () => screen.findByRole('heading', { level: 1, name: 'Grupo indisponível' })],
  ] as const) {
    it(`FUN-38: com VITE_VITRINE=1, /_vitrine/${id} renderiza`, async () => {
      vi.stubEnv('VITE_VITRINE', '1');
      abrir(`/_vitrine/${id}`);
      expect(await verificar()).toBeTruthy();
      expect(screen.queryByRole('heading', { name: 'Página não encontrada' })).toBeNull();
    });

    it(`FUN-38: sem VITE_VITRINE, /_vitrine/${id} cai no 404`, async () => {
      vi.stubEnv('VITE_VITRINE', '');
      abrir(`/_vitrine/${id}`);
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Página não encontrada' }),
      ).toBeTruthy();
    });
  }

  it('FUN-38: com VITE_VITRINE=1, um id de vitrine que não existe cai no 404', async () => {
    vi.stubEnv('VITE_VITRINE', '1');
    abrir('/_vitrine/nao-existe');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Página não encontrada' }),
    ).toBeTruthy();
  });

  it('FUN-38: com VITE_VITRINE=1, a vitrine de erro de rede segue o mockup (título e grupo)', async () => {
    vi.stubEnv('VITE_VITRINE', '1');
    abrir('/_vitrine/erro-rede');
    expect(await screen.findByRole('heading', { level: 1, name: 'Partidas' })).toBeTruthy();
    expect(screen.getByRole('banner').textContent).toContain('Pelada de Quinta');
  });
});
