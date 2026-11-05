/**
 * Classificação em 2 times (T6; SIM-21, SIM-22, SIM-23, SIM-89): a entrada já vem na ordem de prioridade (T5) e não é
 * reordenada aqui. Titulares são os 2N primeiros; entram no 2º tempo os próximos 2 × min(K, N) (2N com K ilimitado);
 * o resto fica em "não entra" (legado `classificacao.ts:32-46`). Quem fica em "não entra" compareceu: conta como
 * presente na pré-marcação (SIM-75).
 */
import type { Limite } from './base.ts';

/** O mínimo que a classificação usa de cada apto. */
export interface AptoOrdenado {
  id: string;
  so1oTempo: boolean;
}

export interface ReservaQueEntra<A extends AptoOrdenado = AptoOrdenado> {
  apto: A;
  /** Reserva "só 1º tempo" que entra joga só o 2º tempo (SIM-23): é informação, a regra é a mesma dos demais. */
  jogaSo2oTempo: boolean;
}

export interface ClassificacaoDois<A extends AptoOrdenado = AptoOrdenado> {
  titulares: A[];
  reservasQueEntram: ReservaQueEntra<A>[];
  naoEntra: A[];
}

/** Vagas de reserva no 2º tempo, somando os dois times: 2 × min(K, N); sem limite, 2N. */
export function vagasDeReserva(n: number, k: Limite): number {
  return 2 * (k === 'ilimitado' ? n : Math.min(k, n));
}

/** Classifica os aptos já ordenados. Menos de 2N aptos é erro de programação: a prévia recusa antes (SIM-56). */
export function classificarDoisTimes<A extends AptoOrdenado>(
  ordenados: readonly A[],
  n: number,
  k: Limite,
): ClassificacaoDois<A> {
  if (ordenados.length < 2 * n) {
    throw new RangeError(`aptos insuficientes: ${ordenados.length} para 2 times de ${n}`);
  }
  const fimTitulares = 2 * n;
  const fimReservas = fimTitulares + vagasDeReserva(n, k);
  return {
    titulares: ordenados.slice(0, fimTitulares),
    reservasQueEntram: ordenados.slice(fimTitulares, fimReservas).map((apto) => ({ apto, jogaSo2oTempo: apto.so1oTempo })),
    naoEntra: ordenados.slice(fimReservas),
  };
}
