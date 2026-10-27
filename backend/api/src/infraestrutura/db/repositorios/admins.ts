import { sql } from 'kysely';
import type { Db } from '../index.ts';
import * as auditoria from './auditoria.ts';

// Admins do grupo (design C2; ACE-37, ACE-39, ACE-40, ACE-42). `grupoId` é sempre o primeiro parâmetro de dado
// (G-03); a RLS e o vínculo da conta da requisição decidem o que se vê.

export interface Admins {
  admins: { id: string; nome: string; email: string; acessaFinanceiro: boolean }[];
  /** Convites pendentes: sem uso, sem cancelamento e dentro do prazo. */
  convites: { id: string; email: string; expiraEm: Date }[];
}

/** Admins (pela função `admins_listar`, que lê o nome e o e-mail de outras contas) e convites pendentes. */
export async function listar(db: Db, grupoId: string): Promise<Admins> {
  const { rows } = await sql<{ id: string; nome: string; email: string; acessa_financeiro: boolean }>`
    SELECT id, nome, email, acessa_financeiro FROM admins_listar(${grupoId})
  `.execute(db);
  const convites = await db
    .selectFrom('convites_admin')
    .select(['id', 'email', 'expira_em'])
    .where('grupo_id', '=', grupoId)
    .where('usado_em', 'is', null)
    .where('cancelado_em', 'is', null)
    .where('expira_em', '>', sql<Date>`now()`)
    .orderBy('criado_em')
    .orderBy('id')
    .execute();
  return {
    admins: rows.map((a) => ({ id: a.id, nome: a.nome, email: a.email, acessaFinanceiro: a.acessa_financeiro })),
    convites: convites.map((c) => ({ id: c.id, email: c.email, expiraEm: c.expira_em })),
  };
}

export type ResultadoRemover = 'ok' | 'ultimo_admin' | 'nao_encontrado';

/**
 * Remove o vínculo de `contaId` com o grupo e grava a auditoria na mesma transação (ACE-39, ACE-42). Trava antes os
 * vínculos do grupo (`FOR UPDATE`): duas remoções simultâneas não deixam o grupo sem admin (ACE-40). A auditoria vem
 * antes do DELETE, para valer também quando a conta remove a si mesma (depois dele, a RLS já não a deixaria gravar).
 */
export async function remover(db: Db, grupoId: string, contaId: string): Promise<ResultadoRemover> {
  const vinculos = await db
    .selectFrom('vinculos_admin')
    .select('conta_id')
    .where('grupo_id', '=', grupoId)
    .forUpdate()
    .execute();
  if (!vinculos.some((v) => v.conta_id === contaId)) return 'nao_encontrado';
  if (vinculos.length <= 1) return 'ultimo_admin';
  await auditoria.registrar(db, grupoId, 'remover_admin', 'vinculo_admin', contaId);
  await db.deleteFrom('vinculos_admin').where('grupo_id', '=', grupoId).where('conta_id', '=', contaId).execute();
  return 'ok';
}
