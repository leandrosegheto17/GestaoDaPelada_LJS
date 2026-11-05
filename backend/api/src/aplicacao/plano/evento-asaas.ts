import type { AsaasEventoCorpo } from '@pelada/contrato';
import { reaisParaCentavos } from '@pelada/dominio';
import type { EventoParaRegistrar } from '../../infraestrutura/db/repositorios/eventos-asaas.ts';

/**
 * O corpo do webhook (já lido pelo contrato tolerante, T7) no formato que `eventos_asaas` guarda (planos-e-cobranca
 * T35; PLA-41, S-07). Só ids, tipo, data, status e valor: `customer` e qualquer dado de pessoa ficam de fora.
 * - a assinatura vem de `payment.subscription` (eventos de cobrança) ou de `subscription.id` (eventos de assinatura);
 * - o valor, em reais no Asaas, vira centavos na fronteira (PLA-06); valor que não converte (fração de centavo,
 *   negativo) vira nulo e o domínio o trata como divergente (PLA-51).
 */
export function eventoDoCorpo(corpo: AsaasEventoCorpo): EventoParaRegistrar {
  const pagamento = corpo.payment ?? null;
  let valorCentavos: number | null = null;
  if (typeof pagamento?.value === 'number') {
    try {
      valorCentavos = reaisParaCentavos(pagamento.value);
    } catch {
      valorCentavos = null;
    }
  }
  return {
    id: corpo.id,
    evento: corpo.event,
    dataCriacao: corpo.dateCreated ?? null,
    cobrancaId: pagamento?.id ?? null,
    assinaturaId: pagamento?.subscription ?? corpo.subscription?.id ?? null,
    status: pagamento?.status ?? null,
    valorCentavos,
  };
}
