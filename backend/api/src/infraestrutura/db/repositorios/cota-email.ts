import { sql } from 'kysely';
import type { Db } from '../index.ts';

// Teto global de e-mails por dia (ACE-72; migration 1792843860000; espera máxima pela trava, ACE-75) e teto por origem em 1 h (ACE-73; migration
// 1792843980000), sobre as funções do banco.

/** Resultado da reserva: `reservado` (somou 1), `teto` (o total do dia já chegou ao teto) ou `trava` (ACE-75). */
export type ResultadoReserva = 'reservado' | 'teto' | 'trava';

/** SQLSTATE do `lock_timeout` estourado (lock_not_available). */
const TRAVA_OCUPADA = '55P03';

/**
 * Reserva um envio no total do dia (fuso de São Paulo). A reserva some se a transação da requisição terminar em
 * ROLLBACK. A função do banco espera no máximo 2 s pela trava da linha do dia (migration 1792844100000); acima disso,
 * `trava`, e a transação da requisição fica abortada: a rota responde 503 sem consultar mais nada.
 */
export async function reservar(db: Db, teto: number): Promise<ResultadoReserva> {
  try {
    const { rows } = await sql<{ ok: boolean }>`SELECT email_cota_reservar(${teto}::integer) AS ok`.execute(db);
    return rows[0]?.ok === true ? 'reservado' : 'teto';
  } catch (erro) {
    if ((erro as { code?: unknown } | null)?.code === TRAVA_OCUPADA) return 'trava';
    throw erro;
  }
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
