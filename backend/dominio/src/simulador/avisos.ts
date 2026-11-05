/**
 * Avisos do simulador (T14; SIM-42 a SIM-46, SIM-90). Nenhum aviso bloqueia a confirmação, e nenhum leva nível
 * individual nem dado pessoal: só apelidos, nomes de time e contagens (SIM-46). O texto sai pronto do domínio, para a
 * tela só mostrar (`S:77`). Regra do legado `dominio/src/simulador/avisos.ts:61-73` e textos de
 * `aplicacao/simulador/textos-avisos.ts`, escritos do zero.
 */
import { compararIds, jogadorDe, type Elenco } from './base.ts';
import type { ComposicaoDois } from './chave-dois.ts';
import type { IndicadoresTimeDois, Posicoes } from './indicadores-dois.ts';
import { calcularPrevia, N_MINIMO, timesVarios } from './previa.ts';

export type TipoAviso = 'so_1o_tempo_sem_reserva' | 'composicao_diferente' | 'sem_nota' | 'incompleto_pequeno';

export interface Aviso {
  tipo: TipoAviso;
  texto: string;
}

/** Quantos N alternativos são sugeridos no máximo, e até que distância do N atual se procura. */
const MAX_SUGESTOES = 2;
const MAX_DISTANCIA = 30;

/** "A", "A e B", "A, B e C". */
export function listar(itens: readonly string[]): string {
  if (itens.length <= 1) return itens.join('');
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

/** "Time A" e "Time B" em 2 times. */
export function nomeDoTimeDois(indice: number): string {
  return indice === 0 ? 'Time A' : 'Time B';
}

/** "Time 1", "Time 2"… em 3 ou mais. */
export function nomeDoTimeVarios(indice: number): string {
  return `Time ${indice + 1}`;
}

function semNota(ids: readonly string[], elenco: Elenco): Aviso[] {
  const apelidos = ids.filter((id) => jogadorDe(elenco, id).semNota).map((id) => jogadorDe(elenco, id).apelido);
  if (apelidos.length === 0) return [];
  const verbo = apelidos.length === 1 ? 'não tem nota' : 'não têm nota';
  return [{ tipo: 'sem_nota', texto: `${listar(apelidos)} ${verbo}: usamos nível 5,5.` }];
}

function composicaoDiferente(nomes: readonly string[]): Aviso[] {
  if (nomes.length === 0) return [];
  return [{ tipo: 'composicao_diferente', texto: `A composição difere da prevista: confira ${listar(nomes)}.` }];
}

export interface EntradaAvisosDois {
  n: number;
  composicao: ComposicaoDois;
  indicadores: readonly [IndicadoresTimeDois, IndicadoresTimeDois];
  elenco: Elenco;
  posicoes: Posicoes;
}

/**
 * 2 times: (a) time com mais titulares "só 1º" que reservas entrando (SIM-42, SIM-90); (b) composição que difere da
 * prevista: time sem N titulares ou com reserva sem par (SIM-43); (c) aptos sem nota, na ordem de prioridade (SIM-44).
 */
export function avisosDoisTimes({ n, composicao, indicadores, elenco, posicoes }: EntradaAvisosDois): Aviso[] {
  const avisos: Aviso[] = [];
  composicao.times.forEach((time, i) => {
    const so1o = time.titulares.filter((id) => jogadorDe(elenco, id).so1oTempo).length;
    const faltam = so1o - time.entram.length;
    if (faltam > 0) {
      const quem = faltam === 1 ? 'jogador que só joga' : 'jogadores que só jogam';
      avisos.push({
        tipo: 'so_1o_tempo_sem_reserva',
        texto: `${nomeDoTimeDois(i)}: ${faltam} ${quem} o 1º tempo sem reserva para entrar; o time terá menos gente no 2º tempo.`,
      });
    }
  });

  const diferentes = composicao.times.flatMap((time, i) =>
    time.titulares.length !== n || indicadores[i]!.entraSemPar.length > 0 ? [nomeDoTimeDois(i)] : [],
  );
  avisos.push(...composicaoDiferente(diferentes));

  const pos = (id: string): number => posicoes.get(id) ?? Number.MAX_SAFE_INTEGER;
  const todos = [...composicao.times.flatMap((t) => [...t.titulares, ...t.entram]), ...composicao.naoEntra].sort(
    (a, b) => pos(a) - pos(b) || compararIds(a, b),
  );
  avisos.push(...semNota(todos, elenco));
  return avisos;
}

/** N próximos do atual (N−1, N+1, N−2, …) que formam 3 times e não deixam incompleto menor que a metade. */
export function nAlternativos(n: number, aptos: number): number[] {
  const sugeridos: number[] = [];
  for (let d = 1; d <= MAX_DISTANCIA && sugeridos.length < MAX_SUGESTOES; d += 1) {
    for (const candidato of [n - d, n + d]) {
      if (candidato < N_MINIMO || sugeridos.length >= MAX_SUGESTOES) continue;
      if (!calcularPrevia({ formato: 'varios_times', n: candidato, aptos }).valida) continue;
      const resto = timesVarios(aptos, candidato).tamanhoIncompleto;
      if (resto === 0 || 2 * resto >= candidato) sugeridos.push(candidato);
    }
  }
  return sugeridos;
}

export interface EntradaAvisosVarios {
  n: number;
  times: readonly (readonly string[])[];
  elenco: Elenco;
}

/**
 * 3 ou mais: (b) mais de um time abaixo de N ou algum acima (SIM-43); (c) aptos sem nota, por id (SIM-44);
 * (d) incompleto com menos da metade de N, com até 2 N alternativos (SIM-45).
 */
export function avisosVariosTimes({ n, times, elenco }: EntradaAvisosVarios): Aviso[] {
  const avisos: Aviso[] = [];
  const tamanhos = times.map((t) => t.length);
  const abaixo = tamanhos.filter((q) => q < n).length;
  if (abaixo > 1 || tamanhos.some((q) => q > n)) {
    avisos.push(...composicaoDiferente(tamanhos.flatMap((q, i) => (q !== n ? [nomeDoTimeVarios(i)] : []))));
  }

  const ids = times.flat();
  avisos.push(...semNota([...ids].sort(compararIds), elenco));

  const resto = timesVarios(ids.length, n).tamanhoIncompleto;
  if (resto > 0 && 2 * resto < n) {
    const sugeridos = nAlternativos(n, ids.length);
    const sugestao = sugeridos.length > 0 ? ` Experimente N = ${sugeridos.join(' ou ')}.` : '';
    avisos.push({
      tipo: 'incompleto_pequeno',
      texto: `O time incompleto ficou com ${resto} ${resto === 1 ? 'jogador' : 'jogadores'}, menos da metade de N.${sugestao}`,
    });
  }
  return avisos;
}
