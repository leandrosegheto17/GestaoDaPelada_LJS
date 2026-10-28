import { sql } from 'kysely';
import type { Db } from '../index.ts';

// Teto global de e-mails por dia (ACE-72; migration 1792843860000) e teto por origem em 1 h (ACE-73; migration
// 1792843980000), sobre as funções do banco.

/**
 * Reserva um envio no total do dia (fuso de São Paulo). Verdadeiro se o total estava abaixo do teto (e somou 1);
 * falso se o teto já foi atingido. A reserva some se a transação da requisição terminar em ROLLBACK.
 */
export async function reservar(db: Db, teto: number): Promise<boolean> {
  const { rows } = await sql<{ ok: boolean }>`SELECT email_cota_reservar(${teto}::integer) AS ok`.execute(db);
  return rows[0]?.ok === true;
}

/**
 * Registra um pedido de e-mail da origem (SHA-256 da chave de IP, ACE-73; migration 1792843980000). Verdadeiro se a
 * origem tinha menos de `teto` pedidos na última hora (e o pedido foi contado); falso se já chegou ao teto.
 */
export async function registrarOrigem(db: Db, chaveHash: Uint8Array, teto: number): Promise<boolean> {
  const { rows } = await sql<{ ok: boolean }>`
    SELECT email_origem_registrar(${chaveHash}, ${teto}::integer) AS ok
  `.execute(db);
  return rows[0]?.ok === true;
}
