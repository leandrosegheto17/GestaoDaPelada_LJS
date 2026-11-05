import { sql } from 'kysely';
import { auditoria } from '../convites.ts';
import type { Db } from '../tipos.ts';

/**
 * Desmarcar o pagamento da mensalidade (financeiro T19; FIN-22, FIN-23). Na transação da requisição: apaga o
 * pagamento (`DELETE … RETURNING`; sem linha, `nao_encontrado`), depois o lançamento vinculado (a FK `ON DELETE
 * RESTRICT` exige essa ordem) e audita `pagamento_desmarcado` com o mês e o valor removido, que é o atual do
 * lançamento, mesmo editado depois (FIN-22). Pagamento sem lançamento (marcado sem mensalidade) só apaga o pagamento.
 *
 * Não exige jogador ativo: quem foi inativado depois de pagar continua desmarcável. Duas desmarcações simultâneas
 * (FIN-23): a segunda espera o lock da linha do pagamento, não a encontra depois do commit da primeira e devolve
 * `nao_encontrado`, sem erro. Toda consulta filtra por `grupo_id`; jogador de outro grupo é `nao_encontrado`.
 */

export type ResultadoDesmarcar = { resultado: 'ok'; valorCentavos: number | null } | { resultado: 'nao_encontrado' };

async function desmarcar(db: Db, grupoId: string, jogadorId: string, mes: string): Promise<ResultadoDesmarcar> {
  const p = await sql<{ lancamento_id: string | null }>`
    DELETE FROM pagamentos_mes
     WHERE grupo_id = ${grupoId} AND jogador_id = ${jogadorId} AND mes = ${mes}
    RETURNING lancamento_id`.execute(db);
  const pagamento = p.rows[0];
  if (!pagamento) return { resultado: 'nao_encontrado' };

  let valorCentavos: number | null = null;
  if (pagamento.lancamento_id) {
    const l = await sql<{ valor_centavos: number }>`
      DELETE FROM lancamentos WHERE grupo_id = ${grupoId} AND id = ${pagamento.lancamento_id}
      RETURNING valor_centavos`.execute(db);
    const apagado = l.rows[0];
    valorCentavos = apagado ? Number(apagado.valor_centavos) : null;
  }

  await auditoria.registrar(db, grupoId, {
    acao: 'pagamento_desmarcado',
    entidade: 'pagamento_mes',
    entidadeId: jogadorId,
    resumo: { mes, valorCentavos },
  });
  return { resultado: 'ok', valorCentavos };
}

export const financeiroPagamentosDesmarcar = { desmarcar };
