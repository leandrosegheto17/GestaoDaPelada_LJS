/**
 * Prévias: rodadas que passam ou deixam de constar, aviso de falta e prévia da data de início (T15; PAR-111, PAR-114,
 * PAR-115, PAR-116).
 */
import { avaliarInicio } from '../atividade/avaliar-inicio.ts';
import type { Data, Periodo } from '../atividade/datas.ts';
import { compararDatas, mesDe, type Mes } from '../datas.ts';
import {
  emOrdemDeData,
  periodoDoMes,
  rodadasNoMes,
  type JogadorDoRanking,
  type PartidaDoRanking,
} from '../ranking/calcular.ts';
import type { Rodada, SituacaoRodada } from '../ranking/rodadas.ts';
import {
  compararJogador,
  jogadorDoHistorico,
  prepararHistorico,
  type CenariosComparados,
  type HistoricoDoGrupo,
  type HistoricoPreparado,
} from './comparar.ts';

/** PAR-116: exatamente uma rodada que passa a constar é falta. */
export const AVISO_UMA_FALTA = 'Ela vale 0 ponto até você lançar a presença em Editar partida.';
/** PAR-116: duas ou mais rodadas que passam a constar são falta. */
export const AVISO_VARIAS_FALTAS =
  'Elas valem 0 ponto até você lançar a presença em Editar partida.';

export interface RodadaQuePassaAConstar {
  data: Data;
  situacao: Exclude<SituacaoRodada, 'fora'>;
}

export interface RodadaQueDeixaDeConstar {
  data: Data;
}

/** Os campos de PAR-109 (reativar) e PAR-110 (corrigir período). */
export interface PreviaDosPeriodos extends CenariosComparados {
  rodadasQuePassamAConstar: RodadaQuePassaAConstar[];
  rodadasQueDeixamDeConstar: RodadaQueDeixaDeConstar[];
  aviso: string | null;
}

/** Os campos de PAR-111 (data de início). */
export interface PreviaDoInicio extends CenariosComparados {
  rodadasQuePassamAConstar: number;
}

/** PAR-116: conta só as faltas entre as rodadas que passam a constar. */
export function avisoDasRodadas(passam: readonly RodadaQuePassaAConstar[]): string | null {
  const faltas = passam.filter((r) => r.situacao === 'falta').length;
  if (faltas === 0) return null;
  return faltas === 1 ? AVISO_UMA_FALTA : AVISO_VARIAS_FALTAS;
}

/** Uma rodada por partida, cada uma cortada no início da contagem do mês dela (PAR-114, PAR-74). */
function rodadasDeTodosOsMeses(
  jogador: JogadorDoRanking,
  preparado: HistoricoPreparado,
  partidas: readonly PartidaDoRanking[],
  hoje: Data,
): Rodada[] {
  const presencas = preparado.presencasPorJogador.get(jogador.id) ?? [];
  const porMes = new Map<Mes, PartidaDoRanking[]>();
  for (const p of partidas) {
    const mes = mesDe(p.data);
    const lista = porMes.get(mes) ?? [];
    lista.push(p);
    porMes.set(mes, lista);
  }
  const porId = new Map<string, Rodada>();
  for (const [mes, doMes] of porMes) {
    const rodadas = rodadasNoMes(
      jogador,
      presencas,
      doMes,
      preparado.resolver,
      periodoDoMes(hoje, mes),
    );
    doMes.forEach((p, i) => porId.set(p.id, rodadas[i] as Rodada));
  }
  return partidas.map((p) => porId.get(p.id) as Rodada);
}

/**
 * Passa a constar a partida em que a rodada era "–" (`fora`) e passa a ter situação; deixa de constar o inverso
 * (PAR-114). Só as partidas até hoje, em ordem de data.
 */
function diferencaDasRodadas(
  historico: HistoricoDoGrupo,
  preparado: HistoricoPreparado,
  antes: JogadorDoRanking,
  depois: JogadorDoRanking,
  hoje: Data,
): { passam: RodadaQuePassaAConstar[]; deixam: RodadaQueDeixaDeConstar[] } {
  const partidas = emOrdemDeData(
    historico.partidas.filter((p) => compararDatas(p.data, hoje) <= 0),
  );
  const rodadasAntes = rodadasDeTodosOsMeses(antes, preparado, partidas, hoje);
  const rodadasDepois = rodadasDeTodosOsMeses(depois, preparado, partidas, hoje);
  const passam: RodadaQuePassaAConstar[] = [];
  const deixam: RodadaQueDeixaDeConstar[] = [];
  partidas.forEach((p, i) => {
    const a = (rodadasAntes[i] as Rodada).situacao;
    const d = (rodadasDepois[i] as Rodada).situacao;
    if (a === 'fora' && d !== 'fora') passam.push({ data: p.data, situacao: d });
    else if (a !== 'fora' && d === 'fora') deixam.push({ data: p.data });
  });
  return { passam, deixam };
}

/**
 * Prévia de reativar (PAR-109) ou de corrigir saída ou retorno (PAR-110): acumulado e posição de hoje antes e depois
 * (PAR-113), rodadas que passam e deixam de constar (PAR-114) e o `aviso` das faltas (PAR-116). Os períodos de depois
 * já foram validados como na gravação (PAR-112).
 */
export function previaDosPeriodos(
  historico: HistoricoDoGrupo,
  jogadorId: string,
  periodosDepois: readonly Periodo[],
  hoje: Data,
): PreviaDosPeriodos {
  const preparado = prepararHistorico(historico);
  const antes = jogadorDoHistorico(historico, jogadorId);
  const depois: JogadorDoRanking = { ...antes, periodos: periodosDepois };
  const cenarios = compararJogador(historico, depois, hoje, preparado);
  const { passam, deixam } = diferencaDasRodadas(historico, preparado, antes, depois, hoje);
  return {
    ...cenarios,
    rodadasQuePassamAConstar: passam,
    rodadasQueDeixamDeConstar: deixam,
    aviso: avisoDasRodadas(passam),
  };
}

/**
 * Prévia da data de início da pontuação (PAR-111): a nova data passa pela mesma avaliação da gravação (`avaliarInicio`,
 * GEL-77 a GEL-82), então o recuo para antes do primeiro período alinha o início dele à nova data (GEL-81, PAR-115).
 * Data recusada lança com a mensagem da gravação; quem chama valida antes e devolve o 422 (PAR-112).
 */
export function previaDoInicio(
  historico: HistoricoDoGrupo,
  jogadorId: string,
  novaData: Data,
  hoje: Data,
): PreviaDoInicio {
  const preparado = prepararHistorico(historico);
  const antes = jogadorDoHistorico(historico, jogadorId);
  const ordenados = [...antes.periodos].sort((a, b) => compararDatas(a.inicio, b.inicio));
  const avaliacao = avaliarInicio({
    periodos: ordenados,
    inicioPontuacao: antes.inicioPontuacao ?? null,
    novaData,
    hoje,
  });
  if (!avaliacao.ok) throw new Error(avaliacao.mensagem);
  // Data igual à atual não grava (GEL-82): o cenário de depois é o de antes.
  const depois: JogadorDoRanking = avaliacao.alterado
    ? { ...antes, periodos: avaliacao.periodos, inicioPontuacao: avaliacao.inicioPontuacao }
    : antes;
  const cenarios = compararJogador(historico, depois, hoje, preparado);
  const { passam } = diferencaDasRodadas(historico, preparado, antes, depois, hoje);
  return { ...cenarios, rodadasQuePassamAConstar: passam.length };
}
