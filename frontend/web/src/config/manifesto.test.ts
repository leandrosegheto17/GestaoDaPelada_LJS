import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { manifesto } from './manifesto.ts';

const WEB = join(import.meta.dirname, '..', '..');

/** Lê um token de cor de tokens.css (`--cor-verde:#0B6B34;`). */
function token(nome: string): string {
  const css = readFileSync(join(WEB, 'src', 'estilos', 'tokens.css'), 'utf8');
  const achado = new RegExp(nome + '[ ]*:[ ]*(#[0-9A-Fa-f]{6})').exec(css);
  if (!achado?.[1]) throw new Error(`token ${nome} ausente em tokens.css`);
  return achado[1];
}

describe('manifest do PWA', () => {
  test('FUN-33: nome, display, lang, start_url e theme_color do token', () => {
    expect(manifesto.name).toBe('Gestão da Pelada');
    expect(manifesto.display).toBe('standalone');
    expect(manifesto.lang).toBe('pt-BR');
    expect(manifesto.start_url).toBe('/');
    expect(manifesto.theme_color).toBe(token('--cor-verde'));
    expect(manifesto.background_color).toBe(token('--cor-fundo'));
  });

  test('FUN-33: os ícones 192 e 512 existem em public/icones e um é maskable', () => {
    const tamanhos = manifesto.icons.map((i) => i.sizes);
    expect(tamanhos).toContain('192x192');
    expect(tamanhos).toContain('512x512');
    for (const icone of manifesto.icons) {
      expect(existsSync(join(WEB, 'public', icone.src))).toBe(true);
      expect(icone.src.startsWith('icones/')).toBe(true);
    }
    expect(manifesto.icons.filter((i) => i.purpose === 'maskable')).toHaveLength(1);
    expect(manifesto.icons.find((i) => i.sizes === '192x192')?.purpose).toBe('any');
  });
});
