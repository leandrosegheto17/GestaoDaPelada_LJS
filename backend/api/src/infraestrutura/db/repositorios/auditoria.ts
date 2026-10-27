import { sql } from 'kysely';
import type { Db } from '../index.ts';

/**
 * Grava uma linha de auditoria do grupo, com a conta da requisição como autora, na transação da requisição
 * (ACE-42). Serve às ações que não passam por função do banco (remover admin, cancelar convite); as funções de
 * convite e de exclusão de conta já gravam a própria linha. A pelada_app só tem INSERT em `auditoria` (ACE-46).
 */
export async function registrar(
  db: Db,
  grupoId: string,
  acao: string,
  entidade: string,
  entidadeId: string,
  resumo: Record<string, unknown> = {},
): Promise<void> {
  await db
    .insertInto('auditoria')
    .values({
      autor_tipo: 'conta',
      autor_conta_id: sql<string>`app_conta_id()`,
      acao,
      entidade,
      entidade_id: entidadeId,
      grupo_id: grupoId,
      momento: sql<Date>`now()`,
      resumo: JSON.stringify(resumo),
    })
    .execute();
}
