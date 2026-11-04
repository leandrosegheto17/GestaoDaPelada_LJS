import { limparEvento } from '@pelada/contrato/sentry';
import { init, type BrowserOptions } from '@sentry/react';

interface EnvSentry {
  VITE_SENTRY_DSN?: string | undefined;
  VITE_VERSAO?: string | undefined;
}

/**
 * Opções do Sentry do front (FUN-24, FUN-25). Sem `VITE_SENTRY_DSN` o SDK fica desligado e nada sai para terceiros;
 * com ele, `release` é o SHA publicado e todo evento passa por `limparEvento` antes de sair.
 */
export function configurarSentry(env: EnvSentry): BrowserOptions {
  const dsn = env.VITE_SENTRY_DSN?.trim();
  return {
    ...(dsn ? { dsn } : {}),
    ...(env.VITE_VERSAO ? { release: env.VITE_VERSAO } : {}),
    beforeSend: (evento) => limparEvento(evento),
  };
}

/** Liga o Sentry só com DSN. Devolve se ligou. */
export function iniciarSentry(
  env: EnvSentry,
  iniciar: (opcoes: BrowserOptions) => unknown = init,
): boolean {
  const opcoes = configurarSentry(env);
  if (!opcoes.dsn) return false;
  iniciar(opcoes);
  return true;
}
