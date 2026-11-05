import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { manifesto } from '../../src/config/manifesto.ts';

/**
 * Manifest do PWA (FUN-33): nome, `display`, `lang`, `start_url`, cores iguais às dos tokens e
 * ícones 192 e 512 que existem em `public/icones`, um deles `maskable`.
 */

const WEB = join(import.meta.dirname, '..', '..');
const TOKENS = readFileSync(join(WEB, 'src', 'estilos', 'tokens.css'), 'utf8');

/** Valor de um token de `tokens.css` (ex.: `--cor-verde` → `#0B6B34`). */
function token(nome: string): string {
  const achado = new RegExp(`${nome}\\s*:\\s*([^;]+);`).exec(TOKENS);
  if (!achado?.[1]) throw new Error(`Token ${nome} não encontrado em tokens.css.`);
  return achado[1].trim();
}

/** Lê o PNG e devolve largura e altura do cabeçalho IHDR. */
function dimensoesPng(caminho: string): { largura: number; altura: number } {
  const b = readFileSync(caminho);
  expect(b.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { largura: b.readUInt32BE(16), altura: b.readUInt32BE(20) };
}

describe('manifest do PWA', () => {
  it('FUN-33: nome "Gestão da Pelada", display standalone, lang pt-BR e start_url /', () => {
    expect(manifesto.name).toBe('Gestão da Pelada');
    expect(manifesto.display).toBe('standalone');
    expect(manifesto.lang).toBe('pt-BR');
    expect(manifesto.start_url).toBe('/');
    expect(manifesto.short_name.length).toBeGreaterThan(0);
  });

  it('FUN-33: theme_color é o --cor-verde e background_color é o --cor-fundo dos tokens', () => {
    expect(manifesto.theme_color.toLowerCase()).toBe(token('--cor-verde').toLowerCase());
    expect(manifesto.background_color.toLowerCase()).toBe(token('--cor-fundo').toLowerCase());
  });

  it('FUN-33: tem ícones 192 e 512, e um deles é maskable', () => {
    const tamanhos = manifesto.icons.map((i) => i.sizes);
    expect(tamanhos).toContain('192x192');
    expect(tamanhos).toContain('512x512');
    expect(manifesto.icons.filter((i) => i.purpose === 'maskable')).not.toHaveLength(0);
  });

  for (const icone of manifesto.icons) {
    it(`FUN-33: ${icone.src} existe em public e tem ${icone.sizes}`, () => {
      expect(icone.src.startsWith('/icones/')).toBe(true);
      const caminho = join(WEB, 'public', ...icone.src.split('/').filter(Boolean));
      expect(existsSync(caminho), `${icone.src} não existe em public`).toBe(true);
      const { largura, altura } = dimensoesPng(caminho);
      expect(`${largura}x${altura}`).toBe(icone.sizes);
    });
  }
});
