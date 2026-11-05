import { sql } from 'kysely';
import type { AssinaturaGravada, SituacaoAssinatura } from '@pelada/dominio';
import type { Db } from './tipos.ts';

/**
 * Eventos do webhook do Asaas (planos-e-cobranca T35, T36; PLA-41, PLA-42, PLA-49; AD-088). A `pelada_app` não lê nem
 * escreve `eventos_asaas`: a única porta é a `asaas_evento_registrar` (T15), que exige a transação sem conta e sem
 * slug, grava com `ON CONFLICT DO NOTHING` e, para evento novo de assinatura conhecida, trava a assinatura e devolve o
 * estado que o domínio precisa (`AssinaturaGravada`, T4).
 */

export interface EventoParaRegistrar {
  id: string;
  evento: string;
  /** `dateCreated` como o Asaas manda (`AAAA-MM-DD HH:MM:SS`, São Paulo). */
  dataCriacao: string | null;
  cobrancaId: string | null;
  assinaturaId: string | null;
  status: string | null;
  valorCentavos: number | null;
}

export type RegistroDoEvento =
  | { resultado: 'repetido' }
  | {
      resultado: 'novo';
      /** A assinatura gravada (travada até o fim da transação), ou `null` quando é desconhecida (PLA-49). */
      assinatura: (AssinaturaGravada & { grupoId: string }) | null;
    };

async function registrar(db: Db, e: EventoParaRegistrar): Promise<RegistroDoEvento> {
  const r = await sql<{
    resultado: 'novo' | 'repetido';
    grupo_id: string | null;
    situacao: SituacaoAssinatura | null;
    valor_centavos: number | null;
    pago_ate: string | null;
    cobranca_pro_id: string | null;
    ultimo_evento_em: string | null;
  }>`
    SELECT resultado, grupo_id, situacao, valor_centavos, pago_ate::text AS pago_ate, cobranca_pro_id,
           ultimo_evento_em
      FROM asaas_evento_registrar(${e.id}, ${e.evento}, ${e.dataCriacao}, ${e.cobrancaId}, ${e.assinaturaId},
                                  ${e.status}, ${e.valorCentavos}::integer)`.execute(db);
  const l = r.rows[0];
  if (l === undefined) throw new Error('asaas_evento_registrar sem retorno');
  if (l.resultado === 'repetido') return { resultado: 'repetido' };
  if (l.grupo_id === null || l.situacao === null || l.valor_centavos === null) {
    return { resultado: 'novo', assinatura: null };
  }
  return {
    resultado: 'novo',
    assinatura: {
      grupoId: l.grupo_id,
      situacao: l.situacao,
      valorCentavos: l.valor_centavos,
      pagoAte: l.pago_ate,
      cobrancaDoPro: l.cobranca_pro_id,
      ultimoEventoEm: l.ultimo_evento_em,
    },
  };
}

export const eventosAsaas = { registrar };
