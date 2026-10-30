// Critérios: GEL-101 (média × 100 com meio para cima), GEL-102 (sem nota: 550 e semNota), GEL-104 (função pura).
import { describe, expect, it } from 'vitest';
import { calcularNivel, NIVEL_SEM_NOTA } from '../../src/index.ts';

describe('calcularNivel (GEL-101)', () => {
  it('8, 7, 6, 7, 8, 5 → 683', () => {
    expect(calcularNivel([8, 7, 6, 7, 8, 5])).toEqual({ nivel: 683, semNota: false });
  });

  it('meio para cima: média 6,845 → 685 (sem erro de ponto flutuante)', () => {
    // 169 notas 7 e 31 notas 6: soma 1369 em 200 notas, média 6,845 e × 100 = 684,5.
    const notas = [...Array<number>(169).fill(7), ...Array<number>(31).fill(6)];
    expect(calcularNivel(notas)).toEqual({ nivel: 685, semNota: false });
  });

  it('meio para cima onde a média em ponto flutuante erraria: soma 169 em 40 notas → 422,5 → 423', () => {
    // 169 / 40 × 100 em ponto flutuante dá 422,49999…; a conta em inteiros dá o meio exato.
    const notas = [...Array<number>(9).fill(5), ...Array<number>(31).fill(4)];
    expect(calcularNivel(notas)).toEqual({ nivel: 423, semNota: false });
  });

  it('meio para cima em 8 notas: 7 × 7 e um 6 → 687,5 → 688', () => {
    expect(calcularNivel([7, 7, 7, 7, 7, 7, 7, 6])).toEqual({ nivel: 688, semNota: false });
  });

  it('abaixo do meio arredonda para baixo: 7, 7, 6 → 666,67 → 667; 7, 6, 6 → 633,33 → 633', () => {
    expect(calcularNivel([7, 7, 6]).nivel).toBe(667);
    expect(calcularNivel([7, 6, 6]).nivel).toBe(633);
  });

  it('uma única nota: 10 → 1000 e 1 → 100', () => {
    expect(calcularNivel([10])).toEqual({ nivel: 1000, semNota: false });
    expect(calcularNivel([1])).toEqual({ nivel: 100, semNota: false });
  });

  it('todas iguais dão a própria nota × 100', () => {
    expect(calcularNivel([5, 5, 5, 5, 5, 5])).toEqual({ nivel: 500, semNota: false });
    expect(calcularNivel([9, 9])).toEqual({ nivel: 900, semNota: false });
  });

  it('não altera a lista recebida', () => {
    const notas = Object.freeze([8, 7]);
    expect(calcularNivel(notas).nivel).toBe(750);
    expect(notas).toEqual([8, 7]);
  });
});

describe('calcularNivel sem nota (GEL-102)', () => {
  it('lista vazia → { nivel: 550, semNota: true }', () => {
    expect(calcularNivel([])).toEqual({ nivel: 550, semNota: true });
    expect(NIVEL_SEM_NOTA).toBe(550);
  });
});
