import { describe, expect, it } from 'vitest';
import { pagoAteDe } from '../../src/plano/pago-ate.ts';

/**
 * `pagoAte` a partir do vencimento (T3; PLA-44, AD-096).
 *
 * Casos limite listados antes do código: 31/01, 29/02 em ano bissexto, 30/11, 31/12.
 */

describe('pagoAteDe', () => {
  it.each([
    ['2026-11-04', '2026-12-04'],
    ['2027-01-31', '2027-02-28'],
    ['2028-01-31', '2028-02-29'],
    ['2026-12-31', '2027-01-31'],
  ])('PLA-44: vencimento %s → pagoAte %s', (vencimento, esperado) => {
    expect(pagoAteDe(vencimento)).toBe(esperado);
  });

  it.each([
    ['2028-02-29', '2028-03-29'],
    ['2026-11-30', '2026-12-30'],
    ['2026-03-31', '2026-04-30'],
    ['2026-01-28', '2026-02-28'],
    ['2026-01-29', '2026-02-28'],
    ['2026-08-31', '2026-09-30'],
  ])('PLA-44: dia limitado ao fim do mês seguinte: %s → %s', (vencimento, esperado) => {
    expect(pagoAteDe(vencimento)).toBe(esperado);
  });
});
