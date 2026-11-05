import { describe, expect, it } from 'vitest';
import { montarElenco, type Apto } from '../../src/simulador/base.ts';
import {
  chaveDoisTimes,
  elencoDois,
  menorChave,
  type TimeIdx,
} from '../../src/simulador/chave-dois.ts';

/**
 * Chave de comparação de 2 times (T8; SIM-29, SIM-30, SIM-51, SIM-95).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - Time sem N titulares perde de qualquer composição com N, mesmo com nível muito melhor (critério 1 antes do 3).
 * - Substituições 3 × 1 perdem de 2 × 2 antes do nível (critério 2 antes do 3); 2 × 1 não conta excesso.
 * - Titular "só 1º" sai e não soma no 2º tempo.
 * - Sem ano: fica fora da idade média; time sem ninguém com ano tem idade nula e o critério (4) vale 0, sem lançar.
 * - Todos os termos são inteiros.
 */

const DATA = '2026-10-22';

function apto(
  id: string,
  nivel: number,
  anoNascimento: number | null = null,
  so1oTempo = false,
): Apto {
  return { id, apelido: id, nivel, semNota: false, anoNascimento, so1oTempo };
}

function montar(aptos: readonly Apto[]) {
  return elencoDois(
    aptos.map((a) => a.id),
    montarElenco(aptos, DATA),
  );
}

const time = (titulares: number[], entram: number[] = []): TimeIdx => ({ titulares, entram });

describe('chaveDoisTimes', () => {
  it('SIM-29: composição com time sem N titulares perde de outra com N, mesmo com nível pior', () => {
    const e = montar([apto('a', 1000), apto('b', 100), apto('c', 100), apto('d', 1000)]);
    const semN = chaveDoisTimes([time([0]), time([1, 2, 3])], 2, e);
    const comN = chaveDoisTimes([time([0, 3]), time([1, 2])], 2, e);
    expect(semN[0]).toBe(2);
    expect(comN[0]).toBe(0);
    expect(semN[2]).toBeLessThan(comN[2]);
    expect(menorChave(comN, semN)).toBe(true);
  });

  it('SIM-30: substituições 3 × 1 perdem de 2 × 2 antes de olhar o nível', () => {
    // 6 titulares de 500 e 4 reservas: r6 = 900, r7 a r9 = 100.
    const e = montar([
      ...Array.from({ length: 6 }, (_, i) => apto(`t${i}`, 500)),
      apto('r6', 900),
      apto('r7', 100),
      apto('r8', 100),
      apto('r9', 100),
    ]);
    const tresUm = chaveDoisTimes([time([0, 1, 2], [6, 8, 9]), time([3, 4, 5], [7])], 3, e);
    const doisDois = chaveDoisTimes([time([0, 1, 2], [6, 7]), time([3, 4, 5], [8, 9])], 3, e);
    expect(tresUm.slice(0, 3)).toEqual([0, 1, 0]);
    expect(doisDois.slice(0, 3)).toEqual([0, 0, 800]);
    expect(menorChave(doisDois, tresUm)).toBe(true);
  });

  it('SIM-30: diferença de 1 substituição não conta como excesso', () => {
    const e = montar([...Array.from({ length: 4 }, (_, i) => apto(`t${i}`, 500)), apto('r4', 500)]);
    expect(chaveDoisTimes([time([0, 1], [4]), time([2, 3])], 2, e)[1]).toBe(0);
  });

  it('SIM-29: titular "só 1º" sai e não soma no 2º tempo', () => {
    const e = montar([apto('a', 800, null, true), apto('b', 500), apto('c', 500), apto('d', 500)]);
    // A: 1º = 1300, 2º = 500 (sai o "só 1º"); B: 1000 e 1000.
    expect(chaveDoisTimes([time([0, 1]), time([2, 3])], 2, e)[2]).toBe(300 + 500);
  });

  it('SIM-95: jogador sem ano não entra na idade média', () => {
    // A: 36 e sem ano → 3600; B: 30 e 30 → 3000. Se o sem ano contasse como 0, A daria 1800.
    const e = montar([
      apto('a', 500, 1990),
      apto('b', 500, null),
      apto('c', 500, 1996),
      apto('d', 500, 1996),
    ]);
    expect(chaveDoisTimes([time([0, 1]), time([2, 3])], 2, e)[3]).toBe(600);
  });

  it('SIM-95: time sem ninguém com ano tem idade nula e o critério (4) vale 0, sem lançar', () => {
    const e = montar([
      apto('a', 500, null),
      apto('b', 500, null),
      apto('c', 500, 1996),
      apto('d', 500, 1990),
    ]);
    expect(() => chaveDoisTimes([time([0, 1]), time([2, 3])], 2, e)).not.toThrow();
    expect(chaveDoisTimes([time([0, 1]), time([2, 3])], 2, e)[3]).toBe(0);
  });

  it('SIM-51: a chave só tem inteiros', () => {
    const e = montar([
      apto('a', 683, 1990),
      apto('b', 551, 1987),
      apto('c', 700, 2001),
      apto('d', 612, null),
      apto('e', 599, 1979),
    ]);
    const chave = chaveDoisTimes([time([0, 3], [4]), time([1, 2])], 2, e);
    expect(chave.every((termo) => Number.isInteger(termo))).toBe(true);
  });
});
