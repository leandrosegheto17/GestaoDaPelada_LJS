/** Forma mínima do evento do Sentry que a limpeza lê; o resto passa intacto. */
interface EventoSentry {
  request?: {
    data?: unknown;
    cookies?: unknown;
    headers?: Record<string, string>;
    [chave: string]: unknown;
  };
  [chave: string]: unknown;
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const CABECALHOS_SENSIVEIS = new Set(['cookie', 'set-cookie', 'authorization']);

function semEmail(valor: unknown): unknown {
  if (typeof valor === 'string') return valor.replace(EMAIL, '[email]');
  if (Array.isArray(valor)) return valor.map(semEmail);
  if (valor !== null && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, semEmail(v)]));
  }
  return valor;
}

/**
 * Limpa o evento antes de ir ao Sentry (FUN-24): remove o corpo da requisição, os cookies, os cabeçalhos `cookie`,
 * `set-cookie` e `authorization`, e troca e-mails por `[email]` em qualquer texto do evento. Devolve um evento novo.
 */
export function limparEvento<T extends object>(evento: T): T {
  const limpo = semEmail(evento) as EventoSentry;
  if (limpo.request) {
    const { headers, ...resto } = limpo.request;
    delete resto.data;
    delete resto.cookies;
    limpo.request = {
      ...resto,
      ...(headers
        ? {
            headers: Object.fromEntries(
              Object.entries(headers).filter(
                ([nome]) => !CABECALHOS_SENSIVEIS.has(nome.toLowerCase()),
              ),
            ),
          }
        : {}),
    };
  }
  return limpo as T;
}
