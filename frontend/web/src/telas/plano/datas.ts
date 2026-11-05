/** "2026-11-14" → "14/11/2026" (Meu plano, planos-e-cobranca T44 e T46). */
export function dataBr(data: string): string {
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}
