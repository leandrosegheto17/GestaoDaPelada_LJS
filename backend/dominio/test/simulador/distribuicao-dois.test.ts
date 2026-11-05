import { describe, expect, it } from 'vitest';
import { montarElenco, type Apto } from '../../src/simulador/base.ts';
import { chaveDaComposicao, elencoDois, menorChave, type ComposicaoDois } from '../../src/simulador/chave-dois.ts';
import { classificarDoisTimes, type Limite } from '../../src/simulador/classificacao.ts';
import { distribuirDoisTimes } from '../../src/simulador/distribuicao-dois.ts';

/**
 * Serpentina e busca local de 2 times (T9; SIM-27, SIM-28, SIM-30, SIM-31, SIM-32, SIM-59, SIM-91, SIM-92).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - Todos iguais: a serpentina fica como está, zero trocas aceitas.
 * - Sem reservas (K = 0): só trocas titular↔titular.
 * - Craque muito acima: fica no time que, sem ele, tem menos nível.
 * - Teto de trocas atingido: devolve a melhor até ali, com N titulares por time.
 * - Saída: ótimo local (nenhuma troca melhora), cada lista na ordem de prioridade, "não entra" intocado.
 */

const DATA = '2026-10-22';

function apto(i: number, nivel: number, anoNascimento: number | null, so1oTempo = false): Apto {
  return { id: `p${String(i).padStart(2, '0')}`, apelido: `P${i}`, nivel, semNota: false, anoNascimento, so1oTempo };
}

/** 19 aptos com níveis, idades e "só 1º" variados, já na ordem de prioridade. */
const VARIADOS: Apto[] = Array.from({ length: 19 }, (_, k) => {
  const i = k + 1;
  return apto(i, 400 + ((i * 137) % 500), i % 6 === 0 ? null : 1975 + ((i * 7) % 25), i === 4 || i === 16);
});

function rodar(aptos: readonly Apto[], n: number, k: Limite, maxTrocas?: number) {
  const elenco = montarElenco(aptos, DATA);
  const classificacao = classificarDoisTimes(aptos, n, k);
  const resultado = distribuirDoisTimes(classificacao, n, elenco, maxTrocas === undefined ? {} : { maxTrocas });
  const ordem = [...classificacao.titulares.map((t) => t.id), ...classificacao.reservasQueEntram.map((r) => r.apto.id)];
  return { ...resultado, classificacao, e: elencoDois(ordem, elenco) };
}

function trocar(c: ComposicaoDois, lista: 'titulares' | 'entram', i: number, j: number): ComposicaoDois {
  const a = { titulares: [...c.times[0].titulares], entram: [...c.times[0].entram] };
  const b = { titulares: [...c.times[1].titulares], entram: [...c.times[1].entram] };
  [a[lista][i], b[lista][j]] = [b[lista][j]!, a[lista][i]!];
  return { times: [a, b], naoEntra: c.naoEntra };
}

