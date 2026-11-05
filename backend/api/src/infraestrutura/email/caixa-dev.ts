import {
  remetenteMemoria,
  remetenteResend,
  type Remetente,
  type RemetenteMemoria,
} from './resend.ts';

/**
 * Caixa de e-mails de desenvolvimento (T17; ACE-52). Com `EMAIL_DEV=1` (só no `.env` local e no
 * e2e, nunca no `wrangler.jsonc`), os e-mails ficam nesta caixa em memória, do isolate do Worker,
 * e `GET /api/dev/emails` os lista. Sem ela, o envio é pelo Resend.
 */

export const caixaDev: RemetenteMemoria = remetenteMemoria();

export interface AmbienteEmail {
  EMAIL_DEV?: string;
  RESEND_API_KEY?: string;
  RESEND_REMETENTE?: string;
}

export function emailDevLigado(env: AmbienteEmail): boolean {
  return env.EMAIL_DEV === '1';
}

/** O remetente da requisição: a caixa de dev com `EMAIL_DEV=1`, senão o Resend. */
export function remetenteDoAmbiente(env: AmbienteEmail): Remetente {
  return emailDevLigado(env) ? caixaDev : remetenteResend(env);
}
