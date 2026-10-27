import { sql } from 'kysely';
import type { Db } from '../index.ts';

// Links de conta (confirmação e recuperação) sobre as funções do banco (design C2; AD-008, AD-010). Só o SHA-256 do
// token chega aqui.

export type TipoLink = 'confirmacao' | 'recuperacao';

export interface ResultadoPedir {
  /** Verdadeiro só quando há conta e o intervalo de 60 s permite (ACE-51); a rota responde igual nos dois casos. */
  enviar: boolean;
  /** Nome da conta, para o e-mail; nulo sem conta. */
  nome: string | null;
}

/** Cria o link novo do tipo, invalidando o anterior (ACE-08, ACE-23). */
export async function pedir(db: Db, email: string, tipo: TipoLink, tokenHash: Uint8Array): Promise<ResultadoPedir> {
  const { rows } = await sql<ResultadoPedir>`
    SELECT enviar, nome FROM link_pedir(${email}, ${tipo}, ${tokenHash})
  `.execute(db);
  const linha = rows[0];
  if (!linha) throw new Error('link_pedir não devolveu linha');
  return { enviar: linha.enviar, nome: linha.nome };
}

/**
 * Consome o link de confirmação e marca o e-mail como confirmado, sem abrir sessão. Devolve a conta, ou nulo se o
 * link está vencido, usado ou não existe (ACE-06, ACE-07). O segundo parâmetro da função do banco não é mais usado
 * (migration 1792843740000) e vai nulo.
 */
export async function confirmar(db: Db, tokenHash: Uint8Array): Promise<string | null> {
  const { rows } = await sql<{ conta_id: string | null }>`
    SELECT link_confirmar(${tokenHash}, NULL) AS conta_id
  `.execute(db);
  return rows[0]?.conta_id ?? null;
}

/** Consome o link de recuperação e troca a senha, encerrando as sessões. Falso se o link não vale (ACE-24, ACE-25). */
export async function novaSenha(db: Db, tokenHash: Uint8Array, senha: string): Promise<boolean> {
  const { rows } = await sql<{ ok: boolean }>`SELECT link_nova_senha(${tokenHash}, ${senha}) AS ok`.execute(db);
  return rows[0]?.ok === true;
}
