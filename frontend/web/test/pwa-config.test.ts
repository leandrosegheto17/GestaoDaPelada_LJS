import { describe, expect, it } from 'vitest';
import { criarOpcoesPwa } from '../config/manifesto.ts';

// FUN-33
describe('opções do plugin do PWA', () => {
  it('service worker próprio em src/sw.ts, sem registro inline, com precache do shell', () => {
    const opcoes = criarOpcoesPwa();
    expect(opcoes.strategies).toBe('injectManifest');
    expect(opcoes.srcDir).toBe('src');
    expect(opcoes.filename).toBe('sw.ts');
    expect(opcoes.injectRegister).toBe(false);
    expect(opcoes.injectManifest?.globPatterns).toEqual(['**/*.{html,js,css,woff2,png,svg,webmanifest}']);
  });
});
