/**
 * Chave de comparação de composições em 2 times (T8; SIM-29, SIM-30, SIM-51, SIM-95). Lexicográfica e só em inteiros:
 * (1) quantos times não têm N titulares; (2) quanto a diferença de substituições entre os times passa de 1;
 * (3) diferença de nível somado no 1º tempo + diferença no 2º tempo; (4) diferença de idade média de quem joga pelo
 * time (titulares e reservas que entram), só com quem tem ano de nascimento. Menor é melhor. Regra do legado
 * `distribuicao-dois.ts:61-106`, escrita do zero; a idade nula é da v2 (SIM-95).
 *
 * Os jogadores viram índices na ordem de prioridade (0 = melhor): "pior prioridade" é "índice maior", e a busca local
 * (T9) avalia trocas sem mapas nem ordenação.
 */
import { jogadorDe, mediaInteira, type Elenco } from './base.ts';

/** Um time em ids: titulares e reservas que entram no 2º tempo. */
export interface TimeDois {
  titulares: string[];
  entram: string[];
}

/** Os dois times e quem fica em "não entra". */
export interface ComposicaoDois {
  times: [TimeDois, TimeDois];
  naoEntra: string[];
}

/** Os jogadores que jogam, em vetores indexados pela posição na ordem de prioridade. */
export interface ElencoDois {
  ids: string[];
  nivel: number[];
  idade: (number | null)[];
  so1o: boolean[];
}

/** Um time em índices do `ElencoDois`. */
export interface TimeIdx {
  titulares: number[];
  entram: number[];
}

export type ChaveDois = readonly [number, number, number, number];

/** O elenco em vetores, na ordem recebida (que deve ser a de prioridade). */
export function elencoDois(idsEmOrdemDePrioridade: readonly string[], elenco: Elenco): ElencoDois {
  const js = idsEmOrdemDePrioridade.map((id) => jogadorDe(elenco, id));
  return {
    ids: [...idsEmOrdemDePrioridade],
    nivel: js.map((j) => j.nivel),
    idade: js.map((j) => j.idade),
    so1o: js.map((j) => j.so1oTempo),
  };
}

/** `a` vem antes de `b` na ordem lexicográfica. */
export function menorChave(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i]! < b[i]!;
  return false;
}

interface Medidas {
  titulares: number;
  substituicoes: number;
  nivel1: number;
  nivel2: number;
  idadeMedia: number | null;
}

/**
 * Medidas de um time. No 2º tempo saem os "só 1º" e, até max("só 1º", reservas) saídas, os demais titulares de pior
 * prioridade (a regra de `saidaNoIntervalo`, T7): tira-se do maior índice para o menor, sem ordenar.
 */
function medir({ titulares, entram }: TimeIdx, e: ElencoDois): Medidas {
  let nivel1 = 0;
  let nivel2 = 0;
  let so1o = 0;
  let somaIdade = 0;
  let comAno = 0;
  for (const i of titulares) {
    nivel1 += e.nivel[i]!;
    if (e.so1o[i]) so1o += 1;
    else nivel2 += e.nivel[i]!;
    const idade = e.idade[i]!;
    if (idade !== null) {
      somaIdade += idade;
      comAno += 1;
    }
  }
  for (const i of entram) {
    nivel2 += e.nivel[i]!;
    const idade = e.idade[i]!;
    if (idade !== null) {
      somaIdade += idade;
      comAno += 1;
    }
  }
  const saem = Math.min(Math.max(so1o, entram.length), titulares.length);
  let teto = Number.MAX_SAFE_INTEGER;
  for (let falta = saem - so1o; falta > 0; falta -= 1) {
    let pior = -1;
    for (const i of titulares) if (!e.so1o[i] && i < teto && i > pior) pior = i;
    nivel2 -= e.nivel[pior]!;
    teto = pior;
  }
  return {
    titulares: titulares.length,
    substituicoes: Math.min(saem, entram.length),
    nivel1,
    nivel2,
    idadeMedia: mediaInteira(100 * somaIdade, comAno),
  };
}

/**
 * A chave da composição. Idade média nula num dos times (ninguém com ano) deixa o critério (4) em 0.
 * [LACUNA] A spec só diz que o time sem ninguém com ano tem idade média nula (SIM-95); não diz como comparar um time
 * nulo com outro que tem idade. Vale 0 (critério ignorado), a leitura que não favorece nenhum dos dois.
 */
export function chaveDoisTimes(times: readonly [TimeIdx, TimeIdx], n: number, e: ElencoDois): ChaveDois {
  const a = medir(times[0], e);
  const b = medir(times[1], e);
  const foraDeN = Number(a.titulares !== n) + Number(b.titulares !== n);
  const excessoSubs = Math.max(0, Math.abs(a.substituicoes - b.substituicoes) - 1);
  const difNivel = Math.abs(a.nivel1 - b.nivel1) + Math.abs(a.nivel2 - b.nivel2);
  const difIdade = a.idadeMedia === null || b.idadeMedia === null ? 0 : Math.abs(a.idadeMedia - b.idadeMedia);
  return [foraDeN, excessoSubs, difNivel, difIdade];
}

/** A chave de uma composição em ids (para conferir ótimo local e comparar com a serpentina). */
export function chaveDaComposicao(composicao: ComposicaoDois, n: number, e: ElencoDois): ChaveDois {
  const indice = new Map(e.ids.map((id, i) => [id, i]));
  const emIndices = (t: TimeDois): TimeIdx => ({
    titulares: t.titulares.map((id) => indice.get(id)!),
    entram: t.entram.map((id) => indice.get(id)!),
  });
  return chaveDoisTimes([emIndices(composicao.times[0]), emIndices(composicao.times[1])], n, e);
}
