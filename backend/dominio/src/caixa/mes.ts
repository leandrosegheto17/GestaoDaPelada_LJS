import { compararMeses, mesAnterior, mesDe, mesSeguinte } from '../datas.ts';
import type { MesCaixa } from './resumo.ts';
import type { DataCaixa } from './saldos.ts';

/**
 * Meses do caixa: histórico, navegação e mês futuro (FIN-07, FIN-09, FIN-18, FIN-49). O histórico vai do mês da data
 * do saldo inicial ao mês de hoje, inclusive. "Hoje" chega como parâmetro, já no fuso de São Paulo (o relógio é da
 * API, FIN-49); nenhuma função lê relógio. Molde: `ranking/navegacao.ts`.
 */

export interface LimitesDoCaixa {
  /** Mês da data do saldo inicial; nulo sem configuração. */
  primeiro: MesCaixa | null;
  /** Mês de hoje. */
  ultimo: MesCaixa;
}

export interface NavegacaoDoCaixa {
  mesAnterior: MesCaixa | null;
  mesSeguinte: MesCaixa | null;
}

export const MENSAGEM_MES_FORA_DO_HISTORICO = 'Mês fora do histórico do caixa.';
export const MENSAGEM_MES_FUTURO = 'Não dá para marcar o pagamento de um mês que ainda não começou.';

/**
 * Do mês da data do saldo inicial ao mês de hoje. Sem configuração (`dataSaldoInicial` nulo), só o mês de hoje.
 * [LACUNA] A spec não define o histórico quando a data do saldo inicial cai num mês posterior ao de hoje (o FIN-02 a
 * recusa no futuro, então só aconteceria com relógio voltando): vale só o mês de hoje, a leitura mais conservadora.
 */
export function limitesDoCaixa(dataSaldoInicial: DataCaixa | null, hoje: DataCaixa): LimitesDoCaixa {
  const ultimo = mesDe(hoje);
  if (dataSaldoInicial === null) return { primeiro: null, ultimo };
  const primeiro = mesDe(dataSaldoInicial);
  return { primeiro: compararMeses(primeiro, ultimo) > 0 ? ultimo : primeiro, ultimo };
}

/** Todos os meses do histórico, do mais antigo ao de hoje. */
export function mesesDoCaixa(dataSaldoInicial: DataCaixa | null, hoje: DataCaixa): MesCaixa[] {
  const { primeiro, ultimo } = limitesDoCaixa(dataSaldoInicial, hoje);
  const meses: MesCaixa[] = [];
  for (let mes = primeiro ?? ultimo; compararMeses(mes, ultimo) <= 0; mes = mesSeguinte(mes)) meses.push(mes);
  return meses;
}

/**
 * O mês está no histórico do caixa (FIN-09). Sem configuração, só o mês de hoje.
 * [LACUNA] A spec (FIN-08) só define a resposta sem configuração para o mês padrão; outro mês sem configuração é
 * tratado como fora do histórico (422), a leitura mais conservadora.
 */
export function mesNoHistorico(mes: MesCaixa, dataSaldoInicial: DataCaixa | null, hoje: DataCaixa): boolean {
  const { primeiro, ultimo } = limitesDoCaixa(dataSaldoInicial, hoje);
  if (primeiro === null) return mes === ultimo;
  return compararMeses(mes, primeiro) >= 0 && compararMeses(mes, ultimo) <= 0;
}

/**
 * `mesAnterior` só depois do primeiro mês do histórico; `mesSeguinte` só antes do mês de hoje (FIN-07). Sem
 * configuração, os dois nulos (FIN-08).
 */
export function navegacao(mes: MesCaixa, dataSaldoInicial: DataCaixa | null, hoje: DataCaixa): NavegacaoDoCaixa {
  const { primeiro, ultimo } = limitesDoCaixa(dataSaldoInicial, hoje);
  if (primeiro === null) return { mesAnterior: null, mesSeguinte: null };
  return {
    mesAnterior: compararMeses(mes, primeiro) > 0 ? mesAnterior(mes) : null,
    mesSeguinte: compararMeses(mes, ultimo) < 0 ? mesSeguinte(mes) : null,
  };
}

/** O mês é posterior ao mês de hoje (FIN-18). O mês de hoje não é futuro. */
export function mesFuturo(mes: MesCaixa, hoje: DataCaixa): boolean {
  return compararMeses(mes, mesDe(hoje)) > 0;
}
