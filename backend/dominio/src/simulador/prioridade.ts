/**
 * Ordem de prioridade em 2 times (T5; SIM-16, SIM-17, SIM-18; AD-085). Acumulado de cada apto até a véspera da data
 * da partida pela função única de acumulado (PAR-58 a PAR-61), maior primeiro; depois ano de nascimento (menor primeiro,
 * sem ano no fim), apelido sem acento nem caixa e id. É a ordem própria do simulador: o `ordenarPorRanking` não desempata
 * por id e não muda (AD-085). Regra do legado `dominio/src/simulador/prioridade.ts`, escrita do zero.
 */
import { chaveBusca } from '../elenco/apelido.ts';
import { vespera } from '../datas.ts';
import { acumuladoPorInicio } from '../pontuacao/acumulado.ts';
import type { ConfigPesos } from '../pontuacao/pesos.ts';
import { criarResolvedorDePesos } from '../pontuacao/resolvedor.ts';
import {
  agruparPresencasPorJogador,
  type JogadorDoRanking,
  type PartidaDoRanking,
  type PresencaDoRanking,
} from '../ranking/calcular.ts';
import { compararIds, type Apto, type Data } from './base.ts';

/** O histórico do grupo, como o ranking o recebe; partidas e presenças em qualquer ordem. */
export interface HistoricoSim {
  jogadores: readonly JogadorDoRanking[];
  partidas: readonly PartidaDoRanking[];
  presencas: readonly PresencaDoRanking[];
  configsPesos: readonly ConfigPesos[];
}

/** Acumulado de cada apto até a véspera da data (SIM-17: a partida da própria data não conta). */
export function acumuladosNaVespera(aptos: readonly Apto[], historico: HistoricoSim, data: Data): Map<string, number> {
  const referencia = vespera(data);
  const resolver = criarResolvedorDePesos(historico.configsPesos);
  const presencas = agruparPresencasPorJogador(historico.partidas, historico.presencas);
  const jogadores = new Map(historico.jogadores.map((j) => [j.id, j]));
  const acumulados = new Map<string, number>();
  for (const apto of aptos) {
    const jogador = jogadores.get(apto.id);
    if (!jogador) throw new Error(`apto sem histórico: ${apto.id}`);
    acumulados.set(
      apto.id,
      acumuladoPorInicio({
        inicio: jogador.inicioPontuacao,
        pontuacaoInicial: jogador.pontuacaoInicial,
        presencas: presencas.get(apto.id) ?? [],
        configs: resolver,
        referencia,
        periodos: jogador.periodos,
      }),
    );
  }
  return acumulados;
}

/**
 * Os aptos na ordem de prioridade. A ordem da entrada não influi (SIM-49): o último desempate é o id. Sem partida
 * anterior, o acumulado é a pontuação inicial de cada um e decidem os desempates (SIM-18).
 */
export function ordemDePrioridade<A extends Apto>(aptos: readonly A[], historico: HistoricoSim, data: Data): A[] {
  const acumulados = acumuladosNaVespera(aptos, historico, data);
  const ano = (a: A): number => a.anoNascimento ?? Number.MAX_SAFE_INTEGER;
  return [...aptos].sort((a, b) => {
    const porAcumulado = acumulados.get(b.id)! - acumulados.get(a.id)!;
    if (porAcumulado !== 0) return porAcumulado;
    const porAno = ano(a) - ano(b);
    if (porAno !== 0) return porAno;
    const ca = chaveBusca(a.apelido);
    const cb = chaveBusca(b.apelido);
    if (ca !== cb) return ca < cb ? -1 : 1;
    return compararIds(a.id, b.id);
  });
}

/** Posição de cada id na ordem (0 = melhor), para indicadores e avisos. */
export function posicoesDe(ordem: readonly { id: string }[]): Map<string, number> {
  return new Map(ordem.map((a, i) => [a.id, i]));
}
