import { describe, expect, it } from 'vitest';
import { criarRelogio, relogioFixo } from '../../src/infraestrutura/relogio/index.ts';

// Relógio da API (T21; AD-015, ADR-012): "hoje" e o mês sempre de São Paulo.

describe('relógio de São Paulo', () => {
  it('22h de São Paulo (01h UTC do dia seguinte) ainda é o dia de São Paulo', () => {
    const r = criarRelogio(() => new Date('2026-10-29T01:00:00Z'));
    expect(r.hoje()).toBe('2026-10-28');
    expect(r.mes()).toBe('2026-10');
    expect(r.agoraIso()).toBe('2026-10-29T01:00:00.000Z');
  });

  it('23:30 de 31/12 em São Paulo ainda é dezembro (02:30 UTC de 01/01)', () => {
    const r = criarRelogio(() => new Date('2027-01-01T02:30:00Z'));
    expect(r.hoje()).toBe('2026-12-31');
    expect(r.mes()).toBe('2026-12');
  });

  it('meia-noite exata em São Paulo já é o dia seguinte', () => {
    const r = criarRelogio(() => new Date('2027-01-01T03:00:00Z'));
    expect(r.hoje()).toBe('2027-01-01');
    expect(r.mes()).toBe('2027-01');
  });

  it('sem argumento, usa o relógio real: data no formato AAAA-MM-DD', () => {
    expect(criarRelogio().hoje()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('relógio fixo para testes', () => {
  it('relogioFixo(data) fixa o dia ao meio-dia de São Paulo', () => {
    const r = relogioFixo('2026-10-22');
    expect(r.hoje()).toBe('2026-10-22');
    expect(r.agoraIso()).toBe('2026-10-22T15:00:00.000Z');
  });

  it('relogioFixo(data, hora) às 22h de São Paulo continua no mesmo dia', () => {
    const r = relogioFixo('2026-10-31', '22:00');
    expect(r.hoje()).toBe('2026-10-31');
    expect(r.mes()).toBe('2026-10');
    expect(r.agoraIso()).toBe('2026-11-01T01:00:00.000Z');
  });

  it('o instante não anda entre chamadas', () => {
    const r = relogioFixo('2026-10-22', '09:00');
    expect([r.agoraIso(), r.agoraIso()]).toEqual(['2026-10-22T12:00:00.000Z', '2026-10-22T12:00:00.000Z']);
  });
});
