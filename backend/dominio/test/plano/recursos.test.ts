import { describe, expect, it } from 'vitest';
import {
  centavosParaReais,
  formatarPreco,
  planoLibera,
  PRECO_PRO_CENTAVOS,
  reaisParaCentavos,
  RECURSOS_POR_PLANO,
} from '../../src/plano/recursos.ts';

/** Recursos por plano e preço (T2; PLA-05, PLA-06, PLA-62). */

describe('RECURSOS_POR_PLANO', () => {
  it('PLA-05: free tem só partidas e ranking, 20 jogadores ativos e 1 grupo', () => {
    expect(RECURSOS_POR_PLANO.free).toEqual({
      recursos: ['partidas', 'ranking'],
      limiteJogadores: 20,
      limiteGrupos: 1,
    });
  });

  it.each(['trial', 'pro', 'cortesia'] as const)(
    'PLA-05: %s tem jogadores ilimitados, simulador, financeiro, pdf e push',
    (plano) => {
      expect(RECURSOS_POR_PLANO[plano]).toEqual({
        recursos: ['partidas', 'ranking', 'simulador', 'financeiro', 'pdf', 'push'],
        limiteJogadores: null,
        limiteGrupos: null,
      });
    },
  );

  it('PLA-05: a tabela tem exatamente os 4 planos', () => {
    expect(Object.keys(RECURSOS_POR_PLANO).sort()).toEqual(['cortesia', 'free', 'pro', 'trial']);
  });

  it('PLA-05: o free não libera recurso Pro; o ranking (inclusive o público) vale em todo plano', () => {
    for (const recurso of ['simulador', 'financeiro', 'pdf', 'push'] as const) {
      expect(planoLibera('free', recurso)).toBe(false);
      expect(planoLibera('trial', recurso)).toBe(true);
      expect(planoLibera('pro', recurso)).toBe(true);
      expect(planoLibera('cortesia', recurso)).toBe(true);
    }
    for (const plano of ['free', 'trial', 'pro', 'cortesia'] as const) {
      expect(planoLibera(plano, 'ranking')).toBe(true);
      expect(planoLibera(plano, 'partidas')).toBe(true);
    }
  });

  it('PLA-05: a tabela não pode ser alterada em tempo de execução', () => {
    expect(Object.isFrozen(RECURSOS_POR_PLANO)).toBe(true);
    expect(Object.isFrozen(RECURSOS_POR_PLANO.free)).toBe(true);
    expect(Object.isFrozen(RECURSOS_POR_PLANO.free.recursos)).toBe(true);
  });
});

describe('preço em centavos', () => {
  it('PLA-06: o preço do Pro é o inteiro 990', () => {
    expect(PRECO_PRO_CENTAVOS).toBe(990);
    expect(Number.isInteger(PRECO_PRO_CENTAVOS)).toBe(true);
  });

  it('PLA-06: centavosParaReais(990) === 9.9 e a volta dá 990', () => {
    expect(centavosParaReais(990)).toBe(9.9);
    expect(reaisParaCentavos(centavosParaReais(990))).toBe(990);
  });

  it('PLA-06: ida e volta sem arredondamento de 1 a 99.999 centavos', () => {
    for (let c = 1; c <= 99_999; c++) {
      if (reaisParaCentavos(centavosParaReais(c)) !== c) throw new Error(`ida e volta quebrou em ${c}`);
    }
  });

  it('PLA-06: reais com mais de 2 casas são recusados, não arredondados', () => {
    expect(() => reaisParaCentavos(9.905)).toThrow(RangeError);
  });

  it('PLA-06: centavos fracionários ou negativos são recusados', () => {
    expect(() => centavosParaReais(9.5)).toThrow(RangeError);
    expect(() => centavosParaReais(-1)).toThrow(RangeError);
    expect(() => reaisParaCentavos(-1)).toThrow(RangeError);
    expect(() => reaisParaCentavos(Number.NaN)).toThrow(RangeError);
  });
});

describe('formatarPreco', () => {
  it('PLA-62: formatarPreco(PRECO_PRO_CENTAVOS) = "R$ 9,90"', () => {
    expect(formatarPreco(PRECO_PRO_CENTAVOS)).toBe('R$ 9,90');
  });

  it('PLA-62: zeros à esquerda nos centavos e ponto no milhar', () => {
    expect(formatarPreco(5)).toBe('R$ 0,05');
    expect(formatarPreco(100)).toBe('R$ 1,00');
    expect(formatarPreco(123_456)).toBe('R$ 1.234,56');
  });
});
