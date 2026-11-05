import { z } from 'zod';
import { diaSemana, frequencia } from './grupo.ts';
import { FORMATO_MES, navegacaoMes } from './partidas.ts';

/**
 * Contrato das rotas públicas (T19; PAR-64, PAR-70, PAR-76, PAR-95, PAR-101, PAR-128). Formas de `BD:179-182`. Toda
 * projeção é `strictObject` em todos os níveis: um campo que não é de PAR-64, PAR-70 ou PAR-95 recusa a resposta
 * inteira (G-10). `CAMPOS_PROIBIDOS_PUBLICO` e `camposProibidosEm` servem ao teste das rotas (T45, T46), que procura
 * esses campos na resposta de verdade.
 */

/**
 * O que nunca sai numa rota pública (PAR-76): id de jogador, telefone, ano, idade, posição em campo, notas, nível,
 * períodos, pontuação inicial isolada, financeiro e contato. A posição em campo não entra pelo nome (`posicao` é a
 * colocação no ranking): o schema só aceita número inteiro nela.
 */
export const CAMPOS_PROIBIDOS_PUBLICO = [
  'id',
  'jogadorId',
  'grupoId',
  'telefone',
  'anoNascimento',
  'idade',
  'posicaoEmCampo',
  'notas',
  'nota',
  'semNota',
  'nivel',
  'habilidades',
  'periodos',
  'inicioPontuacao',
  'pontuacaoInicial',
  'financeiro',
  'mensalidade',
  'saldo',
  'saldoCentavos',
  'valorCentavos',
  'lancamentos',
  'email',
  'dispositivoId',
] as const;

/** Os caminhos (`linhas.0.jogadorId`) dos campos proibidos achados em qualquer nível de `valor`, em ordem alfabética. */
export function camposProibidosEm(valor: unknown): string[] {
  return acharProibidos(valor, '').sort();
}

function acharProibidos(valor: unknown, caminho: string): string[] {
  const proibidos: readonly string[] = CAMPOS_PROIBIDOS_PUBLICO;
  if (Array.isArray(valor))
    return valor.flatMap((item, i) => acharProibidos(item, caminho ? `${caminho}.${i}` : `${i}`));
  if (valor === null || typeof valor !== 'object') return [];
  return Object.entries(valor).flatMap(([chave, filho]) => {
    const aqui = caminho ? `${caminho}.${chave}` : chave;
    return [...(proibidos.includes(chave) ? [aqui] : []), ...acharProibidos(filho, aqui)];
  });
}

export const MENSAGEM_MES_PUBLICO = 'Mês inválido.';
export const MENSAGEM_MES_FORA_DO_HISTORICO = 'Mês fora do histórico do grupo.';

/** Query de `GET /api/publico/:slug/ranking` e `/pdf` (PAR-65, PAR-100): sem `mes`, o mês de hoje. */
export const consultaMesPublico = z.strictObject({
  mes: z
    .string({ error: MENSAGEM_MES_PUBLICO })
    .regex(FORMATO_MES, MENSAGEM_MES_PUBLICO)
    .optional(),
});
export type ConsultaMesPublico = z.infer<typeof consultaMesPublico>;

const dataTexto = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const mesTexto = z.string().regex(FORMATO_MES);
const inteiro = z.number().int();

/** Situação de uma rodada: a gravada, `falta` (ativo sem presença) ou `fora` ("–"; PAR-71 a PAR-73). */
export const SITUACOES_RODADA = ['presente', 'lesionado', 'expulso', 'falta', 'fora'] as const;
export type SituacaoRodada = (typeof SITUACOES_RODADA)[number];

/** Rodada: pontos nulos se e só se `fora`. */
export const rodadaPublica = z
  .strictObject({ situacao: z.enum(SITUACOES_RODADA), pontos: inteiro.nullable() })
  .refine((r) => (r.situacao === 'fora') === (r.pontos === null), {
    error: 'Pontos nulos só na rodada "–".',
  });
export type RodadaPublica = z.infer<typeof rodadaPublica>;

/** Linha do ranking e do PDF (PAR-70, PAR-95): `posicao` é a colocação, nunca a posição em campo. */
export const linhaPublica = z.strictObject({
  posicao: inteiro.min(1),
  apelido: z.string(),
  ptsInicial: inteiro,
  rodadas: z.array(rodadaPublica),
  ptsFinal: inteiro,
});
export type LinhaPublica = z.infer<typeof linhaPublica>;

/** `GET /api/publico/:slug/ranking` (PAR-64, PAR-70): uma rodada por partida do mês em cada linha. */
export const rankingPublico = z
  .strictObject({
    grupo: z.strictObject({
      nome: z.string(),
      slug: z.string(),
      diaSemana,
      frequencia,
      horario: z.string(),
    }),
    mes: mesTexto,
    hoje: dataTexto,
    geradoEm: z.iso.datetime({ offset: true }),
    navegacao: navegacaoMes,
    resumoMes: z.strictObject({ partidas: inteiro.min(0), comChuva: inteiro.min(0) }),
    partidas: z.array(z.strictObject({ data: dataTexto, choveu: z.boolean() })),
    linhas: z.array(linhaPublica),
    /**
     * O grupo tem o recurso `pdf` hoje (planos-e-cobranca T27; PLA-25, AD-095): a t01 esconde "Exportar PDF" no Free
     * sem outra chamada. Ranking guardado no aparelho antes deste campo falha a validação e é descartado (PAR-154).
     */
    pdfLiberado: z.boolean(),
  })
  .refine((r) => r.linhas.every((l) => l.rodadas.length === r.partidas.length), {
    error: 'Cada linha tem uma rodada por partida do mês.',
  });
export type RankingPublico = z.infer<typeof rankingPublico>;

/** Máximo de colunas do PDF de uma página (PAR-96, PAR-101), o mesmo `MAX_COLUNAS_PDF` do domínio. */
export const MAX_COLUNAS_PDF = 12;

/** `GET /api/publico/:slug/pdf` (PAR-95, PAR-101): até 12 colunas e uma rodada por coluna em cada linha. */
export const pdfPublico = z
  .strictObject({
    grupo: z.strictObject({ nome: z.string(), slug: z.string() }),
    mes: mesTexto,
    geradoEm: z.iso.datetime({ offset: true }),
    urlPublica: z.url(),
    semPartidasNoMes: z.boolean(),
    colunas: z
      .array(z.strictObject({ data: dataTexto, choveu: z.boolean(), doMesExibido: z.boolean() }))
      .max(MAX_COLUNAS_PDF),
    linhas: z.array(linhaPublica),
  })
  .refine((r) => r.linhas.every((l) => l.rodadas.length === r.colunas.length), {
    error: 'Cada linha tem uma rodada por coluna.',
  });
export type PdfPublico = z.infer<typeof pdfPublico>;

/** Corpo de `POST /api/publico/:slug/eventos` acima disso: 413 (PAR-128). */
export const LIMITE_CORPO_EVENTO_BYTES = 1024;

/**
 * Corpo do evento anônimo (PAR-124, PAR-125, PAR-128): abertura com o identificador do aparelho (UUID v4, PAR-123) ou
 * PDF com o mês exportado; outro tipo, campo extra ou campo que falta são recusados.
 */
export const eventoPublicoCorpo = z.discriminatedUnion('tipo', [
  z.strictObject({ tipo: z.literal('ranking_aberto'), dispositivoId: z.uuidv4() }),
  z.strictObject({ tipo: z.literal('pdf_exportado'), mes: mesTexto }),
]);
export type EventoPublicoCorpo = z.infer<typeof eventoPublicoCorpo>;
