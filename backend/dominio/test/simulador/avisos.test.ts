import { describe, expect, it } from 'vitest';
import { montarElenco, type Apto } from '../../src/simulador/base.ts';
import type { ComposicaoDois } from '../../src/simulador/chave-dois.ts';
import { avisosDoisTimes, avisosVariosTimes, nAlternativos, type Aviso } from '../../src/simulador/avisos.ts';
import { indicadoresDoisTimes } from '../../src/simulador/indicadores-dois.ts';

/**
 * Avisos (T14; SIM-42 a SIM-46, SIM-90).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - "Só 1º" sem reserva: 1 a mais (singular), 2 a mais (plural); igual ao número de reservas não avisa.
 * - Composição diferente em 2 times: time sem N titulares; reserva sem par. Em 3+: um só abaixo de N (o incompleto
 *   previsto) não avisa; dois abaixo avisam; um acima avisa.
 * - Sem nota: um (singular), dois ("A e B"), três ("A, B e C"); ordem de prioridade em 2 times, por id em 3+.
 * - Incompleto: exatamente a metade de N não avisa; menos da metade avisa, com 0, 1 ou 2 N alternativos.
 * - Nenhum texto leva nível individual.
 *
 * Nota: o tasks.md cita "2 'só 1º' e 1 reserva … com o plural", mas pela regra (titulares "só 1º" − reservas) isso dá
 * 1 jogador, no singular; o teste de plural usa 3 "só 1º" e 1 reserva.
 */

const DATA = '2026-10-22';

function apto(id: string, apelido: string, opcoes: { semNota?: boolean; so1oTempo?: boolean } = {}): Apto {
  return {
    id,
    apelido,
    nivel: opcoes.semNota ? 550 : 600,
    semNota: opcoes.semNota ?? false,
    anoNascimento: 1990,
    so1oTempo: opcoes.so1oTempo ?? false,
  };
}

function dois(aptos: readonly Apto[], composicao: ComposicaoDois, n: number): Aviso[] {
  const elenco = montarElenco(aptos, DATA);
  const posicoes = new Map(aptos.map((a, i) => [a.id, i]));
  const indicadores = indicadoresDoisTimes(composicao, elenco, posicoes);
  return avisosDoisTimes({ n, composicao, indicadores, elenco, posicoes });
}

function varios(aptos: readonly Apto[], times: string[][], n: number): Aviso[] {
  return avisosVariosTimes({ n, times, elenco: montarElenco(aptos, DATA) });
}

const textos = (avisos: readonly Aviso[], tipo: Aviso['tipo']): string[] =>
  avisos.filter((a) => a.tipo === tipo).map((a) => a.texto);

