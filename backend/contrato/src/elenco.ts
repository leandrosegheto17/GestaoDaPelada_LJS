import { z } from 'zod';
import { textoVisivel } from './grupo.ts';

/**
 * Contrato do jogador (T17; GEL-33 a GEL-43, SEC-002, SEC-005). As regras que dependem de "hoje" ficam em fábricas
 * (`jogadorCorpo(hoje)`, `GD:139`): `hoje` chega do relógio da API (T19), em `AAAA-MM-DD` de São Paulo. Mensagens de
 * `GS:165-175`; o piso da data de entrada é o de `GSEG:66`, com a mensagem de `GS:275`. Escrito do zero (AD-002).
 */

export const LIMITES_JOGADOR = {
  apelidoMin: 2,
  apelidoMax: 30,
  anoNascimentoMin: 1940,
  idadeMinima: 10,
  pontuacaoMin: 0,
  pontuacaoMax: 9999,
} as const;

/** As 7 posições do CHECK do banco (GEL-37), na ordem da spec. */
export const POSICOES = [
  'goleiro',
  'zagueiro',
  'lateral',
  'volante',
  'meia',
  'atacante',
  'centroavante',
] as const;
export type Posicao = (typeof POSICOES)[number];

export const MENSAGEM_APELIDO = `O apelido precisa ter de ${LIMITES_JOGADOR.apelidoMin} a ${LIMITES_JOGADOR.apelidoMax} caracteres.`;
export const MENSAGEM_POSICAO = 'Escolha a posição.';
export const MENSAGEM_TELEFONE = 'Informe o telefone como (DD) 9XXXX-XXXX.';
export const MENSAGEM_PONTUACAO = `Informe um número inteiro de ${LIMITES_JOGADOR.pontuacaoMin} a ${LIMITES_JOGADOR.pontuacaoMax}.`;
export const MENSAGEM_DATA_INVALIDA = 'Informe uma data válida.';
export const MENSAGEM_DATA_FUTURA = 'A data não pode ser no futuro.';
export const MENSAGEM_DATA_ANTES_DO_PISO = 'A data de início não pode ser anterior a 01/01/2000.';

/**
 * Piso da data de entrada (SEC-002), o mesmo `PISO_INICIO` do domínio (GEL-78). O contrato não depende do domínio
 * (o web carrega o contrato), então repete o valor; o teste daqui e o do domínio provam o mesmo limite.
 */
export const PISO_DATA_ENTRADA = '2000-01-01';

/** Mensagem do ano de nascimento para o máximo de hoje (GEL-36). */
export function mensagemAnoNascimento(maximo: number): string {
  return `O ano precisa estar entre ${LIMITES_JOGADOR.anoNascimentoMin} e ${maximo}.`;
}

/**
 * Maior ano aceito: o ano de `hoje` − 10 (GEL-36). Repete a conta de `anoNascimentoMaximo` do domínio pelo mesmo
 * motivo do piso. SPEC_DEVIATION: a tarefa nomeia `anoNascimentoMaximo(hoje)`; o contrato não importa o domínio.
 */
export function anoMaximoNascimento(hoje: string): number {
  return Number(hoje.slice(0, 4)) - LIMITES_JOGADOR.idadeMinima;
}

/** Apelido de 2 a 30 depois do trim (GEL-34), em NFC e sem invisíveis (SEC-005). A unicidade é do repositório. */
export const apelido = textoVisivel(
  LIMITES_JOGADOR.apelidoMin,
  LIMITES_JOGADOR.apelidoMax,
  MENSAGEM_APELIDO,
);

/** GEL-37: a spec pede só o erro no campo. */
export const posicao = z.enum(POSICOES, { error: MENSAGEM_POSICAO });

/** Caracteres de máscara retirados antes de contar os dígitos (GEL-39). */
const MASCARA = /[\s().-]/g;
/** DDD de 2 dígitos sem zero, o 9 e mais 8 dígitos. */
const CELULAR = /^[1-9]{2}9\d{8}$/;

/** Telefone opcional: vazio ou nulo vira `null` (GEL-38); o válido sai só com os 11 dígitos (GEL-39). */
export const telefone = z
  .union([z.string(), z.null()], { error: MENSAGEM_TELEFONE })
  .optional()
  .transform((valor, contexto): string | null => {
    if (valor === undefined || valor === null || valor.trim() === '') return null;
    const digitos = valor.replace(MASCARA, '');
    if (!CELULAR.test(digitos)) {
      contexto.addIssue({ code: 'custom', message: MENSAGEM_TELEFONE });
      return z.NEVER;
    }
    return digitos;
  });

/** Pontuação de antes da primeira partida registrada: inteiro de 0 a 9999 (GEL-40). */
export const pontuacaoInicial = z
  .number({ error: MENSAGEM_PONTUACAO })
  .int(MENSAGEM_PONTUACAO)
  .min(LIMITES_JOGADOR.pontuacaoMin, MENSAGEM_PONTUACAO)
  .max(LIMITES_JOGADOR.pontuacaoMax, MENSAGEM_PONTUACAO);

