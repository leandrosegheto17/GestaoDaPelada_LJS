import { init, type BrowserOptions, type ErrorEvent } from '@sentry/react';

// E-mail em texto puro ou com o `@` codificado em URL (`%40`).
const EMAIL = /[a-z0-9._%+-]+(?:@|%40)[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
const SUBSTITUTO = '[email removido]';
const CABECALHOS_PROIBIDOS = new Set(['cookie', 'authorization']);

function semEmails<T>(valor: T): T {
  if (typeof valor === 'string') return valor.replace(EMAIL, SUBSTITUTO) as T;
  if (Array.isArray(valor)) return valor.map((item: unknown) => semEmails(item)) as T;
  if (valor && typeof valor === 'object') {
    const limpo: Record<string, unknown> = {};
    for (const [chave, item] of Object.entries(valor)) limpo[chave] = semEmails(item);
    return limpo as T;
  }
  return valor;
}

/**
 * `beforeSend` (FUN-23): tira do evento o corpo da requisição, os cookies e os cabeçalhos `Cookie` e `Authorization`,
 * e troca todo e-mail por `[email removido]`. Mesmo padrão do Worker (`backend/api/src/entrada/sentry.ts`).
 */
export function limparEvento(evento: ErrorEvent): ErrorEvent {
  const copia: ErrorEvent = { ...evento };
  if (copia.request) {
    const { headers, ...resto } = copia.request;
    delete resto.data;
    delete resto.cookies;
    copia.request = resto;
    if (headers) {
      copia.request.headers = Object.fromEntries(
        Object.entries(headers).filter(([nome]) => !CABECALHOS_PROIBIDOS.has(nome.toLowerCase())),
      );
    }
  }
  return semEmails(copia);
}

export interface AmbienteSentry {
  VITE_SENTRY_DSN?: string | undefined;
  /** SHA do commit do build (`release`). */
  VITE_VERSAO?: string | undefined;
}

/** Opções do Sentry no front: ligado só com `VITE_SENTRY_DSN` (FUN-24), `release` = SHA do build. */
export function opcoesSentry(env: AmbienteSentry): BrowserOptions {
  const dsn = env.VITE_SENTRY_DSN || undefined;
  return {
    dsn,
    enabled: dsn !== undefined,
    release: env.VITE_VERSAO || undefined,
    // Na 11.x, `dataCollection` substitui o `sendDefaultPii`: nada de usuário, cookies, corpos nem query.
    dataCollection: { userInfo: false, cookies: false, httpBodies: [], urlQueryParams: false },
    beforeSend: limparEvento,
  };
}

/** Liga o Sentry. Sem DSN, não inicializa o SDK e nada sai para terceiros. Devolve se ligou. */
export function iniciarObservabilidade(env: AmbienteSentry = import.meta.env): boolean {
  if (!env.VITE_SENTRY_DSN) return false;
  init(opcoesSentry(env));
  return true;
}
