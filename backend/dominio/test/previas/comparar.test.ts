import { describe, expect, it } from 'vitest';
import { compararCenarios, MENSAGEM_JOGADOR_FORA_DO_HISTORICO } from '../../src/previas/comparar.ts';
import { calcularRanking } from '../../src/ranking/calcular.ts';
import { historicoDeTresMeses, presenca } from '../apoio/historico.ts';

/**
 * compararCenarios (T14; PAR-109, PAR-110, PAR-113).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - reativar quem estava fora: `posicaoAntes` nula, `posicaoDepois` com posição; o retorno recomeça a contagem (PAR-57);
 * - corrigir a saída para antes de hoje: `posicaoDepois` nula, o acumulado continua calculado (pela função única);
 * - mudança que faz o jogador passar outro: a posição dele é a do ranking de hoje refeito com ele no lugar, igual à do
 *   `calcularRanking` sobre o cenário de depois;
 * - mudança sem efeito: antes = depois;
 * - jogador fora do histórico: erro (quem chama devolve 404 antes, PAR-112).
 *
 * Acumulados de hoje (15/10) no histórico de apoio: Ana 8, Bia 6, Cris 3, Duda 2, Edu 1; Fê 2 (inativa desde 20/09).
 */

const HOJE = '2026-10-15';
const base = historicoDeTresMeses();

describe('compararCenarios', () => {
  it('PAR-113: reativar quem estava fora passa de posicaoAntes nula a uma posição', () => {
    const r = compararCenarios(
      base,
      'f',
      [
        { inicio: '2026-01-01', fim: '2026-09-20' },
        { inicio: '2026-10-08', fim: null },
      ],
      HOJE,
    );
    // O retorno recomeça a contagem: sem presença desde 08/10 e sem a pontuação inicial (havia presença antes).
    expect(r).toEqual({ acumuladoAntes: 2, acumuladoDepois: 0, posicaoAntes: null, posicaoDepois: 6 });
  });

  it('PAR-113: corrigir a saída para antes de hoje dá posicaoDepois nula', () => {
    const r = compararCenarios(base, 'a', [{ inicio: '2026-01-01', fim: '2026-10-10' }], HOJE);
    expect(r).toEqual({ acumuladoAntes: 8, acumuladoDepois: 8, posicaoAntes: 1, posicaoDepois: null });
  });

  it('PAR-113: posições dos outros jogadores são recalculadas no cenário depois', () => {
    // Edu tem uma presença de 10/09 (com chuva, vale 2) gravada fora de período (PAR-60). Antecipar o retorno para
    // 10/09 a põe na contagem: 1 → 3, empatando com Cris em pontos; Cris (1992) fica à frente de Edu (1994) e Duda cai.
    const comPresenca = { ...base, presencas: [...base.presencas, presenca('e', '2026-09-10')] };
    const periodosDepois = [
      { inicio: '2026-01-01', fim: '2026-09-05' },
      { inicio: '2026-09-10', fim: null },
    ];
    const r = compararCenarios(comPresenca, 'e', periodosDepois, HOJE);
    expect(r).toEqual({ acumuladoAntes: 1, acumuladoDepois: 3, posicaoAntes: 5, posicaoDepois: 4 });

    const cenarioDepois = {
      ...comPresenca,
      jogadores: comPresenca.jogadores.map((j) => (j.id === 'e' ? { ...j, periodos: periodosDepois } : j)),
    };
    const ranking = calcularRanking({ ...cenarioDepois, hoje: HOJE, mes: '2026-10' });
    expect(ranking.linhas.find((l) => l.jogadorId === 'e')?.posicao).toBe(r.posicaoDepois);
    expect(ranking.linhas.find((l) => l.jogadorId === 'd')?.posicao).toBe(5);
  });

  it('PAR-113: a posição de antes é a do ranking de hoje', () => {
    const r = compararCenarios(base, 'c', base.jogadores.find((j) => j.id === 'c')?.periodos ?? [], HOJE);
    const ranking = calcularRanking({ ...base, hoje: HOJE, mes: '2026-10' });
    expect(r.posicaoAntes).toBe(ranking.linhas.find((l) => l.jogadorId === 'c')?.posicao);
    expect(r).toEqual({ acumuladoAntes: 3, acumuladoDepois: 3, posicaoAntes: 3, posicaoDepois: 3 });
  });

  it('PAR-110: não altera o histórico recebido', () => {
    const antes = JSON.stringify(base);
    compararCenarios(base, 'a', [{ inicio: '2026-01-01', fim: '2026-10-10' }], HOJE);
    expect(JSON.stringify(base)).toBe(antes);
  });

  it('PAR-112: jogador fora do histórico lança', () => {
    expect(() => compararCenarios(base, 'zzz', [], HOJE)).toThrow(MENSAGEM_JOGADOR_FORA_DO_HISTORICO);
  });
});
