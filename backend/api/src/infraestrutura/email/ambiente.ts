import { remetenteMemoria } from './memoria.ts';
import type { Remetente } from './remetente.ts';
import { remetenteResend } from './resend.ts';

export interface ConfigEmail {
  RESEND_API_KEY?: string | undefined;
  RESEND_REMETENTE?: string | undefined;
  /** `1` só no desenvolvimento local: as mensagens ficam numa caixa em memória, lida por `GET /api/dev/emails`. */
  EMAIL_DEV?: string | undefined;
}

/** Sem chave configurada o envio falha (ACE-52): a rota responde 503 e o log diz só que falta configuração. */
const semConfiguracao: Remetente = {
  enviar() {
    console.error('email: remetente não configurado');
    return Promise.resolve('falhou');
  },
};

/** Caixa do `EMAIL_DEV=1`: vive enquanto o Worker local vive. Em produção a variável não existe e ela nunca é criada. */
let caixaDeDesenvolvimento: ReturnType<typeof remetenteMemoria> | undefined;

/**
 * Escolhe o remetente do ambiente: a caixa em memória com `EMAIL_DEV=1`; o Resend quando há chave e endereço; senão,
 * o que sempre falha.
 */
export function remetenteDoAmbiente(env: ConfigEmail): Remetente {
  if (env.EMAIL_DEV === '1') return (caixaDeDesenvolvimento ??= remetenteMemoria());
  if (env.RESEND_API_KEY && env.RESEND_REMETENTE) {
    return remetenteResend({ RESEND_API_KEY: env.RESEND_API_KEY, RESEND_REMETENTE: env.RESEND_REMETENTE });
  }
  return semConfiguracao;
}
