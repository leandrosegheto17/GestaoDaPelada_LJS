/**
 * Payloads dos avisos por push (T5; NOT-25, NOT-43). Só título, texto e caminho: nenhum apelido, ponto, posição, id
 * de jogador nem outro campo de PAR-76 (o payload sai para o serviço de push, fora do nosso controle). O tamanho
 * cifrado (< 4096 bytes) é provado na infraestrutura, junto com a cifra.
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - Nome do grupo com 120 caracteres e emoji: entra inteiro no texto (o limite de bytes é da cifra).
 * - Dia 1 e 31 e virada de ano: `dd/mm` e o `mes` do caminho vêm da própria data, sem fuso nem relógio.
 * - Data que não existe no calendário: erro, para não mandar um caminho com mês inválido.
 * - Cobrança: o título leva o tipo e o nome do grupo, e mais nada; sem valor, e-mail nem nome de pessoa (NOT-43).
 */
import { ehDataReal, mesDe, type Data } from '../datas.ts';

export interface PayloadPush {
  titulo: string;
  /** Ausente na cobrança: lá o payload tem só o título e o caminho (NOT-43). */
  texto?: string;
  /** Caminho relativo da mesma origem; o service worker só abre `/g/` ou `/app/` (NOT-37, NOT-48). */
  caminho: string;
}

export const TITULO_RANKING = 'Ranking atualizado';

export type TipoAvisoCobranca = 'cobranca_gerada' | 'pagamento_confirmado' | 'pagamento_atrasado';

/** O tipo do evento em texto claro (NOT-40, NOT-43). */
export const NOME_DO_TIPO: Readonly<Record<TipoAvisoCobranca, string>> = Object.freeze({
  cobranca_gerada: 'Cobrança gerada',
  pagamento_confirmado: 'Pagamento confirmado',
  pagamento_atrasado: 'Pagamento atrasado',
});

/** `AAAA-MM-DD` → `dd/mm`. */
export function diaEMes(data: Data): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

export interface EntradaRanking {
  nomeGrupo: string;
  slug: string;
  dataPartida: Data;
}

/** "Ranking atualizado", "<nome>: partida de dd/mm" e `/g/<slug>?mes=AAAA-MM` (NOT-25). */
export function payloadRanking({ nomeGrupo, slug, dataPartida }: EntradaRanking): PayloadPush {
  if (!ehDataReal(dataPartida)) throw new RangeError('Data da partida inválida.');
  return {
    titulo: TITULO_RANKING,
    texto: `${nomeGrupo}: partida de ${diaEMes(dataPartida)}`,
    caminho: `/g/${encodeURIComponent(slug)}?mes=${mesDe(dataPartida)}`,
  };
}

export interface EntradaCobranca {
  tipo: TipoAvisoCobranca;
  nomeGrupo: string;
  grupoId: string;
}

/**
 * Título "<tipo>: <nome do grupo>" e o caminho de Meu plano, `/app/grupos/<id>/plano` (S-05, AD-063, a conferir
 * pela T0 contra a `planos-e-cobranca`).
 */
export function payloadCobranca({ tipo, nomeGrupo, grupoId }: EntradaCobranca): PayloadPush {
  return {
    titulo: `${NOME_DO_TIPO[tipo]}: ${nomeGrupo}`,
    caminho: `/app/grupos/${encodeURIComponent(grupoId)}/plano`,
  };
}

/** Texto que vai para a cifra: JSON com só os campos do payload. */
export function serializarPayload(payload: PayloadPush): string {
  const { titulo, texto, caminho } = payload;
  return JSON.stringify(texto === undefined ? { titulo, caminho } : { titulo, texto, caminho });
}
