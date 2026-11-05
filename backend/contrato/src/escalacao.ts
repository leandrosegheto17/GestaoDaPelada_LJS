import { z } from 'zod';
import {
  composicaoDois,
  composicaoVarios,
  dataSimulador,
  idsDaComposicao,
  kSimulador,
  MENSAGEM_FORMATO,
  MENSAGEM_REPETIDO_NA_COMPOSICAO,
  nSimulador,
  type Escalada,
} from './simulador.ts';

/**
 * Contrato da escalação (T23; SIM-67, SIM-82, SIM-94). Formas do legado `contrato/src/simulador/escalacao.ts` e
 * `aplicacao/simulador/composicao.ts:4-11`, escritas do zero. As composições (`composicaoDois`, `composicaoVarios`)
 * vivem em `simulador.ts` (o `avaliarCorpo` as usa) e guardam só ids e "só 1º tempo" (SIM-82); aqui a composição
 * gravada é a mesma forma, lida com tolerância do banco.
 */

function recusarRepetidos(corpo: Escalada, contexto: z.RefinementCtx): void {
  const ids = idsDaComposicao(corpo);
  if (new Set(ids).size !== ids.length) {
    contexto.addIssue({ code: 'custom', path: ['composicao'], message: MENSAGEM_REPETIDO_NA_COMPOSICAO });
  }
}

/**
 * `POST …/escalacoes` (SIM-67): formato, data, N, K (só em 2 times) e a composição, sem jogador repetido. Jogador
 * inativo na data é conferido na rota (SIM-71), que precisa do banco.
 */
export const escalacaoCorpo = z.discriminatedUnion(
  'formato',
  [
    z
      .strictObject({
        formato: z.literal('dois_times'),
        data: dataSimulador,
        n: nSimulador,
        k: kSimulador,
        composicao: composicaoDois,
      })
      .superRefine(recusarRepetidos),
    z
      .strictObject({
        formato: z.literal('varios_times'),
        data: dataSimulador,
        n: nSimulador,
        composicao: composicaoVarios,
      })
      .superRefine(recusarRepetidos),
  ],
  { error: MENSAGEM_FORMATO },
);
export type EscalacaoCorpo = z.infer<typeof escalacaoCorpo>;

/** Resposta do 201: a data e o momento da confirmação (SIM-67). */
export const escalacaoResposta = z.strictObject({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  confirmadaEm: z.iso.datetime(),
});
export type EscalacaoResposta = z.infer<typeof escalacaoResposta>;

/** A composição como fica no banco: só ids e "só 1º tempo", por formato (SIM-82). */
export const composicaoGravada = {
  dois_times: composicaoDois,
  varios_times: composicaoVarios,
} as const;

/**
 * Valida o `jsonb` lido do banco com o schema do contrato; forma inválida (dado antigo) volta nulo, sem lançar, e a
 * escalação é tratada como inexistente (SIM-94).
 */
export function lerComposicao(formato: 'dois_times' | 'varios_times', json: unknown): Escalada | null {
  if (formato === 'varios_times') {
    const lida = composicaoVarios.safeParse(json);
    return lida.success ? { formato, composicao: lida.data } : null;
  }
  const lida = composicaoDois.safeParse(json);
  return lida.success ? { formato, composicao: lida.data } : null;
}
