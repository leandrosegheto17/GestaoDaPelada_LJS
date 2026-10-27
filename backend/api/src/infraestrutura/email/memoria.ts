import type { Mensagem, Remetente } from './remetente.ts';

/** Remetente de teste e de `EMAIL_DEV=1`: guarda as mensagens em vez de enviar. */
export function remetenteMemoria(): Remetente & { readonly mensagens: Mensagem[] } {
  const mensagens: Mensagem[] = [];
  return {
    mensagens,
    enviar(mensagem) {
      mensagens.push(mensagem);
      return Promise.resolve('enviado');
    },
  };
}