describe('avisos de 2 times', () => {
  it('SIM-44: "Léo Baiano e Serginho não têm nota: usamos nível 5,5."', () => {
    const aptos = [
      apto('a', 'Toninho'),
      apto('b', 'Bigode'),
      apto('c', 'Léo Baiano', { semNota: true }),
      apto('d', 'Careca'),
      apto('e', 'Serginho', { semNota: true }),
    ];
    const avisos = dois(aptos, { times: [{ titulares: ['a', 'd'], entram: [] }, { titulares: ['b', 'c'], entram: [] }], naoEntra: ['e'] }, 2);
    expect(textos(avisos, 'sem_nota')).toEqual(['Léo Baiano e Serginho não têm nota: usamos nível 5,5.']);
  });

  it('SIM-44: um só: "não tem nota"', () => {
    const aptos = [apto('a', 'A'), apto('b', 'B'), apto('c', 'Juca', { semNota: true }), apto('d', 'D')];
    const avisos = dois(aptos, { times: [{ titulares: ['a', 'd'], entram: [] }, { titulares: ['b', 'c'], entram: [] }], naoEntra: [] }, 2);
    expect(textos(avisos, 'sem_nota')).toEqual(['Juca não tem nota: usamos nível 5,5.']);
  });

  it('SIM-44: em 2 times, os apelidos saem na ordem de prioridade (não na de id nem na da composição)', () => {
    const aptos = [
      apto('z', 'Zeca', { semNota: true }),
      apto('b', 'B'),
      apto('m', 'Mané', { semNota: true }),
      apto('a', 'Abel', { semNota: true }),
    ];
    const avisos = dois(aptos, { times: [{ titulares: ['a', 'z'], entram: [] }, { titulares: ['b', 'm'], entram: [] }], naoEntra: [] }, 2);
    expect(textos(avisos, 'sem_nota')).toEqual(['Zeca, Mané e Abel não têm nota: usamos nível 5,5.']);
  });

  it('SIM-42, SIM-90: 1 "só 1º" a mais que as reservas avisa no singular', () => {
    const aptos = [
      apto('a', 'A', { so1oTempo: true }),
      apto('b', 'B'),
      apto('c', 'C', { so1oTempo: true }),
      apto('d', 'D'),
      apto('r', 'R'),
    ];
    const avisos = dois(aptos, { times: [{ titulares: ['a', 'c'], entram: ['r'] }, { titulares: ['b', 'd'], entram: [] }], naoEntra: [] }, 2);
    expect(textos(avisos, 'so_1o_tempo_sem_reserva')).toEqual([
      'Time A: 1 jogador que só joga o 1º tempo sem reserva para entrar; o time terá menos gente no 2º tempo.',
    ]);
  });

  it('SIM-42, SIM-90: 3 "só 1º" e 1 reserva entrando avisa com o plural', () => {
    const aptos = [
      apto('a', 'A', { so1oTempo: true }),
      apto('b', 'B'),
      apto('c', 'C', { so1oTempo: true }),
      apto('d', 'D'),
      apto('e', 'E', { so1oTempo: true }),
      apto('f', 'F'),
      apto('r', 'R'),
      apto('s', 'S'),
    ];
    const avisos = dois(
      aptos,
      { times: [{ titulares: ['b', 'd', 'f'], entram: ['r'] }, { titulares: ['a', 'c', 'e'], entram: ['s'] }], naoEntra: [] },
      3,
    );
    expect(textos(avisos, 'so_1o_tempo_sem_reserva')).toEqual([
      'Time B: 2 jogadores que só jogam o 1º tempo sem reserva para entrar; o time terá menos gente no 2º tempo.',
    ]);
  });

  it('SIM-42: tantos "só 1º" quanto reservas não avisa', () => {
    const aptos = [apto('a', 'A', { so1oTempo: true }), apto('b', 'B'), apto('c', 'C'), apto('d', 'D'), apto('r', 'R')];
    const avisos = dois(aptos, { times: [{ titulares: ['a', 'd'], entram: ['r'] }, { titulares: ['b', 'c'], entram: [] }], naoEntra: [] }, 2);
    expect(textos(avisos, 'so_1o_tempo_sem_reserva')).toEqual([]);
  });

  it('SIM-43: time sem N titulares e reserva sem par avisam a composição diferente', () => {
    const aptos = [apto('a', 'A'), apto('b', 'B'), apto('c', 'C'), apto('d', 'D'), apto('r', 'R'), apto('s', 'S')];
    // A tem 3 titulares (N = 2); B tem 1 titular e 2 reservas: só 1 sai, e uma reserva fica sem par.
    const avisos = dois(
      aptos,
      { times: [{ titulares: ['a', 'b', 'c'], entram: [] }, { titulares: ['d'], entram: ['r', 's'] }], naoEntra: [] },
      2,
    );
    expect(textos(avisos, 'composicao_diferente')).toEqual(['A composição difere da prevista: confira Time A e Time B.']);
  });

  it('SIM-43: composição prevista não avisa', () => {
    const aptos = [apto('a', 'A'), apto('b', 'B'), apto('c', 'C'), apto('d', 'D')];
    const avisos = dois(aptos, { times: [{ titulares: ['a', 'd'], entram: [] }, { titulares: ['b', 'c'], entram: [] }], naoEntra: [] }, 2);
    expect(avisos).toEqual([]);
  });
});

