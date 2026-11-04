/** Bindings e variáveis do Worker, na forma que `wrangler.jsonc` declara (FUN-20, FUN-26). */
export interface Env {
  VERSAO: string;
  URL_PUBLICA: string;
  /** Segredo opcional: sem ele o Sentry fica desligado (FUN-25). */
  SENTRY_DSN?: string;
  HYPERDRIVE: Hyperdrive;
  LIMITE_ENTRAR: RateLimit;
  LIMITE_PUBLICO: RateLimit;
  LIMITE_WEBHOOK: RateLimit;
  LIMITE_ESCRITA: RateLimit;
}
