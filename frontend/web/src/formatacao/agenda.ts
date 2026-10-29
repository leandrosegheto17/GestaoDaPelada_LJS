import type { DiaSemana, Frequencia } from '@pelada/contrato';
import { ROTULO_DIA_SEMANA, ROTULO_FREQUENCIA } from '../rotulos';

const DIAS_MASCULINOS: readonly DiaSemana[] = ['domingo', 'sabado'];

/**
 * Agenda do grupo numa linha (cópia do legado): "Toda quinta · 20:00" (semanal), "Todo domingo · 09:00" ou
 * "Domingo, quinzenal · 09:00". O horário chega como `HH:MM`.
 */
export function descreverAgenda({
  diaSemana,
  frequencia,
  horario,
}: {
  diaSemana: DiaSemana;
  frequencia: Frequencia;
  horario: string;
}): string {
  const dia = ROTULO_DIA_SEMANA[diaSemana];
  if (frequencia === 'semanal') {
    const artigo = DIAS_MASCULINOS.includes(diaSemana) ? 'Todo' : 'Toda';
    return `${artigo} ${dia.toLowerCase()} · ${horario}`;
  }
  return `${dia}, ${ROTULO_FREQUENCIA[frequencia].toLowerCase()} · ${horario}`;
}
