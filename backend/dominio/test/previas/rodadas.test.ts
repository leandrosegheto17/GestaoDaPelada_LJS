import { describe, expect, it } from 'vitest';
import { MENSAGEM_FUTURO } from '../../src/atividade/datas.ts';
import {
  AVISO_UMA_FALTA,
  AVISO_VARIAS_FALTAS,
  avisoDasRodadas,
  previaDoInicio,
  previaDosPeriodos,
} from '../../src/previas/rodadas.ts';
import { CONFIGS, historicoDeTresMeses, jogador, partida, presenca } from '../apoio/historico.ts';

/**
 * previaDosPeriodos e previaDoInicio (T15; PAR-111, PAR-114, PAR-115, PAR-116).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - reativação: as partidas desde o retorno passam de "–" a falta (sem presença) ou à situação gravada;
 * - cada rodada é cortada no início da contagem do mês dela: com o retorno no meio do mês, a presença do mesmo mês
 *   antes do retorno deixa de constar (PAR-114 com PAR-57);
 * - saída antecipada: a falta que existia entre a nova saída e a antiga deixa de constar; sem falta nova, aviso nulo;
 * - aviso conta só as faltas entre as que passam: uma, singular; duas ou mais, plural; nenhuma, nulo (PAR-116);
 * - recuo da data de início antes do primeiro período: o início do período acompanha (GEL-81); sem alcançar presença,
 *   o acumulado não muda e só rodadas de "–" passam a falta (`B:500`, PAR-115);
 * - data de início hoje dá 0 e recuar volta ao valor de antes (Kim, `B:501`);
 * - data igual à atual: sem mudança; data recusada pela gravação (futura): lança com a mesma mensagem (PAR-112).
 *
 * Acumulados de hoje (15/10) no histórico de apoio: Ana 8, Bia 6, Cris 3, Duda 2, Edu 1; Fê 2 (inativa desde 20/09).
 */

const HOJE = '2026-10-15';
const base = historicoDeTresMeses();

describe('avisoDasRodadas', () => {
  it('PAR-116: uma falta que passa a constar dá o aviso no singular; duas, no plural; nenhuma, nulo', () => {
    expect(avisoDasRodadas([{ data: '2026-10-08', situacao: 'falta' }])).toBe(AVISO_UMA_FALTA);
    expect(
      avisoDasRodadas([
        { data: '2026-10-08', situacao: 'falta' },
        { data: '2026-10-15', situacao: 'falta' },
      ]),
    ).toBe(AVISO_VARIAS_FALTAS);
    expect(avisoDasRodadas([{ data: '2026-10-08', situacao: 'presente' }])).toBeNull();
    expect(avisoDasRodadas([])).toBeNull();
  });

  it('PAR-116: conta só as faltas entre as rodadas que passam a constar', () => {
    expect(
      avisoDasRodadas([
        { data: '2026-10-01', situacao: 'presente' },
        { data: '2026-10-08', situacao: 'falta' },
      ]),
    ).toBe(AVISO_UMA_FALTA);
  });

  it('PAR-116: os textos são os da spec', () => {
    expect(AVISO_UMA_FALTA).toBe('Ela vale 0 ponto até você lançar a presença em Editar partida.');
    expect(AVISO_VARIAS_FALTAS).toBe('Elas valem 0 ponto até você lançar a presença em Editar partida.');
  });
});

