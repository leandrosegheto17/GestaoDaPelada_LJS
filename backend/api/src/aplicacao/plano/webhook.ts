import type { AsaasEventoCorpo } from '@pelada/contrato';
import {
  ehDataValida,
  efeitoDoEvento,
  type CobrancaDoEvento,
  type EfeitoDoEvento,
} from '@pelada/dominio';
import { eventoDoCorpo } from './evento-asaas.ts';
import { eventosAsaas } from '../../infraestrutura/db/repositorios/eventos-asaas.ts';
import type { Db } from '../../infraestrutura/db/repositorios/tipos.ts';

/**
 * Registrar e aplicar o evento do webhook do Asaas (planos-e-cobranca T36; PLA-41, PLA-42, PLA-44 a PLA-47, PLA-49,
 * PLA-51; AD-088, AD-096). Roda na transação da rota (T35), sem conta e sem slug:
 * 1. `asaas_evento_registrar` (T15) grava o evento; `repetido` encerra sem efeito (PLA-42);
 * 2. assinatura desconhecida: o evento fica gravado e nada muda (PLA-49);
 * 3. com a assinatura travada, `efeitoDoEvento` (T4) decide; a função de transição (T16) grava na mesma transação
 *    (PLA-44: grupo, assinatura e `pago_ate` juntos);
 * 4. valor divergente: nada muda e o Sentry recebe só o id do evento e o tipo (PLA-51).
 * A rota responde 200 depois de tudo isso; erro em qualquer passo sobe, a transação é desfeita (nem o evento fica) e o
 * Asaas reenvia.
 *
 * Casos limite e estados (Domínio: sim), listados antes do código:
 * - cada evento tratado × `aguardando_pagamento`, `ativa`, `cancelada`: a tabela é a do domínio (T4); aqui só se
 *   traduz o efeito para a função certa;
 * - o mesmo id duas vezes (em série ou em paralelo): o segundo sai `repetido` no `ON CONFLICT` (PLA-42, PLA-43);
 * - tipo desconhecido (`PAYMENT_DELETED`, `PAYMENT_CREATED`): gravado, `nenhum('nao_tratado')`;
 * - `payment.dueDate` fora do formato: a cobrança vai ao domínio sem vencimento (`incompleto`), sem lançar;
 * - valor que não converte para centavos (fração de centavo, texto): o domínio o vê divergente;
 * - a função de transição devolve `false` (assinatura cancelada entre o registro e a transição): sem efeito, 200;
 * - erro na transição (inclusive na auditoria): sobe, 500, nada gravado.
 *
 * [LACUNA] `efeito = 'nenhum:<motivo>'` (comentário de `eventos_asaas.efeito`, T10) não é gravado: só as funções de
 * transição escrevem a coluna e a `pelada_app` não tem UPDATE nela. O evento sem efeito fica com `efeito` nulo; o
 * motivo volta no resultado (para o log e a `notificacoes`, S-03).
 */

export interface RelatoValorDivergente {
  motivo: 'valor_divergente';
  eventoId: string;
  evento: string;
}

export type ReportarWebhook = (relato: RelatoValorDivergente) => void;

/** O que vai ao Sentry: só o motivo, o id do evento e o tipo (PLA-51). Carregado na falha, como no `comBanco`. */
const reportarPadrao: ReportarWebhook = (relato) => {
  void import('@sentry/cloudflare')
    .then((Sentry) =>
      Sentry.captureMessage('webhook_asaas_valor_divergente', {
        level: 'warning',
        tags: { motivo: relato.motivo, evento_id: relato.eventoId, evento: relato.evento },
      }),
    )
    .catch(() => undefined);
};

export interface OpcoesWebhook {
  reportar?: ReportarWebhook;
}

export type ResultadoWebhook =
  | { resultado: 'repetido' }
  | { resultado: 'assinatura_desconhecida' }
  | {
      resultado: 'aplicado' | 'sem_efeito';
      efeito: EfeitoDoEvento;
      grupoId: string;
    };

function cobrancaDoCorpo(corpo: AsaasEventoCorpo): CobrancaDoEvento | null {
  const p = corpo.payment ?? null;
  if (p === null || typeof p.id !== 'string' || p.id.length === 0) return null;
  return {
    id: p.id,
    valorReais: typeof p.value === 'number' ? p.value : null,
    vencimento: ehDataValida(p.dueDate) ? p.dueDate : null,
  };
}

export async function aplicarEventoAsaas(
  db: Db,
  corpo: AsaasEventoCorpo,
  opcoes: OpcoesWebhook = {},
): Promise<ResultadoWebhook> {
  const reportar = opcoes.reportar ?? reportarPadrao;
  const evento = eventoDoCorpo(corpo);

  const registro = await eventosAsaas.registrar(db, evento);
  if (registro.resultado === 'repetido') return { resultado: 'repetido' };
  const assinatura = registro.assinatura;
  if (assinatura === null || evento.assinaturaId === null) {
    return { resultado: 'assinatura_desconhecida' };
  }

  const efeito = efeitoDoEvento(
    { evento: evento.evento, dataCriacao: evento.dataCriacao, cobranca: cobrancaDoCorpo(corpo) },
    assinatura,
  );

  let aplicou = false;
  switch (efeito.tipo) {
    case 'ativar':
      aplicou = await eventosAsaas.ativar(
        db,
        evento.assinaturaId,
        efeito.pagoAte,
        efeito.cobrancaId,
        evento.dataCriacao,
        evento.id,
      );
      break;
    case 'marcar_inadimplente':
      aplicou = await eventosAsaas.inadimplente(
        db,
        evento.assinaturaId,
        evento.dataCriacao,
        evento.id,
      );
      break;
    case 'cancelar':
      aplicou = await eventosAsaas.cancelado(
        db,
        evento.assinaturaId,
        evento.dataCriacao,
        evento.id,
      );
      break;
    case 'nenhum':
      if (efeito.motivo === 'valor_divergente') {
        try {
          reportar({ motivo: 'valor_divergente', eventoId: evento.id, evento: evento.evento });
        } catch {
          // o relato não muda a resposta ao Asaas
        }
      }
      break;
  }

  return {
    resultado: aplicou ? 'aplicado' : 'sem_efeito',
    efeito,
    grupoId: assinatura.grupoId,
  };
}
