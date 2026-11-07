import { describe, expect, it } from 'vitest';
import { sugerir, type EntradaSimulador } from '../../src/simulador/sugerir.ts';
import { aptosGrandes, DATA, historicoGrande } from './apoio.ts';
import { LIMIAR_EFETIVO_MS, medir } from './medir.ts';

/**
 * Orçamento de CPU no Node (T19; SIM-57). 50 medições de `sugerir`, com 10 de aquecimento descartadas: 30 aptos em
 * 2 times de 11 com K ilimitado e em 6 times de 5, histórico de 40 jogadores e 104 partidas. Mediana e p99 abaixo de
 * 10 ms (AD-128; o legado `sugerir.orcamento.test.ts:10` usava 4 ms). Roda no CI com o resto da suíte do domínio.
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - O maior trabalho de 2 times é N = 11 com K ilimitado (22 titulares e 8 reservas, todos trocáveis).
 * - 6 × 5 sem incompleto exercita a busca de 3 ou mais com 15 pares de times.
 * - O histórico pesa só em 2 times (acumulado até a véspera); em 3 ou mais é ignorado.
 *
 * Evidência (registrar na T19 do tasks.md, pelo /executar): os números medidos na máquina local e no CI, impressos
 * abaixo pelo `console.info`.
 */

const HISTORICO = historicoGrande(40, 104);
const APTOS = aptosGrandes(30);

const CENARIOS: [string, EntradaSimulador][] = [
  [
    '2 times de 11, K ilimitado',
    { formato: 'dois_times', data: DATA, n: 11, k: 'ilimitado', aptos: APTOS },
  ],
  ['6 times de 5', { formato: 'varios_times', data: DATA, n: 5, k: 'ilimitado', aptos: APTOS }],
];

describe('orçamento de CPU do sugerir', () => {
  it.each(CENARIOS)('SIM-57: %s: mediana e p99 abaixo de 10 ms', (nome, entrada) => {
    expect(sugerir(entrada, HISTORICO).valida).toBe(true);
    const { mediana, p99 } = medir(() => sugerir(entrada, HISTORICO));
    console.info(`SIM-57 ${nome}: mediana ${mediana.toFixed(3)} ms, p99 ${p99.toFixed(3)} ms`);
    expect(mediana).toBeLessThan(LIMIAR_EFETIVO_MS);
    expect(p99).toBeLessThan(LIMIAR_EFETIVO_MS);
  });
});
