import { compararDatas, ehDataValida, exigirData, type Data } from '../datas.ts';
import { formatarData, type PeriodoEntrada } from './atividade.ts';
import { emOrdem, MENSAGEM_DATA_INVALIDA, MENSAGEM_FUTURO } from './validar-periodos.ts';

/** Primeira data aceita como início da pontuação (GEL-78). */
export const PISO_INICIO: Data = '2000-01-01';

export type RegraInicio = 'data-invalida' | 'antes-do-piso' | 'futuro' | 'depois-da-saida-do-primeiro';

export interface FalhaInicio {
  ok: false;
  regra: RegraInicio;
  campo: 'data';
  mensagem: string;
}

export interface EntradaInicio {
  /** A nova data de início pedida. */
  data: unknown;
  /** Os períodos do jogador como estão gravados, em qualquer ordem. */
  periodos: readonly PeriodoEntrada[];
  /** `jogadores.inicio_pontuacao` atual. */
  inicioAtual: Data;
  /** Hoje em São Paulo, vindo de fora: o domínio não lê relógio. */
  hoje: Data;
}

export type ResultadoInicio =
  | {
      ok: true;
      /** `false` quando a data é a atual: nada a gravar nem auditar (GEL-82). */
      alterado: boolean;
      /** A data recua antes do início do primeiro período, que passa a começar nela (GEL-81). */
      recuarPrimeiroPeriodo: boolean;
      /** Os períodos depois da mudança, em ordem cronológica. */
      periodos: PeriodoEntrada[];
    }
  | FalhaInicio;

const falha = (regra: RegraInicio, mensagem: string): FalhaInicio => ({ ok: false, regra, campo: 'data', mensagem });

/**
 * Regras de alterar a data de início da pontuação (GEL-78 a GEL-82), nesta ordem: data válida, piso de 01/01/2000,
 * não futura e não depois da saída do primeiro período. Data anterior ao início do primeiro período o recua; os
 * outros períodos não mudam. Não altera a entrada.
 */
export function avaliarInicio(entrada: EntradaInicio): ResultadoInicio {
  exigirData(entrada.hoje, 'Hoje');
  const { data } = entrada;
  if (!ehDataValida(data)) return falha('data-invalida', MENSAGEM_DATA_INVALIDA);
  if (compararDatas(data, PISO_INICIO) < 0) {
    return falha('antes-do-piso', 'A data de início não pode ser anterior a 01/01/2000.');
  }
  if (compararDatas(data, entrada.hoje) > 0) return falha('futuro', MENSAGEM_FUTURO);
  const periodos = emOrdem(entrada.periodos);
  const primeiro = periodos[0];
  if (primeiro?.fim != null && compararDatas(data, primeiro.fim) > 0) {
    return falha(
      'depois-da-saida-do-primeiro',
      `A data de início não pode ficar depois da saída do primeiro período (${formatarData(primeiro.fim)}). Corrija antes a data de saída do primeiro período.`,
    );
  }
  const recuar = primeiro !== undefined && compararDatas(data, primeiro.inicio) < 0;
  if (recuar) periodos[0] = { ...primeiro, inicio: data };
  return { ok: true, alterado: data !== entrada.inicioAtual, recuarPrimeiroPeriodo: recuar, periodos };
}
