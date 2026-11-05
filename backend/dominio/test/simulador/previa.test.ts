import { describe, expect, it } from 'vitest';
import { calcularPrevia } from '../../src/simulador/previa.ts';

/**
 * Prévia em números (T3; SIM-09 a SIM-13).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - 2 times: exatamente 2N aptos (válida, 0 reservas); 2N − 1 (inválida); aptos que dão N possível < 2 (nulo); 0 aptos.
 * - 3 ou mais: exatamente 2N aptos (inválida: precisa de mais que 2N); 2N + 1 (válida, 2 completos e incompleto de 1);
 *   múltiplo de N (sem incompleto); 4 aptos (2 times possíveis, N sugerido 1 → nulo); 3 aptos (nada possível).
 */

describe('calcularPrevia em 2 times', () => {
  it('SIM-10: 19 aptos, N = 7: válida com 5 reservas', () => {
    expect(calcularPrevia({ formato: 'dois_times', n: 7, aptos: 19 })).toEqual({
      formato: 'dois_times',
      valida: true,
      n: 7,
      aptos: 19,
      reservas: 5,
    });
  });

  it('SIM-10: 14 aptos, N = 7: válida com 0 reservas', () => {
    expect(calcularPrevia({ formato: 'dois_times', n: 7, aptos: 14 })).toMatchObject({ valida: true, reservas: 0 });
  });

  it('SIM-11: 19 aptos, N = 11: inválida com maior N possível 9', () => {
    expect(calcularPrevia({ formato: 'dois_times', n: 11, aptos: 19 })).toEqual({
      formato: 'dois_times',
      valida: false,
      n: 11,
      aptos: 19,
      maiorNPossivel: 9,
    });
  });

  it('SIM-11: 13 aptos, N = 7 (2N − 1): inválida com maior N 6', () => {
    expect(calcularPrevia({ formato: 'dois_times', n: 7, aptos: 13 })).toMatchObject({ valida: false, maiorNPossivel: 6 });
  });

  it.each([3, 1, 0])('SIM-11: %i aptos: maior N possível nulo', (aptos) => {
    expect(calcularPrevia({ formato: 'dois_times', n: 7, aptos })).toMatchObject({ valida: false, maiorNPossivel: null });
  });
});

describe('calcularPrevia em 3 ou mais times', () => {
  it('SIM-12: 18 aptos, N = 4: 4 completos e incompleto de 2', () => {
    expect(calcularPrevia({ formato: 'varios_times', n: 4, aptos: 18 })).toEqual({
      formato: 'varios_times',
      valida: true,
      n: 4,
      aptos: 18,
      times: 5,
      timesCompletos: 4,
      tamanhoIncompleto: 2,
    });
  });

  it('SIM-12: 20 aptos, N = 4: 5 completos, sem incompleto', () => {
    expect(calcularPrevia({ formato: 'varios_times', n: 4, aptos: 20 })).toMatchObject({
      valida: true,
      times: 5,
      timesCompletos: 5,
      tamanhoIncompleto: 0,
    });
  });

  it('SIM-12: 9 aptos, N = 4 (2N + 1): 2 completos e incompleto de 1', () => {
    expect(calcularPrevia({ formato: 'varios_times', n: 4, aptos: 9 })).toMatchObject({
      valida: true,
      times: 3,
      timesCompletos: 2,
      tamanhoIncompleto: 1,
    });
  });

  it('SIM-13: 8 aptos, N = 4: inválida, N sugerido 3 e 2 times possível', () => {
    expect(calcularPrevia({ formato: 'varios_times', n: 4, aptos: 8 })).toEqual({
      formato: 'varios_times',
      valida: false,
      n: 4,
      aptos: 8,
      nSugerido: 3,
      doisTimesPossivel: true,
    });
  });

  it('SIM-13: 4 aptos, N = 2: N sugerido nulo e 2 times possível', () => {
    expect(calcularPrevia({ formato: 'varios_times', n: 2, aptos: 4 })).toMatchObject({
      valida: false,
      nSugerido: null,
      doisTimesPossivel: true,
    });
  });

  it('SIM-13: 3 aptos: N sugerido nulo e 2 times impossível', () => {
    expect(calcularPrevia({ formato: 'varios_times', n: 4, aptos: 3 })).toMatchObject({
      valida: false,
      nSugerido: null,
      doisTimesPossivel: false,
    });
  });
});
