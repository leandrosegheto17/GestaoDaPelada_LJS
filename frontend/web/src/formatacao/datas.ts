import { DIAS_DA_SEMANA } from '@pelada/contrato';
import { ROTULO_DIA_SEMANA } from '../rotulos';

const DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
const MES = /^(\d{4})-(\d{2})$/;

const FUSO = 'America/Sao_Paulo';
const formatoDiaSemana = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' });
const formatoMes = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const formatoInstante = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO,
  hourCycle: 'h23',
  year: 'numeric',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function lerData(texto: string): { ano: number; mes: number; dia: number } {
  const achado = DATA.exec(texto);
  if (!achado) throw new RangeError(`Data inválida: "${texto}".`);
  const [ano, mes, dia] = [Number(achado[1]), Number(achado[2]), Number(achado[3])];
  const conferida = new Date(Date.UTC(ano, mes - 1, dia));
  if (conferida.getUTCFullYear() !== ano || conferida.getUTCMonth() !== mes - 1 || conferida.getUTCDate() !== dia) {
    throw new RangeError(`Data inexistente: "${texto}".`);
  }
  return { ano, mes, dia };
}

/** `2026-10-22` → `22/10/2026` (calendário, sem fuso). */
export function dataCompleta(data: string): string {
  lerData(data);
  return `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;
}

/** `2026-10-15` → `Quinta, 15/10/2026` (dia da semana por extenso, como nos rótulos do app). */
export function diaSemanaData(data: string): string {
  const { ano, mes, dia } = lerData(data);
  const chave = DIAS_DA_SEMANA[new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()];
  if (!chave) throw new RangeError(`Data inválida: "${data}".`);
  return `${ROTULO_DIA_SEMANA[chave]}, ${dataCompleta(data)}`;
}

/** `2026-10-22` → `22/10`. */
export function diaMes(data: string): string {
  lerData(data);
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

/** `2026-10-22` → `qui, 22/10`. */
export function diaSemanaCurto(data: string): string {
  const { ano, mes, dia } = lerData(data);
  const semana = formatoDiaSemana.format(new Date(Date.UTC(ano, mes - 1, dia))).replace('.', '');
  return `${semana}, ${diaMes(data)}`;
}

/** `2026-10` → `outubro de 2026`. */
export function mesPorExtenso(mes: string): string {
  const achado = MES.exec(mes);
  const numero = Number(achado?.[2]);
  if (!achado || numero < 1 || numero > 12) throw new RangeError(`Mês inválido: "${mes}".`);
  return formatoMes.format(new Date(Date.UTC(Number(achado[1]), numero - 1, 1)));
}

/** `2026-10` → `outubro` (só o nome do mês). */
export function nomeMes(mes: string): string {
  return mesPorExtenso(mes).replace(/ de \d+$/, '');
}

/** `2026-10` → `10/2026`. */
export function mesNumerico(mes: string): string {
  const achado = MES.exec(mes);
  const numero = Number(achado?.[2]);
  if (!achado || numero < 1 || numero > 12) throw new RangeError(`Mês inválido: "${mes}".`);
  return `${achado[2]}/${achado[1]}`;
}

function partesDoInstante(iso: string): Record<string, string> {
  const instante = new Date(iso);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(iso) || Number.isNaN(instante.getTime())) {
    throw new RangeError(`Instante inválido: "${iso}".`);
  }
  const partes: Record<string, string> = {};
  for (const parte of formatoInstante.formatToParts(instante)) partes[parte.type] = parte.value;
  return partes;
}

/** Instante ISO → `hh:mm` em America/Sao_Paulo. */
export function hora(iso: string): string {
  const p = partesDoInstante(iso);
  return `${p.hour}:${p.minute}`;
}

/** Instante ISO → `dd/mm hh:mm` em America/Sao_Paulo. */
export function diaMesHora(iso: string): string {
  const p = partesDoInstante(iso);
  return `${p.day}/${p.month} ${p.hour}:${p.minute}`;
}

/** Instante ISO → `dd/mm/aaaa hh:mm` em America/Sao_Paulo. */
export function dataHoraCompleta(iso: string): string {
  const p = partesDoInstante(iso);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** `2026-10` → `out` (três letras do mês, sem ponto). */
export function siglaMes(mes: string): string {
  return nomeMes(mes).slice(0, 3);
}
