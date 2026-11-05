import { describe, expect, it } from 'vitest';
import * as dominio from '../src/index.ts';
import { calcularPdf } from '../src/pdf/calcular.ts';
import { PESOS_PADRAO, type ConfigPesos, type SituacaoGravada } from '../src/pontuacao/pesos.ts';
import { compararCenarios } from '../src/previas/comparar.ts';
import { calcularRanking, type EntradaRanking, type PresencaDoRanking } from '../src/ranking/calcular.ts';
import { datasSemanais, jogador, partida } from './apoio/historico.ts';

/**
 * Desempenho do domínio e exportações (T16; PAR-63, PAR-62). Dois anos de pelada semanal: 40 jogadores × 104 partidas,
 * com faltas, lesões, expulsões, chuva, troca de pesos e jogadores que saíram e voltaram. A mediana de 50 rodadas de
 * cada função, depois de uma de aquecimento, fica abaixo de 5 ms.
 */

const RODADAS = 50;
const ORCAMENTO_MS = 5;

const DATAS = datasSemanais('2024-10-31', 104);
const HOJE = DATAS[DATAS.length - 1] as string;
const CONFIGS: ConfigPesos[] = [
  { ...PESOS_PADRAO, vigenteDesde: '2024-10-01' },
  { ...PESOS_PADRAO, presencaComChuva: 2, expulsoComChuva: -2, vigenteDesde: '2025-06-05' },
  { ...PESOS_PADRAO, presencaComChuva: 3, vigenteDesde: '2026-03-12' },
];

function situacao(j: number, p: number): SituacaoGravada | null {
  const k = j * 7 + p;
  if (k % 5 === 0) return null; // falta
  if (k % 13 === 0) return 'lesionado';
  if (k % 17 === 0) return 'expulso';
  return 'presente';
}

function grupoGrande(): Omit<EntradaRanking, 'mes'> {
  const partidas = DATAS.map((d, i) => partida(d, i % 4 === 0));
  const jogadores = Array.from({ length: 40 }, (_, j) =>
    jogador(`j${String(j).padStart(2, '0')}`, `Jogador ${j}`, {
      anoNascimento: j % 6 === 0 ? null : 1975 + (j % 25),
      pontuacaoInicial: j % 3,
      periodos:
        j % 8 === 0
          ? [
              { inicio: '2024-10-01', fim: '2025-08-01' },
              { inicio: '2025-09-04', fim: null },
            ]
          : [{ inicio: '2024-10-01', fim: null }],
      ...(j % 10 === 0 ? { inicioPontuacao: '2025-01-02' } : {}),
    }),
  );
  const presencas: PresencaDoRanking[] = [];
  jogadores.forEach((jog, j) => {
    partidas.forEach((p, i) => {
      const s = situacao(j, i);
      if (s !== null) presencas.push({ partidaId: p.id, jogadorId: jog.id, situacao: s });
    });
  });
  return { hoje: HOJE, jogadores, partidas, presencas, configsPesos: CONFIGS };
}

function mediana(fn: () => unknown): number {
  fn(); // aquecimento
  const tempos: number[] = [];
  for (let i = 0; i < RODADAS; i++) {
    const inicio = performance.now();
    fn();
    tempos.push(performance.now() - inicio);
  }
  tempos.sort((a, b) => a - b);
  return ((tempos[RODADAS / 2 - 1] as number) + (tempos[RODADAS / 2] as number)) / 2;
}

describe('desempenho do domínio', () => {
  const grupo = grupoGrande();
  const mes = HOJE.slice(0, 7);

  it('o cenário tem 40 jogadores e 104 partidas', () => {
    expect(grupo.jogadores).toHaveLength(40);
    expect(grupo.partidas).toHaveLength(104);
    expect(calcularRanking({ ...grupo, mes }).linhas).toHaveLength(40);
  });

  it('PAR-63: mediana de calcularRanking < 5 ms', () => {
    expect(mediana(() => calcularRanking({ ...grupo, mes }))).toBeLessThan(ORCAMENTO_MS);
  });

  it('PAR-63: mediana de calcularPdf < 5 ms', () => {
    expect(mediana(() => calcularPdf({ ...grupo, mes }))).toBeLessThan(ORCAMENTO_MS);
  });

  it('PAR-63: mediana de compararCenarios < 5 ms', () => {
    const { hoje, ...historico } = grupo;
    const periodosDepois = [
      { inicio: '2024-10-01', fim: '2025-08-01' },
      { inicio: '2025-08-07', fim: null },
    ];
    expect(mediana(() => compararCenarios(historico, 'j00', periodosDepois, hoje))).toBeLessThan(ORCAMENTO_MS);
  });
});

describe('exportações da pontuação', () => {
  it.each(['acumuladoAte', 'acumuladoComInicial', 'acumuladoDoJogador', 'compararJogador', 'prepararHistorico'])(
    'PAR-61: o index.ts não exporta a interna %s',
    (nome) => {
      expect((dominio as Record<string, unknown>)[nome]).toBeUndefined();
    },
  );

  it.each(['acumuladoPorInicio', 'calcularRanking', 'calcularPdf', 'compararCenarios', 'previaDosPeriodos', 'previaDoInicio'])(
    'PAR-62: o index.ts exporta a API pública %s',
    (nome) => {
      expect(typeof (dominio as Record<string, unknown>)[nome]).toBe('function');
    },
  );
});
