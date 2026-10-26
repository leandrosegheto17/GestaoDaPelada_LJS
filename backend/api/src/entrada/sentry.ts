import type { CloudflareOptions, ErrorEvent } from '@sentry/cloudflare';
import { sentry } from '@sentry/hono/cloudflare';
import type { Hono } from 'hono';
import type { AppEnv } from './app.ts';
import type { Env } from './env.ts';

// E-mail em texto puro ou com o `@` codificado em URL (`%40`).
const EMAIL = /[a-z0-9._%+-]+(?:@|%40)[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
const SUBSTITUTO = '[email removido]';
// SEC-002: lista de permissão (não de bloqueio). Fica de fora todo o resto, inclusive `Cookie`, `Authorization`, os
// cabeçalhos de IP e país que a Cloudflare acrescenta (`CF-Connecting-IP`, `X-Forwarded-For`, `X-Real-IP`,
// `CF-IPCountry`) e o `User-Agent`: dado pessoal (LGPD) que não vai a terceiro.
const CABECALHOS_PERMITIDOS = ['content-type', 'content-length', 'x-pelada'] as const;
const PERMITIDOS = new Set<string>(CABECALHOS_PERMITIDOS);

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
 * `beforeSend` (FUN-23): tira do evento o corpo da requisição, os cookies e todo cabeçalho fora da lista de permissão
 * (sem `Cookie`, `Authorization`, IP, país nem user-agent; SEC-002), e troca todo e-mail (mensagem, exceção, breadcrumbs, URL, usuário, extras) por `[email removido]`.
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
        Object.entries(headers).filter(([nome]) => PERMITIDOS.has(nome.toLowerCase())),
      );
    }
  }
  return semEmails(copia);
}

/** Opções do Sentry por requisição: ligado só com `SENTRY_DSN` (FUN-24), `release` = SHA do deploy. */
export function opcoesSentry(env: Env): CloudflareOptions {
  const dsn = env.SENTRY_DSN || undefined;
  return {
    dsn,
    enabled: dsn !== undefined,
    release: env.VERSAO,
    // Na 11.x, `dataCollection` substitui o `sendDefaultPii`: nada de usuário, cookies, corpos, query, SQL nem
    // cabeçalhos fora da lista de permissão.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      // SEC-002: o padrão copia todos os cabeçalhos. O SDK compara por "contém"; o `limparEvento` refaz o corte por
      // nome exato (defesa em profundidade).
      httpHeaders: { request: { allow: [...CABECALHOS_PERMITIDOS] }, response: false },
    },
    // Cliente por requisição: as opções dependem do `env` (com ou sem DSN), e com o cliente em cache por isolate só
    // a primeira requisição descarregava os eventos no pool de testes do workerd.
    cacheClient: false,
    beforeSend: limparEvento,
  };
}

/** Liga o Sentry no app. Sem DSN, o SDK fica desligado e nada sai para terceiros. */
export function ligarSentry(app: Hono<AppEnv>): void {
  app.use(sentry(app, (env) => opcoesSentry(env)));
}
