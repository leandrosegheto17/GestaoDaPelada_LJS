import { describe, expect, it } from 'vitest';
import { PESOS_PADRAO, type ConfigPesos } from '../../src/pontuacao/pesos.ts';
import type { JogadorDoRanking } from '../../src/ranking/calcular.ts';
import type { Apto } from '../../src/simulador/base.ts';
import { ordemDePrioridade, type HistoricoSim } from '../../src/simulador/prioridade.ts';

/**
 * Ordem de prioridade pelo ranking da véspera (T5; SIM-16, SIM-17, SIM-18).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - Partida lançada na própria data não conta; a da semana anterior conta.
 * - Grupo sem partida anterior: só desempates (ano, apelido, id); sem ano vai ao fim.
 * - "José" e "Jose" com o mesmo ano e o mesmo acumulado: decide o id, em qualquer ordem de entrada.
 * - Maiúsculas e acentos não mudam a ordem do apelido.
 */

const DATA = '2026-10-22';
const CONFIGS: ConfigPesos[] = [{ ...PESOS_PADRAO, presencaSemChuva: 4, vigenteDesde: '2000-01-01' }];

function apto(id: string, apelido: string, anoNascimento: number | null): Apto {
  return { id, apelido, nivel: 600, semNota: false, anoNascimento, so1oTempo: false };
}

function jogador(id: string, apelido: string, pontuacaoInicial: number, anoNascimento: number | null): JogadorDoRanking {
  return {
    id,
    apelido,
    anoNascimento,
    periodos: [{ inicio: '2026-01-01', fim: null }],
    pontuacaoInicial,
    inicioPontuacao: '2026-01-01',
  };
}

function historico(jogadores: JogadorDoRanking[], extra: Partial<HistoricoSim> = {}): HistoricoSim {
  return { jogadores, partidas: [], presencas: [], configsPesos: CONFIGS, ...extra };
}

const ids = (lista: readonly Apto[]): string[] => lista.map((a) => a.id);

describe('ordemDePrioridade', () => {
  it('SIM-17: A com 10 até a véspera e B com 8 (12 contando a partida da própria data): A antes de B', () => {
    const h = historico([jogador('a', 'A', 10, 1990), jogador('b', 'B', 8, 1990)], {
      partidas: [{ id: 'hoje', data: DATA, choveu: false }],
      presencas: [{ partidaId: 'hoje', jogadorId: 'b', situacao: 'presente' }],
    });
    expect(ids(ordemDePrioridade([apto('b', 'B', 1990), apto('a', 'A', 1990)], h, DATA))).toEqual(['a', 'b']);
  });

  it('SIM-17: a partida da semana anterior conta (B passa a 12 e fica antes de A)', () => {
    const h = historico([jogador('a', 'A', 10, 1990), jogador('b', 'B', 8, 1990)], {
      partidas: [{ id: 'antes', data: '2026-10-15', choveu: false }],
      presencas: [{ partidaId: 'antes', jogadorId: 'b', situacao: 'presente' }],
    });
    expect(ids(ordemDePrioridade([apto('a', 'A', 1990), apto('b', 'B', 1990)], h, DATA))).toEqual(['b', 'a']);
  });

  it('SIM-18: grupo sem partida anterior: ordem por ano, apelido e id; sem ano vai ao fim', () => {
    const h = historico([
      jogador('1', 'Zeca', 0, 1980),
      jogador('2', 'Beto', 0, 1995),
      jogador('3', 'Abel', 0, 1995),
      jogador('4', 'Caio', 0, null),
    ]);
    const aptos = [apto('4', 'Caio', null), apto('2', 'Beto', 1995), apto('3', 'Abel', 1995), apto('1', 'Zeca', 1980)];
    expect(ids(ordemDePrioridade(aptos, h, DATA))).toEqual(['1', '3', '2', '4']);
  });

  it('SIM-16: "José" e "Jose" empatados em tudo: o id menor primeiro, em qualquer ordem de entrada', () => {
    const h = historico([jogador('id-2', 'José', 5, 1990), jogador('id-1', 'Jose', 5, 1990)]);
    const jose = apto('id-1', 'Jose', 1990);
    const joseAcento = apto('id-2', 'José', 1990);
    expect(ids(ordemDePrioridade([joseAcento, jose], h, DATA))).toEqual(['id-1', 'id-2']);
    expect(ids(ordemDePrioridade([jose, joseAcento], h, DATA))).toEqual(['id-1', 'id-2']);
  });

  it('SIM-16: caixa e acento não mudam a ordem do apelido', () => {
    const h = historico([jogador('x', 'álvaro', 0, 1990), jogador('y', 'Bruno', 0, 1990)]);
    expect(ids(ordemDePrioridade([apto('y', 'Bruno', 1990), apto('x', 'álvaro', 1990)], h, DATA))).toEqual(['x', 'y']);
  });
});
