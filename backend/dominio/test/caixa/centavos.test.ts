import { describe, expect, it } from 'vitest';
import {
  ErroCentavosNaoInteiro,
  ErroEstouroCentavos,
  somarCentavos,
  subtrairCentavos,
} from '../../src/caixa/centavos.ts';

/** Soma em centavos inteiros, sem arredondar e sem estouro silencioso (T1; FIN-13). */

describe('somarCentavos', () => {
  it('FIN-13: 200 entradas de 99.999.999 somam o valor exato, acima do teto do cliente', () => {
    const valores = Array<number>(200).fill(99_999_999);
    expect(somarCentavos(valores)).toBe(19_999_999_800);
  });

  it('FIN-13: lista vazia soma zero', () => {
    expect(somarCentavos([])).toBe(0);
  });

  it('FIN-13: valores negativos entram na soma', () => {
    expect(somarCentavos([-35_000, 7_500, 7_500])).toBe(-20_000);
  });

  it('FIN-13: soma que passa de MAX_SAFE_INTEGER lança, sem devolver valor truncado', () => {
    expect(() => somarCentavos([Number.MAX_SAFE_INTEGER, 1])).toThrow(ErroEstouroCentavos);
    expect(() => somarCentavos([Number.MIN_SAFE_INTEGER, -1])).toThrow(ErroEstouroCentavos);
  });

  it('FIN-13: estouro no meio da soma lança mesmo que o fim voltasse para a faixa', () => {
    expect(() => somarCentavos([Number.MAX_SAFE_INTEGER, 1, -1])).toThrow(ErroEstouroCentavos);
  });

  it('FIN-13: valor não inteiro lança', () => {
    expect(() => somarCentavos([100, 1.5])).toThrow(ErroCentavosNaoInteiro);
    expect(() => somarCentavos([Number.NaN])).toThrow(ErroCentavosNaoInteiro);
    expect(() => somarCentavos([Number.POSITIVE_INFINITY])).toThrow(ErroCentavosNaoInteiro);
  });

  it('FIN-13: valor fora do inteiro seguro na entrada lança', () => {
    expect(() => somarCentavos([Number.MAX_SAFE_INTEGER + 1])).toThrow(ErroCentavosNaoInteiro);
  });
});

describe('subtrairCentavos', () => {
  it('FIN-13: subtrai em inteiros e aceita resultado negativo', () => {
    expect(subtrairCentavos(120_000, 90_000)).toBe(30_000);
    expect(subtrairCentavos(0, 80_000)).toBe(-80_000);
  });

  it('FIN-13: resultado fora do inteiro seguro lança', () => {
    expect(() => subtrairCentavos(Number.MIN_SAFE_INTEGER, 1)).toThrow(ErroEstouroCentavos);
    expect(() => subtrairCentavos(Number.MAX_SAFE_INTEGER, -1)).toThrow(ErroEstouroCentavos);
  });

  it('FIN-13: operando não inteiro lança', () => {
    expect(() => subtrairCentavos(10, 0.1)).toThrow(ErroCentavosNaoInteiro);
    expect(() => subtrairCentavos(0.5, 0)).toThrow(ErroCentavosNaoInteiro);
  });
});
