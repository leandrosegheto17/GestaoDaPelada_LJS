/**
 * Envio dos e-mails de conta (T15; ACE-21, ACE-52, ACE-75). Decisão do design do LJS
 * (`design.md:176-187`): `fetch` direto para a API do Resend, sem SDK. Escrito do zero.
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - 2xx: `enviado`.
 * - 4xx (domínio não verificado, dado recusado), 429 (cota do Resend) e 5xx: `falhou`.
 * - Rede caída (o `fetch` lança): `falhou`.
 * - Sem resposta em 10 s: o pedido é abortado e vira `falhou` (ACE-75).
 * - Sem `RESEND_API_KEY` ou sem `RESEND_REMETENTE`: `falhou`, sem chamar a rede.
 * O log da falha leva só o tipo do e-mail, o status HTTP e o código de erro do Resend (o campo
 * `name` do corpo); nunca o destino, o assunto, o corpo, o link nem o token (ACE-21).
 */

export const URL_RESEND = 'https://api.resend.com/emails';

/** Tempo máximo de espera pelo Resend (ACE-75). */
export const TEMPO_LIMITE_MS = 10_000;

export type TipoEmail = 'confirmacao' | 'recuperacao' | 'convite' | 'aviso_cadastro';

export interface Mensagem {
  tipo: TipoEmail;
  para: string;
  assunto: string;
  texto: string;
  html: string;
  /** Chave de idempotência do Resend: o mesmo pedido repetido não envia duas vezes. */
  idempotencia: string;
}

export type ResultadoEnvio = 'enviado' | 'falhou';

export interface Remetente {
  enviar(mensagem: Mensagem): Promise<ResultadoEnvio>;
}

/** Linha de log estruturada; só campos sem dado pessoal. */
export type Registro = (linha: Record<string, string | number>) => void;

const registroPadrao: Registro = (linha) => console.error(JSON.stringify(linha));

export interface ConfigResend {
  RESEND_API_KEY?: string;
  RESEND_REMETENTE?: string;
}

export interface OpcoesResend {
  fetch?: typeof fetch;
  registrar?: Registro;
  tempoLimiteMs?: number;
}

/** Código de erro do corpo do Resend (`name`), sem ler nada além dele. */
async function codigoDoErro(resposta: Response): Promise<string> {
  try {
    const corpo: unknown = await resposta.json();
    if (typeof corpo === 'object' && corpo !== null && 'name' in corpo && typeof corpo.name === 'string') {
      return /^[a-z_]{1,64}$/.test(corpo.name) ? corpo.name : 'desconhecido';
    }
  } catch {
    // corpo que não é JSON
  }
  return 'desconhecido';
}

export function remetenteResend(config: ConfigResend, opcoes: OpcoesResend = {}): Remetente {
  const buscar = opcoes.fetch ?? fetch;
  const registrar = opcoes.registrar ?? registroPadrao;
  const tempoLimite = opcoes.tempoLimiteMs ?? TEMPO_LIMITE_MS;

  return {
    async enviar(m) {
      const falha = (status: number, codigo: string): ResultadoEnvio => {
        registrar({ evento: 'email_falhou', tipo: m.tipo, status, codigo });
        return 'falhou';
      };
      if (!config.RESEND_API_KEY || !config.RESEND_REMETENTE) return falha(0, 'sem_configuracao');

      const controle = new AbortController();
      const relogio = setTimeout(() => controle.abort(), tempoLimite);
      try {
        const resposta = await buscar(URL_RESEND, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': m.idempotencia,
          },
          body: JSON.stringify({
            from: config.RESEND_REMETENTE,
            to: [m.para],
            subject: m.assunto,
            text: m.texto,
            html: m.html,
          }),
          signal: controle.signal,
        });
        if (resposta.ok) return 'enviado';
        return falha(resposta.status, await codigoDoErro(resposta));
      } catch {
        return falha(0, controle.signal.aborted ? 'tempo_esgotado' : 'rede');
      } finally {
        clearTimeout(relogio);
      }
    },
  };
}

export interface RemetenteMemoria extends Remetente {
  /** As mensagens enviadas, da mais antiga à mais nova. */
  readonly mensagens: Mensagem[];
  /** Faz os próximos `n` envios falharem (para os testes do ACE-52). */
  falharProximos(n: number): void;
  limpar(): void;
}

/** Remetente de desenvolvimento e teste: guarda as mensagens em memória, nada sai para a rede. */
export function remetenteMemoria(): RemetenteMemoria {
  const mensagens: Mensagem[] = [];
  let falhas = 0;
  return {
    mensagens,
    falharProximos(n) {
      falhas = n;
    },
    limpar() {
      mensagens.length = 0;
      falhas = 0;
    },
    async enviar(m) {
      if (falhas > 0) {
        falhas -= 1;
        return 'falhou';
      }
      mensagens.push(m);
      return 'enviado';
    },
  };
}
