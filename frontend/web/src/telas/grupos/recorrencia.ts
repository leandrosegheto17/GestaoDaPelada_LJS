import type { DiaSemana, Frequencia } from '@pelada/contrato/grupo';
import { ROTULOS_DIA_SEMANA } from '../../componentes/CampoSeletor.tsx';

/**
 * Recorrência do grupo como o mockup mostra (`t08-grupos--sucesso.html`, `t09-inicio--sucesso.html`):
 * - semanal: "Toda quinta · 20:00" ("Todo sábado", "Todo domingo": os dias masculinos);
 * - quinzenal e mensal: "Domingo, quinzenal · 09:00", "Quinta, mensal · 20:00".
 * O mockup só mostra semanal e quinzenal; a mensal segue o molde da quinzenal.
 */

const MASCULINOS: ReadonlySet<DiaSemana> = new Set(['sabado', 'domingo']);

export function textoRecorrencia(g: { diaSemana: DiaSemana; frequencia: Frequencia; horario: string }): string {
  const dia = ROTULOS_DIA_SEMANA[g.diaSemana];
  if (g.frequencia === 'semanal') {
    const artigo = MASCULINOS.has(g.diaSemana) ? 'Todo' : 'Toda';
    return `${artigo} ${dia.toLowerCase()} · ${g.horario}`;
  }
  return `${dia}, ${g.frequencia} · ${g.horario}`;
}
