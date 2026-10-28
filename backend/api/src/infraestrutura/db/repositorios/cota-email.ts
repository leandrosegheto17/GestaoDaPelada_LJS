import { sql } from 'kysely';
import type { Db } from '../index.ts';

// Teto global de e-mails por dia, sobre a função do banco (ACE-72; migration 1792843860000).

/**
 * Reserva um envio no total do dia (fuso de São Paulo). Verdadeiro se o total estava abaixo do teto (e somou 1);
 * falso se o teto já foi atingido. A reserva some se a transação da requisição terminar em ROLLBACK.
 */
export async function reservar(db: Db, teto: number): Promise<boolean> {
  const { rows } = await sql<{ ok: boolean }>`SELECT email_cota_reservar(${teto}::integer) AS ok`.execute(db);
  return rows[0]?.ok === true;
}
