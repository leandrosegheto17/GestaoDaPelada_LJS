import { sql } from 'kysely';
import type { DiaSemana, Frequencia } from '@pelada/contrato';
import type { Db } from './tipos.ts';

/**
 * O grupo da página pública (partidas-e-ranking T45; PAR-64, PAR-90, PAR-93; `BD:220-222`). Roda na transação do
 * `contextoPublico`, só com `app.slug_publico`: a RLS mostra só o grupo do slug, e só se ele está ativo (T26). Slug
 * que não existe, de grupo arquivado ou de outro grupo dão o mesmo nulo, e a rota responde o mesmo 404 (PAR-90).
 * O filtro por `slug` repete a RLS, para a leitura não depender só dela.
 */

export interface GrupoPublico {
  /** Só para carregar o histórico; nunca sai na resposta (PAR-76). */
  id: string;
  nome: string;
  slug: string;
  diaSemana: DiaSemana;
  frequencia: Frequencia;
  horario: string;
}

async function lerPeloSlug(db: Db, slug: string): Promise<GrupoPublico | null> {
  const r = await sql<GrupoPublico>`
    SELECT id, nome, slug, dia_semana AS "diaSemana", frequencia, to_char(horario, 'HH24:MI') AS horario
      FROM grupos
     WHERE slug = ${slug}`.execute(db);
  return r.rows[0] ?? null;
}

export const grupoPublico = { lerPeloSlug };
