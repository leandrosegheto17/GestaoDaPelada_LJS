/**
 * Mês no histórico e navegação entre meses (T12; PAR-41, PAR-66, PAR-84, PAR-85, PAR-86).
 */
import type { Data } from '../atividade/datas.ts';
import { compararDatas, compararMeses, mesAnterior, mesDe, mesSeguinte, type Mes } from '../datas.ts';

export interface LimitesDeMes {
  /** Mês da primeira partida do grupo; nulo sem partidas. */
  primeiro: Mes | null;
  /** Mês de hoje. */
  ultimo: Mes;
}

export interface Navegacao {
  mesAnterior: Mes | null;
  mesSeguinte: Mes | null;
}

/** Do mês da primeira partida do grupo ao mês de hoje. */
export function limitesDeMes(partidas: readonly { data: Data }[], hoje: Data): LimitesDeMes {
  let primeira: Data | null = null;
  for (const p of partidas) if (primeira === null || compararDatas(p.data, primeira) < 0) primeira = p.data;
  return { primeiro: primeira === null ? null : mesDe(primeira), ultimo: mesDe(hoje) };
}

/**
 * Mês do histórico (PAR-66): do mês da primeira partida ao de hoje; sem partidas, só o de hoje (`B:65`).
 */
export function mesNoHistorico(limites: LimitesDeMes, mes: Mes): boolean {
  if (limites.primeiro === null) return mes === limites.ultimo;
  return compararMeses(mes, limites.primeiro) >= 0 && compararMeses(mes, limites.ultimo) <= 0;
}

/**
 * `mesAnterior` só depois do mês da primeira partida (PAR-84); `mesSeguinte` só antes do mês de hoje (PAR-85); os dois
 * nulos sem partidas (PAR-86, PAR-41).
 */
export function navegacaoDeMes(limites: LimitesDeMes, mes: Mes): Navegacao {
  if (limites.primeiro === null) return { mesAnterior: null, mesSeguinte: null };
  return {
    mesAnterior: compararMeses(mes, limites.primeiro) > 0 ? mesAnterior(mes) : null,
    mesSeguinte: compararMeses(mes, limites.ultimo) < 0 ? mesSeguinte(mes) : null,
  };
}
