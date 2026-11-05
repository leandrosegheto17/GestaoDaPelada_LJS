/**
 * Regra do excedente do Free (T5; PLA-15, PLA-16, PLA-17; S:41-42, AD-062, AD-092). Função pura: a API conta os
 * jogadores ativos e lista os grupos Free da criadora (T20) e o middleware `exigirPlanoEditavel` (T22) traduz o motivo em
 * 403 `somente_leitura`.
 *
 * Casos limite (Domínio: sim):
 * - 19, 20 e 21 ativos: com 20, só cadastrar e reativar travam (PLA-16); com 21, toda escrita trava (PLA-15);
 * - plano que não é Free (trial, pro, cortesia), mesmo com 30 ativos: nada trava;
 * - inativar jogador nunca trava, nem com 25 ativos nem no grupo que não é o mais antigo (PLA-15, AD-092);
 * - dois grupos Free da criadora com o mesmo `criadoEm`: desempate pelo id (texto), o menor segue editável (PLA-17);
 * - grupo arquivado não entra na lista (quem lista é a API);
 * - os dois motivos ao mesmo tempo: vale `limite_grupos` (o grupo inteiro trava, qualquer que seja a contagem).
 */
import type { Plano } from './plano-efetivo.ts';
import { LIMITE_JOGADORES_FREE } from './recursos.ts';

export type OperacaoDeEscrita =
  'escrita' | 'cadastrar_jogador' | 'reativar_jogador' | 'inativar_jogador';
export type MotivoSomenteLeitura = 'limite_jogadores' | 'limite_grupos';

export interface GrupoDaCriadora {
  id: string;
  /** `grupos.criado_em`, ISO 8601: a ordem do texto é a do tempo. */
  criadoEm: string;
}

export interface EntradaExcedente {
  plano: Plano;
  jogadoresAtivos: number;
  /** Grupos não arquivados da criadora que estão no Free, incluindo este. */
  gruposFreeDaCriadora: readonly GrupoDaCriadora[];
  grupoId: string;
  operacao: OperacaoDeEscrita;
}

/** O grupo Free mais antigo da criadora (menor `criadoEm`, desempate pelo id), o único editável. */
export function grupoFreeEditavel(grupos: readonly GrupoDaCriadora[]): GrupoDaCriadora | null {
  let escolhido: GrupoDaCriadora | null = null;
  for (const g of grupos) {
    if (
      escolhido === null ||
      g.criadoEm < escolhido.criadoEm ||
      (g.criadoEm === escolhido.criadoEm && g.id < escolhido.id)
    ) {
      escolhido = g;
    }
  }
  return escolhido;
}

/** `null` = pode escrever; senão, o motivo do 403 `somente_leitura`. */
export function somenteLeitura(entrada: EntradaExcedente): MotivoSomenteLeitura | null {
  const { plano, jogadoresAtivos, gruposFreeDaCriadora, grupoId, operacao } = entrada;
  if (plano !== 'free') return null;
  if (operacao === 'inativar_jogador') return null;

  if (gruposFreeDaCriadora.length > 1) {
    const editavel = grupoFreeEditavel(gruposFreeDaCriadora);
    if (editavel !== null && editavel.id !== grupoId) return 'limite_grupos';
  }

  if (jogadoresAtivos > LIMITE_JOGADORES_FREE) return 'limite_jogadores';
  if (
    jogadoresAtivos === LIMITE_JOGADORES_FREE &&
    (operacao === 'cadastrar_jogador' || operacao === 'reativar_jogador')
  ) {
    return 'limite_jogadores';
  }
  return null;
}
