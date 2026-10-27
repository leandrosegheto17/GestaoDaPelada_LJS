import { sql } from 'kysely';
import { abrirTransacaoDaRequisicao, type Db } from '../index.ts';

/**
 * Resolve a sessão pelo hash do token numa transação curta PRÓPRIA, antes da transação da rota (AD-007): a função
 * `sessao_tocar` apaga a sessão vencida (15 min parada ou 12 h de vida) e renova a válida, então precisa escrever
 * mesmo quando a rota é um GET (`READ ONLY`). Abre, confirma e fecha a conexão antes de devolver o `conta_id` (ou
 * nulo). Qualquer falha desfaz a transação, fecha a conexão e sobe.
 */
export async function tocar(urlBanco: string, tokenHash: Uint8Array): Promise<string | null> {
  const transacao = abrirTransacaoDaRequisicao({
    connectionString: () => urlBanco,
    somenteLeitura: false,
    contexto: () => ({}),
  });
  try {
    const { rows } = await sql<{ conta_id: string | null }>`SELECT sessao_tocar(${tokenHash}) AS conta_id`.execute(
      transacao.db,
    );
    await transacao.terminar(true);
    return rows[0]?.conta_id ?? null;
  } catch (erro) {
    await transacao.terminar(false).catch(() => undefined);
    throw erro;
  } finally {
    await transacao.fechar();
  }
}

/** Apaga a sessão do token, se for da conta da requisição (RLS). Verdadeiro se apagou (ACE-17). */
export async function encerrarAtual(db: Db, tokenHash: Uint8Array): Promise<boolean> {
  const r = await db.deleteFrom('sessoes').where('token_hash', '=', tokenHash).executeTakeFirst();
  return r.numDeletedRows > 0n;
}
