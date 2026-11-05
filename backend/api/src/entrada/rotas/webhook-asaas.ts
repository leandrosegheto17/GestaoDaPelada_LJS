import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { asaasEventoCorpo, type AsaasEventoCorpo } from '@pelada/contrato';
import {
  mensagemCobranca,
  type MensagemCobranca,
  type TipoAvisoCobrancaFila,
} from '@pelada/contrato/fila-avisos';
import { ehDataValida, reaisParaCentavos } from '@pelada/dominio';
import type { Ambiente } from '../ambiente.ts';
import { comBanco, SEM_CONTEXTO } from '../middlewares/com-banco.ts';
import { limiteTaxa } from '../middlewares/limite-taxa.ts';
import { MENSAGEM_CORPO_GRANDE } from './publico.ts';
import {
  aplicarEventoAsaas,
  type ReportarWebhook,
  type ResultadoWebhook,
} from '../../aplicacao/plano/webhook.ts';
import { agendarAviso } from '../../infraestrutura/fila/avisos.ts';
import type { RegistroAsaas } from '../../infraestrutura/asaas/cliente.ts';
import { tokenDoWebhookConfere } from '../../infraestrutura/asaas/token-webhook.ts';
import type { OpcoesCliente } from '../../infraestrutura/db/cliente.ts';
import type { Db } from '../../infraestrutura/db/repositorios/tipos.ts';

/**
 * `POST /api/webhooks/asaas` (planos-e-cobranca T35; PLA-39, PLA-40, PLA-50; AD-093). Sem sessão e fora do
 * `exigirCabecalhoPelada` (a exceção mora lá). Na ordem, antes de abrir o banco:
 * 1. `LIMITE_WEBHOOK` com chave fixa (o Asaas sai de vários IPs; o limite é do webhook inteiro): 429 (PLA-40);
 * 2. `asaas-access-token` contra `ASAAS_WEBHOOK_TOKEN`, em tempo constante: 401 sem gravar e sem logar o valor
 *    (PLA-39); a chave da API no header também é recusada (são segredos diferentes);
 * 3. corpo acima de 64 KiB: 413, antes de ler o JSON (PLA-40);
 * 4. JSON inválido ou sem `id`/`event`: 400; campo novo segue (contrato tolerante, PLA-50);
 * 5. transação sem conta e sem slug (a `asaas_evento_registrar` recusa outro contexto) e `processar` (registrar e
 *    aplicar, T36); 200 depois de gravar (PLA-41). Erro no processamento: 500 pelo `onError` e `ROLLBACK`, e o Asaas
 *    reenvia.
 */

/**
 * Gatilho dos avisos de cobrança (notificacoes T22; NOT-38, NOT-39, NOT-47; AD-105; S-03, S-04). Depois de o
 * `aplicarEventoAsaas` (T36) gravar, a rota registra no `aposCommit` uma mensagem `cobranca` (T16) para o consumidor
 * (T24, T25). Mapa (S-04): `PAYMENT_CREATED` → `cobranca_gerada`; `PAYMENT_CONFIRMED` ou `PAYMENT_RECEIVED` →
 * `pagamento_confirmado`; `PAYMENT_OVERDUE` → `pagamento_atrasado`. Em qualquer plano (NOT-47): não há conferência de
 * plano aqui. A mensagem não leva dado pessoal (`.strict()` do contrato, NOT-38): só ids, tipo, valor e vencimento.
 *
 * Casos limite e estados (Domínio: sim), listados antes do código:
 * - evento repetido (PLA-42, `resultado: 'repetido'`): nada; a primeira entrega já enfileirou (NOT-39);
 * - assinatura desconhecida (PLA-49): nada, a cobrança não é do Pro de um grupo daqui;
 * - evento fora de ordem (PLA-48, `nenhum('fora_de_ordem')`, o "obsoleto" da S-03): nada; inclui o `PAYMENT_CREATED`
 *   que chega depois do pagamento da mesma cobrança;
 * - tipo fora do mapa (`PAYMENT_REFUNDED`, `SUBSCRIPTION_DELETED`, `PAYMENT_DELETED`…): nada;
 * - `PAYMENT_RECEIVED` depois de `PAYMENT_CONFIRMED` da mesma cobrança: os dois são eventos novos e os dois enfileiram
 *   `pagamento_confirmado` com o mesmo `idExterno`; o "uma vez" é a chave (cobrança, tipo) do `aviso_cobranca_registrar`
 *   no consumidor (AD-105, T11, T24), que descarta a segunda;
 * - `PAYMENT_CREATED` sai `nenhum('nao_tratado')` no efeito, mas avisa (é o evento da cobrança gerada);
 * - grupo Free, cancelado ou inadimplente: avisa (NOT-47);
 * - valor `9.9` e `9.90` (o mesmo número em JSON): 990 centavos pelo `reaisParaCentavos`;
 * - sem `payment.id`, com valor que não vira centavos inteiros (fração de centavo, negativo, texto) ou com
 *   `payment.dueDate` fora de `AAAA-MM-DD`: a mensagem não cabe no contrato, então nada (o e-mail exige valor e
 *   vencimento, NOT-40);
 * - `processar` trocado nos testes devolvendo outra coisa: nada.
 *
 * [LACUNA] Pagamento confirmado com valor divergente (`nenhum('valor_divergente')`, PLA-51) ou de assinatura já
 * cancelada (`nenhum('assinatura_cancelada')`): a spec não diz se a criadora é avisada. Interpretação conservadora:
 * não avisa "pagamento confirmado" de pagamento que não deu o Pro (evita dizer que o plano foi pago quando não foi). O
 * /executar confirma com o usuário.
 */
