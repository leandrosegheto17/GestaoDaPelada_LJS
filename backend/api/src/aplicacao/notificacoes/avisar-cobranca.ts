import * as Sentry from '@sentry/cloudflare';
import { TENTATIVA_MAXIMA, type MensagemCobranca, type TipoAvisoCobrancaFila } from '@pelada/contrato/fila-avisos';
import { payloadCobranca, serializarPayload } from '@pelada/dominio';
import { enviarEmailDeConta, limiteEmailsDia } from '../acesso/enviar-email.ts';
import { atrasoDaNovaTentativa } from './enviar-ranking.ts';
import type { CasoDeUso, ContextoConsumidor, Desfecho } from '../../entrada/consumidor-avisos.ts';
import { push, type AssinaturaDoLote, type DestinoCobranca } from '../../infraestrutura/db/repositorios/push.ts';
import { remetenteDoAmbiente } from '../../infraestrutura/email/caixa-dev.ts';
import { emailCobranca } from '../../infraestrutura/email/modelo-cobranca.ts';
import type { Remetente } from '../../infraestrutura/email/resend.ts';
import { agendarAviso } from '../../infraestrutura/fila/avisos.ts';
import { enviarPush, TTL_COBRANCA, type Reportar } from '../../infraestrutura/push/enviar.ts';
import { topicoDoGrupo } from '../../infraestrutura/push/topico.ts';
import { chavesVapidDoAmbiente, novoCacheVapid } from '../../infraestrutura/push/vapid.ts';

/**
 * Aviso de cobrança à criadora do grupo, uma vez por evento (notificacoes T24 e T25; NOT-38, NOT-39, NOT-41, NOT-42,
 * NOT-43, NOT-46, NOT-47, NOT-48; AD-105, AD-108), o caso de uso `cobranca` do consumidor da fila (T17).
 *
 * E-mail (T24), numa transação curta (sem conta nem slug), na ordem:
 * 1. `push.registrarAviso` com a chave (id da cobrança, tipo): já registrada, encerra sem enviar nada (NOT-39). Duas
 *    entregas em paralelo: a segunda espera a primeira na chave única e recebe "já registrada" se ela confirmou;
 * 2. `push.destinoCobranca`: só a criadora (`grupos.criado_por`) não excluída; sem destino, encerra (NOT-38);
 * 3. reserva a cota do dia com 100% de `LIMITE_EMAILS_DIA` e envia pelo remetente da conta-e-acesso, com
 *    `Idempotency-Key` = id e tipo (NOT-41); o fluxo é o do `enviarEmailDeConta` (savepoint da cota), na categoria
 *    `recuperacao`, que é a de 100%.
 *
 * Push (T25), depois do `COMMIT` do e-mail aceito e fora da transação: a cada assinatura de `push_conta` da criadora,
 * com o título do tipo e o nome do grupo e o caminho de Meu plano (`payloadCobranca`, sem valor, e-mail nem nome,
 * NOT-43), o tópico do grupo e o TTL de 48 h; resultado como no ranking (NOT-48): 201 grava `ultimo_envio_em`, 404 e
 * 410 apagam, 429 e 5xx voltam à fila numa mensagem com só os `pushIds` (o e-mail não sai de novo), 400, 403 e 413
 * mantêm. Sem assinatura ou sem VAPID: só o e-mail (NOT-46, NOT-61).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - a mesma mensagem duas vezes, em série ou em paralelo: um e-mail e um push por aparelho (NOT-39);
 * - o Resend falha (ou a cota está cheia, ou a trava da cota passou de 2 s): `ROLLBACK` da transação inteira (o
 *   registro do aviso e a reserva da cota somem), nenhum push, e a mensagem volta à fila com `tentativa` + 1 e 8 h de
 *   atraso; a 1.ª, a 2.ª e a 3.ª tentativa cabem em 24 h (0 h, 8 h, 16 h); falhou a 3.ª, desiste e o Sentry recebe
 *   só "desistência" e o tipo, sem e-mail, nome, valor nem conteúdo (NOT-42);
 * - criadora excluída ou grupo que não existe mais: encerra sem e-mail nem push;
 * - grupo Free: envia do mesmo jeito; o aviso de cobrança vale em qualquer plano (NOT-47);
 * - push que pede nova tentativa: a mensagem de push conta as suas tentativas a partir de 1 (a 1.ª foi esta), até 3;
 *   assinatura de `pushIds` que sumiu (revogada ou apagada) é ignorada;
 * - outro erro (banco fora) antes do `COMMIT`: sobe, e o consumidor faz `retry()`; nada foi confirmado. Depois do
 *   `COMMIT`, um erro no push também sobe, e a nova entrega encontra o aviso registrado e encerra (o push daquele
 *   aparelho se perde, o e-mail já saiu).
 */

