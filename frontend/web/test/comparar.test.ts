import { PNG } from 'pngjs';
import { describe, expect, test } from 'vitest';
import { compararImagens } from '../e2e/ferramentas/comparar.mjs';

/** PNG branco `largura × altura`, com os `pretos` primeiros pixels pintados de preto. */
function imagem(largura: number, altura: number, pretos = 0): Buffer {
  const png = new PNG({ width: largura, height: altura });
  png.data.fill(255);
  for (let i = 0; i < pretos; i++) png.data.fill(0, i * 4, i * 4 + 3);
  return PNG.sync.write(png);
}

describe('comparador de imagens', () => {
  test('FUN-38: duas imagens idênticas dão 0% de diferença e passam', () => {
    const r = compararImagens(imagem(100, 100), imagem(100, 100));
    expect(r.diferenca).toBe(0);
    expect(r.ok).toBe(true);
  });

  test('FUN-38: diferença de 2% reprova', () => {
    const r = compararImagens(imagem(100, 100), imagem(100, 100, 200));
    expect(r.diferenca).toBeCloseTo(0.02, 5);
    expect(r.ok).toBe(false);
  });

  test('FUN-38: diferença de 0,5% passa', () => {
    const r = compararImagens(imagem(100, 100), imagem(100, 100, 50));
    expect(r.diferenca).toBeCloseTo(0.005, 5);
    expect(r.ok).toBe(true);
  });

  test('FUN-38: o limite pode ser trocado', () => {
    expect(compararImagens(imagem(100, 100), imagem(100, 100, 50), { limite: 0.001 }).ok).toBe(
      false,
    );
  });

  test('FUN-38: imagens de tamanhos diferentes reprovam com mensagem clara', () => {
    const r = compararImagens(imagem(100, 100), imagem(100, 120));
    expect(r.ok).toBe(false);
    expect(r.mensagem).toContain('100x100');
    expect(r.mensagem).toContain('100x120');
    expect(r.mensagem).toMatch(/tamanho/i);
  });
});
