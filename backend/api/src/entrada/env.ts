/** Bindings e variáveis que o Worker recebe (declarados no `wrangler.jsonc` da raiz). */
export interface Env {
  /** Postgres pelo Hyperdrive, com a origem na role pelada_app e cache desligado (FUN-18). */
  HYPERDRIVE: Hyperdrive;
  /** Rate Limiting do Workers (FUN-26). Ausentes fora da Cloudflare. */
  LIMITE_ENTRAR?: RateLimit;
  LIMITE_PUBLICO?: RateLimit;
  LIMITE_WEBHOOK?: RateLimit;
  /** Única fonte do endereço público do app (FUN-22). */
  URL_PUBLICA: string;
  /** SHA do commit publicado, injetado no deploy por `--var VERSAO:<sha>` (FUN-20). */
  VERSAO: string;
}
