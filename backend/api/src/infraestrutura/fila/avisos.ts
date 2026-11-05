import { mensagemAviso, type MensagemAviso } from '@pelada/contrato/fila-avisos';

/**
 * Produtor da fila `avisos` (notificacoes T16; NOT-22, NOT-43; AD-098). A rota registra no `aposCommit` (T15) uma
 * chamada a `agendarAviso`, que só confere a mensagem e a põe na fila: nenhum envio de push nem de e-mail acontece aqui,
 * e a resposta HTTP não espera por eles. Quem envia é o consumidor (T17), noutra invocação do Worker.
 *
 * - Mensagem fora do contrato (inclusive com dado pessoal, NOT-43): lança antes de enfileirar; o `aposCommit` reporta
 *   a falha ao Sentry sem conteúdo e a resposta já enviada não muda.
 * - Sem o binding `FILA_AVISOS` (fila ainda não criada no `/preparar` Nível 2): lança `ErroFilaIndisponivel`, do mesmo
 *   jeito; a partida ou o evento gravado fica de pé.
 */

/** O que o projeto usa do binding de produtor da Cloudflare Queues. */
export interface FilaAvisos {
  send(corpo: MensagemAviso, opcoes?: { contentType?: 'json'; delaySeconds?: number }): Promise<void>;
}

export class ErroFilaIndisponivel extends Error {
  override name = 'ErroFilaIndisponivel';
  constructor() {
    super('Fila de avisos indisponível.');
  }
}

/** Atraso máximo de uma mensagem na Cloudflare Queues (12 h); o de push nunca passa de 1 h (T19). */
export const ATRASO_MAXIMO_S = 43_200;

export interface OpcoesAgendar {
  /** Atraso antes da entrega, em segundos (nova tentativa, T19 e T24). */
  aposSegundos?: number;
}

export async function agendarAviso(
  env: { FILA_AVISOS?: FilaAvisos },
  mensagem: MensagemAviso,
  opcoes: OpcoesAgendar = {},
): Promise<void> {
  // O `parse` devolve uma cópia só com os campos do contrato; `.strict()` recusa os demais.
  const corpo = mensagemAviso.parse(mensagem);
  const fila = env.FILA_AVISOS;
  if (!fila) throw new ErroFilaIndisponivel();
  const atraso = opcoes.aposSegundos === undefined ? undefined : Math.min(Math.max(0, Math.ceil(opcoes.aposSegundos)), ATRASO_MAXIMO_S);
  await fila.send(corpo, atraso === undefined || atraso === 0 ? { contentType: 'json' } : { contentType: 'json', delaySeconds: atraso });
}

/** Fila em memória dos testes: guarda cada mensagem e o atraso pedido. */
export interface FilaMemoria extends FilaAvisos {
  readonly enviadas: Array<{ corpo: MensagemAviso; delaySeconds?: number }>;
}

export function filaMemoria(): FilaMemoria {
  const enviadas: Array<{ corpo: MensagemAviso; delaySeconds?: number }> = [];
  return {
    enviadas,
    async send(corpo, opcoes) {
      enviadas.push(opcoes?.delaySeconds === undefined ? { corpo } : { corpo, delaySeconds: opcoes.delaySeconds });
    },
  };
}
