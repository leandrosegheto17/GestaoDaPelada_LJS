// @vitest-environment node
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { compararPng } from '../../e2e/ferramentas/comparar.mjs';

/**
 * Comparador de imagens (FUN-38): idênticas passam com 0%, 2% reprova, 0,5% passa e tamanhos
 * diferentes reprovam com mensagem clara. As imagens de exemplo são geradas aqui.
 */

/** PNG branco de `largura` × `altura`, com os `pretos` primeiros pixels em preto. */
function imagem(largura: number, altura: number, pretos = 0): Buffer {
  const png = new PNG({ width: largura, height: altura });
  for (let i = 0; i < largura * altura; i += 1) {
    const cor = i < pretos ? 0 : 255;
    png.data[i * 4] = cor;
    png.data[i * 4 + 1] = cor;
    png.data[i * 4 + 2] = cor;
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

describe('comparador de imagens', () => {
  it('FUN-38: duas imagens idênticas dão 0% de diferença e passam', () => {
    const r = compararPng(imagem(100, 100), imagem(100, 100));
    expect(r.diferentes).toBe(0);
    expect(r.proporcao).toBe(0);
    expect(r.passou).toBe(true);
  });

  it('FUN-38: 2% de pixels diferentes reprova com o limite de 1%', () => {
    const r = compararPng(imagem(100, 100), imagem(100, 100, 200));
    expect(r.diferentes).toBe(200);
    expect(r.proporcao).toBeCloseTo(0.02);
    expect(r.passou).toBe(false);
    expect(r.mensagem).toContain('2,00%');
  });

  it('FUN-38: 0,5% de pixels diferentes passa com o limite de 1%', () => {
    const r = compararPng(imagem(100, 100), imagem(100, 100, 50));
    expect(r.diferentes).toBe(50);
    expect(r.passou).toBe(true);
  });

  it('FUN-38: exatamente 1% passa (limite inclusivo) e 1,01% reprova', () => {
    expect(compararPng(imagem(100, 100), imagem(100, 100, 100)).passou).toBe(true);
    expect(compararPng(imagem(100, 100), imagem(100, 100, 101)).passou).toBe(false);
  });

  it('FUN-38: imagens de tamanhos diferentes reprovam com mensagem clara', () => {
    const r = compararPng(imagem(100, 100), imagem(100, 90));
    expect(r.passou).toBe(false);
    expect(r.diff).toBeNull();
    expect(r.mensagem).toContain('Tamanhos diferentes');
    expect(r.mensagem).toContain('100x100');
    expect(r.mensagem).toContain('100x90');
  });

  it('FUN-38: devolve o PNG da diferença com o tamanho das imagens', () => {
    const r = compararPng(imagem(20, 10), imagem(20, 10, 5));
    expect(r.diff).not.toBeNull();
    const diff = PNG.sync.read(r.diff as Buffer);
    expect([diff.width, diff.height]).toEqual([20, 10]);
  });
});
