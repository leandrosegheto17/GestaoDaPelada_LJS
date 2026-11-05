import { describe, expect, it } from 'vitest';
import { calcularRanking } from '../../src/ranking/calcular.ts';
import { CONFIGS, historicoDeTresMeses, jogador } from '../apoio/historico.ts';

/**
 * calcularRanking (T11; PAR-67, PAR-70, PAR-74, PAR-75, PAR-86, PAR-87).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - mês corrente ainda não acabado: período tomado em hoje e PTS FINAL = acumulado de hoje (`B:493`);
 * - mês passado: período tomado no último dia dele;
 * - inativo hoje com partidas no mês sai das linhas, sem perder histórico (`B:495`);
 * - mês sem partidas dentro do histórico: linhas e ordem mantidas, PTS INICIAL = PTS FINAL (PAR-87);
 * - grupo sem partidas: PTS INICIAL = PTS FINAL = acumulado (PAR-86);
 * - saiu e voltou: PTS INICIAL 0 no mês do retorno e o mês do primeiro período com os valores de antes (`B:489`);
 * - jogador que entra no meio do mês: rodada antes da entrada é "–".
 *
 * Valores de outubro (hoje 15/10): Ana 5 → 8; Bia 5 → 6; Cris 0 → 3; Duda 0 → 2; Edu 0 → 1 (retorno em 01/10).
 */

const HOJE = '2026-10-15';
const base = historicoDeTresMeses();
const ranking = (mes: string, entrada = base) => calcularRanking({ ...entrada, hoje: HOJE, mes });

describe('calcularRanking: linhas e ordem', () => {
  it('PAR-70: cada linha tem posição, apelido, PTS INICIAL, uma rodada por partida do mês e PTS FINAL', () => {
    const r = ranking('2026-10');
    expect(r.linhas.map((l) => [l.apelido, l.posicao, l.ptsInicial, l.ptsFinal])).toEqual([
      ['Ana', 1, 5, 8],
      ['Bia', 2, 5, 6],
      ['Cris', 3, 0, 3],
      ['Duda', 4, 0, 2],
      ['Edu', 5, 0, 1],
    ]);
    expect(r.linhas.every((l) => l.rodadas.length === 2)).toBe(true);
    expect(r.partidas).toEqual([
      { data: '2026-10-01', choveu: false },
      { data: '2026-10-08', choveu: true },
    ]);
    expect(r.resumoMes).toEqual({ partidas: 2, comChuva: 1 });
  });

  it('PAR-67: inativo hoje com partidas no mês sai das linhas, sem perder histórico', () => {
    const setembro = ranking('2026-09');
    expect(setembro.linhas.map((l) => l.jogadorId)).not.toContain('f');
    expect(base.presencas.filter((p) => p.jogadorId === 'f')).toHaveLength(2);
  });

  it('PAR-67: as linhas e a ordem são as mesmas em qualquer mês', () => {
    const ordem = (mes: string) => ranking(mes).linhas.map((l) => [l.jogadorId, l.posicao]);
    expect(ordem('2026-08')).toEqual(ordem('2026-10'));
    expect(ordem('2026-09')).toEqual(ordem('2026-10'));
  });

  it('PAR-73: quem entra no meio do mês tem "–" antes da entrada', () => {
    const duda = ranking('2026-10').linhas.find((l) => l.jogadorId === 'd');
    expect(duda?.rodadas).toEqual([
      { situacao: 'fora', pontos: null },
      { situacao: 'presente', pontos: 2 },
    ]);
  });
});

describe('calcularRanking: PTS INICIAL e PTS FINAL', () => {
  it('PAR-74: mês corrente toma o período em hoje e PTS FINAL = acumulado de hoje', () => {
    const r = ranking('2026-10');
    // Acumulados de hoje: Ana 8, Bia 6, Cris 3, Duda 2, Edu 1 (Edu só desde o retorno).
    expect(r.linhas.map((l) => l.ptsFinal)).toEqual([8, 6, 3, 2, 1]);
  });

  it('PAR-74: saiu e voltou tem PTS INICIAL 0 no mês do retorno; o mês do primeiro período fica como antes', () => {
    const edu = (mes: string) => ranking(mes).linhas.find((l) => l.jogadorId === 'e');
    expect(edu('2026-10')).toMatchObject({ ptsInicial: 0, ptsFinal: 1 });
    expect(edu('2026-09')).toMatchObject({
      ptsInicial: 2,
      ptsFinal: 3,
      rodadas: [
        { situacao: 'presente', pontos: 1 },
        { situacao: 'fora', pontos: null },
      ],
    });
  });

  it('PAR-75: PTS FINAL = PTS INICIAL + rodadas, com "–" valendo 0', () => {
    for (const mes of ['2026-08', '2026-09', '2026-10']) {
      for (const l of ranking(mes).linhas) {
        expect(l.ptsFinal).toBe(l.ptsInicial + l.rodadas.reduce((s, r) => s + (r.pontos ?? 0), 0));
      }
    }
  });

  it('PAR-75: o PTS FINAL de um mês é o PTS INICIAL do seguinte (sem retorno no meio)', () => {
    const ana = (mes: string) => ranking(mes).linhas.find((l) => l.jogadorId === 'a');
    expect(ana('2026-08')?.ptsFinal).toBe(ana('2026-09')?.ptsInicial);
    expect(ana('2026-09')?.ptsFinal).toBe(ana('2026-10')?.ptsInicial);
  });

  it('PAR-87: mês sem partidas dá PTS INICIAL = PTS FINAL e a mesma ordem de outubro', () => {
    const semSetembro = {
      ...base,
      partidas: base.partidas.filter((p) => !p.data.startsWith('2026-09')),
      presencas: base.presencas.filter((p) => !p.partidaId.startsWith('p-2026-09')),
    };
    const setembro = ranking('2026-09', semSetembro);
    const outubro = ranking('2026-10', semSetembro);
    expect(setembro.partidas).toEqual([]);
    expect(setembro.linhas.every((l) => l.ptsInicial === l.ptsFinal && l.rodadas.length === 0)).toBe(true);
    expect(setembro.linhas.map((l) => l.jogadorId)).toEqual(outubro.linhas.map((l) => l.jogadorId));
  });

  it('PAR-86: grupo sem partidas dá PTS INICIAL = PTS FINAL = acumulado', () => {
    const r = calcularRanking({
      hoje: HOJE,
      mes: '2026-10',
      jogadores: [jogador('x', 'Xico', { pontuacaoInicial: 10 }), jogador('y', 'Yuri')],
      partidas: [],
      presencas: [],
      configsPesos: CONFIGS,
    });
    expect(r.partidas).toEqual([]);
    expect(r.resumoMes).toEqual({ partidas: 0, comChuva: 0 });
    expect(r.linhas.map((l) => [l.apelido, l.ptsInicial, l.ptsFinal])).toEqual([
      ['Xico', 10, 10],
      ['Yuri', 0, 0],
    ]);
  });
});
