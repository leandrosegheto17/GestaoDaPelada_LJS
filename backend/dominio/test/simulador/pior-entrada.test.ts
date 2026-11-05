import { describe, expect, it } from 'vitest';
import { avaliar, type ComposicaoEntrada } from '../../src/simulador/avaliar.ts';
import type { Formato } from '../../src/simulador/base.ts';
import { MAX_APTOS_SIMULADOR } from '../../src/simulador/varios-inicial.ts';
import { sugerir, type EntradaSimulador, type Sugestao } from '../../src/simulador/sugerir.ts';
import { aptosGrandes, DATA, historicoGrande } from './apoio.ts';
import { LIMIAR_MS, medir } from './medir.ts';

/**
 * Pior entrada válida e teto da busca (T20; SIM-58, SIM-59). Com 60 aptos (`MAX_APTOS_SIMULADOR`), para todo N de 2 a
 * 11, nos dois formatos e com K ilimitado: `sugerir` e `avaliar` abaixo de 4 ms no p99, e toda combinação devolve
 * composição válida. As 20 combinações × 2 funções medem 20 vezes cada, com 5 de aquecimento.
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - 2 times com N = 2 e 60 aptos: 4 titulares, 4 reservas e 52 em "não entra" (busca pequena, classificação grande).
 * - 2 times com N = 11: 22 titulares e 22 reservas (a maior vizinhança de 2 times).
 * - 3 ou mais com N = 2: 30 times de 2 (a maior vizinhança de 3 ou mais: 435 pares de times).
 * - 3 ou mais com N = 7, 8, 9 e 11: com incompleto.
 *
 * Se algum p99 passar de 4 ms, a tarefa para e pergunta o teto de avaliações (Delta 9 do tasks.md): o teto muda a
 * sugestão em relação ao legado (SIM-52). Evidência (registrar na T20, pelo /executar): a pior combinação e o tempo
 * dela, impressos abaixo; teto de avaliações [A ESCLARECER: só se a medição passar de 4 ms].
 */

const APTOS = aptosGrandes(MAX_APTOS_SIMULADOR);
const HISTORICO = historicoGrande(MAX_APTOS_SIMULADOR, 104);
const NS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const FORMATOS: Formato[] = ['dois_times', 'varios_times'];

const COMBINACOES: [Formato, number][] = FORMATOS.flatMap((formato) =>
  NS.map((n): [Formato, number] => [formato, n]),
);

const entradaDe = (formato: Formato, n: number): EntradaSimulador => ({
  formato,
  data: DATA,
  n,
  k: 'ilimitado',
  aptos: APTOS,
});

/** A composição da sugestão no formato que a tela envia ao `avaliar`. */
function composicaoDe(s: Sugestao): ComposicaoEntrada {
  if (!s.valida) throw new Error('sugestão inválida');
  if (s.formato === 'varios_times') return { formato: 'varios_times', times: s.times };
  const so1o = (id: string) => ({ id, so1oTempo: false });
  return {
    formato: 'dois_times',
    times: [
      {
        titulares: s.composicao.times[0].titulares.map(so1o),
        entram: s.composicao.times[0].entram.map(so1o),
      },
      {
        titulares: s.composicao.times[1].titulares.map(so1o),
        entram: s.composicao.times[1].entram.map(so1o),
      },
    ],
    naoEntra: s.composicao.naoEntra,
  };
}

function idsDa(s: Sugestao): string[] {
  if (!s.valida) return [];
  if (s.formato === 'varios_times') return s.times.flat();
  return [
    ...s.composicao.times.flatMap((t) => [...t.titulares, ...t.entram]),
    ...s.composicao.naoEntra,
  ];
}

describe('pior entrada válida', () => {
  it.each(COMBINACOES)('SIM-59: %s com N = %i devolve composição válida', (formato, n) => {
    const s = sugerir(entradaDe(formato, n), HISTORICO);
    expect(s.valida).toBe(true);
    expect([...idsDa(s)].sort()).toEqual(APTOS.map((a) => a.id).sort());
    if (s.valida && s.formato === 'dois_times') {
      expect(s.composicao.times.map((t) => t.titulares.length)).toEqual([n, n]);
    }
    if (s.valida && s.formato === 'varios_times') {
      const resto = APTOS.length % n;
      const esperados = [
        ...Array<number>(Math.floor(APTOS.length / n)).fill(n),
        ...(resto > 0 ? [resto] : []),
      ];
      expect(s.times.map((t) => t.length)).toEqual(esperados);
    }
  });

  it('SIM-58: as 20 combinações × 2 funções ficam abaixo de 4 ms no p99', () => {
    const resultados = COMBINACOES.flatMap(([formato, n]) => {
      const entrada = entradaDe(formato, n);
      const composicao = composicaoDe(sugerir(entrada, HISTORICO));
      return [
        { nome: `sugerir ${formato} N=${n}`, ...medir(() => sugerir(entrada, HISTORICO), 20, 5) },
        {
          nome: `avaliar ${formato} N=${n}`,
          ...medir(() => avaliar(entrada, composicao, HISTORICO), 20, 5),
        },
      ];
    });
    const pior = resultados.reduce((a, b) => (b.p99 > a.p99 ? b : a));
    console.info(`SIM-58 pior combinação: ${pior.nome}, p99 ${pior.p99.toFixed(3)} ms`);
    const acima = resultados
      .filter((r) => r.p99 >= LIMIAR_MS)
      .map((r) => `${r.nome}: ${r.p99.toFixed(3)} ms`);
    expect(acima).toEqual([]);
  });
});
