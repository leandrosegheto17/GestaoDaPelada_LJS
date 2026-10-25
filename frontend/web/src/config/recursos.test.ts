// Critério: FUN-30 (recursos desligados por configuração). Copiado do legado: frontend/web/src/config/recursos.test.ts

import { describe, expect, it } from 'vitest';
import { lerRecursosDesligados } from './recursos';

describe('lerRecursosDesligados', () => {
  it.each([undefined, '', ' ', '  \n'])('%j deixa tudo ligado', (texto) => {
    expect(lerRecursosDesligados(texto).size).toBe(0);
  });

  it('lista separada por vÃ­rgula, com espaÃ§os aparados', () => {
    expect([...lerRecursosDesligados('pdf')]).toEqual(['pdf']);
    expect([...lerRecursosDesligados('pdf, financeiro ')].sort()).toEqual(['financeiro', 'pdf']);
  });

  it.each(['PDF', 'pdf,,', 'pdf;financeiro', 'desconhecido', ',pdf'])('%j Ã© erro', (texto) => {
    expect(() => lerRecursosDesligados(texto)).toThrow();
  });
});
