// Critério: T66 (GEL-86, GEL-87, GEL-114): mockup t16 excluir e exclusao-recusada; texto exato "O cadastro é apagado.
// Só é possível excluir quem não tem partidas, notas nem pagamentos."; recusa 409 mostra a mensagem e o botão que abre
// o diálogo de inativar; axe sem violação.

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { violacoes } from '../../../test/apoio/axe';
import { json, simularApi } from '../../../test/apoio/tela';
import { criarClienteConsultas } from '../../dados/consultas';
import { FichaJogador } from './FichaJogador';

afterEach(() => vi.unstubAllGlobals());

const GRUPO = {
  id: 'g1',
  nome: 'Pelada de Quinta',
  slug: 'quinta',
  diaSemana: 'quinta',
  frequencia: 'semanal',
  horario: '20:00',
  linkPublico: 'https://app.invalid/g/quinta',
  jogadoresAtivos: 1,
  habilidades: 6,
  admins: 1,
  souCriador: true,
};
const TONINHO = {
  id: 'j1',
  apelido: 'Toninho',
  posicao: 'atacante',
  situacao: 'ativo',
  desde: '2026-02-05',
  nivel: 683,
  semNota: false,
  anoNascimento: 1978,
  telefone: null,
  pontuacaoInicial: 0,
  inicioPontuacao: '2026-02-05',
  periodos: [{ id: 'p1', inicio: '2026-02-05', fim: null }],
  notas: [],
};
const MENSAGEM = 'Toninho tem histórico de partidas e não pode ser excluído.';

function api(excluir: () => Response) {
  return simularApi((url, init) => {
    if (url.endsWith('/jogadores/j1') && init?.method === 'DELETE') return excluir();
    if (url.endsWith('/jogadores/j1')) return json(TONINHO);
    return json(GRUPO);
  });
}

function abrir() {
  const roteador = createMemoryRouter(
    [
      { path: '/app/grupos/:grupoId/jogadores/:jogadorId', element: <FichaJogador /> },
      { path: '/app/grupos/:grupoId/jogadores', element: <p>Destino lista</p> },
    ],
    { initialEntries: ['/app/grupos/g1/jogadores/j1'] },
  );
  const tela = render(
    <QueryClientProvider client={criarClienteConsultas({ aoSessaoExpirada: () => undefined })}>
      <RouterProvider router={roteador} />
    </QueryClientProvider>,
  );
  return { roteador, ...tela };
}

describe('Excluir jogador: confirmação (t16 excluir, GEL-86, GEL-87)', () => {
  it('"Excluir Toninho?" com o texto exato, foco em Cancelar, sem violações do axe; Cancelar não apaga nada', async () => {
    const f = api(() => new Response(null, { status: 204 }));
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Excluir jogador' }));
    const d = screen.getByRole('alertdialog', { name: 'Excluir Toninho?' });
    expect(
      within(d).getByText('O cadastro é apagado. Só é possível excluir quem não tem partidas, notas nem pagamentos.'),
    ).toBeVisible();
    expect(within(d).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    expect(await violacoes(d)).toEqual([]);
    await u.click(within(d).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(f.mock.calls.filter(([, i]) => i?.method === 'DELETE')).toHaveLength(0);
  });

  it('confirmar envia DELETE e volta à lista de jogadores', async () => {
    const f = api(() => new Response(null, { status: 204 }));
    const { roteador } = abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Excluir jogador' }));
    await u.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Excluir jogador' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/app/grupos/g1/jogadores'));
    const del = f.mock.calls.find(([, i]) => i?.method === 'DELETE');
    expect(String(del?.[0])).toMatch(/\/api\/grupos\/g1\/jogadores\/j1$/);
  });
});

describe('Excluir jogador: recusa por histórico (t16 exclusao-recusada, GEL-85)', () => {
  const recusar = () =>
    json({ erro: { codigo: 'jogador_com_historico', mensagem: MENSAGEM, sugestao: 'inativar' } }, 409);

  it('o 409 fecha o diálogo e mostra a mensagem com "Inativar em vez disso"', async () => {
    api(recusar);
    const { roteador, container } = abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Excluir jogador' }));
    await u.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Excluir jogador' }));
    expect(await screen.findByText(MENSAGEM)).toBeVisible();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Inativar em vez disso' })).toBeVisible();
    expect(roteador.state.location.pathname).toBe('/app/grupos/g1/jogadores/j1');
    expect(await violacoes(container)).toEqual([]);
  });

  it('"Inativar em vez disso" abre o diálogo de inativar com o aviso do GEL-59', async () => {
    api(recusar);
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Excluir jogador' }));
    await u.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Excluir jogador' }));
    await u.click(await screen.findByRole('button', { name: 'Inativar em vez disso' }));
    const d = screen.getByRole('dialog', { name: 'Inativar Toninho' });
    expect(within(d).getByText(/Ele sai do ranking, do lançamento, do simulador e do financeiro/)).toBeVisible();
    expect(screen.queryByText(MENSAGEM)).toBeNull();
  });
});
