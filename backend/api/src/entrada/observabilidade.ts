import * as Sentry from '@sentry/cloudflare';
import { limparEvento } from '@pelada/contrato/sentry';
import type { Env } from './ambiente.ts';

/**
 * Sentry no Worker (FUN-24, FUN-25, design C5): liga só quando `SENTRY_DSN` existe. Sem ele, a
 * requisição vai direto ao app, sem passar pelo SDK, e nada sai para terceiros.
 */

export interface OpcoesSentry {
  dsn: string;
  release: string;
  sendDefaultPii: false;
  beforeSend: typeof limparEvento;
}

/** Manipulador do Worker, com os tipos mínimos que o projeto usa. */
export interface Manipulador {
  fetch(requisicao: Request, env: Env, ctx: unknown): Response | Promise<Response>;
  /** Consumidor da fila `avisos` (notificacoes T17; AD-098). */
  queue?(lote: unknown, env: Env, ctx: unknown): Promise<void>;
}

export type EmbrulharSentry = (opcoes: (env: Env) => OpcoesSentry, manipulador: Manipulador) => Manipulador;

const embrulharPadrao = Sentry.withSentry as unknown as EmbrulharSentry;

/** `release` igual ao SHA publicado (`VERSAO`) e o evento limpo antes de sair. */
export function opcoesSentry(env: Env): OpcoesSentry {
  return {
    dsn: env.SENTRY_DSN ?? '',
    release: env.VERSAO,
    sendDefaultPii: false,
    beforeSend: limparEvento,
  };
}

/** Só com DSN não vazio: espaços ou texto vazio contam como ausente. */
export function sentryLigado(env: Env): boolean {
  return typeof env.SENTRY_DSN === 'string' && env.SENTRY_DSN.trim() !== '';
}

/**
 * Entrada do Worker: com `SENTRY_DSN`, passa pelo `withSentry`; sem ele, chama o app direto.
 * `embrulhar` existe para os testes trocarem o `withSentry`.
 */
export function criarWorker(app: Manipulador, embrulhar: EmbrulharSentry = embrulharPadrao): Manipulador {
  const consumir = app.queue?.bind(app);
  const comSentry = embrulhar(opcoesSentry, {
    fetch: (r, env, ctx) => app.fetch(r, env, ctx),
    ...(consumir ? { queue: (lote: unknown, env: Env, ctx: unknown) => consumir(lote, env, ctx) } : {}),
  });
  const manipulador: Manipulador = {
    fetch: (requisicao, env, ctx) =>
      sentryLigado(env) ? comSentry.fetch(requisicao, env, ctx) : app.fetch(requisicao, env, ctx),
  };
  // A fila passa pelo mesmo `withSentry` do fetch (notificacoes T17): sem DSN, vai direto ao consumidor.
  if (consumir) {
    manipulador.queue = (lote, env, ctx) =>
      sentryLigado(env) && comSentry.queue ? comSentry.queue(lote, env, ctx) : consumir(lote, env, ctx);
  }
  return manipulador;
}
