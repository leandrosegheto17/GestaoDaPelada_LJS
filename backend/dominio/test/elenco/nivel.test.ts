import { describe, expect, it } from 'vitest';
import {
  anoNascimentoMaximo,
  calcularNivel,
  HABILIDADES_INICIAIS,
} from '../../src/elenco/nivel.ts';

describe('calcularNivel', () => {
  it('GEL-101: 8, 7, 6, 7, 8, 5 → 683', () => {
    expect(calcularNivel([8, 7, 6, 7, 8, 5])).toEqual({ nivel: 683, semNota: false });
  });

  it('GEL-101: meio exato sobe (média 6,505 → 651)', () => {
    // 101 notas 7 e 99 notas 6: soma 1301 em 200 notas, média 6,505.
    const notas = [...Array<number>(101).fill(7), ...Array<number>(99).fill(6)];
    expect(calcularNivel(notas)).toEqual({ nivel: 651, semNota: false });
  });

  it('GEL-101: abaixo do meio desce (média 6,5049... → 650)', () => {
    // 1 nota 7 e 1 nota 6 dá 6,5 → 650 exato; 2 notas 7 e 3 notas 6 dá 6,4 → 640.
    expect(calcularNivel([7, 6])).toEqual({ nivel: 650, semNota: false });
    expect(calcularNivel([7, 7, 6, 6, 6])).toEqual({ nivel: 640, semNota: false });
  });

  it('GEL-101: 1/3 de média arredonda para baixo (2, 1, 1 → 133)', () => {
    expect(calcularNivel([2, 1, 1])).toEqual({ nivel: 133, semNota: false });
  });

  it('GEL-101: 2/3 de média arredonda para cima (2, 2, 1 → 167)', () => {
    expect(calcularNivel([2, 2, 1])).toEqual({ nivel: 167, semNota: false });
  });

  it('GEL-101: uma nota só, 10 → 1000', () => {
    expect(calcularNivel([10])).toEqual({ nivel: 1000, semNota: false });
  });

  it('GEL-102: lista vazia → { nivel: 550, semNota: true }', () => {
    expect(calcularNivel([])).toEqual({ nivel: 550, semNota: true });
  });
});

describe('HABILIDADES_INICIAIS', () => {
  it('GEL-02: as 6 da spec, na ordem', () => {
    expect(HABILIDADES_INICIAIS).toEqual([
      'Visão de Jogo',
      'Passe',
      'Preparo Físico',
      'Drible',
      'Chute',
      'Desarme',
    ]);
  });
});

describe('anoNascimentoMaximo', () => {
  it('GEL-36: em 2026-12-31 é 2016', () => {
    expect(anoNascimentoMaximo('2026-12-31')).toBe(2016);
  });

  it('GEL-36: em 2027-01-01 é 2017', () => {
    expect(anoNascimentoMaximo('2027-01-01')).toBe(2017);
  });
});
