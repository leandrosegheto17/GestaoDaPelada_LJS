import { describe, expect, it } from 'vitest';
import { montarElenco, type Apto } from '../../src/simulador/base.ts';
import { menorChave } from '../../src/simulador/chave-dois.ts';
import {
  chaveVariosTimes,
  distribuirVariosTimes,
} from '../../src/simulador/distribuicao-varios.ts';
import { montarVariosTimes } from '../../src/simulador/varios-inicial.ts';

/**
 * Busca local de 3 ou mais times (T11; SIM-36, SIM-37, SIM-59, SIM-92).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - Saída é ótimo local: nenhuma troca entre dois times diminui a chave (salvo teto).
 * - Teto de 1 troca: os tamanhos continuam os da prévia; ninguém some nem se repete.
 * - O incompleto entra na amplitude de nível como qualquer time.
 * - Sem ano: fora da idade média; time só de quem não tem ano fica fora da amplitude de idade, sem lançar.
 * - Saída de cada time por nível (maior primeiro) e id.
 */

const DATA = '2026-10-22';

/** 22 aptos com níveis e idades variados (alguns sem ano). */
const VARIADOS: Apto[] = Array.from({ length: 22 }, (_, k) => {
  const i = k + 1;
  return {
    id: `p${String(i).padStart(2, '0')}`,
    apelido: `P${i}`,
    nivel: 400 + ((i * 211) % 550),
    semNota: false,
    anoNascimento: i % 5 === 0 ? null : 1970 + ((i * 11) % 30),
    so1oTempo: false,
  };
});

function rodar(aptos: readonly Apto[], n: number, maxTrocas?: number) {
  const elenco = montarElenco(aptos, DATA);
  const inicial = montarVariosTimes(elenco, n);
  return {
    elenco,
    ...distribuirVariosTimes(inicial, elenco, maxTrocas === undefined ? {} : { maxTrocas }),
  };
}

describe('distribuirVariosTimes', () => {
  it('SIM-36: na saída, nenhuma troca entre dois times diminui a chave (força bruta)', () => {
    const { times, elenco, trocasAceitas } = rodar(VARIADOS, 4);
    expect(trocasAceitas).toBeLessThan(200);
    const final = chaveVariosTimes(times, elenco);
    for (let a = 0; a < times.length; a += 1) {
      for (let b = a + 1; b < times.length; b += 1) {
        for (let i = 0; i < times[a]!.length; i += 1) {
          for (let j = 0; j < times[b]!.length; j += 1) {
            const copia = times.map((t) => [...t]);
            [copia[a]![i], copia[b]![j]] = [copia[b]![j]!, copia[a]![i]!];
            expect(menorChave(chaveVariosTimes(copia, elenco), final)).toBe(false);
          }
        }
      }
    }
  });

  it('SIM-36: a busca não piora a solução inicial', () => {
    const elenco = montarElenco(VARIADOS, DATA);
    const inicial = montarVariosTimes(elenco, 4);
    const final = distribuirVariosTimes(inicial, elenco);
    expect(
      menorChave(chaveVariosTimes(inicial.times, elenco), chaveVariosTimes(final.times, elenco)),
    ).toBe(false);
  });

  it('SIM-92: com teto de 1 troca, os tamanhos continuam os da prévia', () => {
    const { times, incompleto, trocasAceitas } = rodar(VARIADOS, 4, 1);
    expect(trocasAceitas).toBeLessThanOrEqual(1);
    expect(times.map((t) => t.length)).toEqual([4, 4, 4, 4, 4, 2]);
    expect(incompleto).toBe(5);
    expect(new Set(times.flat()).size).toBe(22);
  });

  it('SIM-37: saída de cada time por nível (maior primeiro) e id', () => {
    const { times } = rodar(VARIADOS, 4);
    const nivel = new Map(VARIADOS.map((a) => [a.id, a.nivel]));
    for (const t of times) {
      for (let i = 1; i < t.length; i += 1) {
        const anterior = nivel.get(t[i - 1]!)!;
        const atual = nivel.get(t[i]!)!;
        expect(anterior > atual || (anterior === atual && t[i - 1]! < t[i]!)).toBe(true);
      }
    }
  });

  it('SIM-59: termina com composição válida também com 60 aptos e N = 2', () => {
    const muitos: Apto[] = Array.from({ length: 60 }, (_, k) => ({
      ...VARIADOS[k % 22]!,
      id: `q${String(k + 1).padStart(2, '0')}`,
    }));
    const { times } = rodar(muitos, 2);
    expect(times).toHaveLength(30);
    expect(times.every((t) => t.length === 2)).toBe(true);
  });

  it('SIM-95: time só de quem não tem ano não lança e fica fora da amplitude de idade', () => {
    const semAno = VARIADOS.slice(0, 9).map((a, k) => ({
      ...a,
      anoNascimento: k < 3 ? null : 1990,
    }));
    const elenco = montarElenco(semAno, DATA);
    expect(() =>
      chaveVariosTimes(
        [
          ['p01', 'p02', 'p03'],
          ['p04', 'p05', 'p06'],
          ['p07', 'p08', 'p09'],
        ],
        elenco,
      ),
    ).not.toThrow();
    expect(
      chaveVariosTimes(
        [
          ['p01', 'p02', 'p03'],
          ['p04', 'p05', 'p06'],
          ['p07', 'p08', 'p09'],
        ],
        elenco,
      )[1],
    ).toBe(0);
  });
});
