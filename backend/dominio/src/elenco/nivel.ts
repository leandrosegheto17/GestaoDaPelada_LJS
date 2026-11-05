/**
 * Nível do jogador, habilidades iniciais do grupo e limite do ano de nascimento (GEL-02, GEL-36, GEL-101, GEL-102).
 * Funções puras: "hoje" chega como parâmetro (GEL-70, GEL-104).
 */

/** As 6 habilidades que todo grupo novo ganha, nesta ordem (GEL-02). */
export const HABILIDADES_INICIAIS: readonly string[] = [
  'Visão de Jogo',
  'Passe',
  'Preparo Físico',
  'Drible',
  'Chute',
  'Desarme',
];

/** Nível de quem não tem nenhuma nota (GEL-102). */
export const NIVEL_SEM_NOTA = 550;

export interface Nivel {
  /** Média das notas × 100, inteiro com meio para cima (683 = 6,83). */
  nivel: number;
  semNota: boolean;
}

/**
 * Média das notas existentes × 100, arredondada para o inteiro com meio para cima (GEL-101). Conta em inteiros:
 * `floor((200 × soma + n) / 2n)` é `round(100 × soma / n)` com meio para cima, sem erro de ponto flutuante.
 * Sem notas: 550 e `semNota` (GEL-102).
 */
export function calcularNivel(notas: readonly number[]): Nivel {
  if (notas.length === 0) return { nivel: NIVEL_SEM_NOTA, semNota: true };
  const soma = notas.reduce((total, nota) => total + nota, 0);
  const n = notas.length;
  return { nivel: Math.floor((200 * soma + n) / (2 * n)), semNota: false };
}

/** Menor ano de nascimento aceito (GEL-36). */
export const ANO_NASCIMENTO_MINIMO = 1940;

/** Maior ano de nascimento aceito: o ano de hoje − 10 (GEL-36). `hoje` em `AAAA-MM-DD`. */
export function anoNascimentoMaximo(hoje: string): number {
  return Number(hoje.slice(0, 4)) - 10;
}
