import { describe, expect, it } from 'vitest';
import { calcularRanking } from '../../src/ranking/calcular.ts';
import { limitesDeMes, mesNoHistorico, navegacaoDeMes } from '../../src/ranking/navegacao.ts';
import { historicoDeTresMeses } from '../apoio/historico.ts';

/**
 * Mês no histórico e navegação (T12; PAR-41, PAR-66, PAR-84, PAR-85, PAR-86).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - mês anterior ao da primeira partida e mês futuro: fora;
 * - o próprio mês da primeira partida e o de hoje: dentro;
 * - sem partidas: só o mês de hoje é válido; navegação toda nula;
 * - no mês da primeira partida, `mesAnterior` nulo; no de hoje, `mesSeguinte` nulo;
 * - primeira partida no mês de hoje: as duas pontas nulas;
 * - virada de ano na navegação.
 */

const HOJE = '2026-10-15';
const limites = limitesDeMes(
  [{ data: '2026-10-01' }, { data: '2026-08-06' }, { data: '2026-09-10' }],
  HOJE,
);
const semPartidas = limitesDeMes([], HOJE);

describe('mesNoHistorico', () => {
  it('PAR-66: mês anterior à primeira partida, futuro, ou outro que não o de hoje sem partidas: fora do histórico', () => {
    expect(mesNoHistorico(limites, '2026-07')).toBe(false);
    expect(mesNoHistorico(limites, '2026-11')).toBe(false);
    expect(mesNoHistorico(semPartidas, '2026-09')).toBe(false);
  });

  it('PAR-66: do mês da primeira partida ao de hoje, inclusive; sem partidas, só o de hoje', () => {
    expect(['2026-08', '2026-09', '2026-10'].map((m) => mesNoHistorico(limites, m))).toEqual([
      true,
      true,
      true,
    ]);
    expect(mesNoHistorico(semPartidas, '2026-10')).toBe(true);
  });
});

describe('navegacaoDeMes', () => {
  it('PAR-84: no mês da primeira partida, mesAnterior nulo; PAR-85: no mês de hoje, mesSeguinte nulo', () => {
    expect(navegacaoDeMes(limites, '2026-08')).toEqual({
      mesAnterior: null,
      mesSeguinte: '2026-09',
    });
    expect(navegacaoDeMes(limites, '2026-10')).toEqual({
      mesAnterior: '2026-09',
      mesSeguinte: null,
    });
    expect(navegacaoDeMes(limites, '2026-09')).toEqual({
      mesAnterior: '2026-08',
      mesSeguinte: '2026-10',
    });
  });

  it('PAR-86, PAR-41: sem partidas, navegação nula', () => {
    expect(navegacaoDeMes(semPartidas, '2026-10')).toEqual({
      mesAnterior: null,
      mesSeguinte: null,
    });
  });

  it('PAR-84, PAR-85: primeira partida no mês de hoje deixa as duas pontas nulas', () => {
    expect(navegacaoDeMes(limitesDeMes([{ data: '2026-10-01' }], HOJE), '2026-10')).toEqual({
      mesAnterior: null,
      mesSeguinte: null,
    });
  });

  it('PAR-84, PAR-85: virada de ano', () => {
    const l = limitesDeMes([{ data: '2026-11-05' }], '2027-02-10');
    expect(navegacaoDeMes(l, '2027-01')).toEqual({
      mesAnterior: '2026-12',
      mesSeguinte: '2027-02',
    });
  });
});

describe('calcularRanking com a navegação', () => {
  it('PAR-84, PAR-85: o resultado traz navegação e limites do histórico', () => {
    const r = calcularRanking({ ...historicoDeTresMeses(), hoje: HOJE, mes: '2026-08' });
    expect(r.navegacao).toEqual({ mesAnterior: null, mesSeguinte: '2026-09' });
    expect(r.limites).toEqual({ primeiro: '2026-08', ultimo: '2026-10' });
  });
});
