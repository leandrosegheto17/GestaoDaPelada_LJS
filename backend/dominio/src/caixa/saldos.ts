import { somarCentavos, subtrairCentavos } from './centavos.ts';

/**
 * Saldo atual do caixa (FIN-10, FIN-13, FIN-49). Datas em texto `AAAA-MM-DD`, que se comparam pela ordem do texto;
 * "hoje" chega como parâmetro, já no fuso de São Paulo (o relógio é da API, GEL-70). Lançamento com data futura só
 * conta quando a data chega (AD-055).
 */

/** Data em `AAAA-MM-DD`. */
export type DataCaixa = string;

/** Configuração do caixa, em centavos inteiros. */
export interface ConfigCaixa {
  mensalidadeCentavos: number | null;
  saldoInicialCentavos: number;
  dataSaldoInicial: DataCaixa;
}

export interface MovimentoCaixa {
  tipo: 'entrada' | 'saida';
  data: DataCaixa;
  valorCentavos: number;
}

export interface Totais {
  entradasCentavos: number;
  saidasCentavos: number;
}

/** Soma das entradas e das saídas, cada uma positiva. */
export function totais(movimentos: readonly MovimentoCaixa[]): Totais {
  return {
    entradasCentavos: somarCentavos(
      movimentos.filter((m) => m.tipo === 'entrada').map((m) => m.valorCentavos),
    ),
    saidasCentavos: somarCentavos(
      movimentos.filter((m) => m.tipo === 'saida').map((m) => m.valorCentavos),
    ),
  };
}

/**
 * Saldo inicial + entradas − saídas dos lançamentos com data entre a data do saldo inicial e hoje, inclusive as
 * duas pontas. Hoje anterior à data inicial: só o saldo inicial.
 */
export function saldoAtual(
  config: ConfigCaixa,
  lancamentos: readonly MovimentoCaixa[],
  hoje: DataCaixa,
): number {
  if (hoje < config.dataSaldoInicial) return config.saldoInicialCentavos;
  const noIntervalo = lancamentos.filter(
    (l) => l.data >= config.dataSaldoInicial && l.data <= hoje,
  );
  const { entradasCentavos, saidasCentavos } = totais(noIntervalo);
  return subtrairCentavos(
    somarCentavos([config.saldoInicialCentavos, entradasCentavos]),
    saidasCentavos,
  );
}
