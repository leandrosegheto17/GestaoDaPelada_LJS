import { rankingPublico, type RankingPublico } from '@pelada/contrato/publico';
import { CHAVE_DISPENSA } from '../useModoInstalacao.ts';
import { CHAVE_DISPOSITIVO, chavesLocais, gravarLocal, lerLocal, removerLocal } from './armazenamento-local.ts';

/**
 * Guardado local do ranking público (partidas-e-ranking T72; PAR-148, PAR-154; P23 de `BC:35`), em `localStorage`:
 * - a cada sucesso, `pelada:ranking:<slug>:<mes>` com a resposta (que traz o `geradoEm`) e, quando o pedido foi sem
 *   `?mes=`, também `pelada:ranking:<slug>:atual` (PAR-148);
 * - ao ler, valida com o `rankingPublico` do contrato: JSON quebrado, campo extra ou forma errada é descartado e a
 *   chave, removida (PAR-154);
 * - o aparelho guarda só isto, o identificador anônimo e a marca do aviso de instalação: nunca sessão ou dado de
 *   admin (`CHAVES_PERMITIDAS`, conferido no teste depois de entrar como admin).
 */

export const PREFIXO_RANKING = 'pelada:ranking:';
export const MES_ATUAL = 'atual';

/** `pelada:ranking:<slug>:<AAAA-MM | atual>`. */
export function chaveRanking(slug: string, mes: string | undefined): string {
  return `${PREFIXO_RANKING}${slug}:${mes ?? MES_ATUAL}`;
}

const CHAVE_RANKING = /^pelada:ranking:[a-z0-9-]{1,64}:(\d{4}-\d{2}|atual)$/;

/** As 4 formas de chave que o aparelho pode ter (PAR-154). */
export function chavePermitida(chave: string): boolean {
  return chave === CHAVE_DISPOSITIVO || chave === CHAVE_DISPENSA || CHAVE_RANKING.test(chave);
}

/** Grava o ranking carregado; `mesPedido` ausente (sem `?mes=`) grava também a chave do mês atual (PAR-148). */
export function guardarRanking(slug: string, mesPedido: string | undefined, dados: RankingPublico): void {
  const texto = JSON.stringify(dados);
  gravarLocal(chaveRanking(slug, dados.mes), texto);
  if (mesPedido === undefined) gravarLocal(chaveRanking(slug, undefined), texto);
}

/** O guardado do slug e mês pedidos (`undefined`: o atual), validado pelo contrato; inválido é removido (PAR-154). */
export function lerRankingGuardado(slug: string, mesPedido: string | undefined): RankingPublico | null {
  const chave = chaveRanking(slug, mesPedido);
  const texto = lerLocal(chave);
  if (texto === null) return null;
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    removerLocal(chave);
    return null;
  }
  const lido = rankingPublico.safeParse(bruto);
  if (!lido.success || lido.data.grupo.slug !== slug || (mesPedido !== undefined && lido.data.mes !== mesPedido)) {
    removerLocal(chave);
    return null;
  }
  return lido.data;
}

/** Remove as chaves `pelada:*` fora das permitidas (limpeza de versões antigas). */
export function limparChavesNaoPermitidas(): void {
  for (const chave of chavesLocais()) {
    if (chave.startsWith('pelada') && !chavePermitida(chave)) removerLocal(chave);
  }
}
