import * as Sentry from '@sentry/cloudflare';
import { TENTATIVA_MAXIMA, type MensagemCobranca, type TipoAvisoCobrancaFila } from '@pelada/contrato/fila-avisos';
import { enviarEmailDeConta, limiteEmailsDia } from '../acesso/enviar-email.ts';
import type { CasoDeUso, Desfecho } from '../../entrada/consumidor-avisos.ts';
import { push } from '../../infraestrutura/db/repositorios/push.ts';
import { remetenteDoAmbiente } from '../../infraestrutura/email/caixa-dev.ts';
import { emailCobranca } from '../../infraestrutura/email/modelo-cobranca.ts';
import type { Remetente } from '../../infraestrutura/email/resend.ts';
import { agendarAviso } from '../../infraestrutura/fila/avisos.ts';

/**
 * Aviso de cobrança por e-mail à criadora do grupo, uma vez por evento (notificacoes T24; NOT-38, NOT-39, NOT-41,
 * NOT-42, NOT-47; AD-105, AD-108), o caso de uso `cobranca` do consumidor da fila (T17). O push vem na T25.
 *
 * Tudo numa transação curta (sem conta nem slug), na ordem:
 * 1. `push.registrarAviso` com a chave (id da cobrança, tipo): já registrada, encerra sem enviar (NOT-39). Duas
 *    entregas em paralelo: a segunda espera a primeira na chave única e recebe "já registrada" se ela confirmou;
 * 2. `push.destinoCobranca`: só a criadora (`grupos.criado_por`) não excluída; sem destino, encerra (NOT-38);
 * 3. reserva a cota do dia com 100% de `LIMITE_EMAILS_DIA` e envia pelo remetente da conta-e-acesso, com
 *    `Idempotency-Key` = id e tipo (NOT-41); o fluxo é o do `enviarEmailDeConta` (savepoint da cota), na categoria
 *    `recuperacao`, que é a de 100%.
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - a mesma mensagem duas vezes, em série ou em paralelo: um e-mail (NOT-39);
 * - o Resend falha (ou a cota está cheia, ou a trava da cota passou de 2 s): `ROLLBACK` da transação inteira (o
 *   registro do aviso e a reserva da cota somem), e a mensagem volta à fila com `tentativa` + 1 e 8 h de atraso; a
 *   1.ª, a 2.ª e a 3.ª tentativa cabem em 24 h (0 h, 8 h, 16 h); falhou a 3.ª, desiste e o Sentry recebe só
 *   "desistência" e o tipo, sem e-mail, nome, valor nem conteúdo (NOT-42);
 * - criadora excluída ou grupo que não existe mais: encerra sem e-mail (o registro do aviso fica, e a repetição do
 *   evento também não envia);
 * - grupo Free: envia do mesmo jeito; o aviso de cobrança vale em qualquer plano (NOT-47);
 * - outro erro (banco fora): sobe, e o consumidor faz `retry()`; nada foi confirmado.
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

export function criarAvisarCobranca(opcoes: OpcoesAvisarCobranca = {}): CasoDeUso<MensagemCobranca> {
  return async (mensagem, { env, banco }) => {
    const remetente = opcoes.remetente ?? remetenteDoAmbiente(env);
    const reportar = opcoes.reportar ?? reportarPadrao;
    const limite = limiteEmailsDia(env.LIMITE_EMAILS_DIA);

    try {
      await banco(async (db) => {
        const primeira = await push.registrarAviso(db, mensagem.idExterno, mensagem.aviso, mensagem.grupoId);
        if (!primeira) return;
        const destino = await push.destinoCobranca(db, mensagem.grupoId);
        if (destino === null) return;

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
    return CONCLUIR;
  };
}

export const avisarCobranca = criarAvisarCobranca();
