// Critério: FUN-30 (componentes base: renderização e axe; CampoMoeda e NavegadorMes dependem desta formatação). Copiado do legado: frontend/web/src/formatacao/datas.test.ts

import { describe, expect, it } from 'vitest';
import {
  dataCompleta,
  diaMes,
  diaMesHora,
  diaSemanaCurto,
  hora,
  mesNumerico,
  mesPorExtenso,
  nomeMes,
  diaSemanaData,
} from './datas';

describe('datas de negócio', () => {
  it.each([
    ['2026-10-22', '22/10/2026', 'qui, 22/10'],
    ['2024-02-29', '29/02/2024', 'qui, 29/02'],
    ['2026-01-01', '01/01/2026', 'qui, 01/01'],
  ])('%s', (data, completa, semana) => {
    expect(dataCompleta(data)).toBe(completa);
    expect(diaSemanaCurto(data)).toBe(semana);
    expect(diaMes(data)).toBe(completa.slice(0, 5));
  });

  it('mês por extenso', () => {
    expect(mesPorExtenso('2026-10')).toBe('outubro de 2026');
    expect(mesPorExtenso('2026-03')).toBe('março de 2026');
  });

  it.each(['2026-13-01', '2026-02-30', '22/10/2026', ''])('data malformada %j lança', (data) => {
    expect(() => dataCompleta(data)).toThrow(RangeError);
    expect(() => diaSemanaCurto(data)).toThrow(RangeError);
  });

  it.each(['2026-13', '2026-00', '202610', ''])('mês malformado %j lança', (mes) => {
    expect(() => mesPorExtenso(mes)).toThrow(RangeError);
  });
});

describe('diaSemanaData', () => {
  it.each([
    ['2026-10-15', 'Quinta, 15/10/2026'],
    ['2026-10-18', 'Domingo, 18/10/2026'],
    ['2026-10-17', 'Sábado, 17/10/2026'],
    ['2026-12-31', 'Quinta, 31/12/2026'],
    ['2027-01-01', 'Sexta, 01/01/2027'],
  ])('%s', (data, esperado) => {
    expect(diaSemanaData(data)).toBe(esperado);
  });

  it('data inválida lança', () => {
    expect(() => diaSemanaData('2026-02-30')).toThrow(RangeError);
  });
});

describe('nomeMes', () => {
  it('só o nome do mês', () => {
    expect(nomeMes('2026-10')).toBe('outubro');
    expect(nomeMes('2026-03')).toBe('março');
    expect(() => nomeMes('2026-13')).toThrow(RangeError);
  });
});

describe('mesNumerico', () => {
  it.each([
    ['2026-10', '10/2026'],
    ['2026-01', '01/2026'],
  ])('%s', (mes, esperado) => {
    expect(mesNumerico(mes)).toBe(esperado);
  });

  it('malformado lança', () => {
    expect(() => mesNumerico('2026-13')).toThrow(RangeError);
  });
});

describe('instantes em America/Sao_Paulo', () => {
  it.each([
    ['2026-10-22T21:40:00Z', '18:40', '22/10 18:40'],
    ['2026-10-16T01:41:00Z', '22:41', '15/10 22:41'],
    ['2026-12-31T23:30:00-03:00', '23:30', '31/12 23:30'],
  ])('%s', (iso, h, dh) => {
    expect(hora(iso)).toBe(h);
    expect(diaMesHora(iso)).toBe(dh);
  });

  it('instante malformado lança', () => {
    expect(() => hora('amanhã')).toThrow(RangeError);
    expect(() => diaMesHora('2026-10-22')).toThrow(RangeError);
  });
});
