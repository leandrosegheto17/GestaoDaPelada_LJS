import { somarDias } from '../../src/atividade/datas.ts';
import { PESOS_PADRAO, type ConfigPesos } from '../../src/pontuacao/pesos.ts';
import type { Apto } from '../../src/simulador/base.ts';
import type { HistoricoSim } from '../../src/simulador/prioridade.ts';

/**
 * Apoio dos testes do simulador (T15 em diante): um elenco fixo de 22 jogadores com níveis, idades, "sem nota" e
 * histórico variados, e um embaralhamento determinístico (sem `Math.random`, SIM-50).
 */

export const DATA = '2026-10-22';

export const CONFIGS: ConfigPesos[] = [
  { ...PESOS_PADRAO, presencaSemChuva: 3, presencaComChuva: 4, vigenteDesde: '2026-01-01' },
];

const APELIDOS = [
  'Toninho', 'Bigode', 'Careca', 'Juninho', 'Marcão', 'Paulinho', 'Zé Carlos', 'Dudu', 'Gordo', 'Tiago', 'Neném',
  'Rafinha', 'Alemão', 'Pedrão', 'Cabeça', 'Vini', 'Japa', 'Léo Baiano', 'Serginho', 'Bira', 'Tico', 'Nando',
];

/** id `j01` … `j22`. */
export const id = (i: number): string => `j${String(i).padStart(2, '0')}`;

export function aptosFixos(quantos = 22, so1o: readonly number[] = []): Apto[] {
  return Array.from({ length: quantos }, (_, k) => {
    const i = k + 1;
    const semNota = i === 18 || i === 19;
    return {
      id: id(i),
      apelido: APELIDOS[k] ?? `Jogador ${i}`,
      nivel: semNota ? 550 : 450 + ((i * 173) % 480),
      semNota,
      anoNascimento: i % 7 === 0 ? null : 1970 + ((i * 13) % 32),
      so1oTempo: so1o.includes(i),
    };
  });
}

/** Histórico: 8 partidas semanais antes da data e uma na própria data, presenças variadas. */
export function historicoFixo(quantos = 22): HistoricoSim {
  const datas = ['2026-08-27', '2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24', '2026-10-01', '2026-10-08', '2026-10-15', DATA];
  const partidas = datas.map((data, p) => ({ id: `p${p}`, data, choveu: p % 3 === 0 }));
  const presencas = partidas.flatMap((partida, p) =>
    Array.from({ length: quantos }, (_, k) => k + 1)
      .filter((i) => (i * 7 + p * 3) % 5 !== 0)
      .map((i) => ({ partidaId: partida.id, jogadorId: id(i), situacao: 'presente' as const })),
  );
  const jogadores = aptosFixos(quantos).map((a, k) => ({
    id: a.id,
    apelido: a.apelido,
    anoNascimento: a.anoNascimento,
    periodos: [{ inicio: '2026-01-01', fim: null }],
    pontuacaoInicial: k % 4,
    inicioPontuacao: '2026-01-01',
  }));
  return { jogadores, partidas, presencas, configsPesos: CONFIGS };
}

/**
 * Elenco e histórico grandes para medir CPU (T19, T20): `jogadores` jogadores com nível, idade e "sem nota" variados
 * e `partidas` partidas semanais antes de 2026-10-22, cada uma com cerca de 3/4 do elenco presente.
 */
export function aptosGrandes(quantos: number): Apto[] {
  return Array.from({ length: quantos }, (_, k) => {
    const i = k + 1;
    return {
      id: `g${String(i).padStart(3, '0')}`,
      apelido: `Jogador ${i}`,
      nivel: i % 11 === 0 ? 550 : 300 + ((i * 197) % 700),
      semNota: i % 11 === 0,
      anoNascimento: i % 9 === 0 ? null : 1965 + ((i * 17) % 40),
      so1oTempo: false,
    };
  });
}

export function historicoGrande(jogadores: number, partidas: number): HistoricoSim {
  const elenco = aptosGrandes(jogadores);
  // Semanal, para trás a partir de 2026-10-15.
  const lista = Array.from({ length: partidas }, (_, p) => ({
    id: `pg${p}`,
    data: somarDias('2026-10-15', -7 * p),
    choveu: p % 4 === 0,
  }));
  const presencas = lista.flatMap((partida, p) =>
    elenco
      .filter((_, k) => (k * 5 + p) % 4 !== 0)
      .map((a) => ({ partidaId: partida.id, jogadorId: a.id, situacao: 'presente' as const })),
  );
  return {
    jogadores: elenco.map((a, k) => ({
      id: a.id,
      apelido: a.apelido,
      anoNascimento: a.anoNascimento,
      periodos: [{ inicio: '2020-01-01', fim: null }],
      pontuacaoInicial: k % 6,
      inicioPontuacao: '2020-01-01',
    })),
    partidas: lista,
    presencas,
    configsPesos: [{ ...PESOS_PADRAO, presencaSemChuva: 3, presencaComChuva: 4, vigenteDesde: '2020-01-01' }],
  };
}

/** Embaralhamento determinístico: inverte e intercala as metades. */
export function embaralhar<T>(lista: readonly T[]): T[] {
  const invertida = [...lista].reverse();
  const meio = Math.ceil(invertida.length / 2);
  const resultado: T[] = [];
  for (let i = 0; i < meio; i += 1) {
    resultado.push(invertida[i]!);
    if (i + meio < invertida.length) resultado.push(invertida[i + meio]!);
  }
  return resultado;
}

export function embaralharHistorico(h: HistoricoSim): HistoricoSim {
  return {
    jogadores: embaralhar(h.jogadores),
    partidas: embaralhar(h.partidas),
    presencas: embaralhar(h.presencas),
    configsPesos: embaralhar(h.configsPesos),
  };
}
