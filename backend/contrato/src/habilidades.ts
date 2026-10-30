import { z } from './zod.ts';
import { LIMITES } from './limites.ts';
import { textoVisivel } from './texto.ts';

const MENSAGEM_NOME = `O nome precisa ter de ${LIMITES.habilidade.min} a ${LIMITES.habilidade.max} caracteres.`;
/** GEL-99. A spec pede só o erro no campo; o texto diz a faixa. */
const MENSAGEM_NOTA = `A nota precisa ser um número inteiro de ${LIMITES.nota.min} a ${LIMITES.nota.max}.`;

/**
 * Nome da habilidade: de 2 a 30 caracteres sem os espaços das pontas (GEL-90), em NFC e sem invisíveis (SEC-005). A
 * unicidade é do repositório.
 */
export const nomeHabilidade = textoVisivel(LIMITES.habilidade.min, LIMITES.habilidade.max, MENSAGEM_NOME);

/** O mesmo corpo serve a criar (POST) e a renomear (PATCH). */
export const habilidadeCorpo = z.strictObject({ nome: nomeHabilidade });

/** Nota inteira de 1 a 10; `null` apaga a nota (GEL-97 a GEL-99). */
export const notaCorpo = z.strictObject({
  nota: z
    .number({ error: MENSAGEM_NOTA })
    .int(MENSAGEM_NOTA)
    .min(LIMITES.nota.min, MENSAGEM_NOTA)
    .max(LIMITES.nota.max, MENSAGEM_NOTA)
    .nullable(),
});

export const habilidadeItem = z.strictObject({ id: z.string().min(1), nome: z.string() });
export type HabilidadeItem = z.infer<typeof habilidadeItem>;

/** Na ordem de cadastro (GEL-88). */
export const listaHabilidades = z.strictObject({ habilidades: z.array(habilidadeItem) });
export type ListaHabilidades = z.infer<typeof listaHabilidades>;

/** Nível recalculado depois de salvar a nota, em centésimos (GEL-97, GEL-101, GEL-102). */
export const notaResposta = z.strictObject({ nivel: z.number().int().min(100).max(1000), semNota: z.boolean() });
export type NotaResposta = z.infer<typeof notaResposta>;
