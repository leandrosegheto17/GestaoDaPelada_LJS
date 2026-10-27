import type { Remetente } from './remetente.ts';
import { remetenteResend } from './resend.ts';

export interface ConfigEmail {
  RESEND_API_KEY?: string | undefined;
  RESEND_REMETENTE?: string | undefined;
}

/** Sem chave configurada o envio falha (ACE-52): a rota responde 503 e o log diz só que falta configuração. */
const semConfiguracao: Remetente = {
  enviar() {
    console.error('email: remetente não configurado');
    return Promise.resolve('falhou');
  },
};

/** Escolhe o remetente do ambiente: Resend quando há chave e endereço; senão, o que sempre falha. */
export function remetenteDoAmbiente(env: ConfigEmail): Remetente {
  if (env.RESEND_API_KEY && env.RESEND_REMETENTE) {
    return remetenteResend({ RESEND_API_KEY: env.RESEND_API_KEY, RESEND_REMETENTE: env.RESEND_REMETENTE });
  }
  return semConfiguracao;
}
