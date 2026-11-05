import { subtrairCentavos } from './centavos.ts';
import { totais, type MovimentoCaixa } from './saldos.ts';

/**
 * Resumo do mês do caixa e lista de pagamentos (FIN-11, FIN-12, FIN-13). Os ativos chegam já filtrados pelo mês e
 * ordenados pelo apelido (`ativosNoMes`, T2); aqui só se conta. Pagamento de quem não era ativo no mês não desconta
 * de "não pagaram" nem entra na lista.
 */

/** Mês em `AAAA-MM`. */
export type MesCaixa = string;

export interface AtivoNoMes {
  jogadorId: string;
  apelido: string;
}

export interface PagamentoDoMes extends AtivoNoMes {
  pagou: boolean;
}

export interface ResumoDoMes {
  entradasCentavos: number;
  saidasCentavos: number;
  resultadoCentavos: number;
  /** Ativos no mês sem pagamento marcado. */
  naoPagaram: number;
}

/** Lançamento com data dentro do mês (`AAAA-MM-DD` que começa por `AAAA-MM-`). */
function noMes(data: string, mes: MesCaixa): boolean {
  return data.startsWith(`${mes}-`);
}

/**
 * Entradas e saídas com data no mês, resultado (entradas − saídas) e "não pagaram"; a lista de pagamentos traz cada
 * ativo uma vez, na ordem recebida, com `pagou`.
 * @param pagos ids dos jogadores com pagamento marcado naquele mês
 */
export function resumoDoMes(
  lancamentos: readonly MovimentoCaixa[],
  ativos: readonly AtivoNoMes[],
  pagos: readonly string[],
  mes: MesCaixa,
): { resumo: ResumoDoMes; pagamentos: PagamentoDoMes[] } {
  const { entradasCentavos, saidasCentavos } = totais(lancamentos.filter((l) => noMes(l.data, mes)));
  const marcados = new Set(pagos);
  const vistos = new Set<string>();
  const pagamentos: PagamentoDoMes[] = [];
  for (const ativo of ativos) {
    if (vistos.has(ativo.jogadorId)) continue;
    vistos.add(ativo.jogadorId);
    pagamentos.push({ jogadorId: ativo.jogadorId, apelido: ativo.apelido, pagou: marcados.has(ativo.jogadorId) });
  }
  return {
    resumo: {
      entradasCentavos,
      saidasCentavos,
      resultadoCentavos: subtrairCentavos(entradasCentavos, saidasCentavos),
      naoPagaram: pagamentos.filter((p) => !p.pagou).length,
    },
    pagamentos,
  };
}
