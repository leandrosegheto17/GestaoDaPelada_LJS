/**
 * Indicadores de 2 times (T12; SIM-39, SIM-95): por time, jogadores no 1º e no 2º tempo, nível somado e médio por
 * tempo (médio nulo sem ninguém), idade média de titulares e reservas que entram (só com ano), substituições, quem sai,
 * os pares e as sobras. Valem para a sugestão e para a composição ajustada (T16), por isso os titulares e quem entra
 * são ordenados pela prioridade antes de derivar quem sai. Regra do legado `indicadores.ts`, escrita do zero.
 */
import { compararIds, jogadorDe, mediaInteira, type Elenco } from './base.ts';
import type { ComposicaoDois, TimeDois } from './chave-dois.ts';
import { formarPares, saidaNoIntervalo, type ParTroca } from './intervalo.ts';

export interface IndicadoresTimeDois {
  jogadores1oTempo: number;
  jogadores2oTempo: number;
  nivelSoma1oTempo: number;
  /** × 100; nulo se ninguém joga no tempo. */
  nivelMedio1oTempo: number | null;
  nivelSoma2oTempo: number;
  nivelMedio2oTempo: number | null;
  /** × 100, de quem tem ano entre titulares e reservas que entram; nula se ninguém tem ano (SIM-95). */
  idadeMedia: number | null;
  substituicoes: number;
  /** Quem sai no intervalo, na ordem de saída. */
  saem: string[];
  pares: ParTroca[];
  saiSemPar: string[];
  entraSemPar: string[];
}

/** Posição de cada id na ordem de prioridade (0 = melhor). Id ausente vai para o fim, desempatado pelo id. */
export type Posicoes = ReadonlyMap<string, number>;

function ordenarPorPrioridade(ids: readonly string[], posicoes: Posicoes): string[] {
  const pos = (id: string): number => posicoes.get(id) ?? Number.MAX_SAFE_INTEGER;
  return [...ids].sort((a, b) => pos(a) - pos(b) || compararIds(a, b));
}

/** Os indicadores de um time. */
export function indicadoresDoTime(time: TimeDois, elenco: Elenco, posicoes: Posicoes): IndicadoresTimeDois {
  const titulares = ordenarPorPrioridade(time.titulares, posicoes);
  const entram = ordenarPorPrioridade(time.entram, posicoes);
  const saem = saidaNoIntervalo(
    titulares.map((id) => jogadorDe(elenco, id)),
    entram.length,
  );
  const saemSet = new Set(saem);
  const segundoTempo = [...titulares.filter((id) => !saemSet.has(id)), ...entram];
  const somar = (ids: readonly string[]): number => ids.reduce((s, id) => s + jogadorDe(elenco, id).nivel, 0);
  const nivel1 = somar(titulares);
  const nivel2 = somar(segundoTempo);

  let somaIdade = 0;
  let comAno = 0;
  for (const id of [...titulares, ...entram]) {
    const idade = jogadorDe(elenco, id).idade;
    if (idade !== null) {
      somaIdade += idade;
      comAno += 1;
    }
  }

  const { pares, saiSemPar, entraSemPar } = formarPares(saem, entram);
  return {
    jogadores1oTempo: titulares.length,
    jogadores2oTempo: segundoTempo.length,
    nivelSoma1oTempo: nivel1,
    nivelMedio1oTempo: mediaInteira(nivel1, titulares.length),
    nivelSoma2oTempo: nivel2,
    nivelMedio2oTempo: mediaInteira(nivel2, segundoTempo.length),
    idadeMedia: mediaInteira(100 * somaIdade, comAno),
    substituicoes: pares.length,
    saem,
    pares,
    saiSemPar,
    entraSemPar,
  };
}

/** Os indicadores dos dois times, na ordem da composição. */
export function indicadoresDoisTimes(
  composicao: ComposicaoDois,
  elenco: Elenco,
  posicoes: Posicoes,
): [IndicadoresTimeDois, IndicadoresTimeDois] {
  return [
    indicadoresDoTime(composicao.times[0], elenco, posicoes),
    indicadoresDoTime(composicao.times[1], elenco, posicoes),
  ];
}
