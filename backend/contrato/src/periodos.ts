import { z } from './zod.ts';

const MENSAGEM_DATA = 'Informe uma data válida.';

/** Texto `AAAA-MM-DD`. Se a data existe, se é futura e as regras de período ficam no domínio (GEL-62, GEL-63). */
const dataTexto = z.string({ error: MENSAGEM_DATA }).regex(/^\d{4}-\d{2}-\d{2}$/, MENSAGEM_DATA);

/** Inativar e reativar: sem data, a rota usa hoje (GEL-52, GEL-55). */
export const dataCorpo = z.strictObject({ data: dataTexto.optional() });

/** Corrigir a saída e/ou o retorno de um período; ao menos uma das duas (GEL-71). */
export const corrigirPeriodoCorpo = z
  .strictObject({ saida: dataTexto.optional(), retorno: dataTexto.optional() })
  .refine((corpo) => corpo.saida !== undefined || corpo.retorno !== undefined, 'Informe a saída ou o retorno.');

/** Alterar a data de início da pontuação (GEL-77). */
export const inicioCorpo = z.strictObject({ data: dataTexto });

const periodo = z.strictObject({ id: z.string().min(1), inicio: dataTexto, fim: dataTexto.nullable() });

/** `alterado: false` com "Nada a alterar." quando as datas enviadas já eram as atuais (GEL-74). */
export const corrigirPeriodoResposta = z.strictObject({
  alterado: z.boolean(),
  mensagem: z.string().optional(),
  periodos: z.array(periodo),
});
export type CorrigirPeriodoResposta = z.infer<typeof corrigirPeriodoResposta>;
