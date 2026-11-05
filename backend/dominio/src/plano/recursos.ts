/**
 * Recursos por plano e preço do Pro (T2; PLA-05, PLA-06, PLA-62). A tabela é a única fonte do que cada plano libera:
 * a API (`recursoLiberado`, T21), o excedente (T5), Meu plano e a landing leem daqui. Preço em centavos inteiros
 * (molde do financeiro, `FIN:7`); reais só na fronteira com o Asaas (T29).
 */
import type { Plano } from './plano-efetivo.ts';

/** O que um plano pode liberar. Partidas e ranking (inclusive o público, PLA-19) valem em todo plano. */
export const RECURSOS = ['partidas', 'ranking', 'simulador', 'financeiro', 'pdf', 'push'] as const;
export type Recurso = (typeof RECURSOS)[number];

/** Recursos que só o Pro (trial, pro, cortesia) libera: os que respondem 403 `plano_pro` no Free. */
export const RECURSOS_PRO = [
  'simulador',
  'financeiro',
  'pdf',
  'push',
] as const satisfies readonly Recurso[];
export type RecursoPro = (typeof RECURSOS_PRO)[number];

export interface RecursosDoPlano {
  readonly recursos: readonly Recurso[];
  /** Jogadores ativos (período aberto); `null` = ilimitado. */
  readonly limiteJogadores: number | null;
  /** Grupos não arquivados no Free por criadora; `null` = sem limite. */
  readonly limiteGrupos: number | null;
}

export const LIMITE_JOGADORES_FREE = 20;
export const LIMITE_GRUPOS_FREE = 1;

const PRO: RecursosDoPlano = Object.freeze({
  recursos: Object.freeze([
    'partidas',
    'ranking',
    'simulador',
    'financeiro',
    'pdf',
    'push',
  ] as const),
  limiteJogadores: null,
  limiteGrupos: null,
});

/** A tabela de S:77 (PLA-05). */
export const RECURSOS_POR_PLANO: Readonly<Record<Plano, RecursosDoPlano>> = Object.freeze({
  free: Object.freeze({
    recursos: Object.freeze(['partidas', 'ranking'] as const),
    limiteJogadores: LIMITE_JOGADORES_FREE,
    limiteGrupos: LIMITE_GRUPOS_FREE,
  }),
  trial: PRO,
  pro: PRO,
  cortesia: PRO,
});

/** O plano libera o recurso. */
export function planoLibera(plano: Plano, recurso: Recurso): boolean {
  return RECURSOS_POR_PLANO[plano].recursos.includes(recurso);
}

/** Preço mensal do Pro por grupo, em centavos (PLA-06). */
export const PRECO_PRO_CENTAVOS = 990;

function exigirCentavos(centavos: number): void {
  if (!Number.isSafeInteger(centavos) || centavos < 0) {
    throw new RangeError('Valor em centavos precisa ser inteiro e não negativo.');
  }
}

/** Centavos para reais, só na fronteira com o Asaas: 990 → 9.9. */
export function centavosParaReais(centavos: number): number {
  exigirCentavos(centavos);
  return centavos / 100;
}

/**
 * Reais (como o Asaas manda, `value: 9.9`) para centavos. O arredondamento só desfaz o erro de ponto flutuante da
 * multiplicação (9.9 * 100 = 990.0000000000001); valor com mais de 2 casas é recusado, não arredondado.
 */
export function reaisParaCentavos(reais: number): number {
  if (!Number.isFinite(reais) || reais < 0) throw new RangeError('Valor em reais inválido.');
  const centavos = Math.round(reais * 100);
  if (Math.abs(centavos - reais * 100) > 1e-6)
    throw new RangeError('Valor em reais com mais de 2 casas.');
  return centavos;
}

/** "R$ 9,90", com ponto no milhar ("R$ 1.234,56"). Sem `Intl`, que usa espaço não separável. */
export function formatarPreco(centavos: number): string {
  exigirCentavos(centavos);
  const inteiro = Math.floor(centavos / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const resto = String(centavos % 100).padStart(2, '0');
  return `R$ ${inteiro},${resto}`;
}
