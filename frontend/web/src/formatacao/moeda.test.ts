// CritÈrio: FUN-30 (componentes base: renderizaÁ„o e axe; CampoMoeda e NavegadorMes dependem desta formataÁ„o). Copiado do legado: frontend/web/src/formatacao/moeda.test.ts

import { describe, expect, it } from 'vitest';
import { formatarMoeda, lerMoeda } from './moeda';

const FAIXA = { min: 1, max: 99_999_999 };
const COM_NEGATIVO = { min: -99_999_999, max: 99_999_999 };

describe('formatarMoeda', () => {
  it.each([
    [123456, 'R$ 1.234,56'],
    [5, 'R$ 0,05'],
    [0, 'R$ 0,00'],
    [-123456, '‚àí R$ 1.234,56'],
    [99999999, 'R$ 999.999,99'],
  ])('%i', (centavos, texto) => {
    expect(formatarMoeda(centavos)).toBe(texto);
  });

  it.each([2 ** 53, NaN, 1.5, Infinity])('%s lan√ßa', (valor) => {
    expect(() => formatarMoeda(valor)).toThrow(RangeError);
  });
});

describe('lerMoeda', () => {
  it.each([
    ['1.234,56', 123456],
    ['1234,56', 123456],
    ['R$ 12,5', 1250],
    [' 75 ', 7500],
    ['999.999,99', 99999999],
  ])('%j ok', (texto, centavos) => {
    expect(lerMoeda(texto, FAIXA)).toEqual({ ok: true, centavos });
  });

  it('casas', () => {
    expect(lerMoeda('1,234', FAIXA)).toEqual({ ok: false, motivo: 'casas' });
  });

  it.each(['12.34', '1.23,00', '1..000', 'abc', '12,', 'Ÿ°Ÿ¢'])('%j √© formato', (texto) => {
    expect(lerMoeda(texto, FAIXA)).toEqual({ ok: false, motivo: 'formato' });
  });

  it.each(['', '  '])('%j √© vazio', (texto) => {
    expect(lerMoeda(texto, FAIXA)).toEqual({ ok: false, motivo: 'vazio' });
  });

  it('sinal s√≥ quando min < 0', () => {
    expect(lerMoeda('-10', FAIXA)).toEqual({ ok: false, motivo: 'formato' });
    expect(lerMoeda('-10', COM_NEGATIVO)).toEqual({ ok: true, centavos: -1000 });
    expect(lerMoeda('‚àí10', COM_NEGATIVO)).toEqual({ ok: true, centavos: -1000 });
  });

  it('fora da faixa, sem perder precis√£o', () => {
    expect(lerMoeda('1.000.000,00', FAIXA)).toEqual({ ok: false, motivo: 'faixa' });
    expect(lerMoeda('99999999999999999999', FAIXA)).toEqual({ ok: false, motivo: 'faixa' });
    expect(lerMoeda('0', FAIXA)).toEqual({ ok: false, motivo: 'faixa' });
  });
});
