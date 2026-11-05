import { z } from 'zod';
import { ehDataDoCalendario, MENSAGEM_DATA_INVALIDA } from './elenco.ts';

/**
 * Contrato do simulador (T21; SIM-01, SIM-04, SIM-09, SIM-55): contexto e prévia. Tudo `strictObject`: campo
 * desconhecido é recusado (`S:75`). Formas do legado `contrato/src/simulador/contexto.ts`, `previa.ts` e
 * `entrada.ts:24-30`, escritas do zero, com o nível inteiro × 100 (GEL-101) e `semAno` (SIM-95).
 * SPEC_DEVIATION: a tarefa cita a data real do contrato de partidas (`PR:889`), que ainda não existe; a data usa o
 * `ehDataDoCalendario` do contrato de elenco, a mesma regra.
 */

export const LIMITES_SIMULADOR = { nMin: 2, nMax: 11, kMin: 0, kMax: 20, aptosMax: 60 } as const;

export const MENSAGEM_N = `Informe um número inteiro de ${LIMITES_SIMULADOR.nMin} a ${LIMITES_SIMULADOR.nMax}.`;
export const MENSAGEM_K = `Informe um número inteiro de ${LIMITES_SIMULADOR.kMin} a ${LIMITES_SIMULADOR.kMax} ou "ilimitado".`;
export const MENSAGEM_FORMATO = 'Escolha o formato.';
export const MENSAGEM_APTOS_REPETIDO = 'Há jogador repetido nos aptos.';
export const MENSAGEM_APTOS_INATIVOS = 'Há jogadores que não estão ativos no grupo nesta data.';

/** `AAAA-MM-DD` que existe no calendário (SIM-04). */
export const dataSimulador = z
  .string({ error: MENSAGEM_DATA_INVALIDA })
  .refine(ehDataDoCalendario, { error: MENSAGEM_DATA_INVALIDA });

/** Jogadores por time: inteiro de 2 a 11 (SIM-55). */
export const nSimulador = z
  .number({ error: MENSAGEM_N })
  .int(MENSAGEM_N)
  .min(LIMITES_SIMULADOR.nMin, MENSAGEM_N)
  .max(LIMITES_SIMULADOR.nMax, MENSAGEM_N);

/** Substituições por time: inteiro de 0 a 20, ou sem limite (SIM-55). */
export const kSimulador = z.union(
  [
    z.number().int().min(LIMITES_SIMULADOR.kMin).max(LIMITES_SIMULADOR.kMax),
    z.literal('ilimitado'),
  ],
  { error: MENSAGEM_K },
);

/**
 * Id de jogador vindo do corpo. Um id que nem é UUID não é jogador do grupo: mesma mensagem do apto inativo (SIM-54),
 * sem revelar nada (SIM-80).
 */
export const idJogadorCorpo = z.uuid({ error: MENSAGEM_APTOS_INATIVOS });

/** Id de jogador numa resposta. */
export const idJogadorResposta = z.string().min(1);

const semRepeticao = (lista: readonly { id: string }[]): boolean => new Set(lista.map((a) => a.id)).size === lista.length;

/**
 * Lista de aptos: até 60 e sem repetido (SIM-53). Vazia é aceita: a prévia e a sugestão a descrevem como insuficiente
 * ("Faltam aptos para 2 times."), sem mensagem nova.
 * [LACUNA] SIM-53 dá a mesma mensagem ("Há jogador repetido nos aptos.") para mais de 60 aptos e para repetido; vale o
 * texto da spec nos dois casos.
 */
function listaDeAptos<T extends z.ZodType<{ id: string }>>(apto: T) {
  return z
    .array(apto)
    .max(LIMITES_SIMULADOR.aptosMax, MENSAGEM_APTOS_REPETIDO)
    .refine(semRepeticao, { error: MENSAGEM_APTOS_REPETIDO });
}

/** Apto em 2 times: com "só 1º tempo". */
export const aptoDois = z.strictObject({ id: idJogadorCorpo, so1oTempo: z.boolean() });
/** Apto em 3 ou mais: só o id (SIM-33). */
export const aptoVarios = z.strictObject({ id: idJogadorCorpo });

export const aptosDois = listaDeAptos(aptoDois);
export const aptosVarios = listaDeAptos(aptoVarios);

/** `GET …/simulador/contexto?data=`: sem data, o próximo dia de jogo (SIM-01, SIM-02). */
export const consultaContexto = z.strictObject({ data: dataSimulador.optional() });
export type ConsultaContexto = z.infer<typeof consultaContexto>;

const dataResposta = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Nível em centésimos (683 = 6,8 na tela), como na lista de jogadores. */
const nivelResposta = z.number().int().min(100).max(1000);

/** Ativo na data como o simulador o mostra: sem telefone, ano, posição, notas nem pontos (SIM-03). */
export const jogadorContexto = z.strictObject({
  id: idJogadorResposta,
  apelido: z.string(),
  nivel: nivelResposta,
  semNota: z.boolean(),
  semAno: z.boolean(),
});

export const contextoResposta = z.strictObject({
  dataSugerida: dataResposta,
  hoje: dataResposta,
  jogadores: z.array(jogadorContexto),
});
export type ContextoResposta = z.infer<typeof contextoResposta>;

/** `POST …/simulador/previa`: não precisa da data (SIM-09); `k` só em 2 times. */
export const previaCorpo = z.discriminatedUnion(
  'formato',
  [
    z.strictObject({ formato: z.literal('dois_times'), n: nSimulador, k: kSimulador, aptos: aptosDois }),
    z.strictObject({ formato: z.literal('varios_times'), n: nSimulador, aptos: aptosVarios }),
  ],
  { error: MENSAGEM_FORMATO },
);
export type PreviaCorpo = z.infer<typeof previaCorpo>;

const contagem = z.number().int().min(0);
const descricao = z.string().min(1);
const motivo = z.literal('aptos_insuficientes');

/** A prévia com o texto pronto em `descricao` (SIM-10 a SIM-13). */
export const previaResposta = z.union([
  z.strictObject({ formato: z.literal('dois_times'), valida: z.literal(true), descricao, times: z.literal(2), reservas: contagem }),
  z.strictObject({
    formato: z.literal('dois_times'),
    valida: z.literal(false),
    motivo,
    descricao,
    maiorNPossivel: contagem.nullable(),
  }),
  z.strictObject({
    formato: z.literal('varios_times'),
    valida: z.literal(true),
    descricao,
    times: contagem,
    timesCompletos: contagem,
    tamanhoIncompleto: contagem,
  }),
  z.strictObject({
    formato: z.literal('varios_times'),
    valida: z.literal(false),
    motivo,
    descricao,
    nSugerido: contagem.nullable(),
    doisTimesPossivel: z.boolean(),
  }),
]);
export type PreviaResposta = z.infer<typeof previaResposta>;