const FORMATO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

function diasNoMes(ano: number, mes: number): number {
  if (mes === 2) return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(mes) ? 30 : 31;
}

/** `AAAA-MM-DD` que existe no calendário, sem `Date` (o texto basta para comparar datas). */
export function ehDataDoCalendario(valor: string): boolean {
  const partes = FORMATO_DATA.exec(valor);
  if (!partes) return false;
  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= diasNoMes(ano, mes);
}

/**
 * Data de entrada (GEL-33, SEC-002): do calendário, não antes de 01/01/2000 (o ano 0000 dava 500 no Postgres) e não
 * depois de hoje, nessa ordem, cada falha com a sua mensagem.
 */
function dataEntrada(hoje: string) {
  return z
    .string({ error: MENSAGEM_DATA_INVALIDA })
    .refine(ehDataDoCalendario, { error: MENSAGEM_DATA_INVALIDA, abort: true })
    .refine((valor) => valor >= PISO_DATA_ENTRADA, {
      error: MENSAGEM_DATA_ANTES_DO_PISO,
      abort: true,
    })
    .refine((valor) => valor <= hoje, { error: MENSAGEM_DATA_FUTURA });
}

/** Ano de 1940 até o ano de hoje − 10 (GEL-36); falta ou não inteiro dão a mesma mensagem. */
function anoNascimento(hoje: string) {
  const maximo = anoMaximoNascimento(hoje);
  const mensagem = mensagemAnoNascimento(maximo);
  return z
    .number({ error: mensagem })
    .int(mensagem)
    .min(LIMITES_JOGADOR.anoNascimentoMin, mensagem)
    .max(maximo, mensagem);
}

/**
 * Corpo de `POST …/jogadores` (GEL-31): pontuação omitida vale 0 (GEL-40); data de entrada omitida fica ausente e a
 * rota usa hoje (GEL-32).
 */
export function jogadorCorpo(hoje: string) {
  return z
    .object({
      apelido,
      anoNascimento: anoNascimento(hoje),
      posicao,
      telefone,
      pontuacaoInicial: pontuacaoInicial.default(LIMITES_JOGADOR.pontuacaoMin),
      dataEntrada: dataEntrada(hoje).optional(),
    })
    .strict();
}
export type JogadorCorpo = z.infer<ReturnType<typeof jogadorCorpo>>;

/**
 * Corpo de `PATCH …/jogadores/:id` (GEL-41): as mesmas regras, sem data de entrada (ela só muda pela rota de início,
 * GEL-83); a pontuação omitida continua ausente e o repositório mantém o valor atual (GEL-43).
 */
export function editarJogadorCorpo(hoje: string) {
  return z
    .object({
      apelido,
      anoNascimento: anoNascimento(hoje),
      posicao,
      telefone,
      pontuacaoInicial: pontuacaoInicial.optional(),
    })
    .strict();
}
export type EditarJogadorCorpo = z.infer<ReturnType<typeof editarJogadorCorpo>>;

const id = z.string().min(1);
const dataTexto = z.string().regex(FORMATO_DATA);
/** Nível em centésimos (683 = 6,8 na tela). */
const nivel = z.number().int().min(100).max(1000);

/** Item da lista (GEL-46): ativo = período aberto (GEL-50); `desde` = início da situação atual. */
export const jogadorItem = z
  .object({
    id,
    apelido: z.string(),
    posicao,
    situacao: z.enum(['ativo', 'inativo']),
    desde: dataTexto,
    nivel,
    semNota: z.boolean(),
  })
  .strict();
export type JogadorItem = z.infer<typeof jogadorItem>;

export const listaJogadores = z.object({ jogadores: z.array(jogadorItem) }).strict();
export type ListaJogadores = z.infer<typeof listaJogadores>;

/** Período de atividade, intervalo [início, fim); `fim` nulo = aberto. */
export const periodoItem = z.object({ id, inicio: dataTexto, fim: dataTexto.nullable() }).strict();
export type PeriodoItem = z.infer<typeof periodoItem>;

/** Ficha do jogador, com os períodos e as notas por habilidade. */
export const jogadorDetalhe = jogadorItem
  .extend({
    anoNascimento: z.number().int().nullable(),
    telefone: z
      .string()
      .regex(/^\d{11}$/)
      .nullable(),
    pontuacaoInicial: z.number().int(),
    inicioPontuacao: dataTexto,
    periodos: z.array(periodoItem),
    notas: z.array(
      z
        .object({
          habilidadeId: id,
          habilidade: z.string(),
          nota: z.number().int().min(1).max(10).nullable(),
        })
        .strict(),
    ),
  })
  .strict();
export type JogadorDetalhe = z.infer<typeof jogadorDetalhe>;
