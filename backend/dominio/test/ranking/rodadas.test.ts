import { describe, expect, it } from 'vitest';
import { PESOS_PADRAO, type SituacaoGravada } from '../../src/pontuacao/pesos.ts';
import { criarResolvedorDePesos } from '../../src/pontuacao/resolvedor.ts';
import { rodadasDoJogador, type PartidaDaRodada } from '../../src/ranking/rodadas.ts';

/**
 * Rodadas de cada jogador (T10; PAR-71, PAR-72, PAR-73, PAR-60).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - rodada anterior ao início da contagem é `fora`, mesmo com presença gravada (`B:486`);
 * - rodada no dia exato do início da contagem já conta;
 * - ativo sem presença: `falta` com 0; não ativo sem presença: `fora` com nulo;
 * - presença fora de período, depois do início da contagem, aparece com a situação (`B:497`);
 * - período que termina na data da partida: sem presença, `fora`;
 * - pontos pela chuva da partida e pela vigência na data dela; sem início da contagem, nada é cortado.
 */

const resolver = criarResolvedorDePesos([
  { ...PESOS_PADRAO, vigenteDesde: '2026-01-01' },
  { ...PESOS_PADRAO, presencaComChuva: 2, vigenteDesde: '2026-10-10' },
]);
const partida = (data: string, choveu = false): PartidaDaRodada => ({ id: `p-${data}`, data, choveu });
const OUTUBRO = [partida('2026-10-01'), partida('2026-10-08', true), partida('2026-10-15', true), partida('2026-10-22')];

function jogador(periodos: { inicio: string; fim: string | null }[], presencas: [string, SituacaoGravada][]) {
  return { periodos, situacaoPorPartida: new Map(presencas.map(([data, s]) => [`p-${data}`, s])) };
}

describe('rodadasDoJogador', () => {
  it('PAR-73: rodada anterior ao início da contagem é fora mesmo com presença gravada', () => {
    const j = jogador([{ inicio: '2026-01-01', fim: null }], [['2026-10-01', 'presente'], ['2026-10-08', 'presente']]);
    expect(rodadasDoJogador(j, OUTUBRO, '2026-10-08', resolver)).toEqual([
      { situacao: 'fora', pontos: null },
      { situacao: 'presente', pontos: 1 },
      { situacao: 'falta', pontos: 0 },
      { situacao: 'falta', pontos: 0 },
    ]);
  });

  it('PAR-72: ativo sem presença é falta com 0', () => {
    const j = jogador([{ inicio: '2026-01-01', fim: null }], []);
    expect(rodadasDoJogador(j, OUTUBRO, undefined, resolver).every((r) => r.situacao === 'falta' && r.pontos === 0)).toBe(true);
  });

  it('PAR-73: não ativo na data e sem presença é fora com pontos nulos; período que termina na data não o deixa ativo', () => {
    const j = jogador([{ inicio: '2026-01-01', fim: '2026-10-15' }], []);
    expect(rodadasDoJogador(j, OUTUBRO, undefined, resolver).map((r) => r.situacao)).toEqual(['falta', 'falta', 'fora', 'fora']);
    expect(rodadasDoJogador(j, OUTUBRO, undefined, resolver)[3]?.pontos).toBeNull();
  });

  it('PAR-60: presença fora de período e depois do início da contagem aparece com a situação', () => {
    const j = jogador([{ inicio: '2026-01-01', fim: '2026-10-05' }], [['2026-10-22', 'lesionado']]);
    expect(rodadasDoJogador(j, OUTUBRO, '2026-01-01', resolver)[3]).toEqual({ situacao: 'lesionado', pontos: 1 });
  });

  it('PAR-71: pontos pela chuva da partida e pela vigência na data dela', () => {
    const j = jogador(
      [{ inicio: '2026-01-01', fim: null }],
      [['2026-10-08', 'presente'], ['2026-10-15', 'presente'], ['2026-10-22', 'expulso']],
    );
    expect(rodadasDoJogador(j, OUTUBRO, undefined, resolver).map((r) => r.pontos)).toEqual([0, 1, 2, -1]);
  });
});
