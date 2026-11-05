import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MeuPlano, TEXTO_SO_A_CRIADORA } from '../../src/telas/plano/MeuPlano.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, json } from '../apoio/tela.tsx';

/** Meu plano: plano, datas, jogadores e recursos (planos-e-cobranca T44; PLA-52, PLA-57, PLA-58). */

const PLANO_BASE = {
  plano: 'trial',
  situacao: 'trial',
  trialFimEm: '2026-11-14',
  pagoAte: null,
  jogadoresAtivos: 12,
  limiteJogadores: null,
  somenteLeitura: null,
  recursos: ['partidas', 'ranking', 'simulador', 'financeiro', 'pdf', 'push'],
  podeAssinar: true,
  assinatura: null,
};

afterEach(() => {
  cleanup();
});

function abrir(plano: Record<string, unknown>) {
  return abrirTela(
    '/app/grupos/g1/plano',
    { 'GET /api/grupos/g1/plano': () => json(200, plano) },
    () => [{ path: '/app/grupos/:grupoId/plano', element: <MeuPlano /> }],
  );
}

describe('Meu plano', () => {
  it('PLA-52: trial mostra "Trial Pro até 14/11/2026" e os recursos liberados', async () => {
    abrir(PLANO_BASE);
    expect(await screen.findByText('Trial Pro até 14/11/2026')).toBeDefined();
    expect(screen.getByRole('heading', { level: 2, name: 'Trial Pro' })).toBeDefined();
    const recursos = screen.getByRole('list', { name: 'Recursos do plano' });
    expect(within(recursos).getAllByText('Liberado')).toHaveLength(6);
  });

  it('PLA-52: no Free mostra "21 de 20 jogadores" e os recursos Pro como "Só no Pro"', async () => {
    abrir({
      ...PLANO_BASE,
      plano: 'free',
      situacao: 'inadimplente',
      trialFimEm: null,
      jogadoresAtivos: 21,
      limiteJogadores: 20,
      somenteLeitura: { motivo: 'limite_jogadores' },
      recursos: ['partidas', 'ranking'],
    });
    expect(await screen.findByText('21 de 20 jogadores')).toBeDefined();
    const recursos = screen.getByRole('list', { name: 'Recursos do plano' });
    expect(within(recursos).getAllByText('Liberado')).toHaveLength(2);
    expect(within(recursos).getAllByText('Só no Pro')).toHaveLength(4);
    const simulador = within(recursos).getByText('Simulador de times').closest('li');
    expect(simulador?.textContent).toContain('Só no Pro');
  });

  it('PLA-52: Pro mostra a data de pagoAte', async () => {
    abrir({ ...PLANO_BASE, plano: 'pro', situacao: 'ativo', trialFimEm: null, pagoAte: '2026-12-05' });
    expect(await screen.findByText('Pro até 05/12/2026')).toBeDefined();
  });

  it('PLA-57: admin convidada vê o plano sem botões e com o texto', async () => {
    abrir({ ...PLANO_BASE, podeAssinar: false });
    expect(await screen.findByText(TEXTO_SO_A_CRIADORA)).toBeDefined();
    expect(screen.queryByRole('button', { name: /Assinar|Cancelar/ })).toBeNull();
  });

  it('PLA-58: cortesia mostra "Cortesia: Pro sem cobrança" e nenhum botão nem o texto da criadora', async () => {
    abrir({ ...PLANO_BASE, plano: 'cortesia', situacao: 'uso_proprio', trialFimEm: null, podeAssinar: false });
    expect(await screen.findByRole('heading', { level: 2, name: 'Cortesia: Pro sem cobrança' })).toBeDefined();
    expect(screen.queryByRole('button', { name: /Assinar|Cancelar/ })).toBeNull();
    expect(screen.queryByText(TEXTO_SO_A_CRIADORA)).toBeNull();
  });

  it('PLA-52: axe sem violações', async () => {
    const { container } = abrir(PLANO_BASE);
    await screen.findByText('Trial Pro até 14/11/2026');
    await esperarSemViolacoes(container);
  });
});
