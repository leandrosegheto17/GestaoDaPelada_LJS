/**
 * Avaliação de uma composição ajustada à mão (T16; SIM-62, SIM-63): confere repetidos e jogadores fora dos aptos e
 * recalcula saídas, pares, indicadores e avisos da composição recebida, sem refazer a distribuição nem gravar. O "só 1º
 * tempo" vale como está na composição: é o que o admin acabou de ajustar. Regra do legado
 * `aplicacao/simulador/avaliar.ts`, escrita do zero no domínio.
 */
import { montarElenco, type Apto } from './base.ts';
import { avisosDoisTimes, avisosVariosTimes, type Aviso } from './avisos.ts';
import type { ComposicaoDois } from './chave-dois.ts';
import { descreverPrevia } from './descricao.ts';
import { indicadoresDoisTimes, type IndicadoresTimeDois } from './indicadores-dois.ts';
import { indicadoresVariosTimes, type IndicadoresTimeVarios } from './indicadores-varios.ts';
import { calcularPrevia } from './previa.ts';
import { ordemDePrioridade, posicoesDe, type HistoricoSim } from './prioridade.ts';
import { normalizarAptos, type EntradaSimulador } from './sugerir.ts';

export const MENSAGEM_REPETIDO_NA_COMPOSICAO = 'Há jogador repetido na composição.';
export const MENSAGEM_FORA_DOS_APTOS = 'Há jogador fora dos aptos na composição.';
export const MENSAGEM_FALTA_APTO_NA_COMPOSICAO = 'A composição precisa incluir todos os aptos.';

export interface JogadorNaComposicao {
  id: string;
  so1oTempo: boolean;
}

export interface TimeDoisEntrada {
  titulares: readonly JogadorNaComposicao[];
  entram: readonly JogadorNaComposicao[];
}

/** A composição como a tela a envia (a forma do contrato, T22). */
export type ComposicaoEntrada =
  | {
      formato: 'dois_times';
      times: readonly [TimeDoisEntrada, TimeDoisEntrada];
      naoEntra: readonly string[];
    }
  | { formato: 'varios_times'; times: readonly (readonly string[])[] };

export interface FalhaAvaliacao {
  ok: false;
  campo: 'composicao';
  mensagem: string;
}

export interface AvaliacaoDois {
  ok: true;
  formato: 'dois_times';
  descricao: string;
  composicao: ComposicaoDois;
  indicadores: [IndicadoresTimeDois, IndicadoresTimeDois];
  avisos: Aviso[];
}

export interface AvaliacaoVarios {
  ok: true;
  formato: 'varios_times';
  descricao: string;
  times: string[][];
  incompleto: number | null;
  indicadores: IndicadoresTimeVarios[];
  avisos: Aviso[];
}

export type Avaliacao = FalhaAvaliacao | AvaliacaoDois | AvaliacaoVarios;

/** Todos os ids da composição: titulares, reservas e "não entra" (2 times), ou todos os times. */
export function idsDaComposicaoEntrada(composicao: ComposicaoEntrada): string[] {
  if (composicao.formato === 'varios_times') return composicao.times.flat();
  return [
    ...composicao.times.flatMap((t) => [...t.titulares, ...t.entram].map((j) => j.id)),
    ...composicao.naoEntra,
  ];
}

/** Repetido, depois fora dos aptos, depois falta de apto (SIM-63, AD-123); nulo quando a composição passa. */
export function problemaNaComposicao(
  ids: readonly string[],
  aptos: readonly { id: string }[],
): string | null {
  if (new Set(ids).size !== ids.length) return MENSAGEM_REPETIDO_NA_COMPOSICAO;
  const permitidos = new Set(aptos.map((a) => a.id));
  if (!ids.every((id) => permitidos.has(id))) return MENSAGEM_FORA_DOS_APTOS;
  // AD-123: a composição cobre todos os aptos (como o legado); repetido e fora dos aptos já foram recusados.
  return ids.length < permitidos.size ? MENSAGEM_FALTA_APTO_NA_COMPOSICAO : null;
}

/**
 * Avalia a composição. A composição cobre todos os aptos, sem repetido nem fora dos aptos (SIM-63, AD-123).
 * Decisão do usuário em 2026-11-05: vale a recusa do legado (a spec não pedia).
 */
export function avaliar(
  entrada: EntradaSimulador,
  composicao: ComposicaoEntrada,
  historico: HistoricoSim,
): Avaliacao {
  if (composicao.formato !== entrada.formato)
    throw new Error('formato da composição diferente do da entrada');
  const problema = problemaNaComposicao(idsDaComposicaoEntrada(composicao), entrada.aptos);
  if (problema) return { ok: false, campo: 'composicao', mensagem: problema };

  const { data, n } = entrada;
  const previa = calcularPrevia({ formato: entrada.formato, n, aptos: entrada.aptos.length });
  const descricao = descreverPrevia(previa);

  if (composicao.formato === 'varios_times') {
    const aptos = normalizarAptos('varios_times', entrada.aptos);
    const elenco = montarElenco(aptos, data);
    const times = composicao.times.map((t) => [...t]);
    const incompleto =
      previa.valida && previa.formato === 'varios_times' && previa.tamanhoIncompleto > 0
        ? times.length - 1
        : null;
    return {
      ok: true,
      formato: 'varios_times',
      descricao,
      times,
      incompleto,
      indicadores: indicadoresVariosTimes(times, elenco),
      avisos: avisosVariosTimes({ n, times, elenco }),
    };
  }

  const so1o = new Map(
    composicao.times.flatMap((t) =>
      [...t.titulares, ...t.entram].map((j) => [j.id, j.so1oTempo] as const),
    ),
  );
  const aptos: Apto[] = normalizarAptos('dois_times', entrada.aptos).map((a) => ({
    ...a,
    so1oTempo: so1o.get(a.id) ?? a.so1oTempo,
  }));
  const elenco = montarElenco(aptos, data);
  const posicoes = posicoesDe(ordemDePrioridade(aptos, historico, data));
  const comp: ComposicaoDois = {
    times: [
      {
        titulares: composicao.times[0].titulares.map((j) => j.id),
        entram: composicao.times[0].entram.map((j) => j.id),
      },
      {
        titulares: composicao.times[1].titulares.map((j) => j.id),
        entram: composicao.times[1].entram.map((j) => j.id),
      },
    ],
    naoEntra: [...composicao.naoEntra],
  };
  const indicadores = indicadoresDoisTimes(comp, elenco, posicoes);
  return {
    ok: true,
    formato: 'dois_times',
    descricao,
    composicao: comp,
    indicadores,
    avisos: avisosDoisTimes({ n, composicao: comp, indicadores, elenco, posicoes }),
  };
}
