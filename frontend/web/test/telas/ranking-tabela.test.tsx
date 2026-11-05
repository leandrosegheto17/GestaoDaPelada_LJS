import type { LinhaPublica } from '@pelada/contrato/publico';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TabelaRanking, textoPontos } from '../../src/telas/ranking/TabelaRanking.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';

/**
 * Tabela do ranking (partidas-e-ranking T55; PAR-79, PAR-80), a partir de `B:266-267` e do mockup t01 sucesso.
 * A cor de cada situação fica provada na comparação visual (T76); aqui, o nome acessível e a pista que não é só cor.
 */

afterEach(() => {
  cleanup();
});

const PARTIDAS = [
  { data: '2026-10-01', choveu: false },
  { data: '2026-10-08', choveu: true },
  { data: '2026-10-15', choveu: false },
];

const LINHAS: LinhaPublica[] = [
  {
    posicao: 1,
    apelido: 'Toninho',
    ptsInicial: 27,
    rodadas: [
      { situacao: 'presente', pontos: 1 },
      { situacao: 'presente', pontos: 2 },
      { situacao: 'presente', pontos: 1 },
    ],
    ptsFinal: 31,
  },
  {
    posicao: 2,
    apelido: 'Marcão',
    ptsInicial: 26,
    rodadas: [
      { situacao: 'lesionado', pontos: 1 },
      { situacao: 'falta', pontos: 0 },
      { situacao: 'expulso', pontos: -1 },
    ],
    ptsFinal: 26,
  },
  {
    posicao: 3,
    apelido: 'Serginho',
    ptsInicial: 0,
    rodadas: [
      { situacao: 'fora', pontos: null },
      { situacao: 'fora', pontos: null },
      { situacao: 'presente', pontos: 1 },
    ],
    ptsFinal: 1,
  },
];

const LEGENDA =
  'Ranking geral da Pelada de Quinta, com os pontos de cada partida de outubro de 2026';

function montar(linhas: LinhaPublica[] = LINHAS, partidas = PARTIDAS) {
  return render(<TabelaRanking partidas={partidas} linhas={linhas} legenda={LEGENDA} />);
}

function linhaDe(apelido: string): HTMLElement {
  const cabecalho = screen.getByRole('rowheader', { name: apelido });
  const linha = cabecalho.closest('tr');
  if (!linha) throw new Error(`linha de ${apelido} não encontrada`);
  return linha;
}

/** As células de rodada da linha, na ordem das partidas (sem #, Pts inicial e Pts final). */
function rodadasDe(apelido: string): HTMLElement[] {
  const celulas = within(linhaDe(apelido)).getAllByRole('cell');
  return celulas.slice(2, celulas.length - 1);
}

