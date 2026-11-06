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
/**
 * `dateCreated` no único formato que o domínio e o banco comparam (`AAAA-MM-DD HH:MM:SS`, hora de São Paulo; A-12).
 * Aceita também a forma com `T` e frações de segundo (`2026-11-05T11:00:00.123`), sem fuso, e a devolve no formato do
 * Asaas. Qualquer outra coisa (com fuso, só a data, texto livre) vira `null`: o domínio trata como sem data, e a
 * ordem dos eventos nunca depende de uma comparação de textos de formatos diferentes.
 */
export function dataCriacaoNormalizada(texto: string | null | undefined): string | null {
  if (texto === null || texto === undefined) return null;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?$/.exec(texto.trim());
  return m === null ? null : `${m[1]} ${m[2]}`;
}

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
    dataCriacao: dataCriacaoNormalizada(corpo.dateCreated),
    cobrancaId: pagamento?.id ?? null,
    assinaturaId: pagamento?.subscription ?? corpo.subscription?.id ?? null,
    status: pagamento?.status ?? null,
    valorCentavos,
  };
}
