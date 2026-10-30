// Critério: GEL-61 (período é o intervalo [início, fim): sair e voltar no mesmo dia não sobrepõe).
// Parte dos casos vem do legado (`backend/dominio/test/atividade/atividade.test.ts`).
import { describe, expect, it } from 'vitest';
import { ativoEm, formatarData, sobrepoem, type Periodo } from '../../src/index.ts';

const p = (inicio: string, fim: string | null): Periodo => ({ inicio, fim });

describe('sobrepoem: intervalo semiaberto [início, fim) (GEL-61)', () => {
  it('sair e voltar no mesmo dia não sobrepõe: [01/10, 05/10) e [05/10, ∞)', () => {
    expect(sobrepoem(p('2026-10-01', '2026-10-05'), p('2026-10-05', null))).toBe(false);
    expect(sobrepoem(p('2026-10-05', null), p('2026-10-01', '2026-10-05'))).toBe(false);
  });

  it('períodos que se tocam por um dia sobrepõem: [01/10, 05/10) e [04/10, ∞)', () => {
    expect(sobrepoem(p('2026-10-01', '2026-10-05'), p('2026-10-04', null))).toBe(true);
    expect(sobrepoem(p('2026-10-04', '2026-10-10'), p('2026-10-01', '2026-10-05'))).toBe(true);
  });

  it('dois abertos sempre sobrepõem; um aberto sobrepõe o que vem depois do seu início', () => {
    expect(sobrepoem(p('2026-01-01', null), p('2026-05-01', null))).toBe(true);
    expect(sobrepoem(p('2026-01-01', null), p('2026-05-01', '2026-06-01'))).toBe(true);
    expect(sobrepoem(p('2026-05-01', null), p('2026-01-01', '2026-05-01'))).toBe(false);
  });

  it('separados por dias não sobrepõem; idênticos sobrepõem', () => {
    expect(sobrepoem(p('2026-01-01', '2026-02-01'), p('2026-03-01', null))).toBe(false);
    expect(sobrepoem(p('2026-01-01', '2026-02-01'), p('2026-01-01', '2026-02-01'))).toBe(true);
  });
});

describe('ativoEm: o dia da saída já é fora; o do retorno, dentro (GEL-61)', () => {
  const ps = [p('2026-01-01', '2026-08-10'), p('2026-09-14', null)];
  it.each([
    ['2025-12-31', false],
    ['2026-01-01', true],
    ['2026-08-09', true],
    ['2026-08-10', false],
    ['2026-09-13', false],
    ['2026-09-14', true],
    ['2030-01-01', true],
  ])('%s → %s', (data, esperado) => {
    expect(ativoEm(ps, data)).toBe(esperado);
  });

  it('sair e voltar no mesmo dia mantém o dia ativo', () => {
    expect(ativoEm([p('2026-01-01', '2026-05-05'), p('2026-05-05', null)], '2026-05-05')).toBe(true);
  });
});

describe('formatarData', () => {
  it('"2026-10-05" → "05/10/2026"', () => {
    expect(formatarData('2026-10-05')).toBe('05/10/2026');
    expect(formatarData('2000-01-01')).toBe('01/01/2000');
  });

  it('recusa texto que não é data AAAA-MM-DD real', () => {
    expect(() => formatarData('2026-02-30')).toThrow(RangeError);
    expect(() => formatarData('05/10/2026')).toThrow(RangeError);
  });
});
