import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FaixaSomenteLeitura, TITULO_SOMENTE_LEITURA } from '../../src/componentes/FaixaSomenteLeitura.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, json, pendente } from '../apoio/tela.tsx';

/** Faixa de somente leitura (planos-e-cobranca T43; PLA-22). */

const PLANO_FREE = {
  plano: 'free',
  situacao: 'inadimplente',
  trialFimEm: null,
  pagoAte: null,
  jogadoresAtivos: 21,
  limiteJogadores: 20,
  somenteLeitura: { motivo: 'limite_jogadores' },
  recursos: ['partidas', 'ranking'],
  podeAssinar: true,
  assinatura: null,
};

afterEach(() => {
  cleanup();
});

function montar(plano: () => Response | Promise<Response>) {
  return abrirTela('/faixa', { 'GET /api/grupos/g1/plano': plano }, () => [
    {
      path: '/faixa',
      element: (
        <main>
          <h1>Tela do grupo</h1>
          <FaixaSomenteLeitura grupoId="g1" />
        </main>
      ),
    },
  ]);
}

describe('FaixaSomenteLeitura', () => {
  it('PLA-22: com somenteLeitura.motivo = limite_jogadores, mostra o título, o motivo e o link para Meu plano', async () => {
    montar(() => json(200, PLANO_FREE));
    const faixa = await screen.findByRole('status');
    expect(faixa.textContent).toContain(TITULO_SOMENTE_LEITURA);
    expect(faixa.textContent).toContain('mais de 20 jogadores ativos');
    expect(screen.getByRole('link', { name: 'Ver Meu plano' }).getAttribute('href')).toBe(
      '/app/grupos/g1/plano',
    );
  });

  it('PLA-22: com motivo limite_grupos, o texto é o do grupo mais antigo', async () => {
    montar(() => json(200, { ...PLANO_FREE, somenteLeitura: { motivo: 'limite_grupos' } }));
    const faixa = await screen.findByRole('status');
    expect(faixa.textContent).toContain('só o grupo mais antigo');
  });

  it('PLA-22: sem motivo, a faixa não aparece', async () => {
    const { chamadasA } = montar(() => json(200, { ...PLANO_FREE, somenteLeitura: null }));
    await waitFor(() => expect(chamadasA('GET', '/api/grupos/g1/plano')).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Tela do grupo' })).toBeDefined());
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText(TITULO_SOMENTE_LEITURA)).toBeNull();
  });

  it('PLA-22: enquanto o plano carrega, a faixa não aparece', () => {
    montar(() => pendente());
    expect(screen.queryByText(TITULO_SOMENTE_LEITURA)).toBeNull();
  });

  it('PLA-22: axe sem violações com a faixa', async () => {
    const { container } = montar(() => json(200, PLANO_FREE));
    await screen.findByRole('status');
    await esperarSemViolacoes(container);
  });
});
