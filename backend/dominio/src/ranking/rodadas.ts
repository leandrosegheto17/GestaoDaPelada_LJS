/**
 * Rodadas de um jogador nas partidas de um mês (T10; PAR-71, PAR-72, PAR-73, PAR-60). É a mesma conta do ranking, do
 * PDF e das prévias.
 */
import { ativoEm, type Data, type Periodo } from '../atividade/datas.ts';
import { compararDatas } from '../datas.ts';
import { pontosDaPresenca, type SituacaoGravada } from '../pontuacao/pesos.ts';
import type { ResolvedorDePesos } from '../pontuacao/resolvedor.ts';

export type SituacaoRodada = SituacaoGravada | 'falta' | 'fora';

export interface Rodada {
  situacao: SituacaoRodada;
  /** Nulo quando a rodada é "–" (`fora`). */
  pontos: number | null;
}

export interface PartidaDaRodada {
  id: string;
  data: Data;
  choveu: boolean;
}

export interface JogadorDaRodada {
  periodos: readonly Periodo[];
  /** Situação gravada por id de partida. */
  situacaoPorPartida: ReadonlyMap<string, SituacaoGravada>;
}

/**
 * Uma rodada por partida, na ordem recebida: partida anterior ao início da contagem do mês é `fora` com ou sem presença
 * (PAR-73); presença gravada dá a situação e os pontos, mesmo fora de período (PAR-71, PAR-60); sem presença, `falta`
 * com 0 se ativo na data (PAR-72) e `fora` com pontos nulos se não (PAR-73).
 */
export function rodadasDoJogador(
  jogador: JogadorDaRodada,
  partidas: readonly PartidaDaRodada[],
  inicioDaContagemDoMes: Data | undefined,
  resolverPesos: ResolvedorDePesos,
): Rodada[] {
  return partidas.map((partida): Rodada => {
    if (inicioDaContagemDoMes !== undefined && compararDatas(partida.data, inicioDaContagemDoMes) < 0) {
      return { situacao: 'fora', pontos: null };
    }
    const gravada = jogador.situacaoPorPartida.get(partida.id);
    if (gravada !== undefined) {
      return { situacao: gravada, pontos: pontosDaPresenca(gravada, partida.choveu, resolverPesos(partida.data)) };
    }
    return ativoEm(jogador.periodos, partida.data) ? { situacao: 'falta', pontos: 0 } : { situacao: 'fora', pontos: null };
  });
}