describe('distribuirDoisTimes', () => {
  it('SIM-91: 4 aptos iguais, N = 2, K = 0: A recebe o 1º e o 4º, zero trocas aceitas', () => {
    const iguais = [1, 2, 3, 4].map((i) => apto(i, 500, 1990));
    const { composicao, trocasAceitas } = rodar(iguais, 2, 0);
    expect(composicao.times[0].titulares).toEqual(['p01', 'p04']);
    expect(composicao.times[1].titulares).toEqual(['p02', 'p03']);
    expect(trocasAceitas).toBe(0);
  });

  it('SIM-27: serpentina com reservas: titulares A, B, B, A e reservas alternando A, B quando nada melhora', () => {
    const iguais = Array.from({ length: 10 }, (_, k) => apto(k + 1, 500, 1990));
    const { composicao, trocasAceitas } = rodar(iguais, 4, 1);
    expect(trocasAceitas).toBe(0);
    expect(composicao.times[0]).toEqual({ titulares: ['p01', 'p04', 'p05', 'p08'], entram: ['p09'] });
    expect(composicao.times[1]).toEqual({ titulares: ['p02', 'p03', 'p06', 'p07'], entram: ['p10'] });
  });

  it('SIM-27: um craque muito acima fica no time que, sem ele, tem menos nível', () => {
    const aptos = [apto(1, 1000, 1990), apto(2, 600, 1990), apto(3, 550, 1990), apto(4, 500, 1990)];
    const { composicao } = rodar(aptos, 2, 0);
    const nivel = new Map(aptos.map((a) => [a.id, a.nivel]));
    const soma = (ids: readonly string[]): number => ids.reduce((s, id) => s + nivel.get(id)!, 0);
    const doCraque = composicao.times.findIndex((t) => t.titulares.includes('p01'));
    const companheiros = composicao.times[doCraque]!.titulares.filter((id) => id !== 'p01');
    expect(soma(companheiros)).toBeLessThan(soma(composicao.times[1 - doCraque]!.titulares));
  });

  it('SIM-31: na saída, nenhuma troca titular↔titular nem reserva↔reserva diminui a chave (força bruta)', () => {
    const { composicao, trocasAceitas, e } = rodar(VARIADOS, 7, 2);
    expect(trocasAceitas).toBeLessThan(200);
    const final = chaveDaComposicao(composicao, 7, e);
    for (const lista of ['titulares', 'entram'] as const) {
      for (let i = 0; i < composicao.times[0][lista].length; i += 1) {
        for (let j = 0; j < composicao.times[1][lista].length; j += 1) {
          const candidata = chaveDaComposicao(trocar(composicao, lista, i, j), 7, e);
          expect(menorChave(candidata, final)).toBe(false);
        }
      }
    }
  });

  it('SIM-30: N titulares por time e diferença de no máximo 1 nas reservas que entram', () => {
    const { composicao } = rodar(VARIADOS, 7, 2);
    expect(composicao.times.map((t) => t.titulares.length)).toEqual([7, 7]);
    expect(Math.abs(composicao.times[0].entram.length - composicao.times[1].entram.length)).toBeLessThanOrEqual(1);
  });

  it('SIM-32: titulares e reservas de cada time saem na ordem de prioridade; "não entra" intocado', () => {
    const { composicao, classificacao } = rodar(VARIADOS, 7, 2);
    const posicao = new Map(VARIADOS.map((a, i) => [a.id, i]));
    const crescente = (ids: readonly string[]): boolean =>
      ids.every((id, i) => i === 0 || posicao.get(ids[i - 1]!)! < posicao.get(id)!);
    for (const t of composicao.times) {
      expect(crescente(t.titulares)).toBe(true);
      expect(crescente(t.entram)).toBe(true);
    }
    expect(composicao.naoEntra).toEqual(classificacao.naoEntra.map((a) => a.id));
  });

  it('SIM-92: com teto de 1 troca, devolve a melhor até ali com N titulares por time', () => {
    const { composicao, trocasAceitas, e } = rodar(VARIADOS, 7, 'ilimitado', 1);
    expect(trocasAceitas).toBeLessThanOrEqual(1);
    expect(composicao.times.map((t) => t.titulares.length)).toEqual([7, 7]);
    const todos = [...composicao.times.flatMap((t) => [...t.titulares, ...t.entram]), ...composicao.naoEntra];
    expect(new Set(todos).size).toBe(VARIADOS.length);
    expect(() => chaveDaComposicao(composicao, 7, e)).not.toThrow();
  });

  it('SIM-59: a busca termina e devolve composição válida também com K ilimitado', () => {
    const { composicao } = rodar(VARIADOS, 5, 'ilimitado');
    expect(composicao.times.map((t) => t.titulares.length)).toEqual([5, 5]);
    expect(composicao.times[0].entram.length + composicao.times[1].entram.length).toBe(9);
  });
});
