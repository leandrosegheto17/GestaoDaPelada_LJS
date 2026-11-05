/**
 * Sugestão do simulador (T15; SIM-19, SIM-47, SIM-48, SIM-49): prévia → (2 times) prioridade, classificação,
 * distribuição → indicadores → avisos; em 3 ou mais, montagem e distribuição sem ordem de prioridade (SIM-19). Não
 * grava nem sorteia: a mesma entrada dá sempre a mesma sugestão, em qualquer ordem dos aptos (SIM-48, SIM-49), porque
 * a entrada é normalizada (aptos por id) antes de calcular. Regra do legado `dominio/src/simulador/sugerir.ts`,
 * escrita do zero.
 */
import {
  compararIds,
  montarElenco,
  type Apto,
  type Data,
  type Formato,
  type Limite,
} from './base.ts';
import { avisosDoisTimes, avisosVariosTimes, type Aviso } from './avisos.ts';
import type { ComposicaoDois } from './chave-dois.ts';
import { classificarDoisTimes } from './classificacao.ts';
import { descreverPrevia } from './descricao.ts';
import { distribuirDoisTimes } from './distribuicao-dois.ts';
import { distribuirVariosTimes } from './distribuicao-varios.ts';
import { indicadoresDoisTimes, type IndicadoresTimeDois } from './indicadores-dois.ts';
import { indicadoresVariosTimes, type IndicadoresTimeVarios } from './indicadores-varios.ts';
import { calcularPrevia, type Previa } from './previa.ts';
import { ordemDePrioridade, posicoesDe, type HistoricoSim } from './prioridade.ts';
import { montarVariosTimes } from './varios-inicial.ts';

export interface EntradaSimulador {
  formato: Formato;
  /** Data da partida: escolhe o acumulado (véspera) e a idade (ano da data). */
  data: Data;
  n: number;
  /** Só vale em 2 times; ignorado em 3 ou mais. */
  k: Limite;
  aptos: readonly Apto[];
}

export interface SugestaoDois {
  valida: true;
  formato: 'dois_times';
  descricao: string;
  /** Ids na ordem de prioridade (SIM-20). */
  ordemPrioridade: string[];
  composicao: ComposicaoDois;
  indicadores: [IndicadoresTimeDois, IndicadoresTimeDois];
  avisos: Aviso[];
}

export interface SugestaoVarios {
  valida: true;
  formato: 'varios_times';
  descricao: string;
  /** Ids de cada time, por nível e id; o incompleto é o último. */
  times: string[][];
  incompleto: number | null;
  indicadores: IndicadoresTimeVarios[];
  avisos: Aviso[];
}

/** Aptos insuficientes: a prévia e a descrição dela, para o 422 no campo `aptos` (SIM-47, SIM-56). */
export interface SugestaoInvalida {
  valida: false;
  previa: Previa;
  descricao: string;
}

export type Sugestao = SugestaoDois | SugestaoVarios | SugestaoInvalida;

/** Aptos por id; em 3 ou mais, sem "só 1º" (o contrato já recusa, SIM-33). */
export function normalizarAptos(formato: Formato, aptos: readonly Apto[]): Apto[] {
  const ordenados = [...aptos].sort((a, b) => compararIds(a.id, b.id));
  return formato === 'varios_times'
    ? ordenados.map((a) => ({ ...a, so1oTempo: false }))
    : ordenados;
}

export function sugerir(entrada: EntradaSimulador, historico: HistoricoSim): Sugestao {
  const { formato, data, n, k } = entrada;
  const aptos = normalizarAptos(formato, entrada.aptos);
  const previa = calcularPrevia({ formato, n, aptos: aptos.length });
  const descricao = descreverPrevia(previa);
  if (!previa.valida) return { valida: false, previa, descricao };

  const elenco = montarElenco(aptos, data);

  if (formato === 'varios_times') {
    const { times, incompleto } = distribuirVariosTimes(montarVariosTimes(elenco, n), elenco);
    return {
      valida: true,
      formato,
      descricao,
      times,
      incompleto,
      indicadores: indicadoresVariosTimes(times, elenco),
      avisos: avisosVariosTimes({ n, times, elenco }),
    };
  }

  const ordem = ordemDePrioridade(aptos, historico, data);
  const posicoes = posicoesDe(ordem);
  const { composicao } = distribuirDoisTimes(classificarDoisTimes(ordem, n, k), n, elenco);
  const indicadores = indicadoresDoisTimes(composicao, elenco, posicoes);
  return {
    valida: true,
    formato,
    descricao,
    ordemPrioridade: ordem.map((a) => a.id),
    composicao,
    indicadores,
    avisos: avisosDoisTimes({ n, composicao, indicadores, elenco, posicoes }),
  };
}
