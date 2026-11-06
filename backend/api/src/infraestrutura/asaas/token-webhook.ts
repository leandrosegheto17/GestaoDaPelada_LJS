/**
 * Conferência do `asaas-access-token` do webhook (planos-e-cobranca T35; PLA-39). Em tempo constante: os dois valores
 * passam pelo SHA-256 e os 32 bytes são comparados sem sair no primeiro diferente, para o tempo não dizer quantos
 * caracteres acertou. Sem token configurado (ausente ou vazio), nada confere. O valor recebido nunca vai a log.
 *
 * O token configurado também precisa ser válido (PLA-38, A-11): de 32 a 255 caracteres e diferente da chave da API (são
 * segredos diferentes: um vazamento do token do webhook, que o Asaas guarda e manda em toda entrega, não pode abrir a
 * API). Configuração fora disso recusa tudo, como se não houvesse token.
 */

export const TOKEN_WEBHOOK_MIN = 32;
export const TOKEN_WEBHOOK_MAX = 255;

/** O token configurado serve? (32 a 255 caracteres e diferente da chave da API). */
export function tokenDoWebhookValido(esperado: string | undefined, chaveApi?: string): boolean {
  if (esperado === undefined) return false;
  if (esperado.length < TOKEN_WEBHOOK_MIN || esperado.length > TOKEN_WEBHOOK_MAX) return false;
  return chaveApi === undefined || chaveApi === '' || esperado !== chaveApi;
}

async function resumo(valor: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(valor)));
}

export async function tokenDoWebhookConfere(
  recebido: string | undefined,
  esperado: string | undefined,
  chaveApi?: string,
): Promise<boolean> {
  const configurado = tokenDoWebhookValido(esperado, chaveApi);
  // Calcula os dois resumos mesmo quando não vai conferir, para o caminho ter o mesmo custo.
  const [a, b] = await Promise.all([resumo(recebido ?? ''), resumo(esperado ?? '')]);
  let diferenca = 0;
  for (let i = 0; i < a.length; i += 1) diferenca |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return configurado && recebido !== undefined && diferenca === 0;
}
