import { compararDatas, ehDataValida, exigirData, type Data } from '../datas.ts';
import { formatarData, sobrepoem, type Periodo, type PeriodoEntrada } from './atividade.ts';

/** Campo da data no pedido: a saída (fim) ou o retorno (início) de um período. */
export type CampoPeriodo = 'saida' | 'retorno';

/** Regras de período, na ordem do GEL-62. */
export type RegraPeriodo =
  | 'data-invalida'
  | 'nao-corrigivel'
  | 'futuro'
  | 'saida-antes-do-inicio'
  | 'retorno-antes-da-saida-anterior'
  | 'saida-depois-do-proximo-retorno'
  | 'retorno-depois-da-saida'
  | 'sobreposicao'
  | 'presenca'
  | 'antes-do-inicio-da-pontuacao';

/** A primeira regra que falhou, com o campo e a mensagem que a tela mostra. */
export interface FalhaPeriodo {
  ok: false;
  regra: RegraPeriodo;
  campo: CampoPeriodo;
  mensagem: string;
}

/** Período no resultado: o novo (reativar) ainda não tem id. */
export type PeriodoResultado = Periodo & { id?: string };

export const MENSAGEM_DATA_INVALIDA = 'Informe uma data válida.';
export const MENSAGEM_FUTURO = 'A data não pode ser no futuro.';
export const MENSAGEM_SOBREPOSICAO = 'Os períodos não podem se sobrepor.';

export const falhaPeriodo = (regra: RegraPeriodo, campo: CampoPeriodo, mensagem: string): FalhaPeriodo => ({
  ok: false,
  regra,
  campo,
  mensagem,
});

/** Datas informadas no pedido, sempre na ordem saída, retorno. */
export function datasInformadas(pedido: { saida?: unknown; retorno?: unknown }): Array<[CampoPeriodo, unknown]> {
  const informadas: Array<[CampoPeriodo, unknown]> = [];
  if (pedido.saida !== undefined) informadas.push(['saida', pedido.saida]);
  if (pedido.retorno !== undefined) informadas.push(['retorno', pedido.retorno]);
  return informadas;
}

/** GEL-63: cada data informada é uma data real `AAAA-MM-DD`. */
export function validarFormato(informadas: ReadonlyArray<[CampoPeriodo, unknown]>): FalhaPeriodo | null {
  for (const [campo, valor] of informadas) {
    if (!ehDataValida(valor)) return falhaPeriodo('data-invalida', campo, MENSAGEM_DATA_INVALIDA);
  }
  return null;
}

/** GEL-64: nenhuma data informada fica depois de hoje. Supõe o formato já validado. */
export function validarFuturo(informadas: ReadonlyArray<[CampoPeriodo, unknown]>, hoje: Data): FalhaPeriodo | null {
  for (const [campo, valor] of informadas) {
    if (compararDatas(valor as Data, hoje) > 0) return falhaPeriodo('futuro', campo, MENSAGEM_FUTURO);
  }
  return null;
}

/** GEL-67: nenhum período com fim antes do início e nenhum par com dia em comum. */
function semSobreposicao(periodos: readonly Periodo[]): boolean {
  if (periodos.some((p) => p.fim !== null && compararDatas(p.fim, p.inicio) < 0)) return false;
  return periodos.every((a, i) => periodos.every((b, j) => j <= i || !sobrepoem(a, b)));
}

export const emOrdem = <T extends Periodo>(periodos: readonly T[]): T[] =>
  periodos.map((p) => ({ ...p })).sort((a, b) => compararDatas(a.inicio, b.inicio));

export interface PedidoValidacao {
  /** Os períodos como estão gravados, em qualquer ordem. */
  periodos: readonly PeriodoEntrada[];
  /** Período editado; `null` abre um período novo a partir do `retorno` (reativar). */
  periodoId: string | null;
  saida?: unknown;
  retorno?: unknown;
  /** Hoje em São Paulo, vindo de fora: o domínio não lê relógio (GEL-70). */
  hoje: Data;
}

export type ResultadoValidacao = { ok: true; periodos: PeriodoResultado[] } | FalhaPeriodo;

/**
 * Regras de data e de ordem de uma edição de período (GEL-63 a GEL-67), na ordem do GEL-62: data válida, não
 * futura, saída antes do início do próprio período, retorno antes da saída anterior, saída depois do próximo
 * retorno, retorno depois da saída do próprio período e sobreposição. Devolve só a primeira falha, ou os períodos
 * resultantes em ordem cronológica. Não altera a entrada.
 */
export function validarPeriodos(pedido: PedidoValidacao): ResultadoValidacao {
  exigirData(pedido.hoje, 'Hoje');
  const informadas = datasInformadas(pedido);
  const invalida = validarFormato(informadas) ?? validarFuturo(informadas, pedido.hoje);
  if (invalida) return invalida;
  const saida = pedido.saida as Data | undefined;
  const retorno = pedido.retorno as Data | undefined;

  const ordenados = emOrdem(pedido.periodos);
  let indice: number;
  let atual: PeriodoResultado;
  if (pedido.periodoId === null) {
    if (retorno === undefined) throw new RangeError('Período novo sem data de retorno.');
    indice = ordenados.length;
    atual = { inicio: retorno, fim: null };
  } else {
    indice = ordenados.findIndex((p) => p.id === pedido.periodoId);
    if (indice < 0) throw new RangeError(`Período ${pedido.periodoId} não está entre os do jogador.`);
    atual = ordenados[indice]!;
  }
  const novo: PeriodoResultado = { ...atual, inicio: retorno ?? atual.inicio, fim: saida ?? atual.fim };
  const saidaAnterior = ordenados[indice - 1]?.fim ?? null;
  const inicioDoProximo = ordenados[indice + 1]?.inicio ?? null;

  if (saida !== undefined && compararDatas(saida, novo.inicio) < 0) {
    return falhaPeriodo(
      'saida-antes-do-inicio',
      'saida',
      `A saída não pode ser antes do início deste período (${formatarData(novo.inicio)}).`,
    );
  }
  if (retorno !== undefined && saidaAnterior !== null && compararDatas(retorno, saidaAnterior) < 0) {
    return falhaPeriodo(
      'retorno-antes-da-saida-anterior',
      'retorno',
      `O retorno não pode ser antes da saída anterior (${formatarData(saidaAnterior)}).`,
    );
  }
  if (saida !== undefined && inicioDoProximo !== null && compararDatas(saida, inicioDoProximo) > 0) {
    return falhaPeriodo(
      'saida-depois-do-proximo-retorno',
      'saida',
      `A saída não pode ser depois do próximo retorno (${formatarData(inicioDoProximo)}).`,
    );
  }
  if (retorno !== undefined && novo.fim !== null && compararDatas(retorno, novo.fim) > 0) {
    return falhaPeriodo(
      'retorno-depois-da-saida',
      'retorno',
      `O retorno não pode ser depois da saída deste período (${formatarData(novo.fim)}).`,
    );
  }

  const depois: PeriodoResultado[] =
    pedido.periodoId === null ? [...ordenados, novo] : ordenados.map((p, i) => (i === indice ? novo : p));
  if (!semSobreposicao(depois)) {
    return falhaPeriodo('sobreposicao', saida !== undefined ? 'saida' : 'retorno', MENSAGEM_SOBREPOSICAO);
  }
  return { ok: true, periodos: depois };
}
