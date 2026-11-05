/**
 * Saída no intervalo e pares "sai → entra" de um time em 2 times (T7; SIM-24, SIM-25, SIM-89, SIM-90). Regra do legado
 * `classificacao.ts:52-60`, escrita do zero.
 */
import type { AptoOrdenado } from './classificacao.ts';

/**
 * Ids que saem no intervalo: todos os titulares "só 1º tempo" (mesmo sem reserva para entrar, SIM-90), na ordem de
 * prioridade, e, até completar max(titulares "só 1º", reservas que entram) saídas, os demais titulares de pior
 * prioridade, do pior para o melhor (SIM-24). Os titulares chegam na ordem de prioridade do time.
 */
export function saidaNoIntervalo(
  titularesDoTime: readonly AptoOrdenado[],
  reservasEntrando: number,
): string[] {
  const so1o = titularesDoTime.filter((t) => t.so1oTempo).map((t) => t.id);
  const total = Math.min(Math.max(so1o.length, reservasEntrando), titularesDoTime.length);
  const demaisDoPiorParaOMelhor = titularesDoTime
    .filter((t) => !t.so1oTempo)
    .map((t) => t.id)
    .reverse();
  return [...so1o, ...demaisDoPiorParaOMelhor.slice(0, total - so1o.length)];
}

export interface ParTroca {
  sai: string;
  entra: string;
}

export interface Pares {
  pares: ParTroca[];
  saiSemPar: string[];
  entraSemPar: string[];
}

/** Pares na ordem de saída e na ordem de prioridade de quem entra; as sobras de cada lado vão à parte (SIM-25). */
export function formarPares(saem: readonly string[], entram: readonly string[]): Pares {
  const quantos = Math.min(saem.length, entram.length);
  const pares: ParTroca[] = [];
  for (let i = 0; i < quantos; i += 1) pares.push({ sai: saem[i]!, entra: entram[i]! });
  return { pares, saiSemPar: saem.slice(quantos), entraSemPar: entram.slice(quantos) };
}