describe('previaDosPeriodos', () => {
  const gil = (comPartidaDia1 = false) => {
    const datas = ['2026-09-24', ...(comPartidaDia1 ? ['2026-10-01'] : []), '2026-10-08', '2026-10-15'];
    return {
      jogadores: [
        jogador('a', 'Ana'),
        jogador('g', 'Gil', { periodos: [{ inicio: '2026-01-01', fim: '2026-10-05' }] }),
      ],
      partidas: datas.map((d) => partida(d)),
      presencas: [
        ...datas.map((d) => presenca('a', d)),
        presenca('g', '2026-09-24'),
        ...(comPartidaDia1 ? [presenca('g', '2026-10-01')] : []),
      ],
      configsPesos: CONFIGS,
    };
  };
  const retornoEm8 = [
    { inicio: '2026-01-01', fim: '2026-10-05' },
    { inicio: '2026-10-08', fim: null },
  ];

  it('PAR-114: Gil inativo desde 05/10, retorno em 08/10, dá 08/10 e 15/10 passando a constar', () => {
    const r = previaDosPeriodos(gil(), 'g', retornoEm8, '2026-10-16');
    expect(r.rodadasQuePassamAConstar).toEqual([
      { data: '2026-10-08', situacao: 'falta' },
      { data: '2026-10-15', situacao: 'falta' },
    ]);
    expect(r.rodadasQueDeixamDeConstar).toEqual([]);
    expect(r.aviso).toBe(AVISO_VARIAS_FALTAS);
    expect(r.posicaoAntes).toBeNull();
    expect(r.posicaoDepois).toBe(2);
  });

  it('PAR-114: a rodada do mês do retorno anterior a ele deixa de constar (corte no início da contagem do mês)', () => {
    const r = previaDosPeriodos(gil(true), 'g', retornoEm8, '2026-10-16');
    expect(r.rodadasQueDeixamDeConstar).toEqual([{ data: '2026-10-01' }]);
    expect(r.rodadasQuePassamAConstar.map((x) => x.data)).toEqual(['2026-10-08', '2026-10-15']);
    // A rodada de setembro, do primeiro período, continua como estava.
    expect(r.rodadasQueDeixamDeConstar.map((x) => x.data)).not.toContain('2026-09-24');
  });

  it('PAR-116: reativar com uma falta que passa a constar dá o aviso no singular', () => {
    const r = previaDosPeriodos(
      base,
      'f',
      [
        { inicio: '2026-01-01', fim: '2026-09-20' },
        { inicio: '2026-10-08', fim: null },
      ],
      HOJE,
    );
    expect(r.rodadasQuePassamAConstar).toEqual([{ data: '2026-10-08', situacao: 'falta' }]);
    expect(r.rodadasQueDeixamDeConstar).toEqual([]);
    expect(r.aviso).toBe(AVISO_UMA_FALTA);
    expect(r).toMatchObject({ acumuladoAntes: 2, acumuladoDepois: 0, posicaoAntes: null, posicaoDepois: 6 });
  });

  it('PAR-114: saída antecipada faz a falta do intervalo deixar de constar, sem aviso', () => {
    const r = previaDosPeriodos(base, 'f', [{ inicio: '2026-01-01', fim: '2026-09-08' }], HOJE);
    expect(r.rodadasQueDeixamDeConstar).toEqual([{ data: '2026-09-10' }]);
    expect(r.rodadasQuePassamAConstar).toEqual([]);
    expect(r.aviso).toBeNull();
  });

  it('PAR-114: presença gravada que passa a constar vem com a situação dela', () => {
    // Gil já reativado em 08/10, com presença de 01/10 cortada pelo retorno. Corrigir saída e retorno para 28/09 e
    // 30/09 põe 01/10 depois do retorno (passa a constar como presente) e corta 24/09 no mês de setembro.
    const reativado = gil(true);
    const historico = {
      ...reativado,
      jogadores: reativado.jogadores.map((j) => (j.id === 'g' ? { ...j, periodos: retornoEm8 } : j)),
    };
    const r = previaDosPeriodos(
      historico,
      'g',
      [
        { inicio: '2026-01-01', fim: '2026-09-28' },
        { inicio: '2026-09-30', fim: null },
      ],
      '2026-10-16',
    );
    expect(r.rodadasQuePassamAConstar).toEqual([{ data: '2026-10-01', situacao: 'presente' }]);
    expect(r.rodadasQueDeixamDeConstar).toEqual([{ data: '2026-09-24' }]);
    expect(r.aviso).toBeNull();
  });

  it('PAR-114: retorno antecipado para o meio do mês corta a presença do mesmo mês anterior a ele', () => {
    // Edu tem presença de 10/09 gravada fora de período (PAR-60). Antecipar o retorno a 10/09 faz setembro contar desde
    // o retorno: 03/09 deixa de constar; 10/09 já constava e continua.
    const comPresenca = { ...base, presencas: [...base.presencas, presenca('e', '2026-09-10')] };
    const r = previaDosPeriodos(
      comPresenca,
      'e',
      [
        { inicio: '2026-01-01', fim: '2026-09-05' },
        { inicio: '2026-09-10', fim: null },
      ],
      HOJE,
    );
    expect(r.rodadasQueDeixamDeConstar).toEqual([{ data: '2026-09-03' }]);
    expect(r.rodadasQuePassamAConstar).toEqual([]);
    expect(r.aviso).toBeNull();
  });
});

describe('previaDoInicio', () => {
  it('PAR-115: recuo que não alcança presença mantém o acumulado e só passa rodadas de "–" a falta', () => {
    const hugo = jogador('h', 'Hugo', {
      anoNascimento: 1980,
      periodos: [{ inicio: '2026-10-01', fim: null }],
      inicioPontuacao: '2026-10-01',
      pontuacaoInicial: 4,
    });
    const historico = {
      ...base,
      jogadores: [...base.jogadores, hugo],
      presencas: [...base.presencas, presenca('h', '2026-10-01'), presenca('h', '2026-10-08')],
    };
    const r = previaDoInicio(historico, 'h', '2026-09-01', HOJE);
    expect(r.acumuladoDepois).toBe(r.acumuladoAntes);
    expect(r.acumuladoAntes).toBe(7);
    expect(r.posicaoDepois).toBe(r.posicaoAntes);
    // 03/09 e 10/09 passam de "–" a falta; agosto continua antes da nova data.
    expect(r.rodadasQuePassamAConstar).toBe(2);
  });

  it('PAR-111: data de início hoje dá 0 e recuar volta ao valor de antes (Kim)', () => {
    const kim = jogador('k', 'Kim', { inicioPontuacao: HOJE, pontuacaoInicial: 3 });
    const historico = {
      ...base,
      jogadores: [...base.jogadores, kim],
      presencas: [...base.presencas, ...base.partidas.map((p) => presenca('k', p.data))],
    };
    const r = previaDoInicio(historico, 'k', '2026-01-01', HOJE);
    expect(r).toEqual({
      acumuladoAntes: 0,
      acumuladoDepois: 11,
      posicaoAntes: 6,
      posicaoDepois: 1,
      rodadasQuePassamAConstar: 6,
    });
  });

  it('PAR-111: data igual à atual não muda nada', () => {
    const kim = jogador('k', 'Kim', { inicioPontuacao: '2026-09-01' });
    const r = previaDoInicio({ ...base, jogadores: [...base.jogadores, kim] }, 'k', '2026-09-01', HOJE);
    expect(r.acumuladoDepois).toBe(r.acumuladoAntes);
    expect(r.posicaoDepois).toBe(r.posicaoAntes);
    expect(r.rodadasQuePassamAConstar).toBe(0);
  });

  it('PAR-112: data recusada pela gravação lança com a mesma mensagem', () => {
    expect(() => previaDoInicio(base, 'a', '2026-10-20', HOJE)).toThrow(MENSAGEM_FUTURO);
  });
});
