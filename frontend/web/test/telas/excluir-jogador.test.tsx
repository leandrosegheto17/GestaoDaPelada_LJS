import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TEXTO_EXCLUIR, tituloExcluir } from '../../src/telas/jogador/ExcluirJogador.tsx';
import { FichaJogador } from '../../src/telas/jogador/FichaJogador.tsx';
import { tituloInativar } from '../../src/telas/jogador/PeriodosJogador.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, erroApi, json, SESSAO_ANA, type Manipulador } from '../apoio/tela.tsx';

/**
 * Ficha do jogador: excluir (T67; GEL-84, GEL-86, GEL-87, GEL-114), de `t16-jogador--excluir` e
 * `--exclusao-recusada`. A rota entra no app na T69.
 */

const rotas = () => [
  { path: '/app/grupos/:grupoId/jogadores/:jogadorId', element: <FichaJogador /> },
  { path: '*', element: <p>destino</p> },
];

const TONINHO = {
  id: 'j-toninho',
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

const API = '/api/grupos/g-quinta/jogadores/j-toninho';

function abrir(api: Record<string, Manipulador>) {
  return abrirTela('/app/grupos/g-quinta/jogadores/j-toninho', { 'GET /api/sessao': () => json(200, SESSAO_ANA), ...api }, rotas);
}

afterEach(() => {
  cleanup();
});

describe('ficha do jogador: excluir', () => {
  it('GEL-87: o diálogo mostra o título e o texto exatos, com Cancelar e Excluir jogador; axe com o diálogo aberto', async () => {
    const { container } = abrir({ [`GET ${API}`]: () => json(200, TONINHO) });
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir jogador' }));
    const dialogo = screen.getByRole('alertdialog', { name: tituloExcluir('Toninho') });
    expect(tituloExcluir('Toninho')).toBe('Excluir Toninho?');
    expect(within(dialogo).getByText(TEXTO_EXCLUIR)).toBeTruthy();
    expect(TEXTO_EXCLUIR).toBe('O cadastro é apagado. Só é possível excluir quem não tem partidas, notas nem pagamentos.');
    expect(document.activeElement).toBe(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(within(dialogo).getByRole('button', { name: 'Excluir jogador' })).toBeTruthy();
    await esperarSemViolacoes(container);
  });

  it('GEL-87: Cancelar fecha sem chamar a API', async () => {
    const { chamadasA } = abrir({ [`GET ${API}`]: () => json(200, TONINHO) });
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir jogador' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(chamadasA('DELETE', API)).toHaveLength(0);
  });

  it('GEL-84: 204 volta à lista de jogadores', async () => {
    const { chamadasA, local } = abrir({
      [`GET ${API}`]: () => json(200, TONINHO),
      [`DELETE ${API}`]: () => json(204),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir jogador' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Excluir jogador' }));
    await waitFor(() => expect(local()).toBe('/app/grupos/g-quinta/jogadores'));
    expect(chamadasA('DELETE', API)).toHaveLength(1);
  });

  it('GEL-86: 409 mostra a mensagem e "Inativar em vez disso", que abre o diálogo de inativar; axe sem violação', async () => {
    const { container } = abrir({
      [`GET ${API}`]: () => json(200, TONINHO),
      [`DELETE ${API}`]: () => erroApi(409, 'jogador_com_historico', 'Toninho tem histórico de partidas e não pode ser excluído.'),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir jogador' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Excluir jogador' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('Toninho tem histórico de partidas e não pode ser excluído.');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await esperarSemViolacoes(container);

    fireEvent.click(within(alerta).getByRole('button', { name: 'Inativar em vez disso' }));
    expect(screen.getByRole('dialog', { name: tituloInativar('Toninho') })).toBeTruthy();
    expect(screen.queryByText('Toninho tem histórico de partidas e não pode ser excluído.')).toBeNull();
  });

  it('outra falha mostra a mensagem sem "Inativar em vez disso"', async () => {
    abrir({
      [`GET ${API}`]: () => json(200, TONINHO),
      [`DELETE ${API}`]: () => erroApi(409, 'grupo_arquivado', 'Este grupo está arquivado.'),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir jogador' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Excluir jogador' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('Este grupo está arquivado.');
    expect(within(alerta).queryByRole('button', { name: 'Inativar em vez disso' })).toBeNull();
  });
});
