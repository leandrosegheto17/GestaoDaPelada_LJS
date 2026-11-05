import { criarCliente } from '../../src/infraestrutura/db/cliente.ts';
import type { Db } from '../../src/infraestrutura/db/repositorios/tipos.ts';
import { kyselyDoCliente } from '../../src/infraestrutura/db/transacao.ts';
import { fabricaComoApp } from '../db/requisicao.ts';

/**
 * Apoio dos testes dos repositórios (T22, T23): um `Db` igual ao da rota, numa transação como
 * `pelada_app` e com o `app.conta_id` dado, desfeita no fim (ou confirmada, com `confirmar`).
 * A conexão fecha sempre, também quando `fn` lança erro.
 */
export async function comDb<T>(
  url: string,
  conta: string | null,
  fn: (db: Db) => Promise<T>,
  opcoes: { confirmar?: boolean } = {},
): Promise<T> {
  const cliente = criarCliente(url, {
    fabrica: fabricaComoApp().fabrica,
    aoAbrir: async (consultar) => {
      await consultar('BEGIN');
      await consultar(`SELECT set_config('app.conta_id', $1, true), set_config('app.slug_publico', '', true)`, [
        conta ?? '',
      ]);
    },
  });
  try {
    const resultado = await fn(kyselyDoCliente(cliente));
    if (cliente.aberto()) await cliente.consultar(opcoes.confirmar ? 'COMMIT' : 'ROLLBACK');
    return resultado;
  } catch (erro) {
    if (cliente.aberto()) await cliente.consultar('ROLLBACK').catch(() => undefined);
    throw erro;
  } finally {
    await cliente.fechar();
  }
}

/** Bytes aleatórios de 32 posições, como o hash de um token. */
export function hashAleatorio(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}
