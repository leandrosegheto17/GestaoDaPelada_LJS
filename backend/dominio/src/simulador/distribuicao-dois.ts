/**
 * Distribuição em 2 times (T9; SIM-27, SIM-28, SIM-30, SIM-31, SIM-32, SIM-59, SIM-91, SIM-92). Solução inicial em
 * serpentina pela ordem de prioridade (titulares A, B, B, A repetido; reservas que entram alternando A, B) e busca
 * local: trocas titular↔titular e reserva↔reserva entre os times, em índices crescentes, aceitando a primeira que
 * diminui a chave (T8) e recomeçando, até nenhuma melhorar ou 200 trocas aceitas. Determinística. Regra do legado
 * `distribuicao-dois.ts:7`, `:21`, `:127-154`, escrita do zero.
 */
import type { Elenco } from './base.ts';
import {
  chaveDoisTimes,
  elencoDois,
  menorChave,
  type ComposicaoDois,
  type TimeDois,
  type TimeIdx,
} from './chave-dois.ts';
import type { AptoOrdenado, ClassificacaoDois } from './classificacao.ts';

/** Teto de trocas aceitas (SIM-28, SIM-59): garante que o laço termina. */
export const MAX_TROCAS_ACEITAS = 200;

const SERPENTINA = [0, 1, 1, 0] as const;

export interface OpcoesDistribuicao {
  /** Só para teste: substitui `MAX_TROCAS_ACEITAS` (SIM-92). */
  maxTrocas?: number;
}

export interface DistribuicaoDois {
  composicao: ComposicaoDois;
  /** Trocas aceitas pela busca local (0 = a serpentina ficou como estava). */
  trocasAceitas: number;
}

/**
 * Distribui a classificação (T6), que já vem na ordem de prioridade e não é reordenada nem reclassificada. Cada lista
 * do resultado sai na ordem de prioridade (SIM-32); "não entra" fica como veio.
 */
export function distribuirDoisTimes(
  classificacao: ClassificacaoDois<AptoOrdenado>,
  n: number,
  elenco: Elenco,
  { maxTrocas = MAX_TROCAS_ACEITAS }: OpcoesDistribuicao = {},
): DistribuicaoDois {
  const ordem = [...classificacao.titulares.map((t) => t.id), ...classificacao.reservasQueEntram.map((r) => r.apto.id)];
  const e = elencoDois(ordem, elenco);
  const qtdTitulares = classificacao.titulares.length;

  const a: TimeIdx = { titulares: [], entram: [] };
  const b: TimeIdx = { titulares: [], entram: [] };
  for (let i = 0; i < qtdTitulares; i += 1) (SERPENTINA[i % 4] === 0 ? a : b).titulares.push(i);
  for (let r = 0; r < classificacao.reservasQueEntram.length; r += 1) {
    (r % 2 === 0 ? a : b).entram.push(qtdTitulares + r);
  }
  const times: [TimeIdx, TimeIdx] = [a, b];

  let chave = chaveDoisTimes(times, n, e);
  let aceitas = 0;
  let melhorou = true;
  while (melhorou && aceitas < maxTrocas) {
    melhorou = false;
    for (const lista of ['titulares', 'entram'] as const) {
      const la = a[lista];
      const lb = b[lista];
      for (let i = 0; i < la.length && !melhorou; i += 1) {
        for (let j = 0; j < lb.length && !melhorou; j += 1) {
          [la[i], lb[j]] = [lb[j]!, la[i]!];
          const candidata = chaveDoisTimes(times, n, e);
          if (menorChave(candidata, chave)) {
            chave = candidata;
            melhorou = true;
            aceitas += 1;
          } else {
            [la[i], lb[j]] = [lb[j]!, la[i]!];
          }
        }
      }
      if (melhorou) break;
    }
  }

  // Índices crescentes são a ordem de prioridade.
  const emIds = (t: TimeIdx): TimeDois => ({
    titulares: [...t.titulares].sort((x, y) => x - y).map((i) => e.ids[i]!),
    entram: [...t.entram].sort((x, y) => x - y).map((i) => e.ids[i]!),
  });
  return {
    composicao: { times: [emIds(a), emIds(b)], naoEntra: classificacao.naoEntra.map((x) => x.id) },
    trocasAceitas: aceitas,
  };
}
