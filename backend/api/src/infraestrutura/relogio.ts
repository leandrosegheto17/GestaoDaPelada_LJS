/**
 * Relógio da API (T19; GEL-32, GEL-52, GEL-55). É a única peça que lê a hora (`GD:66-67`, `GD:296`): o domínio recebe
 * "hoje" como parâmetro (GEL-70) e o SQL não usa `now()` para regra de data. As datas de regra são do calendário de
 * São Paulo: às 22h de lá (01h UTC do dia seguinte) ainda é o dia de lá.
 *
 * O `criarApp({ relogio })` aceita um relógio falso para os testes; sem ele, vale o do sistema.
 */

export const FUSO_DO_GRUPO = 'America/Sao_Paulo';

export interface Relogio {
  /** Data de hoje em `AAAA-MM-DD`, no fuso de São Paulo. */
  hoje(): string;
  /** Instante atual em ISO 8601 (UTC), para auditoria e respostas. */
  agoraIso(): string;
}

const formatoData = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO_DO_GRUPO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** A data (`AAAA-MM-DD`) do instante no calendário de São Paulo. */
export function dataEmSaoPaulo(instante: Date): string {
  const partes = Object.fromEntries(formatoData.formatToParts(instante).map((p) => [p.type, p.value]));
  return `${partes['year']}-${partes['month']}-${partes['day']}`;
}

/** Relógio que lê a hora do sistema a cada chamada. */
export function relogioDoSistema(): Relogio {
  return {
    hoje: () => dataEmSaoPaulo(new Date()),
    agoraIso: () => new Date().toISOString(),
  };
}

/** Relógio parado num instante (ISO 8601), para os testes. */
export function relogioFixo(instanteIso: string): Relogio {
  const instante = new Date(instanteIso);
  if (Number.isNaN(instante.getTime())) throw new Error(`Instante inválido: ${instanteIso}`);
  return {
    hoje: () => dataEmSaoPaulo(instante),
    agoraIso: () => instante.toISOString(),
  };
}
