import { abrirTransacaoDaRequisicao, type ContextoRls, type Db } from './transacao-da-requisicao.ts';

/**
 * Transação curta PRÓPRIA, fora da transação da requisição, confirmada mesmo quando a resposta da rota é de erro.
 * Serve ao que precisa ficar gravado numa resposta 4xx (a falha de login que alimenta o bloqueio, ACE-13) e à
 * busca da sessão, que acontece antes de existir conta no contexto. A conexão só abre na primeira consulta e
 * fecha antes de devolver; qualquer falha desfaz a transação e sobe.
 */
export async function emTransacaoPropria<T>(
  urlBanco: string,
  contexto: ContextoRls,
  acao: (db: Db) => Promise<T>,
): Promise<T> {
  const transacao = abrirTransacaoDaRequisicao({
    connectionString: () => urlBanco,
    somenteLeitura: false,
    contexto: () => contexto,
  });
  try {
    const resultado = await acao(transacao.db);
    await transacao.terminar(true);
    return resultado;
  } catch (erro) {
    await transacao.terminar(false).catch(() => undefined);
    throw erro;
  } finally {
    await transacao.fechar();
  }
}
