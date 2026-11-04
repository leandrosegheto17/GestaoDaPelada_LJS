export const LIMITE_PADRAO: number;
export interface ResultadoComparacao {
  ok: boolean;
  diferenca: number;
  mensagem: string;
  imagemDiferenca?: Buffer;
}
export function compararImagens(
  a: Buffer,
  b: Buffer,
  opcoes?: { limite?: number },
): ResultadoComparacao;
