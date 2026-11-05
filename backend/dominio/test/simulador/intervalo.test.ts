import { describe, expect, it } from 'vitest';
import type { AptoOrdenado } from '../../src/simulador/classificacao.ts';
import { formarPares, saidaNoIntervalo } from '../../src/simulador/intervalo.ts';

/**
 * Saída no intervalo e pares (T7; SIM-24, SIM-25, SIM-89, SIM-90).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - Sem "só 1º" e sem reservas: ninguém sai.
 * - Só reservas: saem os piores, do pior para o melhor.
 * - "Só 1º" sem reserva (inclusive K = 0): sai mesmo assim, sem par.
 * - "Só 1º" junto com reservas: o "só 1º" conta como uma das saídas; completa com os piores.
 * - Mais reservas que titulares: saem todos os titulares, e sobra quem entra sem par.
 * - Pares: mais saídas que entradas, mais entradas que saídas, iguais, nenhuma.
 */

/** Titulares t1 (melhor) … tq (pior), com os "só 1º" marcados. */
function titulares(quantos: number, so1o: readonly number[] = []): AptoOrdenado[] {
  return Array.from({ length: quantos }, (_, i) => ({
    id: `t${i + 1}`,
    so1oTempo: so1o.includes(i + 1),
  }));
}

describe('saidaNoIntervalo', () => {
  it('SIM-24: com 2 reservas e um titular "só 1º", sai ele e o titular de pior prioridade', () => {
    expect(saidaNoIntervalo(titulares(7, [3]), 2)).toEqual(['t3', 't7']);
  });

  it('SIM-24: só reservas: saem os piores, do pior para o melhor', () => {
    expect(saidaNoIntervalo(titulares(7), 3)).toEqual(['t7', 't6', 't5']);
  });

  it('SIM-24: o pior "só 1º" não é contado duas vezes', () => {
    expect(saidaNoIntervalo(titulares(7, [7]), 2)).toEqual(['t7', 't6']);
  });

  it('SIM-90: titular "só 1º" sem reserva sai mesmo assim', () => {
    expect(saidaNoIntervalo(titulares(7, [2]), 0)).toEqual(['t2']);
  });

  it('SIM-89: K = 0: só os "só 1º" saem, na ordem de prioridade', () => {
    expect(saidaNoIntervalo(titulares(7, [5, 2]), 0)).toEqual(['t2', 't5']);
  });

  it('SIM-24: sem "só 1º" e sem reservas, ninguém sai', () => {
    expect(saidaNoIntervalo(titulares(7), 0)).toEqual([]);
  });

  it('SIM-24: mais reservas que titulares: saem todos os titulares', () => {
    expect(saidaNoIntervalo(titulares(2), 5)).toEqual(['t2', 't1']);
  });
});

describe('formarPares', () => {
  it('SIM-25: 3 saem e 2 entram: 2 pares na ordem e 1 sai sem par', () => {
    expect(formarPares(['t3', 't7', 't6'], ['r1', 'r2'])).toEqual({
      pares: [
        { sai: 't3', entra: 'r1' },
        { sai: 't7', entra: 'r2' },
      ],
      saiSemPar: ['t6'],
      entraSemPar: [],
    });
  });

  it('SIM-25: 1 sai e 2 entram: 1 par e 1 entra sem par', () => {
    expect(formarPares(['t7'], ['r1', 'r2'])).toEqual({
      pares: [{ sai: 't7', entra: 'r1' }],
      saiSemPar: [],
      entraSemPar: ['r2'],
    });
  });

  it('SIM-90: "só 1º" sem reserva fica em "sai sem par"', () => {
    expect(formarPares(saidaNoIntervalo(titulares(7, [2]), 0), [])).toEqual({
      pares: [],
      saiSemPar: ['t2'],
      entraSemPar: [],
    });
  });

  it('SIM-25: ninguém sai nem entra', () => {
    expect(formarPares([], [])).toEqual({ pares: [], saiSemPar: [], entraSemPar: [] });
  });
});
