import type { Mensagem, Remetente } from './remetente.ts';

export type RemetenteMemoria = Remetente & { readonly mensagens: Mensagem[] };

/** Remetente de teste e de `EMAIL_DEV=1`: guarda as mensagens em vez de enviar. */
export function remetenteMemoria(): RemetenteMemoria {
  const mensagens: Mensagem[] = [];
  return {
    mensagens,
    enviar(mensagem) {
      mensagens.push(mensagem);
      return Promise.resolve('enviado');
    },
  };
}

export function ehRemetenteMemoria(remetente: Remetente): remetente is RemetenteMemoria {
  return 'mensagens' in remetente && Array.isArray(remetente.mensagens);
}
