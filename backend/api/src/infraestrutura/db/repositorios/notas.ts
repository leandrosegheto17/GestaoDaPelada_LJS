import { sql } from 'kysely';
import { calcularNivel, type Nivel } from '@pelada/dominio';
import type { Db } from './tipos.ts';

/**
 * Notas do jogador (T48; GEL-97, GEL-98, GEL-100, GEL-105). Interface de `GD:154`: `INSERT … ON CONFLICT DO UPDATE`
 * para criar ou substituir, `DELETE` para `null` (sem erro quando não havia nota), e o nível recalculado pelo domínio
 * (`calcularNivel`, GEL-101, GEL-102) sobre as notas do jogador, na mesma transação.
 *
 * O jogador e a habilidade precisam ser do grupo da rota (GEL-100); a FK composta com `grupo_id` e a RLS são a segunda
 * barreira. A situação do jogador não importa: inativo também recebe nota (GEL-105). Nota não é auditada, por decisão
 * do design (`GSEG:120`).
 */

export type ResultadoSalvarNota =
  { resultado: 'ok'; nivel: Nivel } | { resultado: 'nao_encontrado' };

async function salvar(
  db: Db,
  grupoId: string,
  jogadorId: string,
  habilidadeId: string,
  nota: number | null,
): Promise<ResultadoSalvarNota> {
  const donos = await sql<{ jogador: boolean; habilidade: boolean }>`
    SELECT EXISTS (SELECT 1 FROM jogadores WHERE grupo_id = ${grupoId} AND id = ${jogadorId}) AS jogador,
           EXISTS (SELECT 1 FROM habilidades WHERE grupo_id = ${grupoId} AND id = ${habilidadeId}) AS habilidade`.execute(
    db,
  );
  const d = donos.rows[0];
  if (!d?.jogador || !d.habilidade) return { resultado: 'nao_encontrado' };

  if (nota === null) {
    await sql`
      DELETE FROM notas
       WHERE grupo_id = ${grupoId} AND jogador_id = ${jogadorId} AND habilidade_id = ${habilidadeId}`.execute(
      db,
    );
  } else {
    await sql`
      INSERT INTO notas (jogador_id, habilidade_id, grupo_id, valor)
      VALUES (${jogadorId}, ${habilidadeId}, ${grupoId}, ${nota})
      ON CONFLICT (jogador_id, habilidade_id) DO UPDATE SET valor = EXCLUDED.valor`.execute(db);
  }

  const valores = await sql<{ valor: number }>`
    SELECT valor FROM notas WHERE grupo_id = ${grupoId} AND jogador_id = ${jogadorId}`.execute(db);
  return { resultado: 'ok', nivel: calcularNivel(valores.rows.map((l) => Number(l.valor))) };
}

export const notas = { salvar };
