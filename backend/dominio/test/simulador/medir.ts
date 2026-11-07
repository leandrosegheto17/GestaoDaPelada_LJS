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
 * O limiar que os testes de CPU usam em qualquer ambiente: 10 ms, o teto de CPU por requisição do Worker Free (AD-128).
 * A meta de 4 ms do legado (`LIMIAR_MS`) não se sustenta como teste: na máquina de desenvolvimento (Windows) e no runner
 * do CI o p99 oscila de 4 a 11 ms nas mesmas entradas, só por ruído do relógio e do vizinho. Em vez de afrouxar o teste
 * para 15 ms (acima do teto do Worker, decisão de 2026-11-06 que a validação reprovou, A-01), a entrada é que ficou
 * menor: no máximo 40 aptos (`MAX_APTOS_SIMULADOR`), onde o pior caso mede mediana de ~2 ms e p99 de 4 a 8 ms.
 */
export const LIMIAR_EFETIVO_MS = 10;
