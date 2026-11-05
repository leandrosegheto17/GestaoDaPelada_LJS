/**
 * Máquina de estado dos eventos do Asaas (T4; PLA-44 a PLA-49, PLA-51). Função pura: recebe o evento já lido pelo
 * contrato tolerante (T7) e o estado da assinatura gravada (AD-088) e devolve o efeito; quem grava é a API (T36), numa
 * transação, pelas funções da T16. A entrega do Asaas é "pelo menos uma vez" e sem ordem (S:52): o id do evento já
 * repetido nem chega aqui (PLA-42, chave única no banco).
 *
 * Estados da assinatura: `aguardando_pagamento`, `ativa`, `cancelada`. Inadimplente muda só o grupo; a assinatura
 * segue `ativa` (AD-096).
 *
 * Casos limite (Domínio: sim), evento × estado:
 * - `PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED` com valor igual: em `aguardando_pagamento` e `ativa`, `ativar` com
 *   `pagoAteDe(dueDate)` (PLA-44); valor diferente: `nenhum('valor_divergente')` (PLA-51); a mesma cobrança que já deu o
 *   Pro (o par CONFIRMED + RECEIVED do cartão): `nenhum('ja_aplicado')`; sem `dueDate`: `nenhum('incompleto')`;
 * - `PAYMENT_OVERDUE`: só em `ativa` e só da cobrança mais recente → `inadimplente` (PLA-45); em `aguardando_pagamento`
 *   → `nenhum` (o grupo segue no trial ou no Free em que estava);
 * - `PAYMENT_REFUNDED`/`PAYMENT_CHARGEBACK_REQUESTED`: da cobrança que deu o Pro → `inadimplente`; de outra → `nenhum`
 *   (PLA-47);
 * - `SUBSCRIPTION_DELETED`/`SUBSCRIPTION_INACTIVATED` → `cancelar`, mantendo `pagoAte` (PLA-46); já cancelada → nenhum;
 * - evento com `dateCreated` anterior ao último aplicado → `nenhum('fora_de_ordem')`, qualquer tipo (PLA-48);
 * - tipo não tratado (inclusive `PAYMENT_CREATED`) → `nenhum('nao_tratado')` (PLA-49).
 */
import type { Data } from '../atividade/datas.ts';
import { pagoAteDe } from './pago-ate.ts';
import { reaisParaCentavos } from './recursos.ts';

export const SITUACOES_ASSINATURA = ['aguardando_pagamento', 'ativa', 'cancelada'] as const;
export type SituacaoAssinatura = (typeof SITUACOES_ASSINATURA)[number];

/** Os tipos que mudam alguma coisa; o resto é gravado e ignorado (PLA-49). */
export const EVENTOS_TRATADOS = [
  'PAYMENT_RECEIVED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_OVERDUE',
  'PAYMENT_REFUNDED',
  'PAYMENT_CHARGEBACK_REQUESTED',
  'SUBSCRIPTION_DELETED',
  'SUBSCRIPTION_INACTIVATED',
] as const;

export interface CobrancaDoEvento {
  id: string;
  /** `payment.value`, em reais como o Asaas manda; convertido aqui, na fronteira (PLA-06). */
  valorReais: number | null;
  /** `payment.dueDate`, `AAAA-MM-DD`. */
  vencimento: Data | null;
}

export interface EventoAsaas {
  /** `event`. */
  evento: string;
  /** `dateCreated` do evento, no formato do Asaas (`AAAA-MM-DD HH:MM:SS`): a ordem do texto é a do tempo. */
  dataCriacao: string | null;
  cobranca: CobrancaDoEvento | null;
}

export interface AssinaturaGravada {
  situacao: SituacaoAssinatura;
  valorCentavos: number;
  pagoAte: Data | null;
  /** A cobrança cujo pagamento deu o Pro atual. */
  cobrancaDoPro: string | null;
  /** `dateCreated` do último evento aplicado (que teve efeito). */
  ultimoEventoEm: string | null;
}

