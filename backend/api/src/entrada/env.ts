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
  /** Opcional: sem ele, o Sentry fica desligado (FUN-24). Segredo do Worker, nunca no wrangler.jsonc. */
  SENTRY_DSN?: string | undefined;
  /** Segredo do Worker: chave de API do Resend. Sem ela (e sem `EMAIL_DEV`), o envio de e-mail falha (ACE-52). */
  RESEND_API_KEY?: string | undefined;
  /** Endereço de remetente verificado no Resend. */
  RESEND_REMETENTE?: string | undefined;
  /**
   * Só no desenvolvimento local (`.dev.vars`): `1` troca o Resend pela caixa em memória e liga `GET /api/dev/emails`.
   * O `wrangler.jsonc` de produção não a define (teste de configuração).
   */
  EMAIL_DEV?: string | undefined;
}
