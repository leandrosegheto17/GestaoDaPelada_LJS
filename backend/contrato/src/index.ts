export const PACOTE = '@pelada/contrato';
export * from './primitivos.ts';
export * from './acesso.ts';
export * from './grupo.ts';
export * from './elenco.ts';
export * from './periodos.ts';
export * from './pesos.ts';
export * from './partidas.ts';
export * from './publico.ts';
export * from './previas.ts';
export * from './push.ts';
export * from './plano.ts';
export * from './asaas.ts';
export * from './simulador.ts';
// `previaResposta` existe nos períodos e no simulador: a raiz fica com a dos períodos; a do simulador sai por
// `@pelada/contrato/simulador`.
export { previaResposta, type PreviaResposta } from './previas.ts';
export * from './escalacao.ts';
export * from './financeiro.ts';
export * from './financeiro-lancamentos.ts';
