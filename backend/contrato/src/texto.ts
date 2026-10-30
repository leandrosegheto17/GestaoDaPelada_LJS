import { z } from './zod.ts';

/**
 * Caracteres de controle (`\p{Cc}`: NUL, quebra de linha, tab, DEL, C1) e de formatação invisíveis (`\p{Cf}`: U+200B a
 * U+200F, U+202A a U+202E, U+2066 a U+2069, U+FEFF, hífen suave...). Num nome, eles dão 500 no banco (NUL) ou deixam
 * dois textos iguais na tela com valores diferentes (SEC-005).
 */
const INVISIVEIS = /[\p{Cc}\p{Cf}]/u;

export const MENSAGEM_TEXTO_INVISIVEL = 'Use só caracteres visíveis, sem caracteres de controle ou invisíveis.';

/**
 * Texto livre que aparece para outras pessoas (nome do grupo, apelido, nome da habilidade): sem os espaços das pontas,
 * normalizado em NFC (o tamanho e a unicidade contam o texto já normalizado), sem caracteres de controle nem
 * invisíveis no meio (SEC-005) e com o tamanho de `min` a `max`, com a mesma mensagem de tamanho de antes.
 */
export function textoVisivel(min: number, max: number, mensagemTamanho: string) {
  return z
    .string({ error: mensagemTamanho })
    .trim()
    .normalize('NFC')
    .refine((valor) => !INVISIVEIS.test(valor), { error: MENSAGEM_TEXTO_INVISIVEL, abort: true })
    .min(min, mensagemTamanho)
    .max(max, mensagemTamanho);
}
