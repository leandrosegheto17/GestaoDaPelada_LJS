import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

/** Caminho do wrangler.jsonc da raiz do repositório. */
export const CAMINHO_WRANGLER = join(import.meta.dirname, '../../../../wrangler.jsonc');

/** Lê um wrangler.jsonc (JSON com comentários) com o parser do TypeScript; lança se o texto não for JSONC. */
export function lerWranglerJsonc(texto: string): Record<string, unknown> {
  if (texto.trim() === '') throw new Error('wrangler.jsonc vazio');
  const { config, error } = ts.parseConfigFileTextToJson('wrangler.jsonc', texto);
  if (error || typeof config !== 'object' || config === null) throw new Error('wrangler.jsonc inválido');
  return config as Record<string, unknown>;
}

/** Lê o wrangler.jsonc do repositório no formato que o teste declara. */
export function lerWranglerDoRepositorio<T>(): T {
  return lerWranglerJsonc(readFileSync(CAMINHO_WRANGLER, 'utf8')) as T;
}
