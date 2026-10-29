import { z } from './zod.ts';
import { LIMITES } from './limites.ts';

/** As 7 posições do CHECK da linha de base (C10), na ordem da spec. */
export const POSICOES = ['goleiro', 'zagueiro', 'lateral', 'volante', 'meia', 'atacante', 'centroavante'] as const;
export type Posicao = (typeof POSICOES)[number];

/** GEL-37. A spec pede só o erro no campo; o texto segue o tom das outras mensagens. */
export const posicao = z.enum(POSICOES, { error: 'Escolha a posição.' });

const MENSAGEM_APELIDO = `O apelido precisa ter de ${LIMITES.apelido.min} a ${LIMITES.apelido.max} caracteres.`;
const MENSAGEM_TELEFONE = 'Informe o telefone como (DD) 9XXXX-XXXX.';
const MENSAGEM_PONTUACAO = `Informe um número inteiro de ${LIMITES.pontuacaoInicial.min} a ${LIMITES.pontuacaoInicial.max}.`;
const MENSAGEM_DATA = 'Informe uma data válida.';
const MENSAGEM_FUTURO = 'A data não pode ser no futuro.';

/** Apelido de 2 a 30 caracteres sem os espaços das pontas (GEL-34). A unicidade no grupo é do repositório. */
export const apelido = z
  .string({ error: MENSAGEM_APELIDO })
  .trim()
  .min(LIMITES.apelido.min, MENSAGEM_APELIDO)
  .max(LIMITES.apelido.max, MENSAGEM_APELIDO);

/** Caracteres de máscara que saem antes de contar os dígitos (GEL-39). */
const MASCARA = /[\s()-]/g;
/** DDD de 2 dígitos sem zero, o 9 e mais 8 dígitos. */
const CELULAR = /^[1-9]{2}9\d{8}$/;

/** Telefone opcional (GEL-38, GEL-39): vazio ou nulo vira `null`; o válido é guardado só com os 11 dígitos. */
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

/** Pontos de antes da primeira partida registrada: inteiro de 0 a 9999 (GEL-40). */
export const pontuacaoInicial = z
  .number({ error: MENSAGEM_PONTUACAO })
  .int(MENSAGEM_PONTUACAO)
  .min(LIMITES.pontuacaoInicial.min, MENSAGEM_PONTUACAO)
  .max(LIMITES.pontuacaoInicial.max, MENSAGEM_PONTUACAO);

function ehDataReal(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [ano, mes, dia] = valor.split('-').map(Number) as [number, number, number];
  const t = new Date(0);
  t.setUTCFullYear(ano, mes - 1, dia);
  return t.getUTCFullYear() === ano && t.getUTCMonth() === mes - 1 && t.getUTCDate() === dia;
}

/** Data `AAAA-MM-DD` que existe no calendário e não passa de hoje (GEL-33). */
const dataAteHoje = (hoje: string) =>
  z
    .string({ error: MENSAGEM_DATA })
    .refine(ehDataReal, { error: MENSAGEM_DATA, abort: true })
    .refine((valor) => valor <= hoje, MENSAGEM_FUTURO);

/**
 * Ano de nascimento de 1940 até o ano de hoje − 10 (GEL-36); falta e não inteiro dão a mesma mensagem.
 * SPEC_DEVIATION: o design pede `anoNascimentoMaximo` do domínio aqui. O contrato é carregado pelo web, que não pode
 * importar o domínio (G-01), então a conta (ano de `hoje` − `LIMITES.idadeMinima`) é repetida, como no legado; o
 * teste do contrato e o do domínio provam o mesmo limite.
 */
function anoNascimento(hoje: string) {
  const maximo = Number(hoje.slice(0, 4)) - LIMITES.idadeMinima;
  const mensagem = `O ano precisa estar entre ${LIMITES.anoNascimentoMin} e ${maximo}.`;
  return z.number({ error: mensagem }).int(mensagem).min(LIMITES.anoNascimentoMin, mensagem).max(maximo, mensagem);
}

/**
 * Corpo de `POST …/jogadores`, com as regras que dependem de `hoje` (São Paulo, vindo do relógio da API).
 * Pontuação omitida vale 0 (GEL-40); data de entrada omitida vira hoje na rota (GEL-32).
 */
export function jogadorCorpo(hoje: string) {
  return z.strictObject({
    apelido,
    anoNascimento: anoNascimento(hoje),
    posicao,
    telefone,
    pontuacaoInicial: pontuacaoInicial.default(LIMITES.pontuacaoInicial.min),
    dataEntrada: dataAteHoje(hoje).optional(),
  });
}

/**
 * Corpo de `PATCH …/jogadores/:id` (GEL-41): as mesmas regras, sem data de entrada (só muda pela rota de início).
 * Pontuação omitida fica fora do resultado, e o repositório mantém o valor atual (GEL-43).
 */
export function editarJogadorCorpo(hoje: string) {
  return z.strictObject({
    apelido,
    anoNascimento: anoNascimento(hoje),
    posicao,
    telefone,
    pontuacaoInicial: pontuacaoInicial.optional(),
  });
}

const id = z.string().min(1);
const dataTexto = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Nível em centésimos (683 = 6,8 na tela). */
const nivel = z.number().int().min(100).max(1000);

/** Item da lista de jogadores (GEL-46): ativo = período aberto (GEL-50); `desde` = início da situação atual. */
export const jogadorItem = z.strictObject({
  id,
  apelido: z.string(),
  posicao,
  situacao: z.enum(['ativo', 'inativo']),
  desde: dataTexto,
  nivel,
  semNota: z.boolean(),
});
export type JogadorItem = z.infer<typeof jogadorItem>;

export const listaJogadores = z.strictObject({ jogadores: z.array(jogadorItem) });
export type ListaJogadores = z.infer<typeof listaJogadores>;

/** Ficha do jogador, com os períodos de atividade e as notas por habilidade. */
export const jogadorDetalhe = jogadorItem.extend({
  /** Nulo só em dado antigo; o cadastro novo exige o ano. */
  anoNascimento: z.number().int().nullable(),
  telefone: z
    .string()
    .regex(/^\d{11}$/)
    .nullable(),
  pontuacaoInicial: z.number().int(),
  inicioPontuacao: dataTexto,
  periodos: z.array(z.strictObject({ id, inicio: dataTexto, fim: dataTexto.nullable() })),
  notas: z.array(
    z.strictObject({
      habilidadeId: id,
      habilidade: z.string(),
      nota: z.number().int().min(LIMITES.nota.min).max(LIMITES.nota.max).nullable(),
    }),
  ),
});
export type JogadorDetalhe = z.infer<typeof jogadorDetalhe>;