/** Atraso da nova tentativa de um aviso de cobrança pendente (NOT-42). */
export const ATRASO_AVISO_COBRANCA_S = 8 * 60 * 60;

export interface RelatoDesistencia {
  motivo: 'desistencia';
  tipo: TipoAvisoCobrancaFila;
}

const reportarPadrao = (relato: RelatoDesistencia): void => {
  Sentry.captureMessage('aviso_cobranca_desistencia', {
    level: 'warning',
    tags: { motivo: relato.motivo, tipo: relato.tipo },
  });
};

export interface OpcoesAvisarCobranca {
  /** Só para os testes: o remetente em memória (NOT-63). Padrão: o da conta-e-acesso (`remetenteDoAmbiente`). */
  remetente?: Remetente;
  /** Só para os testes: troca o relato ao Sentry da desistência. */
  reportar?: (relato: RelatoDesistencia) => void;
  /** Só para os testes: o serviço de push falso (NOT-63). */
  fetch?: typeof fetch;
  /** Só para os testes: troca o relato ao Sentry do cliente de push. */
  reportarPush?: Reportar;
}

/** O envio não saiu (remetente, cota): desfaz a transação inteira e o aviso fica pendente. */
class AvisoPendente extends Error {
  override name = 'AvisoPendente';
}

const CONCLUIR: Desfecho = { acao: 'concluir' };

/** Chave de idempotência do Resend: a mesma cobrança e o mesmo tipo nunca dão dois e-mails. */
export function idempotenciaDoAviso(mensagem: Pick<MensagemCobranca, 'idExterno' | 'aviso'>): string {
  return `aviso-cobranca:${mensagem.idExterno}:${mensagem.aviso}`;
}

/** O push de cobrança às assinaturas dadas; grava o resultado e enfileira a nova tentativa, se couber. */
async function enviarPushDeCobranca(
  mensagem: MensagemCobranca,
  destino: DestinoCobranca,
  assinaturas: readonly AssinaturaDoLote[],
  { env, banco }: ContextoConsumidor,
  opcoes: OpcoesAvisarCobranca,
): Promise<void> {
  const vapid = chavesVapidDoAmbiente(env);
  if (vapid === null || assinaturas.length === 0) return;

  const payload = serializarPayload(
    payloadCobranca({ tipo: mensagem.aviso, nomeGrupo: destino.grupoNome, grupoId: mensagem.grupoId }),
  );
  const topico = await topicoDoGrupo(mensagem.grupoId);
  const cache = novoCacheVapid();
  const aceitos: string[] = [];
  const revogados: string[] = [];
  const deNovo: string[] = [];
  const atrasos: Array<number | undefined> = [];

  try {
    for (const assinatura of assinaturas) {
      const resultado = await enviarPush(assinatura, payload, {
        vapid,
        topico,
        ttl: TTL_COBRANCA,
        cache,
        ...(opcoes.fetch ? { fetch: opcoes.fetch } : {}),
        ...(opcoes.reportarPush ? { reportar: opcoes.reportarPush } : {}),
      });
      if (resultado.classe === 'aceito') aceitos.push(assinatura.id);
      else if (resultado.classe === 'revogada') revogados.push(assinatura.id);
      else if (resultado.classe === 'tentarDeNovo') {
        deNovo.push(assinatura.id);
        atrasos.push(resultado.aposSegundos);
      }
    }
  } finally {
    if (aceitos.length > 0 || revogados.length > 0) {
      await banco((db) => push.resultadoConta(db, destino.contaId, aceitos, revogados));
    }
  }

  const tentativaDoPush = mensagem.pushIds === undefined ? 1 : mensagem.tentativa;
  if (deNovo.length > 0 && tentativaDoPush < TENTATIVA_MAXIMA) {
    await agendarAviso(
      env,
      { ...mensagem, pushIds: deNovo, tentativa: tentativaDoPush + 1 },
      { aposSegundos: atrasoDaNovaTentativa(atrasos) },
    );
  }
}

