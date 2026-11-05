import { describe, expect, it } from 'vitest';
import { descreverPrevia } from '../../src/simulador/descricao.ts';
import { calcularPrevia } from '../../src/simulador/previa.ts';

/**
 * Descrição da prévia (T4; SIM-10 a SIM-13).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - Reservas: 0 (sem sufixo), 1 (singular), mais de 1 (plural).
 * - 2 times inválida com e sem maior N possível.
 * - 3 ou mais válida com e sem incompleto.
 * - 3 ou mais inválida: as duas saídas, só N menor, só 2 times, nenhuma (o par "N menor sem 2 times" não acontece:
 *   N sugerido ≥ 2 exige 5 aptos ou mais, e com 4 já há 2 times; o texto cobre o caso do mesmo jeito).
 */

const dois = (n: number, aptos: number): string => descreverPrevia(calcularPrevia({ formato: 'dois_times', n, aptos }));
const varios = (n: number, aptos: number): string =>
  descreverPrevia(calcularPrevia({ formato: 'varios_times', n, aptos }));

describe('descreverPrevia em 2 times', () => {
  it('SIM-10: "2 times de 7 · 5 reservas"', () => {
    expect(dois(7, 19)).toBe('2 times de 7 · 5 reservas');
  });

  it('SIM-10: "2 times de 7 · 1 reserva" no singular', () => {
    expect(dois(7, 15)).toBe('2 times de 7 · 1 reserva');
  });

  it('SIM-10: "2 times de 7" sem reservas', () => {
    expect(dois(7, 14)).toBe('2 times de 7');
  });

  it('SIM-11: "Faltam aptos para 2 times de 11. Maior N possível: 9."', () => {
    expect(dois(11, 19)).toBe('Faltam aptos para 2 times de 11. Maior N possível: 9.');
  });

  it('SIM-11: "Faltam aptos para 2 times." sem N possível', () => {
    expect(dois(7, 3)).toBe('Faltam aptos para 2 times.');
  });
});

describe('descreverPrevia em 3 ou mais times', () => {
  it('SIM-12: "4 times de 4 + 1 time incompleto de 2"', () => {
    expect(varios(4, 18)).toBe('4 times de 4 + 1 time incompleto de 2');
  });

  it('SIM-12: "5 times de 4" sem incompleto', () => {
    expect(varios(4, 20)).toBe('5 times de 4');
  });

  it('SIM-13: N menor e 2 times: "Use N menor ou o formato 2 times."', () => {
    expect(varios(4, 8)).toBe('Com 8 aptos e N = 4 não há 3 times. Use N menor ou o formato 2 times.');
  });

  it('SIM-13: só 2 times: "Use o formato 2 times."', () => {
    expect(varios(2, 4)).toBe('Com 4 aptos e N = 2 não há 3 times. Use o formato 2 times.');
  });

  it('SIM-13: nenhuma saída: só a primeira frase', () => {
    expect(varios(4, 3)).toBe('Com 3 aptos e N = 4 não há 3 times.');
  });

  it('SIM-13: só N menor: "Use N menor."', () => {
    expect(
      descreverPrevia({
        formato: 'varios_times',
        valida: false,
        n: 4,
        aptos: 6,
        nSugerido: 2,
        doisTimesPossivel: false,
      }),
    ).toBe('Com 6 aptos e N = 4 não há 3 times. Use N menor.');
  });
});
