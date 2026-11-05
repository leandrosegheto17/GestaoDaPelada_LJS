import { describe, expect, it } from 'vitest';
import { montarElenco, type Apto } from '../../src/simulador/base.ts';
import { indicadoresVariosTimes } from '../../src/simulador/indicadores-varios.ts';

/** Indicadores de 3 ou mais times (T13; SIM-40, SIM-95). */

const DATA = '2026-10-22';

function apto(id: string, nivel: number, anoNascimento: number | null): Apto {
  return { id, apelido: id, nivel, semNota: false, anoNascimento, so1oTempo: false };
}

const ELENCO = montarElenco(
  [
    apto('a', 600, 1990),
    apto('b', 650, 1986),
    apto('c', 700, null),
    apto('d', 683, 1996),
    apto('e', 550, null),
    apto('f', 500, null),
  ],
  DATA,
);

describe('indicadoresVariosTimes', () => {
  it('SIM-40: time de 4 com níveis 600, 650, 700, 683: soma 2633, média 658', () => {
    const [time] = indicadoresVariosTimes([['a', 'b', 'c', 'd']], ELENCO);
    expect(time).toMatchObject({ jogadores: 4, nivelSoma: 2633, nivelMedio: 658 });
  });

  it('SIM-95: a idade média usa só quem tem ano (36, 40 e 30)', () => {
    const [time] = indicadoresVariosTimes([['a', 'b', 'c', 'd']], ELENCO);
    expect(time?.idadeMedia).toBe(3533); // 106 / 3 = 35,33…
  });

  it('SIM-95: time só com jogadores sem ano tem idade média nula', () => {
    const [time] = indicadoresVariosTimes([['e', 'f']], ELENCO);
    expect(time).toMatchObject({ jogadores: 2, nivelSoma: 1050, nivelMedio: 525, idadeMedia: null });
  });

  it('SIM-40: um bloco por time, na ordem recebida', () => {
    const blocos = indicadoresVariosTimes([['e', 'f'], ['a', 'b', 'c', 'd']], ELENCO);
    expect(blocos.map((b) => b.jogadores)).toEqual([2, 4]);
  });
});