describe('TabelaRanking', () => {
  it('PAR-79: cabeçalho com "#", "Jogador", "Pts inicial", uma coluna "dd/mm" por partida e "Pts final"', () => {
    montar();
    const cabecalhos = screen.getAllByRole('columnheader').map((c) => c.textContent);
    expect(cabecalhos).toEqual([
      '#',
      'Jogador',
      'Pts inicial (antes das partidas do mês)',
      '01/10, sem chuva',
      '08/10, com chuva',
      '15/10, sem chuva',
      'Pts final (acumulado até hoje)',
    ]);
    expect(screen.getByRole('table', { name: LEGENDA })).toBeDefined();
  });

  it('PAR-79: coluna de partida com chuva tem o ícone de chuva e ", com chuva"; sem chuva, o de sol', () => {
    montar();
    const chuva = screen.getByRole('columnheader', { name: '08/10, com chuva' });
    expect(chuva.querySelector('svg[data-tempo="chuva"]')).not.toBeNull();
    expect(chuva.querySelector('svg[data-tempo="sol"]')).toBeNull();
    expect(chuva.querySelector('svg')?.getAttribute('class')).toContain('icone-tempo--chuva');

    const sol = screen.getByRole('columnheader', { name: '01/10, sem chuva' });
    expect(sol.querySelector('svg[data-tempo="sol"]')).not.toBeNull();
    expect(sol.querySelector('svg[data-tempo="chuva"]')).toBeNull();
    expect(sol.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('PAR-79: cada linha mostra posição, apelido, Pts inicial e Pts final', () => {
    montar();
    const celulas = within(linhaDe('Toninho'))
      .getAllByRole('cell')
      .map((c) => c.textContent);
    expect(celulas[0]).toBe('1');
    expect(celulas[1]).toBe('27');
    expect(celulas[celulas.length - 1]).toBe('31');
  });

  it('PAR-80: "Presente, 1 ponto", "Expulso, menos 1 ponto", "Falta, 0 pontos" e o "–" como nome acessível', () => {
    montar();
    expect(screen.getAllByRole('cell', { name: 'Presente, 1 ponto' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('cell', { name: 'Presente, 2 pontos' })).toBeDefined();
    expect(screen.getByRole('cell', { name: 'Lesionado, 1 ponto' })).toBeDefined();
    expect(screen.getByRole('cell', { name: 'Expulso, menos 1 ponto' })).toBeDefined();
    expect(screen.getByRole('cell', { name: 'Falta, 0 pontos' })).toBeDefined();
    expect(
      screen.getAllByRole('cell', { name: 'Fora do grupo ou antes da data de início' }),
    ).toHaveLength(2);
  });

  it('PAR-80: o número visível é o dos pontos, com "−1" no negativo e "–" no fora, e não entra no nome acessível', () => {
    montar();
    const [lesionado, falta, expulso] = rodadasDe('Marcão');
    expect(lesionado?.querySelector('[aria-hidden="true"]')?.textContent).toBe('1');
    expect(falta?.querySelector('[aria-hidden="true"]')?.textContent).toBe('0');
    expect(expulso?.querySelector('[aria-hidden="true"]')?.textContent).toBe('−1');
    const [fora] = rodadasDe('Serginho');
    expect(fora?.querySelector('[aria-hidden="true"]')?.textContent).toBe('–');
  });

  it('PAR-80: cada situação tem um marcador visual distinto que não é só cor (classe da marca do guia)', () => {
    montar();
    const classe = (celula: HTMLElement | undefined) =>
      celula?.querySelector('[class*="marca--"]')?.getAttribute('class') ?? '';
    const [lesionado, falta, expulso] = rodadasDe('Marcão');
    const [presente] = rodadasDe('Toninho');
    const [fora] = rodadasDe('Serginho');

    expect(classe(presente)).toContain('marca--p');
    expect(classe(lesionado)).toContain('marca--l');
    expect(classe(expulso)).toContain('marca--e');
    expect(classe(falta)).toContain('marca--f');
    expect(classe(fora)).toContain('marca--x');

    const marcadores = [presente, lesionado, expulso, falta, fora].map(
      (c) => classe(c).match(/marca--[plefx]/)?.[0],
    );
    expect(new Set(marcadores).size).toBe(5);
  });

  it('PAR-80: textoPontos usa o singular só para 1 e "menos" no negativo', () => {
    expect(textoPontos(1)).toBe('1 ponto');
    expect(textoPontos(0)).toBe('0 pontos');
    expect(textoPontos(2)).toBe('2 pontos');
    expect(textoPontos(-1)).toBe('menos 1 ponto');
    expect(textoPontos(-3)).toBe('menos 3 pontos');
  });

  it('PAR-79: a tabela rola de lado numa região rotulada e focável', () => {
    montar();
    const regiao = screen.getByRole('region', {
      name: 'Tabela do ranking (role para o lado para ver as partidas)',
    });
    expect(regiao.getAttribute('tabindex')).toBe('0');
  });

  it('PAR-79: axe sem violações', async () => {
    const { container } = montar();
    await esperarSemViolacoes(container);
  });
});
