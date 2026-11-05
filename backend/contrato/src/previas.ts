import { z } from 'zod';
import { grupoDetalhe } from './grupo.ts';

/**
 * Contrato das prévias, do painel de uso e do início do grupo (T20; PAR-109, PAR-110, PAR-111, PAR-132, PAR-155).
 * Formas de `BD:181-182`. A prévia de reativar usa o `dataCorpo { data }` da gravação (`periodos.ts`, PAR-109), a de
 * corrigir período o `corrigirPeriodoCorpo` e a de início o `inicioCorpo`: o mesmo corpo e a mesma validação (PAR-112).
 */

const dataTexto = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const contagem = z.number().int().min(0);

/** Situação que a rodada passa a ter ao constar: as gravadas ou `falta` (PAR-114). */
export const SITUACOES_QUE_PASSAM = ['presente', 'lesionado', 'expulso', 'falta'] as const;

const cenarios = {
  acumuladoAntes: z.number().int(),
  acumuladoDepois: z.number().int(),
  /** Nula quando o jogador não está ativo hoje no cenário (PAR-113). */
  posicaoAntes: z.number().int().min(1).nullable(),
  posicaoDepois: z.number().int().min(1).nullable(),
};

/** Resposta das prévias de reativar e de corrigir período (PAR-109, PAR-110). */
export const previaResposta = z.strictObject({
  ...cenarios,
  rodadasQuePassamAConstar: z.array(z.strictObject({ data: dataTexto, situacao: z.enum(SITUACOES_QUE_PASSAM) })),
  rodadasQueDeixamDeConstar: z.array(z.strictObject({ data: dataTexto })),
  /** PAR-116: nulo quando nenhuma rodada que passa a constar é falta. */
  aviso: z.string().nullable(),
});
export type PreviaResposta = z.infer<typeof previaResposta>;

/** Resposta da prévia da data de início (PAR-111): só o número de rodadas que passam a constar. */
export const previaInicioResposta = z.strictObject({ ...cenarios, rodadasQuePassamAConstar: contagem });
export type PreviaInicioResposta = z.infer<typeof previaInicioResposta>;

/** Uma semana do painel de uso, de segunda a domingo em São Paulo (PAR-155, PAR-156). */
export const semanaDeUso = z.strictObject({
  inicio: dataTexto,
  fim: dataTexto,
  aparelhosRanking: contagem,
  pdfsExportados: contagem,
  partidasLancadas: contagem,
  partidasEm48h: contagem,
  escalacoesConfirmadas: contagem,
});
export type SemanaDeUso = z.infer<typeof semanaDeUso>;

/** `GET /api/grupos/:grupoId/uso`: da semana mais recente para a mais antiga, só as que têm evento (PAR-155). */
export const usoResposta = z.strictObject({ semanas: z.array(semanaDeUso) });
export type UsoResposta = z.infer<typeof usoResposta>;

/**
 * `GET /api/grupos/:grupoId` com os 6 campos de PAR-132. O `grupoDetalhe` da grupos-e-elenco continua como está (o
 * PATCH do grupo, GEL-20, responde com ele); esta é a forma do GET, que acrescenta os campos do início do grupo.
 */
export const grupoDetalheComPartidas = grupoDetalhe.extend({
  dataSugeridaPartida: dataTexto,
  partidaNaDataSugerida: z.boolean(),
  partidasNoMes: contagem,
  pesosVigentesDesde: dataTexto,
  pesosPadrao: z.boolean(),
  aparelhosNaSemana: contagem,
});
export type GrupoDetalheComPartidas = z.infer<typeof grupoDetalheComPartidas>;
