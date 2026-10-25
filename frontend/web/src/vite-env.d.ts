/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Recursos desligados no build, separados por vírgula (simulador, pdf, financeiro, privacidade). */
  readonly VITE_RECURSOS_DESLIGADOS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