export function criarAvisarCobranca(opcoes: OpcoesAvisarCobranca = {}): CasoDeUso<MensagemCobranca> {
  return async (mensagem, contexto) => {
    const { env, banco } = contexto;

    // Nova tentativa só do push (T25): o e-mail já saiu; só as assinaturas pendentes que ainda existem.
    if (mensagem.pushIds !== undefined) {
      const pendentes = new Set(mensagem.pushIds);
      const destino = await banco((db) => push.destinoCobranca(db, mensagem.grupoId));
      if (destino === null) return CONCLUIR;
      const alvo = destino.assinaturas.filter((a) => pendentes.has(a.id));
      await enviarPushDeCobranca(mensagem, destino, alvo, contexto, opcoes);
      return CONCLUIR;
    }

    const remetente = opcoes.remetente ?? remetenteDoAmbiente(env);
    const reportar = opcoes.reportar ?? reportarPadrao;
    const limite = limiteEmailsDia(env.LIMITE_EMAILS_DIA);

    let enviadoPara: DestinoCobranca | null;
    try {
      enviadoPara = await banco(async (db) => {
        const primeira = await push.registrarAviso(db, mensagem.idExterno, mensagem.aviso, mensagem.grupoId);
        if (!primeira) return null;
        const destino = await push.destinoCobranca(db, mensagem.grupoId);
        if (destino === null) return null;

        const conteudo = emailCobranca({
          urlPublica: env.URL_PUBLICA,
          tipo: mensagem.aviso,
          grupoId: mensagem.grupoId,
          grupoNome: destino.grupoNome,
          valorCentavos: mensagem.valorCentavos,
          vencimento: mensagem.vencimento,
        });
        const envio = await enviarEmailDeConta(db, remetente, {
          enviar: true,
          // `recuperacao` é a categoria de 100% de LIMITE_EMAILS_DIA (NOT-41, ACE-72).
          categoria: 'recuperacao',
          limiteDia: limite,
          mensagem: { tipo: 'aviso_cobranca', para: destino.email, ...conteudo, idempotencia: idempotenciaDoAviso(mensagem) },
        });
        if (envio !== 'enviado') throw new AvisoPendente();
        return destino;
      });
    } catch (erro) {
      if (!(erro instanceof AvisoPendente)) throw erro;
      if (mensagem.tentativa < TENTATIVA_MAXIMA) {
        await agendarAviso(env, { ...mensagem, tentativa: mensagem.tentativa + 1 }, { aposSegundos: ATRASO_AVISO_COBRANCA_S });
      } else {
        try {
          reportar({ motivo: 'desistencia', tipo: mensagem.aviso });
        } catch {
          // o relato não muda o desfecho
        }
      }
      return CONCLUIR;
    }

    // O e-mail foi aceito e confirmado: agora o push, fora da transação (T25).
    if (enviadoPara !== null) {
      await enviarPushDeCobranca(mensagem, enviadoPara, enviadoPara.assinaturas, contexto, opcoes);
    }
    return CONCLUIR;
  };
}

export const avisarCobranca = criarAvisarCobranca();
