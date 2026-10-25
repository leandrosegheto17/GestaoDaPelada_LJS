/** Limites de entrada, definidos uma vez e usados pelos dois lados (API e tela). */
export const LIMITES = {
  apelido: { min: 2, max: 30 },
  nomeGrupo: { min: 3, max: 60 },
  habilidade: { min: 2, max: 30 },
  nomeAdmin: { min: 2, max: 60 },
  emailMax: 254,
  senha: { min: 8, max: 72, bytesMax: 72 },
  anoNascimentoMin: 1940,
  idadeMinima: 10,
  peso: { min: -10, max: 10 },
  pontuacaoInicial: { min: 0, max: 9999 },
  jogadoresPorTime: { min: 2, max: 11 },
  substituicoes: { min: 0, max: 20 },
  aptosMax: 60,
  nota: { min: 1, max: 10 },
  descricaoLancamento: { min: 1, max: 80 },
  valorCentavos: { min: 1, max: 99_999_999 },
  saldoInicialCentavos: { min: -99_999_999, max: 99_999_999 },
  slug: { min: 1, max: 64 },
  corpoBytes: 16 * 1024,
  corpoPublicoBytes: 1024,
} as const;

const codificador = new TextEncoder();

/** Tamanho em bytes UTF-8 (o bcrypt só considera os 72 primeiros). */
export function bytesUtf8(texto: string): number {
  return codificador.encode(texto).length;
}
