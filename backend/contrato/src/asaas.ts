import { z } from 'zod';

/**
 * Corpo tolerante do webhook do Asaas (T7; PLA-41, PLA-50; AD-060, S:52). O Asaas acrescenta atributos sem aviso:
 * nada aqui é `.strict()`. Só `id` e `event` são exigidos (sem eles, 400); campo conhecido com tipo inesperado vira
 * `null` em vez de recusar o corpo, e campo desconhecido some do resultado. `customer` (e-mail, nome, CPF) nunca é lido,
 * para não chegar ao banco nem ao log (PLA-41).
 */

const texto = z.string().nullable().optional().catch(null);
const numero = z.number().nullable().optional().catch(null);

const pagamento = z
  .object({
    id: texto,
    subscription: texto,
    value: numero,
    dueDate: texto,
    status: texto,
    invoiceUrl: texto,
  })
  .nullable()
  .optional()
  .catch(null);

const assinatura = z.object({ id: texto }).nullable().optional().catch(null);

export const asaasEventoCorpo = z.object({
  id: z.string().min(1),
  event: z.string().min(1),
  dateCreated: texto,
  payment: pagamento,
  subscription: assinatura,
});
export type AsaasEventoCorpo = z.infer<typeof asaasEventoCorpo>;
