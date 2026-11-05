/**
 * Indicadores de 3 ou mais times (T13; SIM-40, SIM-95): por time, jogadores, nível somado, nível médio e idade média
 * (só de quem tem ano). Sem tempos nem substituições. Regra do legado `indicadores.ts`, escrita do zero.
 */
import { jogadorDe, mediaInteira, type Elenco } from './base.ts';

export interface IndicadoresTimeVarios {
  jogadores: number;
  nivelSoma: number;
  /** × 100; nulo em time vazio (não acontece numa composição válida). */
  nivelMedio: number | null;
  /** × 100, só de quem tem ano; nula se ninguém tem (SIM-95). */
  idadeMedia: number | null;
}

/** Um bloco por time, na ordem recebida. */
export function indicadoresVariosTimes(
  times: readonly (readonly string[])[],
  elenco: Elenco,
): IndicadoresTimeVarios[] {
  return times.map((ids) => {
    let nivelSoma = 0;
    let somaIdade = 0;
    let comAno = 0;
    for (const id of ids) {
      const j = jogadorDe(elenco, id);
      nivelSoma += j.nivel;
      if (j.idade !== null) {
        somaIdade += j.idade;
        comAno += 1;
      }
    }
    return {
      jogadores: ids.length,
      nivelSoma,
      nivelMedio: mediaInteira(nivelSoma, ids.length),
      idadeMedia: mediaInteira(100 * somaIdade, comAno),
    };
  });
}