export type MotivoSemEfeito =
  | 'nao_tratado'
  | 'fora_de_ordem'
  | 'valor_divergente'
  | 'ja_aplicado'
  | 'incompleto'
  | 'outra_cobranca'
  | 'assinatura_cancelada'
  | 'aguardando_pagamento';

export type EfeitoDoEvento =
  | { tipo: 'ativar'; pagoAte: Data; cobrancaId: string }
  | { tipo: 'inadimplente' }
  | { tipo: 'cancelar' }
  | { tipo: 'nenhum'; motivo: MotivoSemEfeito };

const nenhum = (motivo: MotivoSemEfeito): EfeitoDoEvento => ({ tipo: 'nenhum', motivo });

function centavosDe(valorReais: number | null): number | null {
  if (valorReais === null) return null;
  try {
    return reaisParaCentavos(valorReais);
  } catch {
    return null;
  }
}

export function efeitoDoEvento(evento: EventoAsaas, assinatura: AssinaturaGravada): EfeitoDoEvento {
  // PLA-48: o que é mais antigo que o último aplicado não muda nada, de qualquer tipo (o `PAYMENT_CREATED` atrasado
  // sai como `fora_de_ordem`). Sem data e com algo já aplicado, não há como provar a ordem: não aplica (conservador).
  if (assinatura.ultimoEventoEm !== null) {
    if (evento.dataCriacao === null || evento.dataCriacao < assinatura.ultimoEventoEm) return nenhum('fora_de_ordem');
  }

  if (!(EVENTOS_TRATADOS as readonly string[]).includes(evento.evento)) return nenhum('nao_tratado');

  switch (evento.evento) {
    case 'SUBSCRIPTION_DELETED':
    case 'SUBSCRIPTION_INACTIVATED':
      return assinatura.situacao === 'cancelada' ? nenhum('ja_aplicado') : { tipo: 'cancelar' };

    case 'PAYMENT_RECEIVED':
    case 'PAYMENT_CONFIRMED': {
      // [LACUNA] Pagamento confirmado de assinatura já cancelada (cobrança paga logo antes do DELETE): a spec não diz se
      // reativa. Conservador: não muda nada; o evento fica gravado para conferência.
      if (assinatura.situacao === 'cancelada') return nenhum('assinatura_cancelada');
      const cobranca = evento.cobranca;
      if (cobranca === null || cobranca.vencimento === null) return nenhum('incompleto');
      if (centavosDe(cobranca.valorReais) !== assinatura.valorCentavos) return nenhum('valor_divergente');
      if (cobranca.id === assinatura.cobrancaDoPro) return nenhum('ja_aplicado');
      return { tipo: 'ativar', pagoAte: pagoAteDe(cobranca.vencimento), cobrancaId: cobranca.id };
    }

    case 'PAYMENT_OVERDUE': {
      if (assinatura.situacao === 'aguardando_pagamento') return nenhum('aguardando_pagamento');
      if (assinatura.situacao === 'cancelada') return nenhum('assinatura_cancelada');
      const cobranca = evento.cobranca;
      if (cobranca === null || cobranca.vencimento === null || assinatura.pagoAte === null) return nenhum('incompleto');
      // [LACUNA] "Cobrança mais recente" (PLA-45) não é guardada em `assinaturas` (AD-088). Interpretação: é a que
      // vence no `pagoAte` ou depois dele, isto é, a que ainda não foi coberta por um pagamento; a que vence antes já
      // foi superada por uma cobrança paga mais nova e não derruba o Pro.
      if (cobranca.vencimento < assinatura.pagoAte) return nenhum('outra_cobranca');
      return { tipo: 'inadimplente' };
    }

    case 'PAYMENT_REFUNDED':
    case 'PAYMENT_CHARGEBACK_REQUESTED': {
      if (evento.cobranca === null || evento.cobranca.id !== assinatura.cobrancaDoPro) return nenhum('outra_cobranca');
      return { tipo: 'inadimplente' };
    }

    default:
      return nenhum('nao_tratado');
  }
}
