/**
 * Apoio dos testes de ranking, PDF e prévias (partidas-e-ranking T11 a T16): fábricas de jogador, partida e presença,
 * e um histórico de agosto a outubro de 2026 com troca de pesos em 01/09.
 */
import { somarDias } from '../../src/atividade/datas.ts';
import { PESOS_PADRAO, type ConfigPesos, type SituacaoGravada } from '../../src/pontuacao/pesos.ts';
import type {
  EntradaRanking,
  JogadorDoRanking,
  PartidaDoRanking,
  PresencaDoRanking,
} from '../../src/ranking/calcular.ts';

/** Pesos padrão desde 05/02 e chuva valendo 2 desde 01/09. */
export const CONFIGS: ConfigPesos[] = [
  { ...PESOS_PADRAO, vigenteDesde: '2026-02-05' },
  { ...PESOS_PADRAO, presencaComChuva: 2, vigenteDesde: '2026-09-01' },
];

export function jogador(
  id: string,
  apelido: string,
  extra: Partial<Omit<JogadorDoRanking, 'id' | 'apelido'>> = {},
): JogadorDoRanking {
  return {
    id,
    apelido,
    anoNascimento: 1990,
    periodos: [{ inicio: '2026-01-01', fim: null }],
    pontuacaoInicial: 0,
    ...extra,
  };
}

export function partida(data: string, choveu = false): PartidaDoRanking {
  return { id: `p-${data}`, data, choveu };
}

export function presenca(
  jogadorId: string,
  data: string,
  situacao: SituacaoGravada = 'presente',
): PresencaDoRanking {
  return { partidaId: `p-${data}`, jogadorId, situacao };
}

export const datasSemanais = (inicio: string, quantas: number, passo = 7): string[] =>
  Array.from({ length: quantas }, (_, i) => somarDias(inicio, i * passo));

/** Chuva em 10/09 e 08/10. */
export const DATAS_TRES_MESES = [
  '2026-08-06',
  '2026-08-13',
  '2026-09-03',
  '2026-09-10',
  '2026-10-01',
  '2026-10-08',
];

/**
 * Seis jogadores, agosto a outubro de 2026:
 * - Ana: presente em todas;
 * - Bia: presente nas 4 primeiras e lesionada em 01/10;
 * - Cris: 06/08, expulsa em 10/09 (chuva), 01/10 e 08/10;
 * - Duda: entra em 08/10 e joga;
 * - Edu: saiu em 05/09 e voltou em 01/10 (saiu e voltou);
 * - Fê: saiu em 20/09 (inativa hoje).
 */
export function historicoDeTresMeses(): Omit<EntradaRanking, 'hoje' | 'mes'> {
  const partidas = DATAS_TRES_MESES.map((d) =>
    partida(d, d === '2026-09-10' || d === '2026-10-08'),
  );
  const jogadores = [
    jogador('a', 'Ana', { anoNascimento: 1990 }),
    jogador('b', 'Bia', { anoNascimento: 1991 }),
    jogador('c', 'Cris', { anoNascimento: 1992 }),
    jogador('d', 'Duda', { anoNascimento: 1993, periodos: [{ inicio: '2026-10-08', fim: null }] }),
    jogador('e', 'Edu', {
      anoNascimento: 1994,
      periodos: [
        { inicio: '2026-01-01', fim: '2026-09-05' },
        { inicio: '2026-10-01', fim: null },
      ],
    }),
    jogador('f', 'Fê', {
      anoNascimento: 1995,
      periodos: [{ inicio: '2026-01-01', fim: '2026-09-20' }],
    }),
  ];
  const presencas: PresencaDoRanking[] = [
    ...DATAS_TRES_MESES.map((d) => presenca('a', d)),
    ...DATAS_TRES_MESES.slice(0, 4).map((d) => presenca('b', d)),
    presenca('b', '2026-10-01', 'lesionado'),
    presenca('c', '2026-08-06'),
    presenca('c', '2026-09-10', 'expulso'),
    presenca('c', '2026-10-01'),
    presenca('c', '2026-10-08'),
    presenca('d', '2026-10-08'),
    presenca('e', '2026-08-06'),
    presenca('e', '2026-08-13'),
    presenca('e', '2026-09-03'),
    presenca('e', '2026-10-01'),
    presenca('f', '2026-08-06'),
    presenca('f', '2026-09-03'),
  ];
  return { jogadores, partidas, presencas, configsPesos: CONFIGS };
}
