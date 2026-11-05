import { sql } from 'kysely';
import { auditoria } from '../convites.ts';
import type { Db } from '../tipos.ts';

/**
 * Excluir lançamento avulso e recusar o vinculado (financeiro T21; FIN-29, FIN-30). Na transação da requisição:
 * `SELECT … FOR UPDATE` do lançamento do grupo (sem linha: `nao_encontrado`, o mesmo para outro grupo e id
 * inexistente, FIN-31), confere se há pagamento vinculado, apaga e audita `lancamento_excluido` com tipo, data e
 * valor, sem a descrição (FIN-44).
 *
 * Lançamento vinculado a um pagamento (a entrada da mensalidade) não se apaga por aqui: devolve `vinculado` com o
 * apelido e o mês, para a rota montar o 409 `lancamento_vinculado` (a saída é pela desmarcação do pagamento, T19). A
 * FK `ON DELETE RESTRICT` de `pagamentos_mes` é a segunda barreira: se a checagem passar e o `DELETE` ainda assim der
 * 23503 (um pagamento marcado entre a conferência e o apagar), um `SAVEPOINT` desfaz só o `DELETE` e o resultado é o
 * mesmo `vinculado`, sem deixar a transação abortada.
 */

export type ResultadoExcluirLancamento =
  | { resultado: 'ok' }
  | { resultado: 'nao_encontrado' }
  | { resultado: 'vinculado'; apelido: string; mes: string };

export interface OpcoesExcluirLancamento {
  /** Só para teste: pula a conferência do vínculo para provar o 23503 da FK, como numa corrida. */
  pularChecagemDoVinculo?: boolean;
}

interface Linha {
  tipo: 'entrada' | 'saida';
  data: string;
  valor_centavos: number;
  apelido: string | null;
  mes: string | null;
}

async function vinculoDe(db: Db, grupoId: string, id: string): Promise<{ apelido: string; mes: string } | null> {
  const r = await sql<{ apelido: string; mes: string }>`
    SELECT j.apelido, p.mes
      FROM pagamentos_mes p JOIN jogadores j ON j.id = p.jogador_id AND j.grupo_id = p.grupo_id
     WHERE p.grupo_id = ${grupoId} AND p.lancamento_id = ${id}`.execute(db);
  return r.rows[0] ?? null;
}

async function excluir(
  db: Db,
  grupoId: string,
  id: string,
  opcoes: OpcoesExcluirLancamento = {},
): Promise<ResultadoExcluirLancamento> {
  const r = await sql<Linha>`
    SELECT l.tipo, l.data::text AS data, l.valor_centavos, j.apelido, p.mes
      FROM lancamentos l
      LEFT JOIN pagamentos_mes p ON p.lancamento_id = l.id AND p.grupo_id = l.grupo_id
      LEFT JOIN jogadores j ON j.id = p.jogador_id AND j.grupo_id = l.grupo_id
     WHERE l.grupo_id = ${grupoId} AND l.id = ${id}
       FOR UPDATE OF l`.execute(db);
  const l = r.rows[0];
  if (!l) return { resultado: 'nao_encontrado' };
  if (!opcoes.pularChecagemDoVinculo && l.apelido !== null && l.mes !== null) {
    return { resultado: 'vinculado', apelido: l.apelido, mes: l.mes };
  }

  await sql`SAVEPOINT excluir_lancamento`.execute(db);
  try {
    await sql`DELETE FROM lancamentos WHERE grupo_id = ${grupoId} AND id = ${id}`.execute(db);
  } catch (erro) {
    await sql`ROLLBACK TO SAVEPOINT excluir_lancamento`.execute(db);
    if ((erro as { code?: string }).code === '23503') {
      const v = await vinculoDe(db, grupoId, id);
      if (v) return { resultado: 'vinculado', apelido: v.apelido, mes: v.mes };
    }
    throw erro;
  }
  await sql`RELEASE SAVEPOINT excluir_lancamento`.execute(db);

  await auditoria.registrar(db, grupoId, {
    acao: 'lancamento_excluido',
    entidade: 'lancamento',
    entidadeId: id,
    resumo: { tipo: l.tipo, data: l.data, valorCentavos: Number(l.valor_centavos) },
  });
  return { resultado: 'ok' };
}

export const lancamentosExcluir = { excluir };
