import { Buffer } from 'node:buffer';
import { criarCliente, type OpcoesCliente } from '../cliente.ts';

/**
 * Resolução da sessão antes do `comBanco` (T20; ACE-15, ACE-16, ACE-47, ACE-69). Decisão do
 * design do LJS (`design.md:18-23`): a sessão é lida e renovada numa transação curta própria,
 * de leitura e escrita, para a transação da rota já abrir com o `app.conta_id` certo e manter o
 * `READ ONLY` nas leituras (FUN-16).
 *
 * `sessao_tocar(hash)` (`1792843500000_conta-entrar-e-sessao.sql:78`) apaga a sessão vencida
 * (12 h absolutas ou 15 min sem uso), renova `ultimo_uso_em` da sessão `completo` e devolve o
 * `conta_id`; nulo quando não há sessão válida. A conta excluída já não tem sessão (a exclusão
 * as apaga, ACE-28), então também dá nulo (ACE-69).
 */

export interface OpcoesTocar {
  /** Só para os testes: troca a fábrica de conexões (ex.: para rodar como `pelada_app`). */
  fabrica?: NonNullable<OpcoesCliente['fabrica']>;
}

/**
 * Toca a sessão do hash dado e devolve a conta dela, ou nulo. Abre e fecha a própria conexão.
 * Banco fora: `ErroBancoIndisponivel` (o `onError` responde 503).
 */
export async function tocar(urlBanco: string, tokenHash: Uint8Array, opcoes: OpcoesTocar = {}): Promise<string | null> {
  const cliente = criarCliente(urlBanco, {
    ...(opcoes.fabrica ? { fabrica: opcoes.fabrica } : {}),
    aoAbrir: async (consultar) => {
      await consultar('BEGIN');
    },
  });
  try {
    const r = await cliente.consultar<{ conta: string | null }>('SELECT sessao_tocar($1) AS conta', [
      Buffer.from(tokenHash),
    ]);
    await cliente.consultar('COMMIT');
    return r.rows[0]?.conta ?? null;
  } catch (erro) {
    if (cliente.aberto()) await cliente.consultar('ROLLBACK').catch(() => undefined);
    throw erro;
  } finally {
    await cliente.fechar();
  }
}
