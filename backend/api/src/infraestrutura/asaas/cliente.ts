/**
 * Cliente do Asaas (T29; PLA-06, PLA-29, PLA-34, PLA-35, PLA-36; S:48-53, AD-058, AD-089). Molde do `remetenteResend`
 * (`infraestrutura/email/resend.ts`): `fetch` direto, sem SDK, 10 s por chamada, log só com o status.
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - 200: o id (cliente, assinatura) ou a primeira cobrança com o `invoiceUrl`;
 * - 400 (dado recusado), 401 (chave errada), 429 (com `RateLimit-Reset`), 500: `'falhou'`, sem segunda chamada
 *   (PLA-36: nada de repetir sozinho; quem decide é a pessoa, de novo pela tela);
 * - rede caída (o `fetch` lança): `'falhou'`;
 * - sem resposta em 10 s: o pedido é abortado e vira `'falhou'`;
 * - 2xx sem o campo esperado (sem `id`, lista de cobranças vazia, cobrança sem `invoiceUrl`): `'falhou'`;
 * - sem `ASAAS_URL` ou sem `ASAAS_API_KEY`: `'falhou'`, sem chamar a rede.
 * O log leva só a operação, o status HTTP e o motivo; nunca o CPF, o nome, o e-mail, a chave nem o corpo do Asaas
 * (cuja `description` de erro pode repetir o dado enviado). Nenhum corpo enviado tem campo de cartão (PLA-34): a forma
 * de pagamento é escolhida na fatura (`billingType` `UNDEFINED`).
 */
import { centavosParaReais } from '@pelada/dominio';

/** Tempo máximo de espera por chamada ao Asaas (PLA-36). */
export const TEMPO_LIMITE_ASAAS_MS = 10_000;

/** Identificação do cliente HTTP; o Asaas exige `User-Agent` nas contas novas. */
export const USER_AGENT_ASAAS = 'gestao-da-pelada';

export type Falhou = 'falhou';

export interface NovoCliente {
  name: string;
  /** CPF só com dígitos; vai para o Asaas e não é guardado (PLA-35). */
  cpfCnpj: string;
  email: string;
  /** Id da conta (PLA-29). */
  externalReference: string;
}

export interface NovaAssinatura {
  customer: string;
  valorCentavos: number;
  /** `AAAA-MM-DD`, hoje em SP (PLA-29). */
  nextDueDate: string;
  description: string;
  /** Id do grupo (PLA-29). */
  externalReference: string;
}

export interface PrimeiraCobranca {
  id: string;
  invoiceUrl: string;
}

export interface Asaas {
  criarCliente(dados: NovoCliente): Promise<{ id: string } | Falhou>;
  criarAssinatura(dados: NovaAssinatura): Promise<{ id: string } | Falhou>;
  /** `GET /v3/subscriptions/{id}/payments`: a cobrança mais antiga, que a assinatura gerou na criação (AD-089). */
  primeiraCobranca(assinaturaId: string): Promise<PrimeiraCobranca | Falhou>;
  /** `DELETE /v3/subscriptions/{id}`: cancela e apaga as cobranças pendentes (S:45, AD-114). */
  removerAssinatura(assinaturaId: string): Promise<'removida' | Falhou>;
}

export interface ConfigAsaas {
  ASAAS_URL?: string;
  ASAAS_API_KEY?: string;
}

/** Linha de log estruturada; só campos sem dado pessoal. */
export type RegistroAsaas = (linha: Record<string, string | number>) => void;

const registroPadrao: RegistroAsaas = (linha) => console.error(JSON.stringify(linha));

export interface OpcoesAsaas {
  fetch?: typeof fetch;
  registrar?: RegistroAsaas;
  tempoLimiteMs?: number;
}

type Operacao = 'criar_cliente' | 'criar_assinatura' | 'primeira_cobranca' | 'remover_assinatura';

function textoNaoVazio(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.length > 0;
}

function campo(corpo: unknown, nome: string): unknown {
  return typeof corpo === 'object' && corpo !== null ? (corpo as Record<string, unknown>)[nome] : undefined;
}

