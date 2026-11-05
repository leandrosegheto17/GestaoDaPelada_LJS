/** Tipos de `verificar-saude.mjs` (FUN-42), para o teste em TypeScript. */

export declare const TENTATIVAS_PADRAO: number;
export declare const ESPERA_PADRAO_MS: number;

export interface ResultadoSaude {
  ok: boolean;
  tentativas: number;
  mensagem: string;
}

export declare function verificarSaude(opcoes: {
  url: string;
  sha: string;
  tentativas?: number;
  esperaMs?: number;
  buscar?: (url: string, init?: RequestInit) => Promise<Response>;
}): Promise<ResultadoSaude>;
