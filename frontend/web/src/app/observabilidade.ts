import * as Sentry from '@sentry/react';
import { limparEvento } from '@pelada/contrato/sentry';

/**
 * Sentry no front (FUN-24, FUN-25, design C5): liga só quando `VITE_SENTRY_DSN` existe. Sem
 * ele, o SDK nem é inicializado e nada sai para terceiros. Mesmo molde do Worker
 * (`backend/api/src/entrada/observabilidade.ts`): `release` igual ao SHA publicado
 * (`VITE_VERSAO`) e o evento limpo por `limparEvento` antes de sair.
 */

/** Variáveis do build que o Sentry do front lê. */
export interface AmbienteFront {
  VITE_SENTRY_DSN?: string;
  VITE_VERSAO?: string;
}

export interface OpcoesSentryFront {
  dsn: string;
  release: string;
  sendDefaultPii: false;
  beforeSend: typeof limparEvento;
}

export type IniciarSentry = (opcoes: OpcoesSentryFront) => unknown;

const iniciarPadrao: IniciarSentry = (opcoes) => Sentry.init(opcoes);

/** Só com DSN não vazio: espaços ou texto vazio contam como ausente. */
export function sentryLigado(env: AmbienteFront): boolean {
  return typeof env.VITE_SENTRY_DSN === 'string' && env.VITE_SENTRY_DSN.trim() !== '';
}

export function opcoesSentry(env: AmbienteFront): OpcoesSentryFront {
  return {
    dsn: env.VITE_SENTRY_DSN?.trim() ?? '',
    release: env.VITE_VERSAO ?? '',
    sendDefaultPii: false,
    beforeSend: limparEvento,
  };
}

/**
 * Chamada uma vez no `main.tsx`, antes do render. Devolve se o Sentry foi ligado. `iniciar`
 * existe para os testes trocarem o `Sentry.init`.
 */
export function iniciarObservabilidade(
  env: AmbienteFront = import.meta.env as AmbienteFront,
  iniciar: IniciarSentry = iniciarPadrao,
): boolean {
  if (!sentryLigado(env)) return false;
  iniciar(opcoesSentry(env));
  return true;
}
