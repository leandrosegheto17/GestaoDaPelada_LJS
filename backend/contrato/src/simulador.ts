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
    // A mensagem vai em cada regra: o zod devolve a do ramo que quase serviu, não a da união.
    z
      .number({ error: MENSAGEM_K })
      .int(MENSAGEM_K)
      .min(LIMITES_SIMULADOR.kMin, MENSAGEM_K)
      .max(LIMITES_SIMULADOR.kMax, MENSAGEM_K),
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

const semRepeticao = (lista: readonly { id: string }[]): boolean =>
  new Set(lista.map((a) => a.id)).size === lista.length;

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
    z.strictObject({
      formato: z.literal('dois_times'),
      n: nSimulador,
      k: kSimulador,
      aptos: aptosDois,
    }),
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
  z.strictObject({
    formato: z.literal('dois_times'),
    valida: z.literal(true),
    descricao,
    times: z.literal(2),
    reservas: contagem,
  }),
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

/*
 * Sugerir e avaliar (T22; SIM-33, SIM-47, SIM-53, SIM-55, SIM-62, SIM-82). Formas do legado
 * `contrato/src/simulador/entrada.ts` e `resultado.ts`, escritas do zero. Em 3 ou mais não há `k` nem `so1oTempo`
 * (SIM-33): o `strictObject` recusa os dois. A resposta traz de cada jogador só id, apelido, nível, `semNota`,
 * `semAno` e "só 1º tempo" (SIM-82); `saiNoIntervalo` é a marcação da troca, não dado do jogador.
 */

export const MENSAGEM_REPETIDO_NA_COMPOSICAO = 'Há jogador repetido na composição.';
export const MENSAGEM_FORA_DOS_APTOS = 'Há jogador fora dos aptos na composição.';
export const MENSAGEM_FALTA_APTO_NA_COMPOSICAO = 'A composição precisa incluir todos os aptos.';

/** `POST …/simulador/sugerir`: a prévia mais a data da partida (SIM-47). */
export const sugerirCorpo = z.discriminatedUnion(
  'formato',
  [
    z.strictObject({
      formato: z.literal('dois_times'),
      data: dataSimulador,
      n: nSimulador,
      k: kSimulador,
      aptos: aptosDois,
    }),
    z.strictObject({
      formato: z.literal('varios_times'),
      data: dataSimulador,
      n: nSimulador,
      aptos: aptosVarios,
    }),
  ],
  { error: MENSAGEM_FORMATO },
);
export type SugerirCorpo = z.infer<typeof sugerirCorpo>;

/** Jogador na composição de 2 times: só o id e o "só 1º tempo". */
export const jogadorNaComposicao = z.strictObject({ id: idJogadorCorpo, so1oTempo: z.boolean() });

const maxAptos = LIMITES_SIMULADOR.aptosMax;

const timeDoisComposicao = z.strictObject({
  titulares: z.array(jogadorNaComposicao).max(maxAptos),
  entramNo2oTempo: z.array(jogadorNaComposicao).max(maxAptos),
});

/** Composição de 2 times: os dois times e "não entra" (só ids e "só 1º", SIM-82). */
export const composicaoDois = z.strictObject({
  times: z.tuple([timeDoisComposicao, timeDoisComposicao]),
  naoEntra: z.array(idJogadorCorpo).max(maxAptos),
});
export type ComposicaoDoisContrato = z.infer<typeof composicaoDois>;

/** Composição de 3 ou mais: os times com os ids. */
export const composicaoVarios = z.strictObject({
  times: z
    .array(z.strictObject({ jogadores: z.array(idJogadorCorpo).max(maxAptos) }))
    .max(maxAptos),
});
export type ComposicaoVariosContrato = z.infer<typeof composicaoVarios>;

/** Formato e composição de uma escalação. */
export type Escalada =
  | { formato: 'dois_times'; composicao: ComposicaoDoisContrato }
  | { formato: 'varios_times'; composicao: ComposicaoVariosContrato };

/** Ids da composição: titulares, reservas e "não entra" (2 times), ou todos os times. */
export function idsDaComposicao(escalada: Escalada): string[] {
  if (escalada.formato === 'varios_times')
    return escalada.composicao.times.flatMap((t) => t.jogadores);
  const { times, naoEntra } = escalada.composicao;
  return [
    ...times.flatMap((t) => [...t.titulares, ...t.entramNo2oTempo].map((j) => j.id)),
    ...naoEntra,
  ];
}

/** Repetido, depois fora dos aptos, depois falta de apto (SIM-63, AD-123); nulo quando passa. */
function problemaNaComposicao(
  ids: readonly string[],
  aptos: readonly { id: string }[],
): string | null {
  if (new Set(ids).size !== ids.length) return MENSAGEM_REPETIDO_NA_COMPOSICAO;
  const permitidos = new Set(aptos.map((a) => a.id));
  if (!ids.every((id) => permitidos.has(id))) return MENSAGEM_FORA_DOS_APTOS;
  // AD-123: a composição cobre todos os aptos (como o legado); repetido e fora dos aptos já foram recusados.
  return ids.length < permitidos.size ? MENSAGEM_FALTA_APTO_NA_COMPOSICAO : null;
}

