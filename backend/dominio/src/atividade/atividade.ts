import { compararDatas, exigirData, type Data } from '../datas.ts';

/**
 * Período de atividade em intervalo semiaberto `[inicio, fim)` (GEL-61): o jogador está ativo quando
 * `inicio ≤ data` e (`fim` nulo ou `data < fim`). Inativar e reativar no mesmo dia gera `[a, d)` e `[d, ∞)`,
 * sem sobreposição. `fim` nulo = período aberto (jogador ativo, GEL-50).
 */
export interface Periodo {
  inicio: Data;
  fim: Data | null;
}

/** Período como está gravado, com o id que a correção de datas aponta. */
export interface PeriodoEntrada extends Periodo {
  id: string;
}

export function ativoEm(periodos: readonly Periodo[], data: Data): boolean {
  return periodos.some((p) => compararDatas(p.inicio, data) <= 0 && (p.fim === null || compararDatas(data, p.fim) < 0));
}

/** Os dois intervalos se cruzam: nenhum termina antes (ou no dia) em que o outro começa. */
export function sobrepoem(a: Periodo, b: Periodo): boolean {
  const aAntesDeB = a.fim !== null && compararDatas(a.fim, b.inicio) <= 0;
  const bAntesDeA = b.fim !== null && compararDatas(b.fim, a.inicio) <= 0;
  return !aAntesDeB && !bAntesDeA;
}

/** `AAAA-MM-DD` → `dd/mm/aaaa`, para as mensagens. Recusa o que não é data real. */
export function formatarData(iso: Data): string {
  exigirData(iso);
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
