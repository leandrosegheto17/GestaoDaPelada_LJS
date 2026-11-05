import { sql } from 'kysely';
import { idsDaComposicao, lerComposicao, type Escalada } from '@pelada/contrato';
import type { Db } from './tipos.ts';

/**
 * Escalações confirmadas (T28, T29 da simulador; SIM-67, SIM-69, SIM-70, SIM-72, SIM-75, SIM-76, SIM-87, SIM-94). Regra de
 * `L:backend/api/src/aplicacao/simulador/confirmar-escalacao.ts`, escrita do zero. Recebe o `Db` da transação da
 * requisição (`c.var.db`) e nunca abre transação própria: a escalação e o evento de uso caem juntos (SIM-70).
 *
 * Casos limite (T28):
 * - mesma data confirmada de novo: o `ON CONFLICT (grupo_id, data) DO UPDATE` troca formato, N, K, composição, autora e
 *   momento, e um novo evento é gravado (SIM-69: uma linha, dois eventos);
 * - duas confirmações simultâneas da mesma data: a segunda espera o lock da linha e atualiza; nenhuma dá 23505 (SIM-87);
 * - 3 ou mais times, e 2 times com K `ilimitado`: `k` nulo (SIM-72; o CHECK `escalacoes_k_so_em_dois_times`);
 * - falha no INSERT do evento: a exceção sobe e a transação da requisição desfaz a escalação (SIM-70);
 * - o evento não leva jogador: só grupo, tipo, momento e data da partida (SIM-72, `eventos_uso` sem coluna de jogador).
 *
 * O momento vem do relógio da API (`relogio.agoraIso()`), nunca de `now()` (`relogio.ts`).
 */

export type Limite = number | 'ilimitado';

export interface EscalacaoParaGravar {
  data: string;
  n: number;
  /** Só em 2 times; ausente em 3 ou mais. */
  k?: Limite;
  escalada: Escalada;
}

export interface EscalacaoGravada {
  data: string;
  confirmadaEm: string;
}

/** `k` como fica no banco: nulo em 3 ou mais e em `ilimitado` (SIM-72). */
function kDoBanco(e: EscalacaoParaGravar): number | null {
  if (e.escalada.formato === 'varios_times') return null;
  return e.k === undefined || e.k === 'ilimitado' ? null : e.k;
}

/** Grava (ou substitui) a escalação da data e o evento `escalacao_confirmada`, na transação da requisição. */
async function confirmar(
  db: Db,
  grupoId: string,
  e: EscalacaoParaGravar,
  conta: string,
  momento: string,
): Promise<EscalacaoGravada> {
  const linha = {
    grupo_id: grupoId,
    data: e.data,
    formato: e.escalada.formato,
    n: e.n,
    k: kDoBanco(e),
    composicao: JSON.stringify(e.escalada.composicao),
    confirmada_por: conta,
    confirmada_em: momento,
  };
  await db
    .insertInto('escalacoes')
    .values(linha)
    .onConflict((oc) =>
      oc.columns(['grupo_id', 'data']).doUpdateSet({
        formato: linha.formato,
        n: linha.n,
        k: linha.k,
        composicao: linha.composicao,
        confirmada_por: linha.confirmada_por,
        confirmada_em: linha.confirmada_em,
      }),
    )
    .execute();

  // `eventos_uso` ainda não está nos tipos (T80 da partidas-e-ranking): o INSERT vai pelo `sql` do Kysely.
  await sql`
    INSERT INTO eventos_uso (grupo_id, tipo, momento, data_partida)
    VALUES (${grupoId}, 'escalacao_confirmada', ${momento}, ${e.data})`.execute(db);

  return { data: e.data, confirmadaEm: momento };
}

export interface EscalacaoLida {
  data: string;
  n: number;
  /** Nulo em 3 ou mais e em `ilimitado`. */
  k: number | null;
  escalada: Escalada;
}

/**
 * A escalação da data, com a composição conferida por `lerComposicao` (T29; SIM-94): forma inválida (dado antigo ou
 * gravado fora da API) é tratada como escalação inexistente, sem erro. Escalação de outro grupo não é lida (filtro por
 * `grupo_id` e RLS).
 */
async function porData(db: Db, grupoId: string, data: string): Promise<EscalacaoLida | null> {
  const linha = await db
    .selectFrom('escalacoes')
    .select(['formato', 'n', 'k', 'composicao'])
    .where('grupo_id', '=', grupoId)
    .where('data', '=', data)
    .executeTakeFirst();
  if (!linha) return null;
  const escalada = lerComposicao(linha.formato, linha.composicao);
  if (!escalada) return null;
  return { data, n: Number(linha.n), k: linha.k === null ? null : Number(linha.k), escalada };
}

/**
 * Os ids da escalação da data, para a pré-marcação de `partidas/nova` (SIM-75): titulares, reservas e "não entra" em 2
 * times, todos os times em 3 ou mais. Nulo sem escalação ou com escalação inválida (SIM-76, SIM-94). Molde da regra:
 * `L:backend/api/src/aplicacao/partidas/nova.ts:51-58`.
 */
async function idsNaData(db: Db, grupoId: string, data: string): Promise<string[] | null> {
  const lida = await porData(db, grupoId, data);
  return lida ? idsDaComposicao(lida.escalada) : null;
}

export const escalacoes = { confirmar, porData, idsNaData };
