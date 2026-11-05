import { formatarData } from '../elenco/apelido.ts';
import { ehDataValida, ehFutura, MENSAGEM_DATA_INVALIDA, MENSAGEM_FUTURO, type Data, type Periodo } from './datas.ts';

/**
 * Avaliação da data de início da pontuação (GEL-77 a GEL-82). Regras, nesta ordem: data válida, piso de 01/01/2000
 * (GEL-78), não futura (GEL-79), não depois da saída do primeiro período (GEL-80); data igual à atual não grava
 * (GEL-82); data anterior ao início do primeiro período move esse início, sem mexer nos encerrados (GEL-81).
 */

export const PISO_INICIO: Data = '2000-01-01';
export const MENSAGEM_ANTES_DO_PISO = 'A data de início não pode ser anterior a 01/01/2000.';

export type RegraInicio = 'data-invalida' | 'antes-do-piso' | 'futuro' | 'depois-da-saida-do-primeiro';

export interface FalhaInicio {
  ok: false;
  regra: RegraInicio;
  mensagem: string;
  campo: 'data';
}

export interface EntradaInicio {
  /** Os períodos do jogador, em ordem de início. */
  periodos: readonly Periodo[];
  /** `jogadores.inicio_pontuacao`; nulo = início do primeiro período. */
  inicioPontuacao: Data | null;
  novaData: unknown;
  hoje: Data;
}

export type ResultadoInicio =
  | { ok: true; alterado: false; inicioPontuacao: Data; periodos: Periodo[] }
  | { ok: true; alterado: true; anterior: Data; inicioPontuacao: Data; periodos: Periodo[] }
  | FalhaInicio;

function falha(regra: RegraInicio, mensagem: string): FalhaInicio {
  return { ok: false, regra, mensagem, campo: 'data' };
}

export function avaliarInicio(entrada: EntradaInicio): ResultadoInicio {
  const { periodos, inicioPontuacao, novaData, hoje } = entrada;
  const primeiro = periodos[0];
  if (!ehDataValida(novaData)) return falha('data-invalida', MENSAGEM_DATA_INVALIDA);
  if (novaData < PISO_INICIO) return falha('antes-do-piso', MENSAGEM_ANTES_DO_PISO);
  if (ehFutura(novaData, hoje)) return falha('futuro', MENSAGEM_FUTURO);
  if (primeiro && primeiro.fim !== null && novaData > primeiro.fim) {
    return falha(
      'depois-da-saida-do-primeiro',
      `A data de início não pode ficar depois da saída do primeiro período (${formatarData(
        primeiro.fim,
      )}). Corrija antes a data de saída do primeiro período.`,
    );
  }

  const copia = periodos.map((p) => ({ ...p }));
  const atual = inicioPontuacao ?? primeiro?.inicio ?? novaData;
  if (novaData === atual) return { ok: true, alterado: false, inicioPontuacao: atual, periodos: copia };

  const novoPrimeiro = copia[0];
  if (novoPrimeiro && novaData < novoPrimeiro.inicio) novoPrimeiro.inicio = novaData;
  return { ok: true, alterado: true, anterior: atual, inicioPontuacao: novaData, periodos: copia };
}
