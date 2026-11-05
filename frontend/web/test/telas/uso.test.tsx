import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PaginaUso,
  textoEscalacoes,
  textoPartidas,
  textoSemana,
} from '../../src/telas/uso/PaginaUso.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, json, pendente, SESSAO_ANA, type Manipulador } from '../apoio/tela.tsx';

/** Uso do app (partidas-e-ranking T63; PAR-144), a partir de `B:438` e do mockup t21. */

afterEach(() => {
  cleanup();
});

const rotas = () => [{ path: '/app/grupos/:grupoId/uso', element: <PaginaUso /> }];
const API = 'GET /api/grupos/g-quinta/uso';

const SEMANAS = [
  {
    inicio: '2026-10-19',
    fim: '2026-10-25',
    aparelhosRanking: 9,
    pdfsExportados: 0,
    partidasLancadas: 2,
    partidasEm48h: 1,
    escalacoesConfirmadas: 0,
  },
  {
    inicio: '2026-10-12',
    fim: '2026-10-18',
    aparelhosRanking: 17,
    pdfsExportados: 2,
    partidasLancadas: 1,
    partidasEm48h: 1,
    escalacoesConfirmadas: 1,
  },
];

function abrir(api: Record<string, Manipulador>) {
  return abrirTela(
    '/app/grupos/g-quinta/uso',
    {
      'GET /api/sessao': () => json(200, SESSAO_ANA),
      'GET /api/grupos/g-quinta': () => pendente(),
      ...api,
    },
    rotas,
  );
}

describe('textos', () => {
  it('PAR-144: semana "dd/mm a dd/mm", partidas "N (M)" e escalações "E / N"', () => {
    const s = SEMANAS[0]!;
    expect(textoSemana(s)).toBe('19/10 a 25/10');
    expect(textoPartidas(s)).toBe('2 (1)');
    expect(textoEscalacoes(s)).toBe('0 / 2');
  });
});

describe('Uso do app (t21)', () => {
  it('PAR-144: semana com 2 partidas, 1 em 48 h, mostra "2 (1)" e "0 / 2"', async () => {
    abrir({ [API]: () => json(200, { semanas: SEMANAS }) });
    const tabela = await screen.findByRole('table', {
      name: 'Uso por semana, mais recente primeiro',
    });
    const linha = within(tabela)
      .getByRole('rowheader', { name: '19/10 a 25/10' })
      .closest('tr') as HTMLElement;
    expect(
      within(linha)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['9', '0', '2 (1)', '0 / 2']);
  });

  it('PAR-144: as colunas da tabela e a ordem das semanas, mais recente primeiro', async () => {
    abrir({ [API]: () => json(200, { semanas: SEMANAS }) });
    const tabela = await screen.findByRole('table', {
      name: 'Uso por semana, mais recente primeiro',
    });
    expect(
      within(tabela)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual([
      'Semana',
      'Aparelhos que abriram o ranking',
      'PDFs exportados',
      'Partidas lançadas (em até 48 h)',
      'Escalações / partidas',
    ]);
    expect(
      within(tabela)
        .getAllByRole('rowheader')
        .map((c) => c.textContent),
    ).toEqual(['19/10 a 25/10', '12/10 a 18/10']);
  });

  it('PAR-144: sem semanas, "Ainda não há uso registrado." e nenhuma tabela', async () => {
    abrir({ [API]: () => json(200, { semanas: [] }) });
    expect(
      await screen.findByRole('heading', { name: 'Ainda não há uso registrado.' }),
    ).toBeDefined();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('axe sem violações', async () => {
    const { container } = abrir({ [API]: () => json(200, { semanas: SEMANAS }) });
    await screen.findByRole('table');
    await esperarSemViolacoes(container);
  });
});
