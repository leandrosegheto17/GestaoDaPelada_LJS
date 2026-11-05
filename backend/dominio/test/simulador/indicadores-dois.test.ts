import { describe, expect, it } from 'vitest';
import { montarElenco, type Apto } from '../../src/simulador/base.ts';
import type { ComposicaoDois } from '../../src/simulador/chave-dois.ts';
import { indicadoresDoisTimes, indicadoresDoTime } from '../../src/simulador/indicadores-dois.ts';

/**
 * Indicadores de 2 times (T12; SIM-39, SIM-95).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - 2º tempo: quem sai deixa a soma, quem entra soma; "só 1º" sem reserva sai e o time joga com menos.
 * - Ninguém no 2º tempo: nível médio do 2º tempo nulo.
 * - Composição ajustada fora da ordem de prioridade: titulares e quem entra são reordenados antes de derivar quem sai.
 * - Idade média só com quem tem ano; ninguém com ano dá nula.
 * - Médias inteiras com meio para cima.
 */

const DATA = '2026-10-22';

function apto(
  id: string,
  nivel: number,
  anoNascimento: number | null = 1990,
  so1oTempo = false,
): Apto {
  return { id, apelido: id.toUpperCase(), nivel, semNota: false, anoNascimento, so1oTempo };
}

const ELENCO = montarElenco(
  [
    apto('t1', 700),
    apto('t2', 650, null),
    apto('t3', 600, 1996, true),
    apto('t4', 500),
    apto('r1', 550, 1986),
    apto('r2', 450, null),
  ],
  DATA,
);
const POSICOES = new Map(['t1', 't2', 't3', 't4', 'r1', 'r2'].map((id, i) => [id, i]));

describe('indicadoresDoTime', () => {
  it('SIM-39: no 2º tempo, quem sai no intervalo deixa a soma e quem entra é somado', () => {
    // Titulares t1, t2, t3 ("só 1º"), t4; entram r1 e r2: saem t3 e t4 (o pior); pares t3 → r1, t4 → r2.
    const ind = indicadoresDoTime(
      { titulares: ['t1', 't2', 't3', 't4'], entram: ['r1', 'r2'] },
      ELENCO,
      POSICOES,
    );
    expect(ind.saem).toEqual(['t3', 't4']);
    expect(ind.nivelSoma1oTempo).toBe(700 + 650 + 600 + 500);
    expect(ind.nivelSoma2oTempo).toBe(700 + 650 + 550 + 450);
    expect(ind.jogadores1oTempo).toBe(4);
    expect(ind.jogadores2oTempo).toBe(4);
    expect(ind.nivelMedio1oTempo).toBe(613); // 2450 / 4 = 612,5 → 613
    expect(ind.nivelMedio2oTempo).toBe(588); // 2350 / 4 = 587,5 → 588
    expect(ind.pares).toEqual([
      { sai: 't3', entra: 'r1' },
      { sai: 't4', entra: 'r2' },
    ]);
    expect(ind.substituicoes).toBe(2);
    expect(ind.saiSemPar).toEqual([]);
    expect(ind.entraSemPar).toEqual([]);
  });

  it('SIM-39: "só 1º" sem reserva sai e o time joga o 2º tempo com menos', () => {
    const ind = indicadoresDoTime({ titulares: ['t1', 't3'], entram: [] }, ELENCO, POSICOES);
    expect(ind.saem).toEqual(['t3']);
    expect(ind.jogadores2oTempo).toBe(1);
    expect(ind.saiSemPar).toEqual(['t3']);
    expect(ind.substituicoes).toBe(0);
  });

  it('SIM-39: time sem ninguém no 2º tempo tem nível médio nulo', () => {
    const elenco = montarElenco([apto('a', 600, 1990, true), apto('b', 500, 1990, true)], DATA);
    const ind = indicadoresDoTime(
      { titulares: ['a', 'b'], entram: [] },
      elenco,
      new Map([
        ['a', 0],
        ['b', 1],
      ]),
    );
    expect(ind.jogadores2oTempo).toBe(0);
    expect(ind.nivelSoma2oTempo).toBe(0);
    expect(ind.nivelMedio2oTempo).toBeNull();
  });

  it('SIM-39: composição ajustada fora de ordem é reordenada pela prioridade antes de derivar quem sai', () => {
    const ind = indicadoresDoTime(
      { titulares: ['t4', 't1', 't2'], entram: ['r1'] },
      ELENCO,
      POSICOES,
    );
    expect(ind.saem).toEqual(['t4']);
  });

  it('SIM-95: idade média ignora quem não tem ano', () => {
    // Titulares t1 (36), t2 (sem ano), t3 (30), t4 (36) e entram r1 (40), r2 (sem ano): (36 + 30 + 36 + 40) / 4.
    const ind = indicadoresDoTime(
      { titulares: ['t1', 't2', 't3', 't4'], entram: ['r1', 'r2'] },
      ELENCO,
      POSICOES,
    );
    expect(ind.idadeMedia).toBe(3550);
  });

  it('SIM-95: ninguém com ano dá idade média nula', () => {
    const ind = indicadoresDoTime({ titulares: ['t2'], entram: ['r2'] }, ELENCO, POSICOES);
    expect(ind.idadeMedia).toBeNull();
  });
});

describe('indicadoresDoisTimes', () => {
  it('SIM-39: devolve um bloco por time, na ordem da composição', () => {
    const composicao: ComposicaoDois = {
      times: [
        { titulares: ['t1', 't4'], entram: ['r1'] },
        { titulares: ['t2', 't3'], entram: ['r2'] },
      ],
      naoEntra: [],
    };
    const [a, b] = indicadoresDoisTimes(composicao, ELENCO, POSICOES);
    expect(a.nivelSoma1oTempo).toBe(1200);
    expect(b.nivelSoma1oTempo).toBe(1250);
  });
});
