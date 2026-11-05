import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatarReais, lerReais, MENSAGEM_VALOR_REAIS } from '../../src/dados/dinheiro.ts';

/** Dinheiro no front (financeiro T35; FIN-15, FIN-48). */

describe('lerReais (FIN-48)', () => {
  it.each([
    ['350,00', 35000],
    ['350', 35000],
    ['350,5', 35050],
    ['0,1', 10],
    ['0,01', 1],
    ['1.245,50', 124550],
    ['1245,50', 124550],
    ['99.999.999,99', 9999999999],
    [' 75,00 ', 7500],
    ['R$ 75,00', 7500],
    ['-15,00', -1500],
    ['−15,00', -1500],
    ['0', 0],
  ])('FIN-48: "%s" vira %i centavos', (texto, centavos) => {
    expect(lerReais(texto)).toEqual({ ok: true, centavos });
  });

  it.each([
    '12,345',
    'abc',
    '1,2,3',
    '35,0,0',
    '',
    '   ',
    '1.24,50',
    '12.3456,00',
    '1,',
    ',50',
    '350.00',
    '1e3',
    'R$',
    '--1',
  ])('FIN-48: "%s" é recusado com a mensagem', (texto) => {
    expect(lerReais(texto)).toEqual({ ok: false, mensagem: MENSAGEM_VALOR_REAIS });
  });

  it('FIN-48: a mensagem é a da spec', () => {
    expect(MENSAGEM_VALOR_REAIS).toBe('Informe um valor em reais, ex.: 350,00.');
  });

  it('FIN-48: valor além do inteiro seguro é recusado', () => {
    expect(lerReais('999999999999999999,00')).toEqual({
      ok: false,
      mensagem: MENSAGEM_VALOR_REAIS,
    });
  });

  it('FIN-48: o arquivo não usa parseFloat nem toFixed (checagem por texto)', () => {
    const fonte = readFileSync(join(import.meta.dirname, '../../src/dados/dinheiro.ts'), 'utf8');
    expect(fonte).not.toMatch(/parseFloat/);
    expect(fonte).not.toMatch(/toFixed/);
  });
});

describe('formatarReais (FIN-15)', () => {
  it.each([
    [124550, 'R$ 1.245,50'],
    [7500, 'R$ 75,00'],
    [5, 'R$ 0,05'],
    [0, 'R$ 0,00'],
    [100000000, 'R$ 1.000.000,00'],
    [-90000, '− R$ 900,00'],
    [-10000, '− R$ 100,00'],
  ])('FIN-15: %i vira "%s", como no mockup', (centavos, texto) => {
    expect(formatarReais(centavos)).toBe(texto);
  });

  it('FIN-15: valor que não é inteiro seguro lança', () => {
    expect(() => formatarReais(1.5)).toThrow(RangeError);
  });

  it('FIN-15, FIN-48: ida e volta sem perda', () => {
    for (const centavos of [1, 99, 100, 123456, 9999999999]) {
      const { ok } = lerReais(formatarReais(centavos));
      expect(ok).toBe(true);
      expect(lerReais(formatarReais(centavos))).toEqual({ ok: true, centavos });
    }
  });
});
