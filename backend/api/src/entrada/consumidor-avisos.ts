import * as Sentry from '@sentry/cloudflare';
import { mensagemAviso, type MensagemAviso, type TipoMensagemAviso } from '@pelada/contrato/fila-avisos';
import { enviarRanking } from '../aplicacao/notificacoes/enviar-ranking.ts';
import type { ConexaoPg } from '../infraestrutura/db/cliente.ts';
import type { Db } from '../infraestrutura/db/repositorios/tipos.ts';
import { transacaoCurta } from '../infraestrutura/db/transacao-curta.ts';
import type { Env } from './ambiente.ts';

/**
 * Consumidor da fila `avisos` (notificacoes T17; NOT-22, NOT-33; AD-098, AD-108), ligado ao `queue` do `worker.ts`.
 * Roda numa invocação própria do Worker, fora de qualquer resposta HTTP: uma falha aqui nunca mexe na partida nem no
 * evento já gravado (NOT-22).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - mensagem válida e caso de uso que conclui: `ack`;
 * - caso de uso que pede nova tentativa (ex.: e-mail com a cota acabada, T24): `retry({ delaySeconds })`;
 * - caso de uso que lança (banco fora, queda no meio do lote): `retry()` sem atraso, para a fila entregar de novo
 *   (até `max_retries` 2, `wrangler.jsonc`); o envio do ranking retoma sem reenviar as aceitas pelo `desde` (NOT-69).
 *   O erro vai ao Sentry só com um motivo fixo;
 * - mensagem inválida (fora do contrato): descartada com `ack`, porque entregar de novo não a conserta, e o Sentry recebe
 *   só o motivo, nunca o corpo (NOT-33);
 * - tipo sem caso de uso ligado (antes da T24): descartado com `ack` e reportado do mesmo jeito.
 *
 * O banco é aberto sem conta e sem slug (`app.conta_id` e `app.slug_publico` vazios): as funções do envio recusam
 * qualquer outro contexto (AD-101). Cada `banco(fn)` é uma transação curta própria, confirmada quando `fn` termina; o
 * caso de uso grava o resultado de um lote antes do próximo, e uma invocação que cai não perde o que já foi aceito.
 */

/** O que o projeto usa de uma mensagem da Cloudflare Queues. */
export interface MensagemDaFila {
  readonly body: unknown;
  ack(): void;
  retry(opcoes?: { delaySeconds?: number }): void;
}

/** O que o projeto usa de um lote da Cloudflare Queues (`max_batch_size` 1, mas o laço vale para qualquer tamanho). */
export interface LoteDaFila {
  readonly messages: readonly MensagemDaFila[];
}

export type Desfecho = { acao: 'concluir' } | { acao: 'repetir'; aposSegundos?: number };

/** Transação curta sem conta e sem slug. */
export type AbrirBanco = <T>(fn: (db: Db) => Promise<T>) => Promise<T>;

export interface ContextoConsumidor {
  env: Env;
  banco: AbrirBanco;
}

export type CasoDeUso<M extends MensagemAviso = MensagemAviso> = (
  mensagem: M,
  contexto: ContextoConsumidor,
) => Promise<Desfecho>;

export type CasosDeUso = { [K in TipoMensagemAviso]?: CasoDeUso<Extract<MensagemAviso, { tipo: K }>> };

/** Os casos de uso ligados: o ranking (T18); a cobrança entra na T24 e na T25. */
export const CASOS_PADRAO: CasosDeUso = { ranking: enviarRanking };

export type MotivoFila = 'mensagem_invalida' | 'sem_caso_de_uso' | 'caso_de_uso_falhou';

const reportarPadrao = (motivo: MotivoFila): void => {
  Sentry.captureMessage('fila_avisos', { level: 'warning', tags: { motivo } });
};

export interface OpcoesConsumidor {
  casos?: CasosDeUso;
  /** Só para os testes: troca a fábrica de conexões (ex.: para rodar como `pelada_app`). */
  fabrica?: (connectionString: string) => ConexaoPg;
  /** Só para os testes: troca o relato ao Sentry. */
  reportar?: (motivo: MotivoFila) => void;
}

export function bancoSemContexto(env: Env, fabrica?: (connectionString: string) => ConexaoPg): AbrirBanco {
  return (fn) => transacaoCurta(env.HYPERDRIVE.connectionString, fn, { conta: null, ...(fabrica ? { fabrica } : {}) });
}

function relatar(reportar: (motivo: MotivoFila) => void, motivo: MotivoFila): void {
  try {
    reportar(motivo);
  } catch {
    // o relato não pode derrubar o consumidor
  }
}

async function consumirUma(mensagem: MensagemDaFila, contexto: ContextoConsumidor, opcoes: OpcoesConsumidor) {
  const reportar = opcoes.reportar ?? reportarPadrao;
  const lida = mensagemAviso.safeParse(mensagem.body);
  if (!lida.success) {
    // Nem o corpo nem o erro do zod (que repete os valores) vão ao relato.
    relatar(reportar, 'mensagem_invalida');
    mensagem.ack();
    return;
  }
  const casos = opcoes.casos ?? CASOS_PADRAO;
  const caso = casos[lida.data.tipo] as CasoDeUso | undefined;
  if (!caso) {
    relatar(reportar, 'sem_caso_de_uso');
    mensagem.ack();
    return;
  }
  let desfecho: Desfecho;
  try {
    desfecho = await caso(lida.data, contexto);
  } catch {
    relatar(reportar, 'caso_de_uso_falhou');
    mensagem.retry();
    return;
  }
  if (desfecho.acao === 'concluir') {
    mensagem.ack();
    return;
  }
  const atraso = desfecho.aposSegundos;
  if (atraso === undefined || atraso <= 0) mensagem.retry();
  else mensagem.retry({ delaySeconds: Math.ceil(atraso) });
}

/** O `queue` do Worker: uma mensagem por vez, cada uma com o seu desfecho. */
export async function consumirAvisos(lote: LoteDaFila, env: Env, opcoes: OpcoesConsumidor = {}): Promise<void> {
  const contexto: ContextoConsumidor = { env, banco: bancoSemContexto(env, opcoes.fabrica) };
  for (const mensagem of lote.messages) await consumirUma(mensagem, contexto, opcoes);
}
