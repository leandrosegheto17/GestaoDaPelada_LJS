import { describe, expect, it } from 'vitest';
import {
  compararMeses,
  diaDaSemana,
  ehDataReal,
  ehMes,
  mesAnterior,
  mesDe,
  mesSeguinte,
  primeiroDia,
  ultimoDia,
  vespera,
} from '../src/datas.ts';

/**
 * Datas e meses (T1; PAR-19, PAR-39, PAR-65, PAR-84, PAR-85).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - 29/02 só em ano bissexto (2028 sim, 2026 não; 2100 não, 2000 sim);
 * - mês 13, mês 00, dia 00, sem zero à esquerda, com hora ou espaço: não é data;
 * - `AAAA-MM` com mês 00 ou 13, `AAAA-M` e `AAAA-MM-DD` não são mês;
 * - virada de ano no mês anterior e no seguinte; véspera do dia 1 de março em ano bissexto.
 */

describe('ehDataReal', () => {
  it('PAR-19: 2026-02-29 e 2026-13-01 não são datas reais; 2028-02-29 é', () => {
    expect(ehDataReal('2026-02-29')).toBe(false);
    expect(ehDataReal('2026-13-01')).toBe(false);
    expect(ehDataReal('2028-02-29')).toBe(true);
  });

  it.each([
    '2026-00-10',
    '2026-10-00',
    '2026-1-05',
    '2026-10-15T00:00',
    ' 2026-10-15',
    '',
    null,
    20261015,
    '2100-02-29',
  ])('PAR-19: %s não é data real', (valor) => {
    expect(ehDataReal(valor)).toBe(false);
  });

  it('PAR-19: 2000-02-29 é data real (múltiplo de 400)', () => {
    expect(ehDataReal('2000-02-29')).toBe(true);
  });
});

describe('ehMes', () => {
  it.each(['2026-10', '2026-01', '2026-12'])('PAR-39, PAR-65: %s é mês', (valor) => {
    expect(ehMes(valor)).toBe(true);
  });

  it.each(['2026-00', '2026-13', '2026-1', '2026-10-01', '10-2026', '', null, 202610])(
    'PAR-39, PAR-65: %s não é mês',
    (valor) => {
      expect(ehMes(valor)).toBe(false);
    },
  );
});

describe('meses', () => {
  it('PAR-84/PAR-85: mesAnterior(2026-01) = 2025-12 e mesSeguinte(2026-12) = 2027-01', () => {
    expect(mesAnterior('2026-01')).toBe('2025-12');
    expect(mesSeguinte('2026-12')).toBe('2027-01');
  });

  it('PAR-84/PAR-85: no meio do ano só muda o mês', () => {
    expect(mesAnterior('2026-10')).toBe('2026-09');
    expect(mesSeguinte('2026-10')).toBe('2026-11');
  });

  it('mesDe, primeiroDia e compararMeses', () => {
    expect(mesDe('2026-10-15')).toBe('2026-10');
    expect(primeiroDia('2026-10')).toBe('2026-10-01');
    expect(compararMeses('2026-09', '2026-10')).toBeLessThan(0);
    expect(compararMeses('2026-10', '2026-10')).toBe(0);
    expect(compararMeses('2027-01', '2026-12')).toBeGreaterThan(0);
  });
});

describe('dias', () => {
  it('diaDaSemana de 2026-10-15 é quinta; ultimoDia(2028-02) = 2028-02-29', () => {
    expect(diaDaSemana('2026-10-15')).toBe(4);
    expect(ultimoDia('2028-02')).toBe('2028-02-29');
  });

  it('ultimoDia de meses de 28, 30 e 31 dias', () => {
    expect(ultimoDia('2026-02')).toBe('2026-02-28');
    expect(ultimoDia('2026-04')).toBe('2026-04-30');
    expect(ultimoDia('2026-12')).toBe('2026-12-31');
  });

  it('vespera atravessa mês e ano', () => {
    expect(vespera('2028-03-01')).toBe('2028-02-29');
    expect(vespera('2027-01-01')).toBe('2026-12-31');
  });
});
