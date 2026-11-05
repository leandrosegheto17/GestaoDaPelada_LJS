import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  listaDeDatas,
  PreviaPeriodos,
  textoAcumulado,
  textoPosicao,
  textoPreviaInicio,
  textoRodadas,
} from '../../src/componentes/PreviaPeriodos.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';

/** Textos das prévias de período (partidas-e-ranking T65; PAR-117, PAR-118, PAR-119), a partir de `B:356-358`. */

afterEach(() => {
  cleanup();
});

const DATAS_7 = ['2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24', '2026-10-01', '2026-10-08', '2026-10-15'];

describe('PAR-117: acumulado e posição', () => {
  it('PAR-117: acumulado que muda e que não muda', () => {
    expect(textoAcumulado(18, 24)).toBe('Acumulado de 18 pontos passa a 24.');
    expect(textoAcumulado(18, 18)).toBe('Acumulado de 18 pontos não muda.');
    expect(textoAcumulado(1, 1)).toBe('Acumulado de 1 ponto não muda.');
  });

  it('PAR-117: posição nula antes e 3 depois dá "Passa a aparecer no ranking, na posição 3."; o inverso, "Sai do ranking (hoje está na posição N)."', () => {
    expect(textoPosicao(null, 3)).toBe('Passa a aparecer no ranking, na posição 3.');
    expect(textoPosicao(4, null)).toBe('Sai do ranking (hoje está na posição 4).');
  });

  it('PAR-117: posição que muda e que não muda', () => {
    expect(textoPosicao(5, 3)).toBe('Posição de 5 para 3.');
    expect(textoPosicao(5, 5)).toBe('Posição 5, não muda.');
  });
});

describe('PAR-118: rodadas', () => {
  it('PAR-118: singular, plural e "deixam de constar"', () => {
    expect(textoRodadas(['2026-10-15'], 'passam')).toBe('1 rodada passa a constar: 15/10.');
    expect(textoRodadas(['2026-10-08', '2026-10-15'], 'passam')).toBe('2 rodadas passam a constar: 08/10 e 15/10.');
    expect(textoRodadas(['2026-10-08', '2026-10-15'], 'deixam')).toBe('2 rodadas deixam de constar: 08/10 e 15/10.');
    expect(textoRodadas(['2026-10-15'], 'passaram')).toBe('1 rodada passou a constar: 15/10.');
    expect(textoRodadas([], 'passam')).toBe('');
  });

  it('PAR-118: 7 datas mostram 5 e "e mais 2"; 3 datas, com vírgula e "e"', () => {
    expect(listaDeDatas(DATAS_7)).toBe('03/09, 10/09, 17/09, 24/09, 01/10 e mais 2');
    expect(listaDeDatas(DATAS_7.slice(0, 5))).toBe('03/09, 10/09, 17/09, 24/09 e 01/10');
    expect(listaDeDatas(DATAS_7.slice(0, 3))).toBe('03/09, 10/09 e 17/09');
    expect(textoRodadas(DATAS_7, 'passam')).toBe('7 rodadas passam a constar: 03/09, 10/09, 17/09, 24/09, 01/10 e mais 2.');
  });

  it('PAR-118: o aviso fica dentro do elemento .faixa--atencao; sem aviso, nenhuma faixa', async () => {
    const aviso = 'Elas valem 0 ponto até você lançar a presença em Editar partida.';
    const { container } = render(
      <PreviaPeriodos
        previa={{
          acumuladoAntes: 18,
          acumuladoDepois: 18,
          posicaoAntes: null,
          posicaoDepois: 15,
          rodadasQuePassamAConstar: [
            { data: '2026-10-08', situacao: 'falta' },
            { data: '2026-10-15', situacao: 'falta' },
          ],
          rodadasQueDeixamDeConstar: [],
          aviso,
        }}
      />,
    );
    expect(screen.getByText('Acumulado de 18 pontos não muda. Passa a aparecer no ranking, na posição 15.')).toBeDefined();
    expect(screen.getByText('2 rodadas passam a constar: 08/10 e 15/10.')).toBeDefined();
    const faixa = container.querySelector('.faixa--atencao');
    expect(faixa).not.toBeNull();
    expect(faixa?.textContent).toContain(aviso);
    await esperarSemViolacoes(container);
    cleanup();

    const sem = render(
      <PreviaPeriodos
        previa={{
          acumuladoAntes: 18,
          acumuladoDepois: 20,
          posicaoAntes: 5,
          posicaoDepois: 4,
          rodadasQuePassamAConstar: [{ data: '2026-10-15', situacao: 'presente' }],
          rodadasQueDeixamDeConstar: [{ data: '2026-10-01' }],
          aviso: null,
        }}
      />,
    );
    expect(sem.container.querySelector('.faixa--atencao')).toBeNull();
    expect(screen.getByText('1 rodada deixa de constar: 01/10.')).toBeDefined();
  });
});

describe('PAR-119: prévia de início', () => {
  it('PAR-119: com tudo, a frase inteira', () => {
    expect(textoPreviaInicio({ acumuladoAntes: 18, acumuladoDepois: 24, posicaoAntes: 5, posicaoDepois: 3, rodadasQuePassamAConstar: 2 })).toBe(
      'Acumulado de 18 pontos passa a 24; posição de 5 para 3. 2 rodadas passam a constar.',
    );
  });

  it('PAR-119: prévia de início omite as partes que não se aplicam', () => {
    // Sem rodadas (avançar a data).
    expect(textoPreviaInicio({ acumuladoAntes: 18, acumuladoDepois: 11, posicaoAntes: 5, posicaoDepois: 7, rodadasQuePassamAConstar: 0 })).toBe(
      'Acumulado de 18 pontos passa a 11; posição de 5 para 7.',
    );
    // Posição igual.
    expect(textoPreviaInicio({ acumuladoAntes: 18, acumuladoDepois: 19, posicaoAntes: 5, posicaoDepois: 5, rodadasQuePassamAConstar: 1 })).toBe(
      'Acumulado de 18 pontos passa a 19. 1 rodada passa a constar.',
    );
    // Só as rodadas (recuo sem presença lançada, PAR-111).
    expect(textoPreviaInicio({ acumuladoAntes: 18, acumuladoDepois: 18, posicaoAntes: 5, posicaoDepois: 5, rodadasQuePassamAConstar: 3 })).toBe(
      '3 rodadas passam a constar.',
    );
    // Só a posição.
    expect(textoPreviaInicio({ acumuladoAntes: 18, acumuladoDepois: 18, posicaoAntes: 5, posicaoDepois: 4, rodadasQuePassamAConstar: 0 })).toBe(
      'Posição de 5 para 4.',
    );
  });
});
