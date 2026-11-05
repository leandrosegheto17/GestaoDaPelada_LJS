import type { Kysely } from 'kysely';
import type { Banco } from '../infraestrutura/db/transacao.ts';

/**
 * Bindings do Worker (wrangler.jsonc). Tipos mínimos escritos aqui, para não depender dos
 * tipos globais do runtime no typecheck do pacote.
 */

/** Binding de rate limit da Cloudflare (`ratelimits` no wrangler.jsonc). */
export interface LimiteDeTaxa {
  limit(opcoes: { key: string }): Promise<{ success: boolean }>;
}

/** Binding do Hyperdrive: só a string de conexão é usada. */
export interface HyperdriveBinding {
  readonly connectionString: string;
}

export interface Env {
  /** SHA do commit publicado (`--var` no deploy); `local` no wrangler dev. */
  VERSAO: string;
  /** URL pública do app, única fonte de endereço absoluto (FUN-23). */
  URL_PUBLICA: string;
  /** DSN do Sentry (secret). Ausente: o Sentry fica desligado e nada sai (FUN-25). */
  SENTRY_DSN?: string;
  HYPERDRIVE: HyperdriveBinding;
  LIMITE_ENTRAR: LimiteDeTaxa;
  LIMITE_PUBLICO: LimiteDeTaxa;
  LIMITE_WEBHOOK: LimiteDeTaxa;
  LIMITE_ESCRITA: LimiteDeTaxa;
}

export type NomeLimite = 'LIMITE_ENTRAR' | 'LIMITE_PUBLICO' | 'LIMITE_WEBHOOK' | 'LIMITE_ESCRITA';

export interface Variaveis {
  /** Kysely da transação da requisição, posto pelo `comBanco` (FUN-16). Só existe nas rotas com ele. */
  db: Kysely<Banco>;
}

export interface Ambiente {
  Bindings: Env;
  Variables: Variaveis;
}
