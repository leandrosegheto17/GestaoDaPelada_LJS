import { calcularNivel } from '@pelada/dominio';
import type { Db } from '../index.ts';

// Notas do jogador por habilidade (grupos-e-elenco, design C5; GEL-97, GEL-98, GEL-100 a GEL-102, GEL-105). Todo
// acesso filtra por `grupo_id` e roda sob a RLS da conta da requisição. Salvar nota não é auditado (design, Tech
// Decisions).

export interface NivelDoJogador {
  /** Média das notas × 100, meio para cima (GEL-101); 550 sem nota (GEL-102). */
  nivel: number;
  semNota: boolean;
}

/**
 * Grava a nota do jogador na habilidade, criando ou substituindo (GEL-97); `null` apaga, sem erro se não existir
 * (GEL-98). Vale para jogador inativo (GEL-105). Devolve o nível recalculado pelo domínio (GEL-104). Jogador ou
 * habilidade que não são do grupo da rota: nulo, sem gravar nada (GEL-100).
 */
export async function salvar(
  db: Db,
  grupoId: string,
  jogadorId: string,
  habilidadeId: string,
  nota: number | null,
): Promise<NivelDoJogador | null> {
  const par = await db
    .selectFrom('jogadores as j')
    .innerJoin('habilidades as h', 'h.grupo_id', 'j.grupo_id')
    .select('j.id')
    .where('j.grupo_id', '=', grupoId)
    .where('j.id', '=', jogadorId)
    .where('h.id', '=', habilidadeId)
    .executeTakeFirst();
  if (!par) return null;
  if (nota === null) {
    await db
      .deleteFrom('notas')
      .where('grupo_id', '=', grupoId)
      .where('jogador_id', '=', jogadorId)
      .where('habilidade_id', '=', habilidadeId)
      .execute();
  } else {
    await db
      .insertInto('notas')
      .values({ grupo_id: grupoId, jogador_id: jogadorId, habilidade_id: habilidadeId, valor: nota })
      .onConflict((oc) =>
        oc.columns(['jogador_id', 'habilidade_id']).doUpdateSet((eb) => ({ valor: eb.ref('excluded.valor') })),
      )
      .execute();
  }
  const valores = await db
    .selectFrom('notas')
    .select('valor')
    .where('grupo_id', '=', grupoId)
    .where('jogador_id', '=', jogadorId)
    .execute();
  return calcularNivel(valores.map((v) => v.valor));
}
