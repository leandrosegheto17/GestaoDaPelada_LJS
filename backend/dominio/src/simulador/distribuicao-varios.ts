/**
 * Busca local de 3 ou mais times (T11; SIM-36, SIM-37, SIM-59, SIM-92). Parte da solução inicial (T10) e troca um
 * jogador de um time com um de outro, em ordem fixa (times a < b, jogadores em índices crescentes), aceitando a troca
 * que diminui a chave, até nenhuma melhorar ou 200 trocas aceitas. A chave é (maior − menor nível médio entre todos os
 * times, inclusive o incompleto; maior − menor idade média, só com quem tem ano). Médias × 100 e inteiras (SIM-51).
 * Trocas não mudam o tamanho dos times (SIM-92). Regra do legado `distribuicao-varios.ts:7`, `:33-47`, `:94-119`,
 * escrita do zero; a idade nula é da v2 (SIM-95).
 */
import { jogadorDe, mediaInteira, type Elenco, type JogadorSim } from './base.ts';
import { menorChave } from './chave-dois.ts';
import { ordenarTimes, type VariosTimes } from './varios-inicial.ts';

/** Teto de trocas aceitas (SIM-36, SIM-59): garante que o laço termina. */
export const MAX_TROCAS_ACEITAS_VARIOS = 200;

export type ChaveVarios = readonly [number, number];

/** Totais de um time, para avaliar uma troca sem percorrer o time. */
interface Agregado {
  n: number;
  somaNivel: number;
  somaIdade: number;
  comAno: number;
}

function agregar(ids: readonly string[], elenco: Elenco): Agregado {
  const ag: Agregado = { n: 0, somaNivel: 0, somaIdade: 0, comAno: 0 };
  for (const id of ids) {
    const j = jogadorDe(elenco, id);
    ag.n += 1;
    ag.somaNivel += j.nivel;
    if (j.idade !== null) {
      ag.somaIdade += j.idade;
      ag.comAno += 1;
    }
  }
  return ag;
}

/** `sai` deixa o time e `entra` chega, em O(1). */
function trocarNoAgregado(ag: Agregado, sai: JogadorSim, entra: JogadorSim): Agregado {
  return {
    n: ag.n,
    somaNivel: ag.somaNivel - sai.nivel + entra.nivel,
    somaIdade: ag.somaIdade - (sai.idade ?? 0) + (entra.idade ?? 0),
    comAno: ag.comAno - (sai.idade === null ? 0 : 1) + (entra.idade === null ? 0 : 1),
  };
}

/**
 * A chave dos agregados. A amplitude de idade considera só os times com idade média (alguém com ano); com menos de dois
 * desses times, vale 0.
 * [LACUNA] A spec não diz como entra na amplitude um time sem ninguém com ano (idade média nula, SIM-95); vale ficar de
 * fora, a mesma leitura da chave de 2 times (`chave-dois.ts`).
 */
function chaveDe(agregados: readonly Agregado[]): ChaveVarios {
  let nivelMax = -Infinity;
  let nivelMin = Infinity;
  let idadeMax = -Infinity;
  let idadeMin = Infinity;
  for (const ag of agregados) {
    const nivel = mediaInteira(ag.somaNivel, ag.n) ?? 0;
    nivelMax = Math.max(nivelMax, nivel);
    nivelMin = Math.min(nivelMin, nivel);
    const idade = mediaInteira(100 * ag.somaIdade, ag.comAno);
    if (idade !== null) {
      idadeMax = Math.max(idadeMax, idade);
      idadeMin = Math.min(idadeMin, idade);
    }
  }
  const difIdade = idadeMax === -Infinity ? 0 : idadeMax - idadeMin;
  return [nivelMax - nivelMin, difIdade];
}

/** A chave de uma composição em ids (para conferir o ótimo local no teste). */
export function chaveVariosTimes(times: readonly (readonly string[])[], elenco: Elenco): ChaveVarios {
  return chaveDe(times.map((ids) => agregar(ids, elenco)));
}

export interface OpcoesDistribuicaoVarios {
  /** Só para teste: substitui `MAX_TROCAS_ACEITAS_VARIOS` (SIM-92). */
  maxTrocas?: number;
}

export interface DistribuicaoVarios extends VariosTimes {
  trocasAceitas: number;
}

/** Melhora a solução inicial; o incompleto continua o último e cada time sai por nível e id (SIM-37). */
export function distribuirVariosTimes(
  inicial: VariosTimes,
  elenco: Elenco,
  { maxTrocas = MAX_TROCAS_ACEITAS_VARIOS }: OpcoesDistribuicaoVarios = {},
): DistribuicaoVarios {
  const times = inicial.times.map((ids) => ids.map((id) => jogadorDe(elenco, id)));
  const agregados = inicial.times.map((ids) => agregar(ids, elenco));
  const total = times.length;

  let chave = chaveDe(agregados);
  let aceitas = 0;
  let melhorou = true;
  while (melhorou && aceitas < maxTrocas) {
    melhorou = false;
    for (let a = 0; a < total && !melhorou; a += 1) {
      for (let b = a + 1; b < total && !melhorou; b += 1) {
        const ta = times[a]!;
        const tb = times[b]!;
        for (let i = 0; i < ta.length && !melhorou; i += 1) {
          for (let j = 0; j < tb.length && !melhorou; j += 1) {
            const deA = ta[i]!;
            const deB = tb[j]!;
            const antesA = agregados[a]!;
            const antesB = agregados[b]!;
            agregados[a] = trocarNoAgregado(antesA, deA, deB);
            agregados[b] = trocarNoAgregado(antesB, deB, deA);
            const candidata = chaveDe(agregados);
            if (menorChave(candidata, chave)) {
              chave = candidata;
              ta[i] = deB;
              tb[j] = deA;
              melhorou = true;
              aceitas += 1;
            } else {
              agregados[a] = antesA;
              agregados[b] = antesB;
            }
          }
        }
      }
    }
  }

  return {
    times: ordenarTimes(
      times.map((t) => t.map((j) => j.id)),
      elenco,
    ),
    incompleto: inicial.incompleto,
    trocasAceitas: aceitas,
  };
}
