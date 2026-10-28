import type { Remetente } from './remetente.ts';

// A API HTTP do Resend (pesquisa de 2026-10-26): `Idempotency-Key` de até 256 caracteres, válida por 24 h.
const ENDERECO = 'https://api.resend.com/emails';

export interface ConfigResend {
  RESEND_API_KEY: string;
  RESEND_REMETENTE: string;
}

/** Só o código de erro do Resend (`name`, como `daily_quota_exceeded`); nunca a mensagem nem o corpo (ACE-21). */
async function codigoDoErro(resposta: Response): Promise<string> {
  try {
    const corpo = (await resposta.json()) as { name?: unknown };
    return typeof corpo.name === 'string' && /^[a-z_]{1,64}$/.test(corpo.name) ? corpo.name : 'desconhecido';
  } catch {
    return 'desconhecido';
  }
}

/**
 * Tempo máximo de um envio ao Resend (ACE-75; SEC-CA-13). Acima dele, o pedido é abortado e vira `falhou`: a rota
 * responde 503 e a transação desfaz a reserva da cota, que não fica presa à espera de um provedor lento.
 */
export const TEMPO_MAXIMO_RESEND_MS = 10_000;

export function remetenteResend(config: ConfigResend, buscar: typeof fetch = fetch): Remetente {
  return {
    async enviar(mensagem) {
      // AbortController com setTimeout (e não AbortSignal.timeout) para o relógio simulado dos testes valer.
      const controle = new AbortController();
      const relogio = setTimeout(() => controle.abort(), TEMPO_MAXIMO_RESEND_MS);
      try {
        let resposta: Response;
        try {
          resposta = await buscar(ENDERECO, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${config.RESEND_API_KEY}`,
              'Content-Type': 'application/json',
              'Idempotency-Key': mensagem.chave,
            },
            body: JSON.stringify({
              from: config.RESEND_REMETENTE,
              to: [mensagem.para],
              subject: mensagem.assunto,
              text: mensagem.texto,
              html: mensagem.html,
            }),
            signal: controle.signal,
          });
        } catch (erro) {
          const motivo = controle.signal.aborted ? 'tempo esgotado' : erro instanceof Error ? erro.name : 'erro';
          console.error(`email: falha de rede (${motivo})`);
          return 'falhou';
        }
        if (resposta.ok) return 'enviado';
        console.error(`email: Resend recusou status=${resposta.status} codigo=${await codigoDoErro(resposta)}`);
        return 'falhou';
      } finally {
        clearTimeout(relogio);
      }
    },
  };
}
