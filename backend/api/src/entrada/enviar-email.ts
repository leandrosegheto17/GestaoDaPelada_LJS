import type { Context } from 'hono';
import type { Modelo } from '../infraestrutura/email/modelos.ts';
import type { AppEnv } from './app.ts';

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Chave de idempotência do envio: tipo + hash do token (C5). */
export function chaveDeEnvio(tipo: string, tokenHash: Uint8Array): string {
  return `${tipo}-${hex(tokenHash)}`;
}

/**
 * Envia o e-mail pelo remetente do app. Verdadeiro se saiu; falso se o remetente falhou (a rota responde 503
 * `email_indisponivel` e a transação desfaz o cadastro ou o pedido, então pedir de novo funciona, ACE-52).
 */
export async function enviarModelo(
  c: Context<AppEnv>,
  envio: { para: string; modelo: Modelo; chave: string },
): Promise<boolean> {
  const { assunto, texto, html } = envio.modelo;
  const resultado = await c.var.remetente.enviar({ para: envio.para, assunto, texto, html, chave: envio.chave });
  return resultado === 'enviado';
}
