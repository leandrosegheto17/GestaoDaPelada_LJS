/**
 * Medição de CPU dos testes de orçamento do simulador (T19, T20). Fica em `test/`: a regra do domínio sem relógio vale
 * só para `src/` (`eslint.config.mjs`, `backend/dominio/src/**`).
 */

export interface Medicao {
  mediana: number;
  p99: number;
  /** Todas as medições, em ms, em ordem crescente. */
  tempos: number[];
}

/** Roda `fn` `aquecimento` vezes sem medir e depois `vezes` vezes medindo cada uma, em ms. */
export function medir(fn: () => unknown, vezes = 50, aquecimento = 10): Medicao {
  for (let i = 0; i < aquecimento; i += 1) fn();
  const tempos: number[] = [];
  for (let i = 0; i < vezes; i += 1) {
    const inicio = performance.now();
    fn();
    tempos.push(performance.now() - inicio);
  }
  tempos.sort((a, b) => a - b);
  const mediana =
    tempos.length % 2 === 1
      ? tempos[(tempos.length - 1) / 2]!
      : (tempos[tempos.length / 2 - 1]! + tempos[tempos.length / 2]!) / 2;
  const p99 = tempos[Math.max(0, Math.ceil(0.99 * tempos.length) - 1)]!;
  return { mediana, p99, tempos };
}

/** Limiar de CPU do domínio em Node (SIM-57, legado `sugerir.orcamento.test.ts:10`). */
export const LIMIAR_MS = 4;

/**
 * Limiar no CI: o runner Linux compartilhado do GitHub mediu p99 de 4,3 a 11,2 ms nas mesmas entradas (2026-11-06), o
 * dobro ou mais do que numa máquina local. Teto de 15 ms no CI (decisão do usuário, 2026-11-06, como no PDF); o limiar
 * de 4 ms vale fora do CI.
 */
export const LIMIAR_CI_MS = 15;

/**
 * O limiar que os testes de CPU usam em qualquer ambiente: 15 ms. Na máquina local de desenvolvimento (Windows) o p99
 * de 4 ms reprovou 2 de cada 3 rodadas mesmo sem carga (pior caso de 5 a 14 ms, SIM-58); decisão do usuário,
 * 2026-11-06, de valer o teto do CI também fora dele. `LIMIAR_MS` fica como referência do legado.
 */
export const LIMIAR_EFETIVO_MS = LIMIAR_CI_MS;
