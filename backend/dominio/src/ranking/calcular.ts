/**
 * Ranking do mês (T11; PAR-67, PAR-70, PAR-74, PAR-75, PAR-86, PAR-87), calculado na leitura a partir de jogadores,
 * períodos, partidas, presenças e pesos (PAR-62).
 */
import { ativoEm, type Data, type Periodo } from '../atividade/datas.ts';
import { compararDatas, mesDe, primeiroDia, ultimoDia, vespera, type Mes } from '../datas.ts';
import { acumuladoPorInicio } from '../pontuacao/acumulado.ts';
import { inicioDaContagem } from '../pontuacao/inicio.ts';
import type { ConfigPesos, SituacaoGravada } from '../pontuacao/pesos.ts';
import { criarResolvedorDePesos, type ResolvedorDePesos } from '../pontuacao/resolvedor.ts';
import { limitesDeMes, navegacaoDeMes, type LimitesDeMes, type Navegacao } from './navegacao.ts';
import { ordenarPorRanking } from './ordenar.ts';
import { rodadasDoJogador, type PartidaDaRodada, type Rodada } from './rodadas.ts';

export interface JogadorDoRanking {
  id: string;
  apelido: string;
  anoNascimento: number | null;
  /** Em qualquer ordem. */
  periodos: readonly Periodo[];
  /** Pontos de antes da primeira partida registrada (PAR-59). */
  pontuacaoInicial: number;
  /** Data de início da pontuação (S). */
  inicioPontuacao?: Data | undefined;
}

export type PartidaDoRanking = PartidaDaRodada;

export interface PresencaDoRanking {
  partidaId: string;
  jogadorId: string;
  situacao: SituacaoGravada;
}

export interface EntradaRanking {
  /** Hoje em São Paulo, vindo de fora: o domínio não lê relógio. */
  hoje: Data;
  /** Mês exibido. */
  mes: Mes;
  jogadores: readonly JogadorDoRanking[];
  /** As partidas do grupo até hoje, em qualquer ordem. */
  partidas: readonly PartidaDoRanking[];
  presencas: readonly PresencaDoRanking[];
  configsPesos: readonly ConfigPesos[];
}

export interface LinhaRanking {
  jogadorId: string;
  apelido: string;
  posicao: number;
  ptsInicial: number;
  /** Uma por partida do mês, em ordem crescente de data. */
  rodadas: Rodada[];
  ptsFinal: number;
}

export interface PartidaDoMes {
  data: Data;
  choveu: boolean;
}

export interface ResultadoRanking {
  linhas: LinhaRanking[];
  partidas: PartidaDoMes[];
  resumoMes: { partidas: number; comChuva: number };
  navegacao: Navegacao;
  limites: LimitesDeMes;
}

/** Presença de um jogador com a data e a chuva da partida. */
export interface PresencaComPartida {
  partidaId: string;
  data: Data;
  choveu: boolean;
  situacao: SituacaoGravada;
}

/** Data que escolhe o período do jogador num mês: o último dia dele, ou hoje se vier antes (PAR-74). */
export function periodoDoMes(hoje: Data, mes: Mes): Data {
  const fim = ultimoDia(mes);
  return compararDatas(hoje, fim) < 0 ? hoje : fim;
}

/** Presenças de cada jogador com a data e a chuva da partida; presença de partida desconhecida é ignorada. */
export function agruparPresencasPorJogador(
  partidas: readonly PartidaDoRanking[],
  presencas: readonly PresencaDoRanking[],
): Map<string, PresencaComPartida[]> {
  const porId = new Map(partidas.map((p) => [p.id, p]));
  const resultado = new Map<string, PresencaComPartida[]>();
  for (const pr of presencas) {
    const partida = porId.get(pr.partidaId);
    if (!partida) continue;
    const lista = resultado.get(pr.jogadorId) ?? [];
    lista.push({ partidaId: pr.partidaId, data: partida.data, choveu: partida.choveu, situacao: pr.situacao });
    resultado.set(pr.jogadorId, lista);
  }
  return resultado;
}

