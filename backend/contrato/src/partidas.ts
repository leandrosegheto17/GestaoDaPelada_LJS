import { z } from 'zod';
import { ehDataDoCalendario, MENSAGEM_DATA_INVALIDA } from './elenco.ts';

/**
 * Contrato das partidas (T18; PAR-19, PAR-26, PAR-39). Formas de `BD:178-179`, mensagens de `B:152-161` e `B:185-188`.
 * O zod confere a forma: data real e mês `AAAA-MM`. Data ou mês futuro (PAR-20, PAR-40), partida que já existe
 * (PAR-21), jogador inativo e repetido (PAR-24, PAR-25) dependem de hoje ou do banco e são da rota e do domínio.
 */

/** As 4 situações de uma marcação; `ausente` não grava presença (PAR-23, PAR-26). */
export const SITUACOES_MARCACAO = ['ausente', 'presente', 'lesionado', 'expulso'] as const;
export type SituacaoMarcacao = (typeof SITUACOES_MARCACAO)[number];

/**
 * As mensagens do domínio (`partidas/marcacoes.ts`), repetidas porque o contrato não importa o domínio (o web carrega o
 * contrato); o teste daqui e o do domínio provam o mesmo texto.
 */
export const MENSAGEM_SITUACAO = 'Escolha a situação.';
export const MENSAGEM_JOGADOR_INATIVO = 'Jogador não está ativo nesta data.';
export const MENSAGEM_JOGADOR_REPETIDO = 'Há jogador repetido nas marcações.';

export const MENSAGEM_MES = 'Informe o mês como AAAA-MM.';
export const MENSAGEM_MES_FUTURO = 'O mês não pode ser futuro.';
export const MENSAGEM_DATA_ALTERADA = 'A data da partida não pode ser alterada.';
export const MENSAGEM_CHUVA = 'Informe se choveu.';

/** "Já existe uma partida em dd/mm/aaaa." (PAR-21, PAR-34), de uma data `AAAA-MM-DD` já validada. */
export function mensagemPartidaJaExiste(data: string): string {
  const [ano, mes, dia] = data.split('-');
  return `Já existe uma partida em ${dia}/${mes}/${ano}.`;
}

/** `AAAA-MM` com mês de 01 a 12. */
export const FORMATO_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Data real `AAAA-MM-DD` (PAR-19): fora do formato, ausente ou que não existe no calendário, a mesma mensagem. */
export const dataReal = z
  .string({ error: MENSAGEM_DATA_INVALIDA })
  .refine(ehDataDoCalendario, { error: MENSAGEM_DATA_INVALIDA });

/** Mês da lista de partidas (PAR-39). */
export const mesTexto = z.string({ error: MENSAGEM_MES }).regex(FORMATO_MES, MENSAGEM_MES);

/**
 * Uma marcação. Id que não é UUID é jogador inexistente: a mesma mensagem do inativo, no mesmo campo (PAR-24), e o
 * banco nunca recebe um texto que não converte para `uuid`.
 */
export const marcacao = z.strictObject({
  jogadorId: z.uuid({ error: MENSAGEM_JOGADOR_INATIVO }),
  situacao: z.enum(SITUACOES_MARCACAO, { error: MENSAGEM_SITUACAO }),
});
export type Marcacao = z.infer<typeof marcacao>;

/** Corpo de `POST …/partidas` e de `PUT …/partidas/:data` (PAR-22, PAR-46). */
export const partidaCorpo = z.strictObject({
  data: dataReal,
  choveu: z.boolean({ error: MENSAGEM_CHUVA }),
  marcacoes: z.array(marcacao),
});
export type PartidaCorpo = z.infer<typeof partidaCorpo>;

/** Query de `GET …/partidas/nova` (PAR-17, PAR-18): sem `data`, a rota usa a sugerida. */
export const consultaData = z.strictObject({ data: dataReal.optional() });
export type ConsultaData = z.infer<typeof consultaData>;

/** Query de `GET …/partidas` (PAR-37, PAR-38): sem `mes`, a rota usa o mês de hoje. */
export const consultaMes = z.strictObject({ mes: mesTexto.optional() });
export type ConsultaMes = z.infer<typeof consultaMes>;

const dataTexto = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const mesResposta = z.string().regex(FORMATO_MES);

/** Jogador da tela de lançar ou editar, com a situação gravada ou `ausente` (PAR-17, PAR-44). */
export const jogadorDaPartida = z.strictObject({
  id: z.uuid(),
  apelido: z.string(),
  situacao: z.enum(SITUACOES_MARCACAO),
});
export type JogadorDaPartida = z.infer<typeof jogadorDaPartida>;

/**
 * `GET …/partidas/nova` (PAR-17, PAR-18). `preMarcadaPelaEscalacao` (T24 da simulador; SIM-75, SIM-76): as situações
 * vieram da escalação confirmada da data; sem escalação, ou com escalação inválida, é falso e a tela fica como antes.
 */
export const partidaNova = z.strictObject({
  data: dataTexto,
  dataSugerida: dataTexto,
  hoje: dataTexto,
  choveu: z.boolean(),
  preMarcadaPelaEscalacao: z.boolean(),
  jogadores: z.array(jogadorDaPartida),
});
export type PartidaNova = z.infer<typeof partidaNova>;

/** 201 do lançamento, 200 da leitura e da edição (PAR-22, PAR-44, PAR-46); `alteradaPor` é o nome da conta. */
export const partidaResposta = z.strictObject({
  data: dataTexto,
  hoje: dataTexto,
  choveu: z.boolean(),
  alteradaPor: z.string(),
  alteradaEm: z.iso.datetime({ offset: true }),
  jogadores: z.array(jogadorDaPartida),
});
export type PartidaResposta = z.infer<typeof partidaResposta>;

export const contagemPartida = z.strictObject({
  presentes: z.number().int().min(0),
  lesionados: z.number().int().min(0),
  expulsos: z.number().int().min(0),
});
export type ContagemPartida = z.infer<typeof contagemPartida>;

export const navegacaoMes = z.strictObject({ mesAnterior: mesResposta.nullable(), mesSeguinte: mesResposta.nullable() });
export type NavegacaoMes = z.infer<typeof navegacaoMes>;

/** `GET …/partidas?mes`: as partidas do mês, da mais recente para a mais antiga (PAR-37, PAR-41). */
export const partidasDoMes = z.strictObject({
  mes: mesResposta,
  hoje: dataTexto,
  navegacao: navegacaoMes,
  partidas: z.array(z.strictObject({ data: dataTexto, choveu: z.boolean(), contagem: contagemPartida })),
});
export type PartidasDoMes = z.infer<typeof partidasDoMes>;
