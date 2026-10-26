/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Recursos desligados no build, separados por vírgula (simulador, pdf, financeiro, privacidade). */
  readonly VITE_RECURSOS_DESLIGADOS?: string;
  /** DSN do Sentry; sem ele, nada é inicializado nem enviado. */
  readonly VITE_SENTRY_DSN?: string;
  /** SHA do commit do build, usado como `release` do Sentry. */
  readonly VITE_VERSAO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
