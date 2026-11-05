import type { Env } from '../../entrada/ambiente.ts';
import { bancoSemContexto } from '../../entrada/consumidor-avisos.ts';
import type { ConexaoPg } from '../../infraestrutura/db/cliente.ts';
import { push } from '../../infraestrutura/db/repositorios/push.ts';

/**
 * Limpeza diária das notificações (notificacoes T26; NOT-56, NOT-57), chamada pelo `scheduled` do `worker.ts` (Cron
 * `0 6 * * *`, 06:00 UTC, no `wrangler.jsonc`). Uma transação curta sem conta e sem slug, como o consumidor da fila
 * (AD-101): a `notificacoes_limpar` (T11) apaga as assinaturas do ranking sem envio aceito há mais de 180 dias e os
 * registros de aviso de cobrança com mais de 90 dias. Falha sobe: o Cron registra a execução com erro e roda de novo no
 * dia seguinte; nada é apagado pela metade (a transação desfaz).
 */
export async function limparNotificacoes(
  env: Env,
  opcoes: { fabrica?: (connectionString: string) => ConexaoPg } = {},
): Promise<{ ranking: number; avisos: number }> {
  return bancoSemContexto(env, opcoes.fabrica)((db) => push.limpar(db));
}
