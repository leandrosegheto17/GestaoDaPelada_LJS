/**
 * Quando Meu plano mostra o link da fatura em aberto (planos-e-cobranca T24; PLA-08, PLA-54; AD-096). Mora no domínio
 * do plano porque decide pela situação comercial, que só se compara aqui (checagem `plano-unico`, T8).
 *
 * Casos limite:
 * - assinatura `aguardando_pagamento`: mostra (PLA-54, "Aguardando…" com o link);
 * - assinatura `ativa` com o grupo `inadimplente`: mostra (AD-096: a assinatura segue ativa com a fatura em aberto);
 * - assinatura `ativa` com o grupo `ativo` ou `cancelado`: não mostra (nada em aberto);
 * - assinatura `cancelada`: nunca mostra;
 * - sem assinatura: não mostra.
 */
import type { SituacaoAssinatura } from './eventos-asaas.ts';
import type { SituacaoComercial } from './plano-efetivo.ts';

export function mostraFaturaEmAberto(
  situacaoComercial: SituacaoComercial,
  situacaoAssinatura: SituacaoAssinatura | null,
): boolean {
  if (situacaoAssinatura === null) return false;
  switch (situacaoAssinatura) {
    case 'aguardando_pagamento':
      return true;
    case 'ativa':
      return situacaoComercial === 'inadimplente';
    case 'cancelada':
      return false;
    default: {
      const _nunca: never = situacaoAssinatura;
      void _nunca;
      return false;
    }
  }
}
