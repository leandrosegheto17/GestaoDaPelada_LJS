/**
 * Único lugar da API que lê o relógio (AD-015, ADR-012): "hoje" e o mês são sempre de São Paulo. O SQL não usa
 * `now()` nem `current_date` para regra de data, e o domínio recebe `hoje` como parâmetro. Cópia do legado.
 */
export interface Relogio {
  /** `AAAA-MM-DD` em America/Sao_Paulo. */
  hoje(): string;
  /** `AAAA-MM` em America/Sao_Paulo. */
  mes(): string;
  /** Instante atual em ISO 8601 (UTC). */
  agoraIso(): string;
}

const formatador = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Relógio a partir de uma fonte do instante; sem ela, o relógio real. */
export function criarRelogio(agora: () => Date = () => new Date()): Relogio {
  const hoje = (): string => formatador.format(agora());
  return {
    hoje,
    mes: () => hoje().slice(0, 7),
    agoraIso: () => agora().toISOString(),
  };
}

/**
 * Relógio parado em `data` (`AAAA-MM-DD`) às `hora` (`HH:MM`) de São Paulo, para os testes. São Paulo está em UTC−3
 * o ano todo desde 2019.
 */
export function relogioFixo(data: string, hora = '12:00'): Relogio {
  const instante = new Date(`${data}T${hora}:00-03:00`);
  return criarRelogio(() => instante);
}