describe('avisos de 3 ou mais times', () => {
  const aptos13 = Array.from({ length: 13 }, (_, k) => apto(`p${String(k + 1).padStart(2, '0')}`, `P${k + 1}`));
  const em = (tamanhos: number[]): string[][] => {
    let i = 0;
    return tamanhos.map((q) => aptos13.slice(i, (i += q)).map((a) => a.id));
  };

  it('SIM-45: 13 aptos, N = 4 (incompleto de 1): avisa e sugere só N que forma 3 times sem incompleto pequeno', () => {
    expect(textos(varios(aptos13, em([4, 4, 4, 1]), 4), 'incompleto_pequeno')).toEqual([
      'O time incompleto ficou com 1 jogador, menos da metade de N. Experimente N = 5 ou 2.',
    ]);
  });

  it('SIM-45: incompleto com exatamente a metade de N não avisa', () => {
    const aptos10 = aptos13.slice(0, 10);
    expect(textos(varios(aptos10, [['p01', 'p02', 'p03', 'p04'], ['p05', 'p06', 'p07', 'p08'], ['p09', 'p10']], 4), 'incompleto_pequeno')).toEqual(
      [],
    );
  });

  it('SIM-45: nAlternativos procura N−1, N+1, N−2… e para em 2', () => {
    expect(nAlternativos(4, 13)).toEqual([5, 2]);
    expect(nAlternativos(4, 13).length).toBeLessThanOrEqual(2);
  });

  it('SIM-43: dois times abaixo de N avisam e listam os times', () => {
    expect(textos(varios(aptos13.slice(0, 10), em([4, 3, 3]), 4), 'composicao_diferente')).toEqual([
      'A composição difere da prevista: confira Time 2 e Time 3.',
    ]);
  });

  it('SIM-43: só o incompleto previsto abaixo de N não avisa a composição diferente', () => {
    expect(textos(varios(aptos13, em([4, 4, 4, 1]), 4), 'composicao_diferente')).toEqual([]);
  });

  it('SIM-43: time acima de N avisa', () => {
    expect(textos(varios(aptos13.slice(0, 12), em([5, 4, 3]), 4), 'composicao_diferente')).toEqual([
      'A composição difere da prevista: confira Time 1 e Time 3.',
    ]);
  });

  it('SIM-44: em 3 ou mais, os apelidos sem nota saem por id', () => {
    const lista = [apto('c', 'Caio', { semNota: true }), apto('a', 'Zé', { semNota: true }), ...aptos13.slice(0, 7)];
    const avisos = varios(lista, [['c', 'p01', 'p02'], ['p03', 'p04', 'a'], ['p05', 'p06', 'p07']], 3);
    expect(textos(avisos, 'sem_nota')).toEqual(['Zé e Caio não têm nota: usamos nível 5,5.']);
  });
});

describe('avisos não expõem nível nem bloqueiam', () => {
  it('SIM-46: nenhum texto contém nível individual; "5,5" só no aviso de sem nota', () => {
    const aptos = [
      apto('a', 'A', { so1oTempo: true }),
      apto('b', 'B'),
      apto('c', 'C', { semNota: true, so1oTempo: true }),
      apto('d', 'D'),
      apto('r', 'R'),
      apto('s', 'S'),
    ];
    const avisos2 = dois(
      aptos,
      { times: [{ titulares: ['a', 'c', 'b'], entram: [] }, { titulares: ['d'], entram: ['r', 's'] }], naoEntra: [] },
      2,
    );
    const aptos13 = Array.from({ length: 13 }, (_, k) => apto(`p${k}`, `P${k}`, { semNota: k === 3 }));
    const avisos3 = avisosVariosTimes({
      n: 4,
      times: [aptos13.slice(0, 4), aptos13.slice(4, 7), aptos13.slice(7, 10), aptos13.slice(10)].map((t) => t.map((a) => a.id)),
      elenco: montarElenco(aptos13, DATA),
    });
    const todos = [...avisos2, ...avisos3];
    expect(new Set(todos.map((a) => a.tipo))).toEqual(
      new Set(['so_1o_tempo_sem_reserva', 'composicao_diferente', 'sem_nota', 'incompleto_pequeno']),
    );
    for (const aviso of todos) {
      if (aviso.tipo === 'sem_nota') expect(aviso.texto.match(/\d,\d/g)).toEqual(['5,5']);
      else expect(aviso.texto).not.toMatch(/\d,\d/);
      expect(aviso.texto).not.toMatch(/\b(550|600)\b/);
    }
  });
});