const AVISO_DO_EVENTO: Readonly<Record<string, TipoAvisoCobrancaFila>> = {
  PAYMENT_CREATED: 'cobranca_gerada',
  PAYMENT_CONFIRMED: 'pagamento_confirmado',
  PAYMENT_RECEIVED: 'pagamento_confirmado',
  PAYMENT_OVERDUE: 'pagamento_atrasado',
};

const MOTIVOS_SEM_AVISO: ReadonlySet<string> = new Set([
  'fora_de_ordem',
  'valor_divergente',
  'assinatura_cancelada',
]);

function ehResultadoComGrupo(
  resultado: unknown,
): resultado is Extract<ResultadoWebhook, { grupoId: string }> {
  if (typeof resultado !== 'object' || resultado === null) return false;
  const r = resultado as { resultado?: unknown; grupoId?: unknown; efeito?: unknown };
  return (
    (r.resultado === 'aplicado' || r.resultado === 'sem_efeito') &&
    typeof r.grupoId === 'string' &&
    typeof r.efeito === 'object' &&
    r.efeito !== null
  );
}

function centavosDoValor(valor: unknown): number | null {
  if (typeof valor !== 'number') return null;
  try {
    return reaisParaCentavos(valor);
  } catch {
    return null;
  }
}

/** A mensagem `cobranca` do evento já processado, ou `null` quando não há aviso. */
export function avisoDoWebhook(
  corpo: AsaasEventoCorpo,
  resultado: unknown,
): MensagemCobranca | null {
  const aviso = AVISO_DO_EVENTO[corpo.event];
  if (aviso === undefined) return null;
  if (!ehResultadoComGrupo(resultado)) return null;
  const efeito = resultado.efeito;
  if (efeito.tipo === 'nenhum' && MOTIVOS_SEM_AVISO.has(efeito.motivo)) return null;

  const p = corpo.payment ?? null;
  if (p === null) return null;
  const valorCentavos = centavosDoValor(p.value);
  if (valorCentavos === null || !ehDataValida(p.dueDate)) return null;

  const mensagem = mensagemCobranca.safeParse({
    tipo: 'cobranca',
    idExterno: p.id,
    aviso,
    grupoId: resultado.grupoId,
    valorCentavos,
    vencimento: p.dueDate,
    tentativa: 1,
  });
  return mensagem.success ? mensagem.data : null;
}

export const LIMITE_CORPO_WEBHOOK_BYTES = 64 * 1024;
/** Chave fixa do `LIMITE_WEBHOOK`. */
export const CHAVE_LIMITE_WEBHOOK = 'webhook:asaas';
export const HEADER_TOKEN_ASAAS = 'asaas-access-token';

/** O que a rota faz com o evento já validado, dentro da transação. */
export type ProcessarEvento = (db: Db, corpo: AsaasEventoCorpo) => Promise<unknown>;

const registroPadrao: RegistroAsaas = (linha) => console.error(JSON.stringify(linha));

export interface OpcoesWebhookAsaas {
  fabrica?: NonNullable<OpcoesCliente['fabrica']>;
  /** Padrão: registrar e aplicar o efeito (`aplicarEventoAsaas`, T36). */
  processar?: ProcessarEvento;
  /** Só para os testes: o relato ao Sentry do valor divergente (PLA-51). */
  reportar?: ReportarWebhook;
  /** Só para os testes: o log do 401 (nunca com o valor recebido). */
  registrar?: RegistroAsaas;
}

export function rotasWebhookAsaas(opcoes: OpcoesWebhookAsaas = {}): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();
  const processar: ProcessarEvento =
    opcoes.processar ??
    ((db, corpo) =>
      aplicarEventoAsaas(db, corpo, opcoes.reportar ? { reportar: opcoes.reportar } : {}));
  const registrar = opcoes.registrar ?? registroPadrao;

  rotas.post(
    '/webhooks/asaas',
    limiteTaxa('LIMITE_WEBHOOK', () => CHAVE_LIMITE_WEBHOOK),
    async (c, next) => {
      const recebido = c.req.header(HEADER_TOKEN_ASAAS);
      if (!(await tokenDoWebhookConfere(recebido, c.env.ASAAS_WEBHOOK_TOKEN))) {
        registrar({
          evento: 'webhook_asaas_recusado',
          comHeader: recebido !== undefined ? 'sim' : 'nao',
        });
        return c.json({ erro: 'nao_autorizado' }, 401);
      }
      await next();
    },
    bodyLimit({
      maxSize: LIMITE_CORPO_WEBHOOK_BYTES,
      onError: (c) => c.json({ erro: MENSAGEM_CORPO_GRANDE }, 413),
    }),
    comBanco(() => SEM_CONTEXTO, opcoes.fabrica ? { fabrica: opcoes.fabrica } : {}),
    async (c) => {
      let json: unknown;
      try {
        json = await c.req.json();
      } catch {
        return c.json({ erro: 'corpo_invalido' }, 400);
      }
      const corpo = asaasEventoCorpo.safeParse(json);
      if (!corpo.success) return c.json({ erro: 'corpo_invalido' }, 400);
      const resultado = await processar(c.var.db, corpo.data);
      const aviso = avisoDoWebhook(corpo.data, resultado);
      if (aviso !== null) {
        const env = c.env;
        // Só depois do `COMMIT` (T15): 500 ou `ROLLBACK` descartam a tarefa e o Asaas reenvia o evento (NOT-39).
        c.var.aposCommit(() => agendarAviso(env, aviso));
      }
      return c.json({ recebido: true }, 200);
    },
  );

  return rotas;
}
