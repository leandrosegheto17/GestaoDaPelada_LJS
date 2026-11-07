/**
 * Times de 3 ou mais e solução inicial (T10; SIM-33, SIM-34, SIM-35, SIM-37). Todos os aptos vão para times: os
 * completos de N e, quando aptos mod N > 0, um único incompleto com o resto, sempre o último. Solução inicial por nível
 * (maior primeiro, depois id) em vaivém entre os times, respeitando a capacidade de cada um. Não há ordem de
 * prioridade (SIM-19): todos são candidatos ao incompleto (SIM-37). Regra do legado `distribuicao-varios.ts:10`,
 * `:70-82`, escrita do zero.
 */
import { compararIds, jogadorDe, type Elenco, type JogadorSim } from './base.ts';
import { calcularPrevia, timesVarios } from './previa.ts';

/** Teto de aptos (SIM-53): a vizinhança da busca local cresce com o quadrado do número de jogadores. */
export const MAX_APTOS_SIMULADOR = 40;

export interface VariosTimes {
  /** Ids de cada time; cada time por nível (maior primeiro) e id. */
  times: string[][];
  /** Índice do incompleto (sempre o último) ou nulo. */
  incompleto: number | null;
}

/** Por nível (maior primeiro) e, no empate, por id. */
export function porNivelEId(a: JogadorSim, b: JogadorSim): number {
  return b.nivel - a.nivel || compararIds(a.id, b.id);
}

/** Cada time por nível e id (SIM-37). */
export function ordenarTimes(times: readonly (readonly string[])[], elenco: Elenco): string[][] {
  return times.map((ids) =>
    ids
      .map((id) => jogadorDe(elenco, id))
      .sort(porNivelEId)
      .map((j) => j.id),
  );
}

/**
 * Monta os times. A ordem da entrada não influi: os aptos são ordenados por nível e id antes do vaivém. Aptos
 * insuficientes ou acima de 60 são erro de programação: a prévia e o contrato recusam antes (SIM-53, SIM-56).
 */
export function montarVariosTimes(elenco: Elenco, n: number): VariosTimes {
  const jogadores = [...elenco.values()];
  if (!calcularPrevia({ formato: 'varios_times', n, aptos: jogadores.length }).valida) {
    throw new RangeError(`aptos insuficientes: ${jogadores.length} para 3 ou mais times de ${n}`);
  }
  if (jogadores.length > MAX_APTOS_SIMULADOR) {
    throw new RangeError(`aptos demais: ${jogadores.length} (máximo ${MAX_APTOS_SIMULADOR})`);
  }
  const { times: total, tamanhoIncompleto } = timesVarios(jogadores.length, n);
  const capacidade = Array.from({ length: total }, (_, t) =>
    t === total - 1 && tamanhoIncompleto > 0 ? tamanhoIncompleto : n,
  );

  const times: string[][] = Array.from({ length: total }, () => []);
  let t = 0;
  let passo = 1;
  const avancar = (): void => {
    if (t + passo < 0 || t + passo >= total) passo = -passo;
    else t += passo;
  };
  for (const j of [...jogadores].sort(porNivelEId)) {
    while (times[t]!.length >= capacidade[t]!) avancar();
    times[t]!.push(j.id);
    avancar();
  }

  return {
    times: ordenarTimes(times, elenco),
    incompleto: tamanhoIncompleto > 0 ? total - 1 : null,
  };
}
