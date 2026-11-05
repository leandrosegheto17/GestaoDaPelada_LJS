import { describe, expect, it } from 'vitest';
import { montarElenco, type Apto } from '../../src/simulador/base.ts';
import { montarVariosTimes } from '../../src/simulador/varios-inicial.ts';

/**
 * Times de 3 ou mais e solução inicial em vaivém (T10; SIM-33, SIM-34, SIM-35, SIM-37).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - Aptos múltiplo de N: sem incompleto. Resto 1: incompleto de 1, por último.
 * - O vaivém pula o incompleto já cheio e volta, sem passar da capacidade.
 * - Empate de nível: desfeito pelo id, independente da ordem da entrada.
 * - O pior nível não vai obrigatoriamente para o incompleto.
 * - Aptos insuficientes (≤ 2N) e acima de 60: lança.
 */

const DATA = '2026-10-22';

/** p01 (melhor) … pq (pior), níveis de 30 em 30. */
function aptos(quantos: number): Apto[] {
  return Array.from({ length: quantos }, (_, k) => ({
    id: `p${String(k + 1).padStart(2, '0')}`,
    apelido: `P${k + 1}`,
    nivel: 1000 - 30 * k,
    semNota: false,
    anoNascimento: 1990,
    so1oTempo: false,
  }));
}

const montar = (lista: readonly Apto[], n: number) =>
  montarVariosTimes(montarElenco(lista, DATA), n);

describe('montarVariosTimes', () => {
  it('SIM-34: 22 aptos, N = 4: 5 times de 4 e um incompleto de 2, por último', () => {
    const { times, incompleto } = montar(aptos(22), 4);
    expect(times.map((t) => t.length)).toEqual([4, 4, 4, 4, 4, 2]);
    expect(incompleto).toBe(5);
  });

  it('SIM-34: 20 aptos, N = 4: 5 times de 4, sem incompleto', () => {
    const { times, incompleto } = montar(aptos(20), 4);
    expect(times.map((t) => t.length)).toEqual([4, 4, 4, 4, 4]);
    expect(incompleto).toBeNull();
  });

  it('SIM-33: todos os aptos ficam em algum time, sem repetição', () => {
    const { times } = montar(aptos(22), 4);
    const todos = times.flat();
    expect(new Set(todos).size).toBe(22);
  });

  it('SIM-35: vaivém com capacidade: 10 aptos, N = 4 dão [p01 p06 p07 p10], [p02 p05 p08 p09], [p03 p04]', () => {
    const { times } = montar(aptos(10), 4);
    expect(times).toEqual([
      ['p01', 'p06', 'p07', 'p10'],
      ['p02', 'p05', 'p08', 'p09'],
      ['p03', 'p04'],
    ]);
  });

  it('SIM-35: o incompleto não recebe além de R', () => {
    const { times, incompleto } = montar(aptos(13), 4);
    expect(times[incompleto!]).toHaveLength(1);
  });

  it('SIM-37: o pior nível não vai obrigatoriamente para o incompleto', () => {
    const { times, incompleto } = montar(aptos(10), 4);
    expect(times[incompleto!]).not.toContain('p10');
  });

  it('SIM-37: cada time sai por nível (maior primeiro) e id; empate de nível pelo id', () => {
    const iguais = aptos(9).map((a) => ({ ...a, nivel: 500 }));
    const { times } = montar([...iguais].reverse(), 3);
    for (const t of times) expect([...t].sort()).toEqual(t);
  });

  it('SIM-33: a ordem da entrada não muda os times', () => {
    expect(montar([...aptos(22)].reverse(), 4)).toEqual(montar(aptos(22), 4));
  });

  it('SIM-34: aptos insuficientes (8 com N = 4) lança', () => {
    expect(() => montar(aptos(8), 4)).toThrow(RangeError);
  });

  it('SIM-34: mais de 60 aptos lança', () => {
    expect(() => montar(aptos(61), 4)).toThrow(RangeError);
  });
});
