import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { abrirTela, erroApi, json, pendente, SESSAO_ANA } from '../apoio/tela.tsx';

/**
 * Rotas de grupos e elenco (T69, GEL-114): cada rota renderiza a sua tela sob a `GuardaApp`; sem sessão, a guarda
 * leva a `/entrar`; grupo ou jogador inexistente (404 da API) mostra o não encontrado da tela.
 */

afterEach(() => {
  cleanup();
});

const ROTAS = [
  ['/app/grupos/novo', 'novo-grupo'],
  ['/app/grupos/g-quinta', 'inicio-grupo'],
  ['/app/grupos/g-quinta/dados', 'dados-grupo'],
  ['/app/grupos/g-quinta/jogadores', 'jogadores'],
  ['/app/grupos/g-quinta/jogadores/novo', 'novo-jogador'],
  ['/app/grupos/g-quinta/jogadores/j-toninho', 'jogador'],
  ['/app/grupos/g-quinta/habilidades', 'habilidades'],
] as const;

describe('rotas de grupos e elenco', () => {
  for (const [caminho, esperada] of ROTAS) {
    it(`GEL-114: ${caminho} renderiza a tela ${esperada} com sessão`, async () => {
      // As leituras da API ficam pendentes: a rota e a guarda bastam aqui; cada tela tem o próprio teste.
      const api = { 'GET /api/sessao': () => json(200, SESSAO_ANA) };
      const pendentes = new Proxy(api as Record<string, () => Response | Promise<Response>>, {
        get: (alvo, chave: string) =>
          alvo[chave] ?? (chave.startsWith('GET ') ? () => pendente() : undefined),
      });
      const { tela, local } = abrirTela(caminho, pendentes);
      await waitFor(() => expect(tela()).toBe(esperada));
      expect(local()).toBe(caminho);
    });

    it(`GEL-114: ${caminho} sem sessão passa pela guarda e vai a /entrar`, async () => {
      const { local } = abrirTela(caminho);
      await waitFor(() => expect(local().startsWith('/entrar')).toBe(true));
    });
  }

  it('GEL-21: grupo inexistente mostra o não encontrado', async () => {
    abrirTela('/app/grupos/g-nada', {
      'GET /api/sessao': () => json(200, SESSAO_ANA),
      'GET /api/grupos/g-nada': () => erroApi(404, 'nao_encontrado'),
    });
    expect(await screen.findByText('Grupo não encontrado.')).toBeTruthy();
  });

  it('jogador inexistente mostra o não encontrado', async () => {
    abrirTela('/app/grupos/g-quinta/jogadores/j-nada', {
      'GET /api/sessao': () => json(200, SESSAO_ANA),
      'GET /api/grupos/g-quinta': () => erroApi(404, 'nao_encontrado'),
      'GET /api/grupos/g-quinta/jogadores/j-nada': () => erroApi(404, 'nao_encontrado'),
    });
    expect(await screen.findByText('Jogador não encontrado.')).toBeTruthy();
  });
});
