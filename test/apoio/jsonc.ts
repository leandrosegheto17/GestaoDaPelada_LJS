import { readFileSync } from 'node:fs';

/**
 * Tira os comentários `//` e `/* *\/` de um JSONC, respeitando strings (URLs como
 * `postgres://...` ficam intactas). Não aceita vírgula sobrando: os arquivos do projeto não a usam.
 */
export function semComentarios(texto: string): string {
  let saida = '';
  let i = 0;
  let emString = false;
  while (i < texto.length) {
    const ch = texto[i] ?? '';
    const prox = texto[i + 1] ?? '';
    if (emString) {
      saida += ch;
      if (ch === '\\') {
        saida += prox;
        i += 2;
        continue;
      }
      if (ch === '"') emString = false;
      i += 1;
      continue;
    }
    if (ch === '"') {
      emString = true;
      saida += ch;
      i += 1;
      continue;
    }
    if (ch === '/' && prox === '/') {
      while (i < texto.length && texto[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && prox === '*') {
      i += 2;
      while (i < texto.length && !(texto[i] === '*' && texto[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    saida += ch;
    i += 1;
  }
  return saida;
}

export function lerJsonc<T = unknown>(caminho: string): T {
  return JSON.parse(semComentarios(readFileSync(caminho, 'utf8'))) as T;
}
