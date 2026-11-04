import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';
import * as matchersAxe from 'vitest-axe/matchers';

expect.extend(matchersAxe);

/**
 * O Node 25+ tem um `localStorage` global que sobrepõe o do jsdom e não funciona sem `--localstorage-file`. Os testes
 * usam um armazenamento em memória com a mesma interface.
 */
class ArmazenamentoEmMemoria implements Storage {
  private dados = new Map<string, string>();
  get length() {
    return this.dados.size;
  }
  clear() {
    this.dados.clear();
  }
  getItem(chave: string) {
    return this.dados.get(chave) ?? null;
  }
  key(indice: number) {
    return [...this.dados.keys()][indice] ?? null;
  }
  removeItem(chave: string) {
    this.dados.delete(chave);
  }
  setItem(chave: string, valor: string) {
    this.dados.set(chave, String(valor));
  }
}
Object.defineProperty(globalThis, 'localStorage', {
  value: new ArmazenamentoEmMemoria(),
  configurable: true,
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});
