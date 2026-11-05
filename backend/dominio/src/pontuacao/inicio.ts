/**
 * Início da contagem de pontos de um jogador numa data X (T4; PAR-57). Quem saiu e voltou recomeça a contagem no
 * retorno (legado, `B:60`).
 */
import type { Data } from '../atividade/datas.ts';
import { compararDatas } from '../datas.ts';

/**
 * O início da contagem em `em` (PAR-57): a data de início da pontuação S quando o período mais recente com início até
 * `em` é o primeiro (ou não há período, ou nenhum começou até `em`); o início desse período (o retorno) quando ele não
 * é o primeiro. Os períodos chegam em qualquer ordem. Sem S e sem retorno, `undefined`: sem limite inferior.
 */
export function inicioDaContagem(
  inicio: Data | undefined,
  periodos: readonly { inicio: Data }[] | undefined,
  em: Data,
): Data | undefined {
  if (periodos === undefined || periodos.length === 0) return inicio;
  let primeiro = (periodos[0] as { inicio: Data }).inicio;
  let atual: Data | undefined;
  for (const periodo of periodos) {
    if (compararDatas(periodo.inicio, primeiro) < 0) primeiro = periodo.inicio;
    if (
      compararDatas(periodo.inicio, em) <= 0 &&
      (atual === undefined || compararDatas(periodo.inicio, atual) > 0)
    ) {
      atual = periodo.inicio;
    }
  }
  return atual !== undefined && atual !== primeiro ? atual : inicio;
}
