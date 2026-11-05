/**
 * Prévias: acumulado e posição de hoje antes e depois de uma mudança de datas (T14; PAR-109, PAR-110, PAR-113). Usa a
 * função única de acumulado (PAR-61) e a mesma ordem do ranking (PAR-68, PAR-69), com os outros jogadores como estão.
 */
import type { Data, Periodo } from '../atividade/datas.ts';
import { criarResolvedorDePesos, type ResolvedorDePesos } from '../pontuacao/resolvedor.ts';
import {
  acumuladoDoJogador,
  agruparPresencasPorJogador,
  ativosHoje,
  type EntradaRanking,
  type JogadorDoRanking,
  type PresencaComPartida,
} from '../ranking/calcular.ts';
import { ordenarPorRanking } from '../ranking/ordenar.ts';

/** Todo o histórico do grupo até hoje: jogadores com períodos, partidas, presenças e pesos. */
export type HistoricoDoGrupo = Omit<EntradaRanking, 'hoje' | 'mes'>;

export interface CenariosComparados {
  acumuladoAntes: number;
  acumuladoDepois: number;
  /** Nula quando o jogador não está ativo hoje no cenário de antes. */
  posicaoAntes: number | null;
  /** Nula quando o jogador não está ativo hoje no cenário de depois. */
  posicaoDepois: number | null;
}

export const MENSAGEM_JOGADOR_FORA_DO_HISTORICO = 'Jogador fora do histórico do grupo.';

/** Interna: o resolvedor de pesos e as presenças por jogador, montados uma vez para os dois cenários. */
export interface HistoricoPreparado {
  resolver: ResolvedorDePesos;
  presencasPorJogador: Map<string, PresencaComPartida[]>;
}

export function prepararHistorico(historico: HistoricoDoGrupo): HistoricoPreparado {
  return {
    resolver: criarResolvedorDePesos(historico.configsPesos),
    presencasPorJogador: agruparPresencasPorJogador(historico.partidas, historico.presencas),
  };
}

/** O jogador do histórico; quem chama já conferiu que ele é do grupo (404 fora do grupo, PAR-112). */
export function jogadorDoHistorico(
  historico: HistoricoDoGrupo,
  jogadorId: string,
): JogadorDoRanking {
  const jogador = historico.jogadores.find((j) => j.id === jogadorId);
  if (!jogador) throw new Error(MENSAGEM_JOGADOR_FORA_DO_HISTORICO);
  return jogador;
}

function acumuladoEPosicao(
  historico: HistoricoDoGrupo,
  preparado: HistoricoPreparado,
  alvo: JogadorDoRanking,
  acumuladosDosOutros: ReadonlyMap<string, number>,
  hoje: Data,
): { acumulado: number; posicao: number | null } {
  const acumulado = acumuladoDoJogador(
    alvo,
    preparado.presencasPorJogador.get(alvo.id) ?? [],
    preparado.resolver,
    hoje,
  );
  const jogadores = historico.jogadores.map((j) => (j.id === alvo.id ? alvo : j));
  const ativos = ativosHoje(jogadores, hoje);
  if (!ativos.some((j) => j.id === alvo.id)) return { acumulado, posicao: null };
  const acumulados = new Map(acumuladosDosOutros);
  acumulados.set(alvo.id, acumulado);
  const colocado = ordenarPorRanking(ativos, acumulados).find((c) => c.jogador.id === alvo.id);
  return { acumulado, posicao: colocado?.posicao ?? null };
}

/**
 * Interna: compara o jogador como está no histórico com `depois` (o mesmo id, com outras datas). Os acumulados dos outros
 * ativos hoje são calculados uma vez e valem nos dois cenários; a posição do alvo é a do ranking de hoje refeito com ele
 * no lugar (PAR-113).
 */
export function compararJogador(
  historico: HistoricoDoGrupo,
  depois: JogadorDoRanking,
  hoje: Data,
  preparado: HistoricoPreparado = prepararHistorico(historico),
): CenariosComparados {
  const antes = jogadorDoHistorico(historico, depois.id);
  const outros = ativosHoje(
    historico.jogadores.filter((j) => j.id !== depois.id),
    hoje,
  );
  const acumuladosDosOutros = new Map(
    outros.map((j) => [
      j.id,
      acumuladoDoJogador(
        j,
        preparado.presencasPorJogador.get(j.id) ?? [],
        preparado.resolver,
        hoje,
      ),
    ]),
  );
  const a = acumuladoEPosicao(historico, preparado, antes, acumuladosDosOutros, hoje);
  const d = acumuladoEPosicao(historico, preparado, depois, acumuladosDosOutros, hoje);
  return {
    acumuladoAntes: a.acumulado,
    acumuladoDepois: d.acumulado,
    posicaoAntes: a.posicao,
    posicaoDepois: d.posicao,
  };
}

/**
 * Acumulado e posição de hoje antes e depois de trocar os períodos do jogador por `periodosDepois` (reativar, PAR-109;
 * corrigir saída ou retorno, PAR-110), pela função única e com os outros jogadores como estão; `posicao` nula quando o
 * jogador não está ativo hoje naquele cenário (PAR-113). Não valida os períodos: a validação é a da gravação (PAR-112),
 * feita antes por quem chama.
 */
export function compararCenarios(
  historico: HistoricoDoGrupo,
  jogadorId: string,
  periodosDepois: readonly Periodo[],
  hoje: Data,
): CenariosComparados {
  const antes = jogadorDoHistorico(historico, jogadorId);
  return compararJogador(historico, { ...antes, periodos: periodosDepois }, hoje);
}
