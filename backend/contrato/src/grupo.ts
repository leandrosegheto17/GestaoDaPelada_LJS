import { z } from './zod.ts';
import { DIAS_DA_SEMANA } from './dias.ts';
import { LIMITES } from './limites.ts';
import { textoVisivel } from './texto.ts';

const MENSAGEM_NOME = `O nome precisa ter de ${LIMITES.nomeGrupo.min} a ${LIMITES.nomeGrupo.max} caracteres.`;

/** Nome do grupo: de 3 a 60 caracteres sem os espaços das pontas (GEL-03), em NFC e sem invisíveis (SEC-005). */
export const nomeGrupo = textoVisivel(LIMITES.nomeGrupo.min, LIMITES.nomeGrupo.max, MENSAGEM_NOME);

export const FREQUENCIAS = ['semanal', 'quinzenal', 'mensal'] as const;
export type Frequencia = (typeof FREQUENCIAS)[number];

/** GEL-04. A spec pede só o erro no campo; o texto segue o tom das outras mensagens. */
export const diaSemana = z.enum(DIAS_DA_SEMANA, { error: 'Escolha o dia da semana.' });
/** GEL-05. */
export const frequencia = z.enum(FREQUENCIAS, { error: 'Escolha a frequência.' });

const HORARIO = /^([01]\d|2[0-3]):[0-5]\d$/;

/** `HH:MM` de 00:00 a 23:59 (GEL-06): ausente ou vazio pede o horário; o resto fora do formato é inválido. */
export const horario = z
  .string({ error: (problema) => (problema.input === undefined ? 'Informe o horário.' : 'Horário inválido.') })
  .refine((valor) => valor !== '', { error: 'Informe o horário.', abort: true })
  .refine((valor) => HORARIO.test(valor), 'Horário inválido.');

/** Dados que a conta informa ao criar e o admin edita. `strictObject` recusa `slug` e `urlPublica` (GEL-07). */
export const dadosGrupo = z.strictObject({ nome: nomeGrupo, diaSemana, frequencia, horario });

export const criarGrupoCorpo = dadosGrupo;
/** Mesmas regras e mensagens da criação (GEL-19); o slug nunca muda (GEL-16). */
export const editarGrupoCorpo = dadosGrupo;

/** Texto que a conta criadora digita para confirmar o arquivamento; a comparação exata é da rota (GEL-22, GEL-23). */
export const arquivarCorpo = z.strictObject({ nomeConfirmacao: z.string({ error: 'Digite o nome do grupo.' }) });

const id = z.string().min(1);

/** 201 de `POST /api/grupos` (GEL-01, GEL-17). */
export const criarGrupoResposta = z.strictObject({ id, slug: z.string(), linkPublico: z.string() });

/** `GET` e `PATCH /api/grupos/:grupoId` (GEL-18, GEL-20). */
export const grupoDetalhe = z.strictObject({
  id,
  nome: z.string(),
  slug: z.string(),
  linkPublico: z.string(),
  diaSemana,
  frequencia,
  horario: z.string(),
  jogadoresAtivos: z.number().int().min(0),
  habilidades: z.number().int().min(0),
  admins: z.number().int().min(0),
  souCriador: z.boolean(),
});
export type GrupoDetalhe = z.infer<typeof grupoDetalhe>;

export const grupoItem = z.strictObject({
  id,
  nome: z.string(),
  slug: z.string(),
  diaSemana,
  frequencia,
  horario: z.string(),
});
export type GrupoItem = z.infer<typeof grupoItem>;

/** `GET /api/grupos`: os ativos e, à parte, os arquivados que a conta criou (GEL-27). */
export const gruposResposta = z.strictObject({ ativos: z.array(grupoItem), arquivados: z.array(grupoItem) });
export type GruposResposta = z.infer<typeof gruposResposta>;
