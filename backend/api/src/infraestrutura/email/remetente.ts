export interface Mensagem {
  para: string;
  assunto: string;
  texto: string;
  html: string;
  /** Chave de idempotência do envio (tipo + hash do token): repetir a chave não envia duas vezes. */
  chave: string;
}

/** `falhou` cobre qualquer resposta que não seja 2xx, inclusive a cota diária esgotada (ACE-52). */
export type ResultadoEnvio = 'enviado' | 'falhou';

export interface Remetente {
  enviar(mensagem: Mensagem): Promise<ResultadoEnvio>;
}