export function asaasHttp(config: ConfigAsaas, opcoes: OpcoesAsaas = {}): Asaas {
  const buscar = opcoes.fetch ?? fetch;
  const registrar = opcoes.registrar ?? registroPadrao;
  const tempoLimite = opcoes.tempoLimiteMs ?? TEMPO_LIMITE_ASAAS_MS;
  const base = (config.ASAAS_URL ?? '').trim().replace(/\/+$/, '');

  const falha = (operacao: Operacao, status: number, motivo: string): Falhou => {
    registrar({ evento: 'asaas_falhou', operacao, status, motivo });
    return 'falhou';
  };

  /** Uma chamada só, sem repetição. Devolve o corpo JSON do 2xx (ou `null` sem corpo) ou `'falhou'`. */
  async function chamar(operacao: Operacao, metodo: string, caminho: string, corpo?: unknown): Promise<unknown> {
    if (!base || !config.ASAAS_API_KEY) return falha(operacao, 0, 'sem_configuracao');
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), tempoLimite);
    try {
      const resposta = await buscar(`${base}${caminho}`, {
        method: metodo,
        headers: {
          access_token: config.ASAAS_API_KEY,
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT_ASAAS,
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: controle.signal,
      });
      if (!resposta.ok) return falha(operacao, resposta.status, resposta.status === 429 ? 'limite' : 'status');
      const texto = await resposta.text();
      if (texto === '') return null;
      try {
        return JSON.parse(texto) as unknown;
      } catch {
        return falha(operacao, resposta.status, 'corpo_invalido');
      }
    } catch {
      return falha(operacao, 0, controle.signal.aborted ? 'tempo_esgotado' : 'rede');
    } finally {
      clearTimeout(relogio);
    }
  }

  return {
    async criarCliente(d) {
      const r = await chamar('criar_cliente', 'POST', '/customers', {
        name: d.name,
        cpfCnpj: d.cpfCnpj,
        email: d.email,
        externalReference: d.externalReference,
      });
      if (r === 'falhou') return r;
      const id = campo(r, 'id');
      return textoNaoVazio(id) ? { id } : falha('criar_cliente', 200, 'sem_id');
    },

    async criarAssinatura(d) {
      const r = await chamar('criar_assinatura', 'POST', '/subscriptions', {
        customer: d.customer,
        billingType: 'UNDEFINED',
        cycle: 'MONTHLY',
        value: centavosParaReais(d.valorCentavos),
        nextDueDate: d.nextDueDate,
        description: d.description,
        externalReference: d.externalReference,
      });
      if (r === 'falhou') return r;
      const id = campo(r, 'id');
      return textoNaoVazio(id) ? { id } : falha('criar_assinatura', 200, 'sem_id');
    },

    async primeiraCobranca(assinaturaId) {
      const r = await chamar('primeira_cobranca', 'GET', `/subscriptions/${encodeURIComponent(assinaturaId)}/payments`);
      if (r === 'falhou') return r;
      const lista = campo(r, 'data');
      if (!Array.isArray(lista) || lista.length === 0) return falha('primeira_cobranca', 200, 'sem_cobranca');
      // A lista vem da mais nova para a mais antiga; na criação há só uma. Vale a de menor vencimento.
      const ordenada = [...lista].sort((a, b) => String(campo(a, 'dueDate')).localeCompare(String(campo(b, 'dueDate'))));
      const primeira = ordenada[0];
      const id = campo(primeira, 'id');
      const invoiceUrl = campo(primeira, 'invoiceUrl');
      if (!textoNaoVazio(id) || !textoNaoVazio(invoiceUrl)) return falha('primeira_cobranca', 200, 'sem_fatura');
      return { id, invoiceUrl };
    },

    async removerAssinatura(assinaturaId) {
      const r = await chamar('remover_assinatura', 'DELETE', `/subscriptions/${encodeURIComponent(assinaturaId)}`);
      return r === 'falhou' ? r : 'removida';
    },
  };
}
