/**
 * Marcações do lançamento e da edição da partida (T8; PAR-23 a PAR-27).
 */
import { ativoEm, type Data, type Periodo } from '../atividade/datas.ts';
import type { SituacaoGravada } from '../pontuacao/pesos.ts';

/** Situação que o admin marca para cada jogador; `ausente` não grava linha (PAR-23). */
export type SituacaoMarcacao = 'ausente' | SituacaoGravada;

export const SITUACOES_MARCACAO: readonly SituacaoMarcacao[] = Object.freeze([
  'ausente',
  'presente',
  'lesionado',
  'expulso',
]);

/** A mesma para inativo na data, inexistente e de outro grupo: não revela quem é de outro grupo (PAR-24). */
export const MENSAGEM_JOGADOR_INATIVO = 'Jogador não está ativo nesta data.';
export const MENSAGEM_JOGADOR_REPETIDO = 'Há jogador repetido nas marcações.';
// SPEC_DEVIATION: PAR-26 pede a recusa no campo da marcação sem fixar o texto; usa-se o padrão das escolhas do
// contrato ("Escolha a posição.").
export const MENSAGEM_SITUACAO = 'Escolha a situação.';

export interface Marcacao {
  jogadorId: string;
  /** Texto recebido: o domínio recusa o que não é uma das quatro situações (PAR-26). */
  situacao: string;
}

export interface PresencaMarcada {
  jogadorId: string;
  situacao: SituacaoGravada;
}

export interface ContagemDaPartida {
  presentes: number;
  lesionados: number;
  expulsos: number;
}

export type ResultadoMarcacoes =
  | { ok: true; presencas: PresencaMarcada[]; contagem: ContagemDaPartida }
  | { ok: false; campos: Record<string, string> };

/** Os jogadores ativos na data (PAR-27): algum período [início, fim) a contém. */
export function ativosNaData<T extends { periodos: readonly Periodo[] }>(
  jogadores: readonly T[],
  data: Data,
): T[] {
  return jogadores.filter((j) => ativoEm(j.periodos, data));
}

const ehSituacao = (valor: string): valor is SituacaoMarcacao =>
  (SITUACOES_MARCACAO as readonly string[]).includes(valor);

/**
 * Confere as marcações contra os ativos na data da partida: cada jogador aparece uma vez (PAR-25), precisa estar ativo
 * (PAR-24; inativo, inexistente e de outro grupo dão a mesma mensagem, porque nenhum deles está na lista) e ter uma das
 * quatro situações (PAR-26). Reúne todos os problemas; com qualquer um, nada é aceito. Só presente, lesionado e
 * expulso viram presença (PAR-23).
 */
export function validarMarcacoes(
  ativos: readonly { id: string }[],
  marcacoes: readonly Marcacao[],
): ResultadoMarcacoes {
  const permitidos = new Set(ativos.map((j) => j.id));
  const vistos = new Set<string>();
  const campos: Record<string, string> = {};
  marcacoes.forEach((marcacao, indice) => {
    if (vistos.has(marcacao.jogadorId)) campos['marcacoes'] = MENSAGEM_JOGADOR_REPETIDO;
    else if (!permitidos.has(marcacao.jogadorId))
      campos[`marcacoes.${indice}.jogadorId`] = MENSAGEM_JOGADOR_INATIVO;
    if (!ehSituacao(marcacao.situacao)) campos[`marcacoes.${indice}.situacao`] = MENSAGEM_SITUACAO;
    vistos.add(marcacao.jogadorId);
  });
  if (Object.keys(campos).length > 0) return { ok: false, campos };

  const presencas = marcacoes.flatMap((marcacao): PresencaMarcada[] =>
    marcacao.situacao === 'ausente'
      ? []
      : [{ jogadorId: marcacao.jogadorId, situacao: marcacao.situacao as SituacaoGravada }],
  );
  return { ok: true, presencas, contagem: contagemDaPartida(presencas) };
}

/** Presentes, lesionados e expulsos da partida; `ausente` não entra (PAR-23). */
export function contagemDaPartida(presencas: readonly { situacao: string }[]): ContagemDaPartida {
  const contagem: ContagemDaPartida = { presentes: 0, lesionados: 0, expulsos: 0 };
  for (const { situacao } of presencas) {
    if (situacao === 'presente') contagem.presentes++;
    else if (situacao === 'lesionado') contagem.lesionados++;
    else if (situacao === 'expulso') contagem.expulsos++;
  }
  return contagem;
}
