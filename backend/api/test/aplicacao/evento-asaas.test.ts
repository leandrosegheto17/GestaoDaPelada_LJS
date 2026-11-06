import { describe, expect, it } from 'vitest';
import { dataCriacaoNormalizada, eventoDoCorpo } from '../../src/aplicacao/plano/evento-asaas.ts';

/** `dateCreated` do webhook (PLA-48; A-12): o domínio compara textos, então todos têm de ter o mesmo formato. */

describe('dataCriacaoNormalizada', () => {
  it.each([
    ['2026-11-05 11:00:00', '2026-11-05 11:00:00'],
    ['2026-11-05T11:00:00', '2026-11-05 11:00:00'],
    ['2026-11-05T11:00:00.123', '2026-11-05 11:00:00'],
    ['  2026-11-05 11:00:00  ', '2026-11-05 11:00:00'],
  ])('PLA-48: %s vira %s', (entrada, saida) => {
    expect(dataCriacaoNormalizada(entrada)).toBe(saida);
  });

  it.each([
    '2026-11-05T11:00:00Z',
    '2026-11-05T11:00:00-03:00',
    '2026-11-05',
    '05/11/2026 11:00:00',
    '',
    'ontem',
  ])('PLA-48: %s vira nulo (sem data: o domínio não aplica fora de ordem)', (entrada) => {
    expect(dataCriacaoNormalizada(entrada)).toBeNull();
  });

  it('PLA-48: ausente vira nulo', () => {
    expect(dataCriacaoNormalizada(undefined)).toBeNull();
    expect(dataCriacaoNormalizada(null)).toBeNull();
  });

  it('PLA-41: eventoDoCorpo grava a data já normalizada', () => {
    const e = eventoDoCorpo({
      id: 'evt_1',
      event: 'PAYMENT_RECEIVED',
      dateCreated: '2026-11-05T11:00:00.5',
    });
    expect(e.dataCriacao).toBe('2026-11-05 11:00:00');
  });
});
