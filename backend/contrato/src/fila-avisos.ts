import { z } from 'zod';
import { ehDataDoCalendario } from './elenco.ts';

/**
 * Mensagens da fila `avisos` (notificacoes T16; NOT-22, NOT-43; AD-098). A rota grava e, depois do `COMMIT`, só
 * enfileira uma destas; o consumidor (T17) valida de novo antes de despachar. Nenhuma leva dado pessoal: nem e-mail,
 * nem nome, nem endpoint ou chave de push (quem envia lê tudo isso do banco, na hora do envio).
 *
 * - `ranking`: o grupo e a data da partida lançada ou editada; `criadoEm` é o instante do aviso, usado como `desde` do
 *   lote (NOT-69: uma assinatura com envio aceito depois dele não recebe de novo); `aposId` é o último id já percorrido
 *   (continuação do lote, T19) e `ids`, as assinaturas pendentes de uma nova tentativa (429 ou 5xx, T19).
 * - `cobranca`: o id externo da cobrança do Asaas, o tipo do aviso, o grupo, o valor em centavos inteiros e o
 *   vencimento (NOT-38, NOT-40, AD-105); `pushIds`, só na nova tentativa do push de cobrança (429 ou 5xx, T25): o
 *   e-mail já saiu e só essas assinaturas da criadora recebem o push de novo.
 * - `tentativa`: 1 no primeiro envio; até 2 novas tentativas (NOT-31, NOT-42), então de 1 a 3.
 *
 * Campo a mais em qualquer uma (inclusive `email`, `nome`, `endpoint`) é recusado: `.strict()` (NOT-43).
 */

export const TIPOS_AVISO_COBRANCA = [
  'cobranca_gerada',
  'pagamento_confirmado',
  'pagamento_atrasado',
] as const;
export type TipoAvisoCobrancaFila = (typeof TIPOS_AVISO_COBRANCA)[number];

/** Até 2 novas tentativas depois da primeira (NOT-31, NOT-42). */
export const TENTATIVA_MAXIMA = 3;

/** Assinaturas por invocação do consumidor (NOT-34). */
export const LOTE_MAXIMO = 40;

/** Id de assinatura (`bigint` do banco) em texto, sem perder precisão. */
const idAssinatura = z.string().regex(/^[1-9]\d{0,18}$/);

/** `aposId`: 0 (início) ou um id de assinatura. */
const aposId = z.string().regex(/^(0|[1-9]\d{0,18})$/);

const dataDoCalendario = z.string().refine(ehDataDoCalendario);

const tentativa = z.number().int().min(1).max(TENTATIVA_MAXIMA);

export const mensagemRanking = z
  .object({
    tipo: z.literal('ranking'),
    grupoId: z.uuid(),
    dataPartida: dataDoCalendario,
    criadoEm: z.iso.datetime(),
    aposId,
    ids: z.array(idAssinatura).min(1).max(LOTE_MAXIMO).optional(),
    tentativa,
  })
  .strict();
export type MensagemRanking = z.infer<typeof mensagemRanking>;

export const mensagemCobranca = z
  .object({
    tipo: z.literal('cobranca'),
    /** `payment.id` do Asaas (ex.: `pay_080225913252`). */
    idExterno: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
    aviso: z.enum(TIPOS_AVISO_COBRANCA),
    grupoId: z.uuid(),
    valorCentavos: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    vencimento: dataDoCalendario,
    pushIds: z.array(idAssinatura).min(1).max(LOTE_MAXIMO).optional(),
    tentativa,
  })
  .strict();
export type MensagemCobranca = z.infer<typeof mensagemCobranca>;

export const mensagemAviso = z.discriminatedUnion('tipo', [mensagemRanking, mensagemCobranca]);
export type MensagemAviso = z.infer<typeof mensagemAviso>;
export type TipoMensagemAviso = MensagemAviso['tipo'];
