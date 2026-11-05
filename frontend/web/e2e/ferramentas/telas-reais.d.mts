/** Tipos de `telas-reais.mjs` (T54), para os testes em TypeScript. */
import type { Page } from '@playwright/test';

export declare const SUFIXO_MODULO: string;

export interface RespostaFalsa {
  url: string;
  arquivo?: string;
  status?: number;
  pendente?: boolean;
  abortar?: boolean;
  sequencia?: { arquivo?: string; status?: number }[];
}

export type Passo =
  | { preencher: string; valor?: string }
  | { clicar: string; indice?: number }
  | { esperar: string }
  | { aguardarMs: number };

export interface EntradaTela {
  id: string;
  estado: string;
  mockup: string;
  rota?: string;
  real?: boolean;
  viewports?: string[];
  limite?: number;
  esperar?: string;
  respostas?: RespostaFalsa[];
  passos?: Passo[];
  recorte?: { mockup: string | string[]; app: string | string[] };
}

export interface MapaTelas {
  viewports: Record<string, { width: number; height: number }>;
  respostas?: RespostaFalsa[];
  telas?: EntradaTela[];
}

export declare function entradasAtivas(mapa: MapaTelas, ativas: { telas?: { id: string; estado: string }[] }): EntradaTela[];
export declare function adaptarCorpo(texto: string): string;
export declare function seletorDoApp(seletor: string): string;
export declare function aplicarRespostas(
  pagina: Page,
  entrada: EntradaTela,
  opcoes: { mockup: string; globais?: RespostaFalsa[] },
): Promise<void>;
export declare function executarPassos(pagina: Page, passos?: Passo[]): Promise<void>;
export declare function printTela(
  pagina: Page,
  url: string,
  viewport: { width: number; height: number },
  opcoes?: { passos?: Passo[]; esperar?: string; recorte?: string | string[]; css?: string },
): Promise<Buffer>;
export declare function recorteDe(entrada: EntradaTela, lado: 'mockup' | 'app'): string | string[] | undefined;
