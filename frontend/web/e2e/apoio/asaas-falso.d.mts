/** Tipos de `asaas-falso.mjs` (T30), para os testes em TypeScript. */

export interface AssinaturaFalsa {
  id: string;
  pagamento: string;
  customer: string;
  billingType: string;
  cycle: string;
  value: number;
  nextDueDate: string;
  description: string;
  externalReference: string;
  deleted: boolean;
}

export interface AsaasFalso {
  /** Base das rotas do Asaas (`…/v3`), o valor de `ASAAS_URL`. */
  url: string;
  base: string;
  porta: number;
  assinaturas: Map<string, AssinaturaFalsa>;
  clientes: Map<string, { id: string; name: string; email?: string; externalReference?: string }>;
  fechar(): Promise<void>;
}

export declare function iniciarAsaasFalso(opcoes?: {
  porta?: number;
  urlWebhook?: string;
  tokenWebhook?: string;
}): Promise<AsaasFalso>;