function conferirComposicao(
  corpo: Escalada & { aptos: readonly { id: string }[] },
  contexto: z.RefinementCtx,
): void {
  const problema = problemaNaComposicao(idsDaComposicao(corpo), corpo.aptos);
  if (problema) contexto.addIssue({ code: 'custom', path: ['composicao'], message: problema });
}

/** `POST …/simulador/avaliar`: a entrada do simulador mais a composição editada (SIM-62, SIM-63). */
export const avaliarCorpo = z.discriminatedUnion(
  'formato',
  [
    z
      .strictObject({
        formato: z.literal('dois_times'),
        data: dataSimulador,
        n: nSimulador,
        k: kSimulador,
        aptos: aptosDois,
        composicao: composicaoDois,
      })
      .superRefine(conferirComposicao),
    z
      .strictObject({
        formato: z.literal('varios_times'),
        data: dataSimulador,
        n: nSimulador,
        aptos: aptosVarios,
        composicao: composicaoVarios,
      })
      .superRefine(conferirComposicao),
  ],
  { error: MENSAGEM_FORMATO },
);
export type AvaliarCorpo = z.infer<typeof avaliarCorpo>;

export const TIPOS_AVISO = [
  'so_1o_tempo_sem_reserva',
  'composicao_diferente',
  'sem_nota',
  'incompleto_pequeno',
] as const;

export const avisoSimulador = z.strictObject({
  tipo: z.enum(TIPOS_AVISO),
  texto: z.string().min(1),
});

/** Os campos de jogador que a resposta pode trazer (SIM-82). */
const jogadorResultado = {
  id: idJogadorResposta,
  apelido: z.string(),
  nivel: nivelResposta,
  semNota: z.boolean(),
  semAno: z.boolean(),
};

const titularDois = z.strictObject({
  ...jogadorResultado,
  so1oTempo: z.boolean(),
  saiNoIntervalo: z.boolean(),
});
const reservaDois = z.strictObject({ ...jogadorResultado, so1oTempo: z.boolean() });
const naoEntraDois = z.strictObject({ ...jogadorResultado, so1oTempo: z.boolean() });
const jogadorVarios = z.strictObject(jogadorResultado);

/** Médias e somas × 100, inteiras; médias nulas sem ninguém (SIM-39, SIM-95). */
const inteiro = z.number().int();
const media = inteiro.nullable();

const timeDoisResultado = z.strictObject({
  nome: z.string(),
  titulares: z.array(titularDois),
  entramNo2oTempo: z.array(reservaDois),
  trocas: z.array(z.strictObject({ sai: idJogadorResposta, entra: idJogadorResposta })),
  saiSemPar: z.array(idJogadorResposta),
  entraSemPar: z.array(idJogadorResposta),
  indicadores: z.strictObject({
    jogadores1oTempo: inteiro.min(0),
    jogadores2oTempo: inteiro.min(0),
    nivelSoma1oTempo: inteiro,
    nivelMedio1oTempo: media,
    nivelSoma2oTempo: inteiro,
    nivelMedio2oTempo: media,
    idadeMedia: media,
    substituicoes: inteiro.min(0),
  }),
});

/** Resultado de 2 times: composição, indicadores, avisos e a ordem de prioridade em ids (SIM-20, SIM-47). */
export const resultadoDois = z.strictObject({
  formato: z.literal('dois_times'),
  data: dataResposta,
  n: inteiro,
  k: kSimulador,
  descricao,
  avisos: z.array(avisoSimulador),
  ordemPrioridade: z.array(idJogadorResposta),
  times: z.tuple([timeDoisResultado, timeDoisResultado]),
  naoEntra: z.array(naoEntraDois),
});
export type ResultadoDois = z.infer<typeof resultadoDois>;

/** Resultado de 3 ou mais: um cartão por time, o incompleto marcado (SIM-38). */
export const resultadoVarios = z.strictObject({
  formato: z.literal('varios_times'),
  data: dataResposta,
  n: inteiro,
  descricao,
  avisos: z.array(avisoSimulador),
  times: z.array(
    z.strictObject({
      nome: z.string(),
      incompleto: z.boolean(),
      jogadores: z.array(jogadorVarios),
      indicadores: z.strictObject({
        jogadores: inteiro.min(0),
        nivelSoma: inteiro,
        nivelMedio: media,
        idadeMedia: media,
      }),
    }),
  ),
});
export type ResultadoVarios = z.infer<typeof resultadoVarios>;

export const sugerirResposta = z.discriminatedUnion('formato', [resultadoDois, resultadoVarios]);
export type SugerirResposta = z.infer<typeof sugerirResposta>;

/** Avaliar não refaz a sugestão: sem ordem de prioridade (SIM-62). */
export const avaliarResposta = z.discriminatedUnion('formato', [
  resultadoDois.omit({ ordemPrioridade: true }),
  resultadoVarios,
]);
export type AvaliarResposta = z.infer<typeof avaliarResposta>;
