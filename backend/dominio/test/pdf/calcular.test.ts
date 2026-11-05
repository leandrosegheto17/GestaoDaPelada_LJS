import { describe, expect, it } from 'vitest';
import { calcularPdf, escolherColunasPdf, MAX_COLUNAS_PDF } from '../../src/pdf/calcular.ts';
import { calcularRanking } from '../../src/ranking/calcular.ts';
import { CONFIGS, datasSemanais, historicoDeTresMeses, jogador, partida, presenca } from '../apoio/historico.ts';

/**
 * calcularPdf e escolha das colunas (T13; PAR-96, PAR-97, PAR-98, PAR-99).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - mês com 14 partidas: as 12 mais recentes, e o PTS INICIAL absorve as 2 primeiras (`B:498`);
 * - mês com poucas partidas completa com meses anteriores; janeiro completa com dezembro do ano anterior (`B:499`);
 * - partidas depois do fim do mês exibido nunca entram;
 * - mês sem partida: `semPartidasNoMes` e colunas só de meses anteriores (PAR-97);
 * - sem nenhuma coluna: `ptsInicial` = `ptsFinal` (PAR-98, I-42);
 * - PTS INICIAL + rodadas ("–" = 0) fecha o PTS FINAL do ranking em toda linha (PAR-99), inclusive para quem saiu e voltou.
 */

describe('escolherColunasPdf', () => {
  it('PAR-96: mês com 14 partidas fica com as 12 mais recentes, em ordem cronológica', () => {
    const datas = datasSemanais('2026-10-01', 14, 2);
    const { colunas, semPartidasNoMes } = escolherColunasPdf(datas.map((d) => partida(d)), '2026-10');
    expect(colunas).toHaveLength(MAX_COLUNAS_PDF);
    expect(colunas.map((c) => c.data)).toEqual(datas.slice(2));
    expect(colunas.every((c) => c.doMesExibido)).toBe(true);
    expect(semPartidasNoMes).toBe(false);
  });

  it('PAR-96: janeiro completa as colunas com dezembro do ano anterior', () => {
    const datas = datasSemanais('2026-10-01', 16);
    const { colunas } = escolherColunasPdf(datas.map((d) => partida(d)), '2027-01');
    expect(colunas).toHaveLength(12);
    expect(colunas.some((c) => c.data.startsWith('2026-12') && !c.doMesExibido)).toBe(true);
    expect(colunas.filter((c) => c.doMesExibido).map((c) => c.data)).toEqual(datas.filter((d) => d.startsWith('2027-01')));
  });

  it('PAR-96: partidas depois do fim do mês exibido não entram', () => {
    const { colunas } = escolherColunasPdf([partida('2026-09-24'), partida('2026-10-01')], '2026-09');
    expect(colunas.map((c) => c.data)).toEqual(['2026-09-24']);
  });

  it('PAR-97: mês sem partida marca semPartidasNoMes com colunas só de meses anteriores', () => {
    const { colunas, semPartidasNoMes } = escolherColunasPdf([partida('2026-08-06'), partida('2026-09-03')], '2026-10');
    expect(semPartidasNoMes).toBe(true);
    expect(colunas.map((c) => [c.data, c.doMesExibido])).toEqual([
      ['2026-08-06', false],
      ['2026-09-03', false],
    ]);
  });
});

describe('calcularPdf', () => {
  it('PAR-96, PAR-98: com 14 partidas no mês, o PTS INICIAL absorve as 2 primeiras', () => {
    const datas = datasSemanais('2026-10-01', 14, 2);
    const pdf = calcularPdf({
      hoje: '2026-10-31',
      mes: '2026-10',
      jogadores: [jogador('a', 'Ana')],
      partidas: datas.map((d) => partida(d)),
      presencas: datas.map((d) => presenca('a', d)),
      configsPesos: CONFIGS,
    });
    expect(pdf.linhas[0]).toMatchObject({ ptsInicial: 2, ptsFinal: 14 });
    expect(pdf.linhas[0]?.rodadas).toHaveLength(12);
  });

  it('PAR-99: soma das rodadas + ptsInicial fecha o ptsFinal do ranking em toda linha', () => {
    const entrada = { ...historicoDeTresMeses(), hoje: '2026-10-15', mes: '2026-10' };
    const pdf = calcularPdf(entrada);
    const ranking = calcularRanking(entrada);
    expect(pdf.linhas.map((l) => [l.jogadorId, l.posicao, l.ptsFinal])).toEqual(
      ranking.linhas.map((l) => [l.jogadorId, l.posicao, l.ptsFinal]),
    );
    for (const linha of pdf.linhas) {
      expect(linha.rodadas).toHaveLength(pdf.colunas.length);
      expect(linha.ptsInicial + linha.rodadas.reduce((s, r) => s + (r.pontos ?? 0), 0)).toBe(linha.ptsFinal);
    }
  });

  it('PAR-99: quem saiu e voltou tem "–" antes do retorno nas colunas de meses anteriores', () => {
    const pdf = calcularPdf({ ...historicoDeTresMeses(), hoje: '2026-10-15', mes: '2026-10' });
    const edu = pdf.linhas.find((l) => l.jogadorId === 'e');
    expect(edu?.rodadas.slice(0, 4).every((r) => r.situacao === 'fora')).toBe(true);
    expect(edu).toMatchObject({ ptsInicial: 0, ptsFinal: 1 });
  });

  it('PAR-97: mês sem partida dá semPartidasNoMes e as linhas fecham com o ranking', () => {
    const base = historicoDeTresMeses();
    const semOutubro = {
      ...base,
      partidas: base.partidas.filter((p) => !p.data.startsWith('2026-10')),
      presencas: base.presencas.filter((p) => !p.partidaId.startsWith('p-2026-10')),
    };
    const pdf = calcularPdf({ ...semOutubro, hoje: '2026-10-15', mes: '2026-10' });
    expect(pdf.semPartidasNoMes).toBe(true);
    expect(pdf.colunas.every((c) => !c.doMesExibido)).toBe(true);
  });

  it('PAR-98: sem nenhuma coluna, ptsInicial = ptsFinal', () => {
    const pdf = calcularPdf({
      hoje: '2026-10-15',
      mes: '2026-10',
      jogadores: [jogador('x', 'Xico', { pontuacaoInicial: 7 })],
      partidas: [],
      presencas: [],
      configsPesos: CONFIGS,
    });
    expect(pdf).toEqual({
      semPartidasNoMes: true,
      colunas: [],
      linhas: [{ jogadorId: 'x', posicao: 1, apelido: 'Xico', ptsInicial: 7, rodadas: [], ptsFinal: 7 }],
    });
  });
});
