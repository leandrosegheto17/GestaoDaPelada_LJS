import { cleanup, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { abrirTela, json, pendente, SESSAO_ANA } from '../apoio/tela.tsx';

/**
 * Rotas do financeiro (financeiro T37; FIN-47, AD-054): cada rota renderiza a sua tela sob a `GuardaApp`; sem sessão,
 * a guarda leva a `/entrar`. Molde: `rotas-grupos.test.tsx`.
 */

afterEach(() => {
  cleanup();
});

const ROTAS = [
  ['/app/grupos/g-quinta/financeiro', 'financeiro'],
  ['/app/grupos/g-quinta/financeiro/lancamentos/novo', 'novo-lancamento'],
  ['/app/grupos/g-quinta/financeiro/lancamentos/l-aluguel', 'lancamento'],
  ['/app/grupos/g-quinta/financeiro/config', 'config-caixa'],
] as const;

describe('rotas do financeiro', () => {
  for (const [caminho, esperada] of ROTAS) {
    it(`FIN-47: ${caminho} renderiza a tela ${esperada} com sessão`, async () => {
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

    it(`FIN-47: ${caminho} sem sessão passa pela guarda e vai a /entrar`, async () => {
      const { local } = abrirTela(caminho);
      await waitFor(() => expect(local().startsWith('/entrar')).toBe(true));
    });
  }

  it('FIN-47: a rota antiga do mockup (/admin/…/financeiro) não existe no app', async () => {
    const { tela } = abrirTela('/admin/g-quinta/financeiro', {
      'GET /api/sessao': () => json(200, SESSAO_ANA),
    });
    await waitFor(() => expect(tela()).toBe('nao-encontrada'));
  });
});
