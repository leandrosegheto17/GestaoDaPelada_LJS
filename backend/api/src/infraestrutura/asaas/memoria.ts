/**
 * Asaas em memória (T30; PLA-36, PLA-53), para os testes de aplicação e de rota: nada sai para a rede. Molde do
 * `remetenteMemoria` (`infraestrutura/email/resend.ts`). As falhas são programáveis por chamada (`falharNa`), para provar
 * o 502 sem gravar (PLA-36) e a compensação quando a leitura da fatura falha com a assinatura já criada (AD-114).
 */
import type { Asaas, Falhou, NovaAssinatura, NovoCliente, PrimeiraCobranca } from './cliente.ts';

export type OperacaoAsaas =
  'criarCliente' | 'criarAssinatura' | 'primeiraCobranca' | 'removerAssinatura';

export interface ChamadaAsaas {
  operacao: OperacaoAsaas;
  dados: NovoCliente | NovaAssinatura | string;
}

export interface AssinaturaFalsa extends NovaAssinatura {
  id: string;
  removida: boolean;
  cobranca: PrimeiraCobranca;
}

export interface AsaasMemoria extends Asaas {
  /** Todas as chamadas, da mais antiga à mais nova, inclusive as que falharam. */
  readonly chamadas: ChamadaAsaas[];
  readonly clientes: Map<string, NovoCliente>;
  readonly assinaturas: Map<string, AssinaturaFalsa>;
  /** A `n`-ésima chamada (contando de 1, todas as operações) devolve `'falhou'`. */
  falharNa(n: number): void;
  /** Toda chamada desta operação devolve `'falhou'` até `limpar`. */
  falharSempre(operacao: OperacaoAsaas): void;
  limpar(): void;
}

export const URL_FATURA_FALSA = 'https://sandbox.asaas.com/i/';

export function asaasMemoria(): AsaasMemoria {
  const chamadas: ChamadaAsaas[] = [];
  const clientes = new Map<string, NovoCliente>();
  const assinaturas = new Map<string, AssinaturaFalsa>();
  const falharEm = new Set<number>();
  const sempre = new Set<OperacaoAsaas>();
  let sequencia = 0;

  /** Registra a chamada e diz se ela deve falhar. */
  function registrar(operacao: OperacaoAsaas, dados: ChamadaAsaas['dados']): boolean {
    chamadas.push({ operacao, dados });
    return falharEm.has(chamadas.length) || sempre.has(operacao);
  }

  const proximoId = (prefixo: string): string => {
    sequencia += 1;
    return `${prefixo}_${String(sequencia).padStart(6, '0')}`;
  };

  return {
    chamadas,
    clientes,
    assinaturas,
    falharNa(n) {
      falharEm.add(n);
    },
    falharSempre(operacao) {
      sempre.add(operacao);
    },
    limpar() {
      chamadas.length = 0;
      clientes.clear();
      assinaturas.clear();
      falharEm.clear();
      sempre.clear();
      sequencia = 0;
    },

    async criarCliente(dados): Promise<{ id: string } | Falhou> {
      if (registrar('criarCliente', dados)) return 'falhou';
      const id = proximoId('cus');
      clientes.set(id, dados);
      return { id };
    },

    async criarAssinatura(dados): Promise<{ id: string } | Falhou> {
      if (registrar('criarAssinatura', dados)) return 'falhou';
      const id = proximoId('sub');
      const pagamento = proximoId('pay');
      assinaturas.set(id, {
        ...dados,
        id,
        removida: false,
        cobranca: { id: pagamento, invoiceUrl: `${URL_FATURA_FALSA}${pagamento}` },
      });
      return { id };
    },

    async primeiraCobranca(assinaturaId): Promise<PrimeiraCobranca | Falhou> {
      if (registrar('primeiraCobranca', assinaturaId)) return 'falhou';
      const a = assinaturas.get(assinaturaId);
      return a && !a.removida ? a.cobranca : 'falhou';
    },

    async removerAssinatura(assinaturaId): Promise<'removida' | Falhou> {
      if (registrar('removerAssinatura', assinaturaId)) return 'falhou';
      const a = assinaturas.get(assinaturaId);
      if (!a) return 'falhou';
      a.removida = true;
      return 'removida';
    },
  };
}
