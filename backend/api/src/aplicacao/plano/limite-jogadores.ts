import { sql } from 'kysely';
import { somenteLeitura, type Data, type MotivoSomenteLeitura } from '@pelada/dominio';
import type { Db } from '../../infraestrutura/db/repositorios/tipos.ts';
import { estadoDoPlano } from './recurso-liberado.ts';

/**
 * Limite de jogadores ativos do Free no cadastrar e no reativar (planos-e-cobranca T23; PLA-16, PLA-21). O
 * `exigirPlanoEditavel` (T22) já recusa com 20 ativos, mas lê a contagem sem trava: dois cadastros simultâneos com 19
 * passariam os dois. Aqui, na transação da rota e antes da gravação, o grupo no Free pega
 * `pg_advisory_xact_lock` por grupo e conta de novo: o segundo espera o primeiro confirmar e vê os 20.
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - 19 ativos e dois cadastros simultâneos: o primeiro grava (20), o segundo espera a trava, relê 20 e recebe 403
 *   `limite_jogadores`, sem gravar (PLA-21);
 * - 20 ativos e reativar: 403 (PLA-16), nada gravado;
 * - trial válido, Pro ou cortesia com 20 (ou mais): passa, sem pegar a trava (PLA-16 só vale no Free);
 * - 20 ativos e cadastro que falharia por apelido repetido: 403 antes (o limite vale antes do conteúdo);
 * - o grupo trocou de plano entre a leitura e a trava: a releitura depois da trava decide (a trava vem antes da
 *   contagem que vale);
 * - grupo não visível (corrida com a remoção do vínculo): passa, e a rota responde o seu 404.
 *
 * A trava é do grupo e dura até o fim da transação (`xact`); a chave é separada da do financeiro
 * (`financeiro_config:<grupo>`, `repositorios/financeiro/config.ts:64`).
 */

export type OperacaoNoLimite = 'cadastrar_jogador' | 'reativar_jogador';

/** `null` = pode gravar; `limite_jogadores` = 403. Chamar na transação da rota, antes de gravar. */
export async function conferirLimiteDeJogadores(
  db: Db,
  grupoId: string,
  hoje: Data,
  operacao: OperacaoNoLimite,
): Promise<MotivoSomenteLeitura | null> {
  const antes = await estadoDoPlano(db, grupoId, hoje);
  if (antes === null || antes.plano !== 'free') return null;

  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`jogadores_ativos:${grupoId}`}, 0))`.execute(
    db,
  );

  // Releitura depois da trava: em READ COMMITTED, a consulta nova vê o que a transação anterior confirmou.
  const estado = await estadoDoPlano(db, grupoId, hoje);
  if (estado === null) return null;
  const motivo = somenteLeitura({
    plano: estado.plano,
    jogadoresAtivos: estado.jogadoresAtivos,
    // Só o limite de jogadores: o de grupos é do `exigirPlanoEditavel` (T22), que já passou.
    gruposFreeDaCriadora: [{ id: grupoId, criadoEm: estado.criadoEm }],
    grupoId,
    operacao,
  });
  return motivo === 'limite_jogadores' ? motivo : null;
}
