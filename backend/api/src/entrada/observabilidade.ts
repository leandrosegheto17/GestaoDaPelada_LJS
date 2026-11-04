import { limparEvento } from '@pelada/contrato/sentry';
import type { CloudflareOptions } from '@sentry/cloudflare';
import type { Env } from './env.ts';

/**
 * Opções do Sentry do Worker (FUN-24, FUN-25). Sem `SENTRY_DSN` o SDK fica desligado e nada sai para terceiros; com
 * ele, `release` é a versão publicada e todo evento passa por `limparEvento` antes de sair.
 */
export function configurarSentry(env: Env): CloudflareOptions {
  const dsn = env.SENTRY_DSN?.trim();
  return {
    ...(dsn ? { dsn } : {}),
    release: env.VERSAO,
    beforeSend: (evento) => limparEvento(evento),
  };
}
