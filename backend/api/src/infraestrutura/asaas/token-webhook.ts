/**
 * Conferência do `asaas-access-token` do webhook (planos-e-cobranca T35; PLA-39). Em tempo constante: os dois valores
 * passam pelo SHA-256 e os 32 bytes são comparados sem sair no primeiro diferente, para o tempo não dizer quantos
 * caracteres acertou. Sem token configurado (ausente ou vazio), nada confere. O valor recebido nunca vai a log.
 */

async function resumo(valor: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(valor)));
}

export async function tokenDoWebhookConfere(
  recebido: string | undefined,
  esperado: string | undefined,
): Promise<boolean> {
  const configurado = esperado !== undefined && esperado.length > 0;
  // Calcula os dois resumos mesmo quando não vai conferir, para o caminho ter o mesmo custo.
  const [a, b] = await Promise.all([resumo(recebido ?? ''), resumo(esperado ?? '')]);
  let diferenca = 0;
  for (let i = 0; i < a.length; i += 1) diferenca |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return configurado && recebido !== undefined && diferenca === 0;
}
