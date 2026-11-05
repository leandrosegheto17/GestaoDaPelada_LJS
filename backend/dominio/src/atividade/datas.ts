/**
 * Tipos dos períodos de atividade, o intervalo [início, fim) e a validade das datas (GEL-61, GEL-63, GEL-64).
 * Datas em `AAAA-MM-DD`: a ordem do texto é a ordem do calendário, então a comparação é de texto. "Hoje" chega como
 * parâmetro (GEL-70).
 */

/** Data no calendário, `AAAA-MM-DD`. */
export type Data = string;

/** Período de atividade: [início, fim), com `fim` nulo para o período aberto. */
export interface Periodo {
  id?: string;
  inicio: Data;
  fim: Data | null;
}

/** O campo de período que uma operação muda: a saída (`fim`) ou o retorno (`inicio`). */
export type CampoPeriodo = 'saida' | 'retorno';

/** As regras, na ordem do GEL-62. */
export type RegraPeriodo =
  | 'data-invalida'
  | 'nao-corrigivel'
  | 'futuro'
  | 'saida-antes-do-inicio'
  | 'retorno-antes-da-saida-anterior'
  | 'saida-depois-do-proximo-retorno'
  | 'retorno-depois-da-saida'
  | 'sobreposicao'
  | 'presenca'
  | 'antes-do-inicio-da-pontuacao';

export interface FalhaPeriodo {
  ok: false;
  regra: RegraPeriodo;
  mensagem: string;
  campo: CampoPeriodo;
}

export const MENSAGEM_DATA_INVALIDA = 'Informe uma data válida.';
export const MENSAGEM_FUTURO = 'A data não pode ser no futuro.';

const FORMATO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Dias de cada mês; fevereiro com 29 só em ano bissexto. */
function diasNoMes(ano: number, mes: number): number {
  if (mes === 2) return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(mes) ? 30 : 31;
}

/** Texto `AAAA-MM-DD` com zeros à esquerda e que existe no calendário (GEL-63). */
export function ehDataValida(valor: unknown): valor is Data {
  if (typeof valor !== 'string') return false;
  const m = FORMATO.exec(valor);
  if (!m) return false;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  return ano >= 1 && mes >= 1 && mes <= 12 && dia >= 1 && dia <= diasNoMes(ano, mes);
}

/** A data é posterior a hoje (GEL-64). Hoje não é futuro. */
export function ehFutura(data: Data, hoje: Data): boolean {
  return data > hoje;
}

/** Soma `n` dias (negativo subtrai), pelo calendário UTC: sem fuso nem horário de verão. */
export function somarDias(data: Data, n: number): Data {
  const [ano, mes, dia] = data.split('-').map(Number) as [number, number, number];
  const d = new Date(Date.UTC(ano, mes - 1, dia + n));
  return d.toISOString().slice(0, 10);
}

/** A data está dentro do período [início, fim). */
export function contem(periodo: Periodo, data: Data): boolean {
  return periodo.inicio <= data && (periodo.fim === null || data < periodo.fim);
}

/** O jogador está ativo na data: algum período a contém. */
export function ativoEm(periodos: readonly Periodo[], data: Data): boolean {
  return periodos.some((p) => contem(p, data));
}

/**
 * Dois períodos [início, fim) têm algum dia em comum (GEL-61): sair e voltar no mesmo dia não sobrepõe.
 * Período vazio (início = fim, que o banco aceita) não cobre nenhum dia e não sobrepõe nada.
 * [LACUNA] A spec não diz se uma saída no mesmo dia do início (período vazio) é válida; vale a interpretação acima,
 * que não recusa o que o banco aceita (`periodo_fim_depois_inicio`).
 */
export function sobrepoem(a: Periodo, b: Periodo): boolean {
  if (a.fim === a.inicio || b.fim === b.inicio) return false;
  const aAntesDoFimDeB = b.fim === null || a.inicio < b.fim;
  const bAntesDoFimDeA = a.fim === null || b.inicio < a.fim;
  return aAntesDoFimDeB && bAntesDoFimDeA;
}

/**
 * Valida uma data informada: real (GEL-63) e não futura (GEL-64), nesta ordem. Devolve a primeira falha, ou nulo.
 */
export function validarData(valor: unknown, hoje: Data, campo: CampoPeriodo): FalhaPeriodo | null {
  if (!ehDataValida(valor))
    return { ok: false, regra: 'data-invalida', mensagem: MENSAGEM_DATA_INVALIDA, campo };
  if (ehFutura(valor, hoje))
    return { ok: false, regra: 'futuro', mensagem: MENSAGEM_FUTURO, campo };
  return null;
}
