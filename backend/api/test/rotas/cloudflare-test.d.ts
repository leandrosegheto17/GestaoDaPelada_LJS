// Tipos mínimos do módulo virtual do pool de Workers do Vitest, usados nos testes de rota.
declare module 'cloudflare:test' {
  export const SELF: { fetch(entrada: string | Request, init?: RequestInit): Promise<Response> };
  export const env: Record<string, unknown>;
}
