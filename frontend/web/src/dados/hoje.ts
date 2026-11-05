/**
 * "Hoje" no fuso de São Paulo, em `AAAA-MM-DD` (o mesmo formato do relógio da API, T19). Só para o
 * `max` e o valor sugerido das datas na tela: quem valida a data contra hoje é a API (GEL-33).
 */
export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(agora);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '';
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}
