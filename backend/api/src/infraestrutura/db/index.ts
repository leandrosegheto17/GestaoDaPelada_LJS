// Ponto de entrada do módulo de dados para a camada de entrada: não exporta o pg nem o Kysely.
export {
  abrirTransacaoDaRequisicao,
  TransacaoAninhada,
  TransacaoEncerrada,
  type ContextoRls,
  type Db,
  type TransacaoDaRequisicao,
} from './transacao-da-requisicao.ts';
export { emTransacaoPropria } from './transacao-propria.ts';