/** Os jogadores ativos em `data` (PAR-67). */
export function ativosHoje<T extends { periodos: readonly Periodo[] }>(jogadores: readonly T[], hoje: Data): T[] {
  return jogadores.filter((j) => ativoEm(j.periodos, hoje));
}

export const emOrdemDeData = <P extends { data: Data }>(partidas: readonly P[]): P[] =>
  [...partidas].sort((a, b) => compararDatas(a.data, b.data));

/** Rodadas de um jogador nas partidas dadas, cortadas no início da contagem do mês exibido. */
export function rodadasNoMes(
  jogador: JogadorDoRanking,
  presencas: readonly PresencaComPartida[],
  partidas: readonly PartidaDoRanking[],
  resolver: ResolvedorDePesos,
  periodoEm: Data,
): Rodada[] {
  return rodadasDoJogador(
    { periodos: jogador.periodos, situacaoPorPartida: new Map(presencas.map((p) => [p.partidaId, p.situacao])) },
    partidas,
    inicioDaContagem(jogador.inicioPontuacao, jogador.periodos, periodoEm),
    resolver,
  );
}

/** Acumulado de um jogador até `referencia`, com o período tomado em `periodoEm`, pela função única. */
export function acumuladoDoJogador(
  jogador: JogadorDoRanking,
  presencas: readonly PresencaComPartida[],
  resolver: ResolvedorDePesos,
  referencia: Data,
  periodoEm?: Data,
): number {
  return acumuladoPorInicio({
    inicio: jogador.inicioPontuacao,
    pontuacaoInicial: jogador.pontuacaoInicial,
    presencas,
    configs: resolver,
    referencia,
    periodos: jogador.periodos,
    periodoEm,
  });
}

/**
 * Ranking do mês `mes` visto em `hoje`: só os ativos hoje, iguais em qualquer mês (PAR-67), na ordem do acumulado de
 * hoje (PAR-68); em cada linha o PTS INICIAL (acumulado até a véspera do dia 1 de M, com o início da contagem tomado no
 * último dia de M ou em hoje, o que vier antes; PAR-74), as rodadas das partidas do mês e o PTS FINAL (PTS INICIAL +
 * rodadas, "–" = 0; PAR-75). Mês sem partidas mantém linhas e ordem, com PTS INICIAL = PTS FINAL (PAR-87); grupo sem
 * partidas dá PTS INICIAL = PTS FINAL = acumulado (PAR-86). Quem chama confere o mês no histórico (T12) antes.
 */
export function calcularRanking(entrada: EntradaRanking): ResultadoRanking {
  const { hoje, mes } = entrada;
  const resolver = criarResolvedorDePesos(entrada.configsPesos);
  const presencasPorJogador = agruparPresencasPorJogador(entrada.partidas, entrada.presencas);
  const ativos = ativosHoje(entrada.jogadores, hoje);
  const acumulados = new Map(
    ativos.map((j) => [j.id, acumuladoDoJogador(j, presencasPorJogador.get(j.id) ?? [], resolver, hoje)]),
  );
  const ordem = ordenarPorRanking(ativos, acumulados);
  const doMes = emOrdemDeData(entrada.partidas.filter((p) => mesDe(p.data) === mes));
  const periodoEm = periodoDoMes(hoje, mes);

  const linhas = ordem.map(({ jogador, posicao }): LinhaRanking => {
    const presencas = presencasPorJogador.get(jogador.id) ?? [];
    const ptsInicial = acumuladoDoJogador(jogador, presencas, resolver, vespera(primeiroDia(mes)), periodoEm);
    const rodadas = rodadasNoMes(jogador, presencas, doMes, resolver, periodoEm);
    const ptsFinal = rodadas.reduce((soma, r) => soma + (r.pontos ?? 0), ptsInicial);
    return { jogadorId: jogador.id, apelido: jogador.apelido, posicao, ptsInicial, rodadas, ptsFinal };
  });

  const limites = limitesDeMes(entrada.partidas, hoje);
  return {
    linhas,
    partidas: doMes.map(({ data, choveu }) => ({ data, choveu })),
    resumoMes: { partidas: doMes.length, comChuva: doMes.filter((p) => p.choveu).length },
    navegacao: navegacaoDeMes(limites, mes),
    limites,
  };
}
