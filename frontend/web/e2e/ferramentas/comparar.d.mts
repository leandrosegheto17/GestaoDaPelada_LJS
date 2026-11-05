/** Tipos de `comparar.mjs` (FUN-38), para os testes e o runner em TypeScript. */

export declare const LIMITE_PADRAO: number;
export declare const LIMIAR_PADRAO: number;

export interface ResultadoComparacao {
  passou: boolean;
  /** Pixels diferentes; `null` quando os tamanhos não batem. */
  diferentes: number | null;
  total: number | null;
  proporcao: number;
  mensagem: string;
  /** PNG da diferença (vermelho = diferente); `null` quando os tamanhos não batem. */
  diff: Buffer | null;
}

export declare function porcentagem(proporcao: number): string;

export declare function compararPng(
  pngA: Buffer | Uint8Array,
  pngB: Buffer | Uint8Array,
  opcoes?: { limite?: number; limiar?: number },
): ResultadoComparacao;
