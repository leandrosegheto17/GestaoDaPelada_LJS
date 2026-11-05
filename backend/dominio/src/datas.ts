/**
 * Datas e meses da partidas-e-ranking (T1; PAR-19, PAR-39, PAR-65, PAR-84, PAR-85). Datas em `AAAA-MM-DD`, meses em
 * `AAAA-MM`: a ordem do texto é a ordem do calendário. Nenhuma função lê relógio: "hoje" chega por parâmetro (AD-015).
 * A validade da data e o intervalo [início, fim) são os da grupos-e-elenco (`atividade/datas.ts`), sem duplicar.
 */
import { ehDataValida, somarDias, type Data } from './atividade/datas.ts';

export type { Data };

/** Mês no calendário, `AAAA-MM`. */
export type Mes = string;

/** 0 = domingo … 6 = sábado. */
export type DiaDaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Dia da semana como o grupo grava (`grupos.dia_semana`). */
export type NomeDiaDaSemana = 'domingo' | 'segunda' | 'terca' | 'quarta' | 'quinta' | 'sexta' | 'sabado';

export const NUMERO_DO_DIA: Readonly<Record<NomeDiaDaSemana, DiaDaSemana>> = Object.freeze({
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
});

/** Data `AAAA-MM-DD` que existe no calendário (PAR-19): a mesma regra da grupos-e-elenco. */
export function ehDataReal(valor: unknown): valor is Data {
  return ehDataValida(valor);
}

const FORMATO_MES = /^(\d{4})-(\d{2})$/;

/** Texto `AAAA-MM` com mês de 01 a 12 (PAR-39, PAR-65). */
export function ehMes(valor: unknown): valor is Mes {
  if (typeof valor !== 'string') return false;
  const m = FORMATO_MES.exec(valor);
  if (!m) return false;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  return ano >= 1 && mes >= 1 && mes <= 12;
}

const doisDigitos = (n: number): string => String(n).padStart(2, '0');
const montarMes = (ano: number, mes: number): Mes => `${String(ano).padStart(4, '0')}-${doisDigitos(mes)}`;

function partesDoMes(mes: Mes): [number, number] {
  const [ano, m] = mes.split('-').map(Number) as [number, number];
  return [ano, m];
}

/** Mês de uma data. */
export function mesDe(data: Data): Mes {
  return data.slice(0, 7);
}

/** Dia 1 do mês. */
export function primeiroDia(mes: Mes): Data {
  return `${mes}-01`;
}

/** Último dia do mês (28, 29, 30 ou 31). */
export function ultimoDia(mes: Mes): Data {
  return vespera(primeiroDia(mesSeguinte(mes)));
}

/** O dia anterior. */
export function vespera(data: Data): Data {
  return somarDias(data, -1);
}

/** Mês anterior (PAR-84): janeiro volta para dezembro do ano anterior. */
export function mesAnterior(mes: Mes): Mes {
  const [ano, m] = partesDoMes(mes);
  return m === 1 ? montarMes(ano - 1, 12) : montarMes(ano, m - 1);
}

/** Mês seguinte (PAR-85): dezembro vai para janeiro do ano seguinte. */
export function mesSeguinte(mes: Mes): Mes {
  const [ano, m] = partesDoMes(mes);
  return m === 12 ? montarMes(ano + 1, 1) : montarMes(ano, m + 1);
}

/** Negativo, zero ou positivo. */
export function compararMeses(a: Mes, b: Mes): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Negativo, zero ou positivo. */
export function compararDatas(a: Data, b: Data): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Dia da semana pelo calendário (sem fuso). */
export function diaDaSemana(data: Data): DiaDaSemana {
  const [ano, mes, dia] = data.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay() as DiaDaSemana;
}
