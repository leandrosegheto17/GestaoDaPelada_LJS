import { criarCliente, type OpcoesCliente } from './cliente.ts';
import type { Db } from './repositorios/tipos.ts';
import { kyselyDoCliente } from './transacao.ts';

/**
 * Transação curta própria, confirmada mesmo quando a rota responde com erro (T26, T28).
 *
 * O `comBanco` desfaz a transação da rota em toda resposta 4xx ou 5xx (FUN-16). Isso apagaria o
 * que tem de ficar gravado justamente nessas respostas: a falha de login que leva ao bloqueio
 * (`conta_entrar`, 401 e 429; ACE-13, ACE-66, ACE-74) e a falha da senha atual (`conta_trocar_senha`
 * e `conta_excluir`, 401; ACE-70). Essas rotas rodam a função aqui: `COMMIT` quando `fn` termina,
 * `ROLLBACK` só quando `fn` lança. O contexto da RLS é o da sessão (ou nenhum).
 */

export interface OpcoesTransacaoCurta {
  /** `app.conta_id` da transação; nulo = sem conta. */
  conta?: string | null;
  /** Só para os testes: troca a fábrica de conexões (ex.: para rodar como `pelada_app`). */
  fabrica?: NonNullable<OpcoesCliente['fabrica']>;
}

export async function transacaoCurta<T>(
  urlBanco: string,
  fn: (db: Db) => Promise<T>,
  opcoes: OpcoesTransacaoCurta = {},
): Promise<T> {
  const cliente = criarCliente(urlBanco, {
    ...(opcoes.fabrica ? { fabrica: opcoes.fabrica } : {}),
    aoAbrir: async (consultar) => {
      await consultar('BEGIN');
      await consultar(`SELECT set_config('app.conta_id', $1, true), set_config('app.slug_publico', '', true)`, [
        opcoes.conta ?? '',
      ]);
    },
  });
  try {
    const resultado = await fn(kyselyDoCliente(cliente));
    if (cliente.aberto()) await cliente.consultar('COMMIT');
    return resultado;
  } catch (erro) {
    if (cliente.aberto()) await cliente.consultar('ROLLBACK').catch(() => undefined);
    throw erro;
  } finally {
    await cliente.fechar();
  }
}
