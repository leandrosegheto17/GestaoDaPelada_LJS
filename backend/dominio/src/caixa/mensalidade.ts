import type { MesCaixa } from './resumo.ts';
import type { ConfigCaixa, DataCaixa } from './saldos.ts';

/**
 * Lançamento de entrada criado ao marcar o pagamento da mensalidade (FIN-16, FIN-17). A data é a de hoje (regime de
 * caixa: o dinheiro entra no dia em que é marcado) e o valor é o da configuração, nunca do cliente. Sem mensalidade
 * configurada, ou sem configuração, só a marcação vale: `null`.
 */

export interface EntradaDaMensalidade {
  tipo: 'entrada';
  data: DataCaixa;
  descricao: string;
  valorCentavos: number;
}

export function entradaDaMensalidade(
  config: ConfigCaixa | null,
  apelido: string,
  mes: MesCaixa,
  hoje: DataCaixa,
): EntradaDaMensalidade | null {
  if (config === null || config.mensalidadeCentavos === null) return null;
  const [ano, numeroMes] = mes.split('-');
  return {
    tipo: 'entrada',
    data: hoje,
    descricao: `Mensalidade ${apelido} ${numeroMes}/${ano}`,
    valorCentavos: config.mensalidadeCentavos,
  };
}
