/**
 * `pagoAte` a partir do vencimento da cobrança paga (T3; PLA-44, AD-096): vencimento + 1 mês, com o dia limitado ao
 * último dia do mês seguinte. Sem relógio.
 *
 * Casos limite (Domínio: sim): 31/01 → 28/02 (ou 29/02 em ano bissexto); 29/02 → 29/03; 30/11 → 30/12;
 * 31/12 → 31/01 do ano seguinte; 31/03 → 30/04.
 */
import type { Data } from '../atividade/datas.ts';
import { mesDe, mesSeguinte, ultimoDia } from '../datas.ts';

export function pagoAteDe(vencimento: Data): Data {
  const dia = vencimento.slice(8, 10);
  const proximo = mesSeguinte(mesDe(vencimento));
  const limite = ultimoDia(proximo);
  const candidato = `${proximo}-${dia}`;
  return candidato > limite ? limite : candidato;
}
