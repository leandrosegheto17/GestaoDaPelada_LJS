import { describe, expect, it } from 'vitest';
import {
  idadeNaData,
  mediaInteira,
  montarElenco,
  proximoDiaDeJogo,
} from '../../src/simulador/base.ts';

/**
 * Base do simulador (T2; SIM-01, SIM-51, SIM-95).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - Próximo dia de jogo: hoje é o dia (devolve hoje); o dia é amanhã; o dia foi ontem (6 dias à frente); virada de mês
 *   e de ano; domingo (0) e sábado (6) nas pontas da semana.
 * - Idade: sem ano é nula; o mesmo ano em 1º de janeiro e em 31 de dezembro dá a mesma idade.
 * - Média: meio exato sobe (683,5 → 684); abaixo do meio desce; 0 jogadores dá nulo; um só jogador é ele mesmo.
 */

describe('proximoDiaDeJogo', () => {
  it('SIM-01: grupo de quinta, numa terça, dá a quinta seguinte', () => {
    expect(proximoDiaDeJogo('2026-11-03', 'quinta')).toBe('2026-11-05');
  });

  it('SIM-01: grupo de quinta, numa quinta, dá hoje', () => {
    expect(proximoDiaDeJogo('2026-11-05', 'quinta')).toBe('2026-11-05');
  });

  it('SIM-01: grupo de quinta, numa sexta, dá a quinta da semana seguinte', () => {
    expect(proximoDiaDeJogo('2026-11-06', 'quinta')).toBe('2026-11-12');
  });

  it('SIM-01: virada de ano (quarta 30/12/2026, grupo de domingo, dá 03/01/2027)', () => {
    expect(proximoDiaDeJogo('2026-12-30', 'domingo')).toBe('2027-01-03');
  });

  it('SIM-01: virada de mês e sábado na ponta da semana', () => {
    expect(proximoDiaDeJogo('2026-10-30', 'sabado')).toBe('2026-10-31');
    expect(proximoDiaDeJogo('2026-11-01', 'sabado')).toBe('2026-11-07');
  });
});

describe('idadeNaData', () => {
  it('SIM-95: sem ano de nascimento, a idade é nula', () => {
    expect(idadeNaData(null, '2026-10-22')).toBeNull();
  });

  it('SIM-95: 1990 dá 36 em qualquer dia de 2026', () => {
    expect(idadeNaData(1990, '2026-01-01')).toBe(36);
    expect(idadeNaData(1990, '2026-12-31')).toBe(36);
  });
});

describe('mediaInteira', () => {
  it('SIM-51: 683 e 684 dão 684 (meio para cima)', () => {
    expect(mediaInteira(683 + 684, 2)).toBe(684);
  });

  it('SIM-51: abaixo do meio desce', () => {
    expect(mediaInteira(600 + 650 + 700 + 683, 4)).toBe(658);
  });

  it('SIM-51: 0 jogadores dá nulo', () => {
    expect(mediaInteira(0, 0)).toBeNull();
  });

  it('SIM-51: o resultado é inteiro', () => {
    expect(Number.isInteger(mediaInteira(1001, 3))).toBe(true);
  });
});

describe('montarElenco', () => {
  it('SIM-95: calcula a idade na data e deixa nula sem ano', () => {
    const elenco = montarElenco(
      [
        {
          id: 'a',
          apelido: 'A',
          nivel: 600,
          semNota: false,
          anoNascimento: 1990,
          so1oTempo: false,
        },
        { id: 'b', apelido: 'B', nivel: 550, semNota: true, anoNascimento: null, so1oTempo: false },
      ],
      '2026-10-22',
    );
    expect(elenco.get('a')?.idade).toBe(36);
    expect(elenco.get('b')?.idade).toBeNull();
  });
});
