import { describe, expect, it } from 'vitest';
import {
  ativoEm,
  contem,
  ehDataValida,
  MENSAGEM_DATA_INVALIDA,
  MENSAGEM_FUTURO,
  somarDias,
  sobrepoem,
  validarData,
} from '../../src/atividade/datas.ts';

/**
 * Datas e intervalo [início, fim) (T11; GEL-61, GEL-63, GEL-64).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - 29/02 em ano bissexto (2024, 2000) vale; em ano não bissexto (2026, 1900) não vale.
 * - `2026-13-01` (mês 13), `2026-04-31` (dia 31 em mês de 30) e `2026-1-1` (sem zero à esquerda) não valem.
 * - Hoje não é futuro; amanhã é.
 * - Saída e retorno no mesmo dia: [01/10, 05/10) e [05/10, aberto) não se sobrepõem.
 * - Período vazio (início = fim) não cobre dia nenhum ([LACUNA] em `datas.ts`).
 * - Valor que não é texto (número, nulo) é data inválida.
 */

const HOJE = '2026-10-15';

describe('ehDataValida', () => {
  it.each(['2024-02-29', '2000-02-29', '2026-01-01', '2026-12-31', '2026-04-30'])('GEL-63: %s é data real', (d) => {
    expect(ehDataValida(d)).toBe(true);
  });

  it.each(['2026-02-29', '1900-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '2026-01-00', '2026-1-1', '26-01-01', '2026/01/01', ''])(
    'GEL-63: %s não é data real',
    (d) => {
      expect(ehDataValida(d)).toBe(false);
    },
  );

  it.each([20261001, null, undefined, {}])('GEL-63: %s (não texto) não é data', (v) => {
    expect(ehDataValida(v)).toBe(false);
  });
});

describe('validarData', () => {
  it.each(['2026-02-29', '2026-13-01', '2026-1-1'])('GEL-63: %s dá "Informe uma data válida."', (d) => {
    expect(validarData(d, HOJE, 'saida')).toEqual({
      ok: false,
      regra: 'data-invalida',
      mensagem: MENSAGEM_DATA_INVALIDA,
      campo: 'saida',
    });
    expect(MENSAGEM_DATA_INVALIDA).toBe('Informe uma data válida.');
  });

  it('GEL-64: amanhã dá "A data não pode ser no futuro."', () => {
    expect(validarData('2026-10-16', HOJE, 'retorno')).toEqual({
      ok: false,
      regra: 'futuro',
      mensagem: 'A data não pode ser no futuro.',
      campo: 'retorno',
    });
    expect(MENSAGEM_FUTURO).toBe('A data não pode ser no futuro.');
  });

  it('GEL-64: hoje vale', () => {
    expect(validarData(HOJE, HOJE, 'saida')).toBeNull();
  });

  it('GEL-64: ontem vale', () => {
    expect(validarData('2026-10-14', HOJE, 'saida')).toBeNull();
  });

  it('GEL-63, GEL-64: data inválida é avaliada antes de futura', () => {
    expect(validarData('2099-02-30', HOJE, 'saida')?.regra).toBe('data-invalida');
  });
});

describe('intervalo [início, fim)', () => {
  it('GEL-61: [01/10, 05/10) e [05/10, aberto) não se sobrepõem', () => {
    expect(sobrepoem({ inicio: '2026-10-01', fim: '2026-10-05' }, { inicio: '2026-10-05', fim: null })).toBe(false);
    expect(sobrepoem({ inicio: '2026-10-05', fim: null }, { inicio: '2026-10-01', fim: '2026-10-05' })).toBe(false);
  });

  it('GEL-61: [01/10, 06/10) e [05/10, aberto) se sobrepõem', () => {
    expect(sobrepoem({ inicio: '2026-10-01', fim: '2026-10-06' }, { inicio: '2026-10-05', fim: null })).toBe(true);
  });

  it('GEL-61: dois abertos se sobrepõem', () => {
    expect(sobrepoem({ inicio: '2026-10-01', fim: null }, { inicio: '2026-11-01', fim: null })).toBe(true);
  });

  it('GEL-61: período dentro de outro se sobrepõe', () => {
    expect(sobrepoem({ inicio: '2026-01-01', fim: '2026-12-31' }, { inicio: '2026-03-01', fim: '2026-04-01' })).toBe(true);
  });

  it('GEL-61: período vazio não sobrepõe', () => {
    expect(sobrepoem({ inicio: '2026-03-01', fim: '2026-03-01' }, { inicio: '2026-01-01', fim: null })).toBe(false);
  });

  it('GEL-61: o dia da saída fica fora do período; o dia do início, dentro', () => {
    const p = { inicio: '2026-10-01', fim: '2026-10-05' };
    expect(contem(p, '2026-10-01')).toBe(true);
    expect(contem(p, '2026-10-04')).toBe(true);
    expect(contem(p, '2026-10-05')).toBe(false);
    expect(contem(p, '2026-09-30')).toBe(false);
  });

  it('GEL-61: quem sai e volta no mesmo dia está ativo nesse dia', () => {
    const periodos = [
      { inicio: '2026-10-01', fim: '2026-10-05' },
      { inicio: '2026-10-05', fim: null },
    ];
    expect(ativoEm(periodos, '2026-10-05')).toBe(true);
  });
});

describe('somarDias', () => {
  it('soma e subtrai atravessando mês, ano e fevereiro bissexto', () => {
    expect(somarDias('2026-09-30', 1)).toBe('2026-10-01');
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(somarDias('2024-02-28', 1)).toBe('2024-02-29');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
  });
});
