import { z } from 'zod';

/**
 * Contrato do grupo (T16; GEL-03 a GEL-07, GEL-19, SEC-005): o texto visível compartilhado pelos nomes da feature,
 * os corpos `.strict()` de criar, editar e arquivar, e as respostas. Formas de `GD:138`, mensagens de `GS:83-87`,
 * escritas do zero (AD-002). As mensagens da spec ficam nos schemas; o corpo de erro 422 é da API (T20).
 */

/**
 * Caracteres de controle (`\p{Cc}`: NUL, tab, quebra de linha, DEL, C1) e de formatação invisíveis (`\p{Cf}`: U+200B a
 * U+200F, U+202A a U+202E, U+2066 a U+2069, U+FEFF...). NUL dá 500 no Postgres; os invisíveis deixam dois textos
 * iguais na tela com valores diferentes (SEC-005).
 */
const INVISIVEIS = /[\p{Cc}\p{Cf}]/u;

export const MENSAGEM_TEXTO_INVISIVEL = 'Use só caracteres visíveis, sem caracteres de controle ou invisíveis.';

/**
 * Texto livre que outras pessoas veem (nome do grupo, apelido, nome da habilidade): sem os espaços das pontas, em NFC
 * (tamanho e unicidade contam o texto já normalizado), sem controle nem invisível (SEC-005) e de `min` a `max`
 * caracteres, com a mensagem de tamanho da spec também quando o valor falta ou não é texto.
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

export const LIMITES_GRUPO = { nomeMin: 3, nomeMax: 60 } as const;

export const MENSAGEM_NOME_GRUPO = `O nome precisa ter de ${LIMITES_GRUPO.nomeMin} a ${LIMITES_GRUPO.nomeMax} caracteres.`;
export const MENSAGEM_DIA_SEMANA = 'Escolha o dia da semana.';
export const MENSAGEM_FREQUENCIA = 'Escolha a frequência.';
export const MENSAGEM_HORARIO_AUSENTE = 'Informe o horário.';
export const MENSAGEM_HORARIO_INVALIDO = 'Horário inválido.';
export const MENSAGEM_NOME_CONFIRMACAO = 'Digite o nome do grupo.';

/** Os dias aceitos (GEL-04), na ordem da spec. */
export const DIAS_DA_SEMANA = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'] as const;
export type DiaSemana = (typeof DIAS_DA_SEMANA)[number];

/** As frequências aceitas (GEL-05). */
export const FREQUENCIAS = ['semanal', 'quinzenal', 'mensal'] as const;
export type Frequencia = (typeof FREQUENCIAS)[number];

/** Nome do grupo: 3 a 60 caracteres depois do trim (GEL-03), em NFC e sem invisíveis (SEC-005). */
export const nomeGrupo = textoVisivel(LIMITES_GRUPO.nomeMin, LIMITES_GRUPO.nomeMax, MENSAGEM_NOME_GRUPO);

/** GEL-04: a spec pede só o erro no campo; o texto segue o tom das outras mensagens. */
export const diaSemana = z.enum(DIAS_DA_SEMANA, { error: MENSAGEM_DIA_SEMANA });

/** GEL-05. */
export const frequencia = z.enum(FREQUENCIAS, { error: MENSAGEM_FREQUENCIA });

/** `HH:MM` de 00:00 a 23:59: hora com 2 dígitos (`7:30` é inválido). */
const FORMATO_HORARIO = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Horário (GEL-06): ausente ou vazio pede o horário; fora do formato é inválido. */
export const horario = z
  .string({
    error: (problema) => (problema.input === undefined ? MENSAGEM_HORARIO_AUSENTE : MENSAGEM_HORARIO_INVALIDO),
  })
  .refine((valor) => valor !== '', { error: MENSAGEM_HORARIO_AUSENTE, abort: true })
  .refine((valor) => FORMATO_HORARIO.test(valor), { error: MENSAGEM_HORARIO_INVALIDO });

/**
 * O que a conta informa ao criar e o admin edita. `.strict()` recusa `slug` e `urlPublica` (GEL-07) e qualquer outro
 * campo: o slug é do servidor e nunca muda (GEL-16).
 */
export const dadosGrupo = z.object({ nome: nomeGrupo, diaSemana, frequencia, horario }).strict();

export const criarGrupoCorpo = dadosGrupo;
/** As mesmas regras e mensagens da criação (GEL-19). */
export const editarGrupoCorpo = dadosGrupo;

export type DadosGrupo = z.infer<typeof dadosGrupo>;

/** Texto que a criadora digita para arquivar; a comparação exata com o nome é da rota (GEL-22, GEL-23). */
export const arquivarCorpo = z.object({ nomeConfirmacao: z.string({ error: MENSAGEM_NOME_CONFIRMACAO }) }).strict();
export type ArquivarCorpo = z.infer<typeof arquivarCorpo>;

const id = z.string().min(1);
const contagem = z.number().int().min(0);

/** 201 de `POST /api/grupos` (GEL-01, GEL-17): o link público vem de `URL_PUBLICA`, nunca de endereço fixo. */
export const criarGrupoResposta = z.object({ id, slug: z.string(), linkPublico: z.string() }).strict();
export type CriarGrupoResposta = z.infer<typeof criarGrupoResposta>;

/** `GET` e `PATCH /api/grupos/:grupoId` (GEL-18, GEL-20). */
export const grupoDetalhe = z
  .object({
    id,
    nome: z.string(),
    slug: z.string(),
    linkPublico: z.string(),
    diaSemana,
    frequencia,
    horario: z.string(),
    jogadoresAtivos: contagem,
    habilidades: contagem,
    admins: contagem,
    souCriador: z.boolean(),
  })
  .strict();
export type GrupoDetalhe = z.infer<typeof grupoDetalhe>;

/** Grupo na lista "Seus grupos". */
export const grupoItem = z
  .object({ id, nome: z.string(), slug: z.string(), diaSemana, frequencia, horario: z.string() })
  .strict();
export type GrupoItem = z.infer<typeof grupoItem>;

/** `GET /api/grupos`: os ativos e, à parte, os arquivados que a conta criou (GEL-25, GEL-27). */
export const gruposResposta = z.object({ ativos: z.array(grupoItem), arquivados: z.array(grupoItem) }).strict();
export type GruposResposta = z.infer<typeof gruposResposta>;
