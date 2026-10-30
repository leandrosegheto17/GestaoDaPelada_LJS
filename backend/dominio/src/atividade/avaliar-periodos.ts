import { compararDatas, exigirData, type Data } from '../datas.ts';
import { formatarData, type PeriodoEntrada } from './atividade.ts';
import { validarPresencas, type PresencaJogador } from './cobertura-periodos.ts';
import {
  datasInformadas,
  emOrdem,
  falhaPeriodo,
  validarFormato,
  validarFuturo,
  validarPeriodos,
  type CampoPeriodo,
  type FalhaPeriodo,
  type PeriodoResultado,
} from './validar-periodos.ts';

export type OperacaoPeriodo =
  | { tipo: 'corrigir'; periodoId: string; saida?: unknown; retorno?: unknown }
  | { tipo: 'inativar'; data: unknown }
  | { tipo: 'reativar'; data: unknown };

export interface EntradaAvaliacao {
  /** Os períodos do jogador como estão gravados, em qualquer ordem. */
  periodos: readonly PeriodoEntrada[];
  operacao: OperacaoPeriodo;
  /** Hoje em São Paulo, vindo de fora: o domínio não lê relógio (GEL-70). */
  hoje: Data;
  /** Data de início da pontuação do jogador (`jogadores.inicio_pontuacao`). */
  inicioPontuacao: Data;
  /** Presenças do jogador nas partidas do grupo. */
  presencas: readonly PresencaJogador[];
}

export type ResultadoAvaliacao = { ok: true; periodos: PeriodoResultado[]; alterado: boolean } | FalhaPeriodo;

const MENSAGEM_NAO_CORRIGIVEL: Record<CampoPeriodo, string> = {
  saida: 'Este período não tem data de saída.',
  retorno: 'O início do primeiro período é a data de início da pontuação; use Alterar data de início.',
};

type Contexto = Omit<EntradaAvaliacao, 'operacao' | 'periodos'>;

/** Regras de ordem e sobreposição, presença (GEL-68) e início da pontuação (GEL-69) de uma edição de período. */
function avaliarEdicao(
  ordenados: PeriodoEntrada[],
  indice: number,
  campos: { saida?: Data; retorno?: Data },
  contexto: Contexto,
): ResultadoAvaliacao {
  const alvo = ordenados[indice]!;
  const validacao = validarPeriodos({ periodos: ordenados, periodoId: alvo.id, ...campos, hoje: contexto.hoje });
  if (!validacao.ok) return validacao;
  const depois = validacao.periodos;
  const presenca = validarPresencas({
    antes: ordenados,
    depois,
    presencas: contexto.presencas,
    inicioDoAlvo: depois[indice]!.inicio,
    saidaInformada: campos.saida !== undefined,
  });
  if (presenca) return presenca;
  if (indice === 0 && campos.saida !== undefined && compararDatas(campos.saida, contexto.inicioPontuacao) < 0) {
    return falhaPeriodo(
      'antes-do-inicio-da-pontuacao',
      'saida',
      `A saída do primeiro período não pode ser antes da data de início da pontuação (${formatarData(contexto.inicioPontuacao)}). Para ir antes, altere primeiro a data de início.`,
    );
  }
  return { ok: true, periodos: depois, alterado: true };
}

function corrigir(
  ordenados: PeriodoEntrada[],
  operacao: Extract<OperacaoPeriodo, { tipo: 'corrigir' }>,
  contexto: Contexto,
): ResultadoAvaliacao {
  const informadas = datasInformadas(operacao);
  const formato = validarFormato(informadas);
  if (formato) return formato;
  const indice = ordenados.findIndex((p) => p.id === operacao.periodoId);
  const atual = ordenados[indice];
  const corrigivel: Record<CampoPeriodo, boolean> = {
    saida: atual !== undefined && atual.fim !== null,
    retorno: atual !== undefined && indice > 0,
  };
  if (atual === undefined && informadas.length === 0) {
    return falhaPeriodo('nao-corrigivel', 'saida', MENSAGEM_NAO_CORRIGIVEL.saida);
  }
  for (const [campo] of informadas) {
    if (!corrigivel[campo]) return falhaPeriodo('nao-corrigivel', campo, MENSAGEM_NAO_CORRIGIVEL[campo]);
  }
  const futuro = validarFuturo(informadas, contexto.hoje);
  if (futuro) return futuro;
  const campos = { saida: operacao.saida as Data | undefined, retorno: operacao.retorno as Data | undefined };
  const igual =
    (campos.saida === undefined || campos.saida === atual!.fim) &&
    (campos.retorno === undefined || campos.retorno === atual!.inicio);
  if (igual) return { ok: true, periodos: ordenados, alterado: false };
  return avaliarEdicao(ordenados, indice, semIndefinidos(campos), contexto);
}

function semIndefinidos(campos: { saida?: Data; retorno?: Data }): { saida?: Data; retorno?: Data } {
  return {
    ...(campos.saida !== undefined ? { saida: campos.saida } : {}),
    ...(campos.retorno !== undefined ? { retorno: campos.retorno } : {}),
  };
}

function inativar(ordenados: PeriodoEntrada[], data: unknown, contexto: Contexto): ResultadoAvaliacao {
  const informadas = datasInformadas({ saida: data ?? null });
  const invalida = validarFormato(informadas) ?? validarFuturo(informadas, contexto.hoje);
  if (invalida) return invalida;
  const indice = ordenados.findIndex((p) => p.fim === null);
  if (indice < 0) throw new RangeError('Inativar pede um período aberto: o jogador já está inativo.');
  return avaliarEdicao(ordenados, indice, { saida: data as Data }, contexto);
}

function reativar(ordenados: PeriodoEntrada[], data: unknown, contexto: Contexto): ResultadoAvaliacao {
  const validacao = validarPeriodos({
    periodos: ordenados,
    periodoId: null,
    retorno: data ?? null,
    hoje: contexto.hoje,
  });
  return validacao.ok ? { ...validacao, alterado: true } : validacao;
}

/**
 * Avaliação única de inativar, reativar e corrigir datas de período (GEL-58, GEL-62). Devolve só a primeira regra
 * que falha, na ordem: data válida, campo corrigível, data não futura, regras de ordem, sobreposição, presença e
 * início da pontuação. Não altera a entrada nem lê relógio (GEL-70).
 */
export function avaliarPeriodos(entrada: EntradaAvaliacao): ResultadoAvaliacao {
  const { operacao, periodos, ...contexto } = entrada;
  exigirData(contexto.hoje, 'Hoje');
  exigirData(contexto.inicioPontuacao, 'Início da pontuação');
  const ordenados = emOrdem(periodos);
  switch (operacao.tipo) {
    case 'corrigir':
      return corrigir(ordenados, operacao, contexto);
    case 'inativar':
      return inativar(ordenados, operacao.data, contexto);
    case 'reativar':
      return reativar(ordenados, operacao.data, contexto);
  }
}
