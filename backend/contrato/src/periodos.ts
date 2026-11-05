import { z } from 'zod';
import { MENSAGEM_DATA_INVALIDA, periodoItem } from './elenco.ts';
import { textoVisivel } from './grupo.ts';

/**
 * Contrato de períodos, habilidades e notas (T18; GEL-52, GEL-55, GEL-90, GEL-99, SEC-005). Formas de `GD:140-142`,
 * mensagens de `GS:313` e `GS:335`. O zod só confere a forma da data: se ela existe, se é futura e as regras de
 * período (ordem, sobreposição, presença) são do domínio (GEL-62, GEL-63), para a primeira falha sair na ordem da spec.
 */

/** Texto `AAAA-MM-DD`; o calendário e o resto ficam no domínio. */
const dataTexto = z.string({ error: MENSAGEM_DATA_INVALIDA }).regex(/^\d{4}-\d{2}-\d{2}$/, MENSAGEM_DATA_INVALIDA);

/** Inativar e reativar: sem data, a rota usa hoje (GEL-52, GEL-55). */
export const dataCorpo = z.object({ data: dataTexto.optional() }).strict();
export type DataCorpo = z.infer<typeof dataCorpo>;

export const MENSAGEM_SAIDA_OU_RETORNO = 'Informe a saída ou o retorno.';

/** Corrigir a saída e/ou o retorno de um período (GEL-71); ao menos uma das duas. */
export const corrigirPeriodoCorpo = z
  .object({ saida: dataTexto.optional(), retorno: dataTexto.optional() })
  .strict()
  .refine((corpo) => corpo.saida !== undefined || corpo.retorno !== undefined, { error: MENSAGEM_SAIDA_OU_RETORNO });
export type CorrigirPeriodoCorpo = z.infer<typeof corrigirPeriodoCorpo>;

/** Alterar a data de início da pontuação (GEL-77): a data é obrigatória. */
export const inicioCorpo = z.object({ data: dataTexto }).strict();
export type InicioCorpo = z.infer<typeof inicioCorpo>;

/** `alterado: false` quando as datas enviadas já eram as atuais (GEL-74, GEL-82). */
export const corrigirPeriodoResposta = z
  .object({ alterado: z.boolean(), mensagem: z.string().optional(), periodos: z.array(periodoItem) })
  .strict();
export type CorrigirPeriodoResposta = z.infer<typeof corrigirPeriodoResposta>;

export const LIMITES_HABILIDADE = { nomeMin: 2, nomeMax: 30, notaMin: 1, notaMax: 10 } as const;

export const MENSAGEM_NOME_HABILIDADE = `O nome precisa ter de ${LIMITES_HABILIDADE.nomeMin} a ${LIMITES_HABILIDADE.nomeMax} caracteres.`;
/** GEL-99: a spec pede só o erro no campo; o texto diz a faixa. */
export const MENSAGEM_NOTA = `A nota precisa ser um número inteiro de ${LIMITES_HABILIDADE.notaMin} a ${LIMITES_HABILIDADE.notaMax}.`;

/** Nome da habilidade: 2 a 30 depois do trim (GEL-90), em NFC e sem invisíveis (SEC-005). A unicidade é do repositório. */
export const nomeHabilidade = textoVisivel(
  LIMITES_HABILIDADE.nomeMin,
  LIMITES_HABILIDADE.nomeMax,
  MENSAGEM_NOME_HABILIDADE,
);

/** O mesmo corpo cria (POST) e renomeia (PATCH). */
export const habilidadeCorpo = z.object({ nome: nomeHabilidade }).strict();
export type HabilidadeCorpo = z.infer<typeof habilidadeCorpo>;

/** Nota inteira de 1 a 10; `null` apaga a nota (GEL-97, GEL-98, GEL-99). Obrigatória: ausente é erro. */
export const notaCorpo = z
  .object({
    nota: z
      .number({ error: MENSAGEM_NOTA })
      .int(MENSAGEM_NOTA)
      .min(LIMITES_HABILIDADE.notaMin, MENSAGEM_NOTA)
      .max(LIMITES_HABILIDADE.notaMax, MENSAGEM_NOTA)
      .nullable(),
  })
  .strict();
export type NotaCorpo = z.infer<typeof notaCorpo>;

export const habilidadeItem = z.object({ id: z.string().min(1), nome: z.string() }).strict();
export type HabilidadeItem = z.infer<typeof habilidadeItem>;

/** Na ordem de cadastro (GEL-88). */
export const listaHabilidades = z.object({ habilidades: z.array(habilidadeItem) }).strict();
export type ListaHabilidades = z.infer<typeof listaHabilidades>;

/** Nível depois de gravar a nota, em centésimos (GEL-97, GEL-101, GEL-102). */
export const notaResposta = z.object({ nivel: z.number().int().min(100).max(1000), semNota: z.boolean() }).strict();
export type NotaResposta = z.infer<typeof notaResposta>;
