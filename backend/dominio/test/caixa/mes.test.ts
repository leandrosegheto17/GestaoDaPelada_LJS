import { describe, expect, it } from 'vitest';
import { limitesDoCaixa, mesFuturo, mesNoHistorico, mesesDoCaixa, navegacao } from '../../src/caixa/mes.ts';

/** Mês do caixa: histórico, navegação e mês futuro (T5; FIN-07, FIN-09, FIN-18, FIN-49). */

describe('mesNoHistorico', () => {
  it('FIN-09: com data inicial 2026-07-15 e hoje 2026-10-03, julho e outubro navegáveis, junho e novembro fora', () => {
    expect(mesNoHistorico('2026-07', '2026-07-15', '2026-10-03')).toBe(true);
    expect(mesNoHistorico('2026-10', '2026-07-15', '2026-10-03')).toBe(true);
    expect(mesNoHistorico('2026-06', '2026-07-15', '2026-10-03')).toBe(false);
    expect(mesNoHistorico('2026-11', '2026-07-15', '2026-10-03')).toBe(false);
  });

  it('FIN-09: virada de ano no histórico', () => {
    expect(mesNoHistorico('2025-12', '2025-11-20', '2026-01-05')).toBe(true);
    expect(mesNoHistorico('2025-10', '2025-11-20', '2026-01-05')).toBe(false);
  });

  it('FIN-08: sem configuração, só o mês de hoje', () => {
    expect(mesNoHistorico('2026-10', null, '2026-10-03')).toBe(true);
    expect(mesNoHistorico('2026-09', null, '2026-10-03')).toBe(false);
  });
});

describe('mesesDoCaixa', () => {
  it('FIN-09: de julho a outubro, em ordem', () => {
    expect(mesesDoCaixa('2026-07-15', '2026-10-03')).toEqual(['2026-07', '2026-08', '2026-09', '2026-10']);
  });

  it('FIN-09: data inicial no mês de hoje dá um mês só', () => {
    expect(mesesDoCaixa('2026-10-01', '2026-10-31')).toEqual(['2026-10']);
  });

  it('FIN-08: sem configuração, só o mês de hoje', () => {
    expect(mesesDoCaixa(null, '2026-10-03')).toEqual(['2026-10']);
  });

  it('FIN-09: data inicial depois de hoje não abre meses futuros', () => {
    expect(limitesDoCaixa('2026-12-01', '2026-10-03')).toEqual({ primeiro: '2026-10', ultimo: '2026-10' });
    expect(mesesDoCaixa('2026-12-01', '2026-10-03')).toEqual(['2026-10']);
  });
});

describe('navegacao', () => {
  it('FIN-07: no primeiro mês `mesAnterior` é nulo; no mês de hoje `mesSeguinte` é nulo', () => {
    expect(navegacao('2026-07', '2026-07-15', '2026-10-03')).toEqual({ mesAnterior: null, mesSeguinte: '2026-08' });
    expect(navegacao('2026-10', '2026-07-15', '2026-10-03')).toEqual({ mesAnterior: '2026-09', mesSeguinte: null });
  });

  it('FIN-07: mês do meio tem os dois lados, inclusive na virada do ano', () => {
    expect(navegacao('2026-01', '2025-11-20', '2026-03-01')).toEqual({ mesAnterior: '2025-12', mesSeguinte: '2026-02' });
  });

  it('FIN-07: histórico de um mês só tem navegação nula dos dois lados', () => {
    expect(navegacao('2026-10', '2026-10-01', '2026-10-31')).toEqual({ mesAnterior: null, mesSeguinte: null });
  });

  it('FIN-08: sem configuração, navegação nula', () => {
    expect(navegacao('2026-10', null, '2026-10-03')).toEqual({ mesAnterior: null, mesSeguinte: null });
  });
});

describe('mesFuturo', () => {
  it('FIN-18: novembro é futuro com hoje 2026-10-31; outubro não', () => {
    expect(mesFuturo('2026-11', '2026-10-31')).toBe(true);
    expect(mesFuturo('2026-10', '2026-10-31')).toBe(false);
  });

  it('FIN-49: hoje 2026-11-01 (já novembro em São Paulo) tira novembro do futuro', () => {
    expect(mesFuturo('2026-11', '2026-11-01')).toBe(false);
  });

  it('FIN-18: mês passado não é futuro; janeiro do ano seguinte é', () => {
    expect(mesFuturo('2026-09', '2026-10-31')).toBe(false);
    expect(mesFuturo('2027-01', '2026-12-31')).toBe(true);
  });
});
