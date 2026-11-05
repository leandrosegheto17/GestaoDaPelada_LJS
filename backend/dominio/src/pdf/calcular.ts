/**
 * Projeção do PDF do mês (T13; PAR-96 a PAR-99).
 */
import type { Data } from '../atividade/datas.ts';
import { compararDatas, mesDe, ultimoDia, vespera, type Mes } from '../datas.ts';
import { criarResolvedorDePesos } from '../pontuacao/resolvedor.ts';
import {
  acumuladoDoJogador,
  agruparPresencasPorJogador,
  ativosHoje,
  calcularRanking,
  periodoDoMes,
  rodadasNoMes,
  type EntradaRanking,
} from '../ranking/calcular.ts';
import type { Rodada } from '../ranking/rodadas.ts';

/** Máximo de colunas de partida no PDF de uma página (PAR-96, PAR-101). */
export const MAX_COLUNAS_PDF = 12;

export interface ColunaPdf {
  id: string;
  data: Data;
  choveu: boolean;
  /** A partida é do mês exibido; as outras completam com meses anteriores. */
  doMesExibido: boolean;
}

export interface ColunasPdf {
  colunas: ColunaPdf[];
  /** O mês exibido não tem partida: as colunas são só de meses anteriores (PAR-97). */
  semPartidasNoMes: boolean;
}

export interface LinhaPdf {
  jogadorId: string;
  posicao: number;
  apelido: string;
  /** Acumulado até a véspera da primeira coluna; sem coluna, o PTS FINAL (PAR-98). */
  ptsInicial: number;
  /** Uma rodada por coluna, na ordem das colunas. */
  rodadas: Rodada[];
  /** O mesmo do ranking do mês (PAR-99). */
  ptsFinal: number;
}

export interface ProjecaoPdf {
  semPartidasNoMes: boolean;
  colunas: ColunaPdf[];
  linhas: LinhaPdf[];
}

/**
 * Colunas do PDF (PAR-96): as partidas até o último dia do mês, as 12 mais recentes, em ordem cronológica. Uma partida do
 * mês só sai quando o mês tem mais de 12 (legado, `B:63`); janeiro completa com dezembro do ano anterior (`B:499`).
 */
export function escolherColunasPdf(
  partidas: readonly { id: string; data: Data; choveu: boolean }[],
  mes: Mes,
): ColunasPdf {
  const fim = ultimoDia(mes);
  const ate = partidas
    .filter((p) => compararDatas(p.data, fim) <= 0)
    .sort((a, b) => compararDatas(a.data, b.data));
  const colunas = ate.slice(-MAX_COLUNAS_PDF).map((p): ColunaPdf => ({
    id: p.id,
    data: p.data,
    choveu: p.choveu,
    doMesExibido: mesDe(p.data) === mes,
  }));
  return { colunas, semPartidasNoMes: !ate.some((p) => mesDe(p.data) === mes) };
}

/**
 * As linhas, a ordem, as posições e o PTS FINAL do ranking do mês (PAR-99), com as colunas de `escolherColunasPdf`. As
 * rodadas seguem PAR-71 a PAR-73 com o início da contagem do mês exibido; o `ptsInicial` é o acumulado até a véspera da
 * primeira coluna, ou o `ptsFinal` sem coluna (PAR-98, I-42).
 */
export function calcularPdf(entrada: EntradaRanking): ProjecaoPdf {
  const ranking = calcularRanking(entrada);
  const { colunas, semPartidasNoMes } = escolherColunasPdf(entrada.partidas, entrada.mes);
  const resolver = criarResolvedorDePesos(entrada.configsPesos);
  const ativos = new Map(ativosHoje(entrada.jogadores, entrada.hoje).map((j) => [j.id, j]));
  const presencasPorJogador = agruparPresencasPorJogador(entrada.partidas, entrada.presencas);
  const periodoEm = periodoDoMes(entrada.hoje, entrada.mes);
  const primeira = colunas[0];

  const linhas = ranking.linhas.map((linha): LinhaPdf => {
    const jogador = ativos.get(linha.jogadorId);
    if (!jogador) throw new Error('Linha do ranking sem jogador ativo.');
    const presencas = presencasPorJogador.get(linha.jogadorId) ?? [];
    const rodadas = rodadasNoMes(jogador, presencas, colunas, resolver, periodoEm);
    const ptsInicial =
      primeira === undefined
        ? linha.ptsFinal
        : acumuladoDoJogador(jogador, presencas, resolver, vespera(primeira.data), periodoEm);
    return {
      jogadorId: linha.jogadorId,
      posicao: linha.posicao,
      apelido: linha.apelido,
      ptsInicial,
      rodadas,
      ptsFinal: linha.ptsFinal,
    };
  });
  return { semPartidasNoMes, colunas, linhas };
}
