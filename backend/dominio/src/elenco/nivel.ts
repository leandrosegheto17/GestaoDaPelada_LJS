/** Nível de quem ainda não tem nota: o meio da escala, em centésimos de ponto (5,50) (GEL-102). */
export const NIVEL_SEM_NOTA = 550;

export interface Nivel {
  /** Média das notas × 100, em inteiro. */
  nivel: number;
  semNota: boolean;
}

/** Divisão inteira com o meio arredondado para cima: `floor((2 · numerador + denominador) / (2 · denominador))`. */
function dividirMeioParaCima(numerador: number, denominador: number): number {
  return Math.floor((2 * numerador + denominador) / (2 * denominador));
}

/**
 * Nível = média das notas × 100, com meio arredondado para cima, só em inteiros (GEL-101).
 * Ex.: notas 8, 7, 6, 7, 8, 5 → 683. Sem notas, vale `NIVEL_SEM_NOTA` e `semNota` é verdadeiro.
 */
export function calcularNivel(notas: readonly number[]): Nivel {
  const n = notas.length;
  if (n === 0) return { nivel: NIVEL_SEM_NOTA, semNota: true };
  const soma = notas.reduce((total, nota) => total + nota, 0);
  return { nivel: dividirMeioParaCima(100 * soma, n), semNota: false };
}
