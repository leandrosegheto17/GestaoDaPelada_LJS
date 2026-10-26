import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { criarManifesto } from '../config/manifesto.ts';
import { lerToken } from '../config/tokens.ts';

const RAIZ = join(import.meta.dirname, '..');
const MOCKUP = join(RAIZ, '../../.specs/mockup');
const tokens = readFileSync(join(RAIZ, 'src/estilos/tokens.css'), 'utf8');

// FUN-32
describe('manifesto do PWA', () => {
  const manifesto = criarManifesto();

  it('é um app instalável em modo standalone, em português, com o nome do produto', () => {
    expect(manifesto.display).toBe('standalone');
    expect(manifesto.lang).toBe('pt-BR');
    expect(manifesto.start_url).toBe('/');
    expect(manifesto.scope).toBe('/');
    expect(manifesto.name).toBe('Gestão da Pelada');
    expect(manifesto.short_name).toBe('Pelada');
  });

  it('as cores vêm dos tokens', () => {
    expect(manifesto.theme_color).toBe(lerToken(tokens, '--cor-verde'));
    expect(manifesto.background_color).toBe(lerToken(tokens, '--cor-fundo'));
  });

  it('ícones 192 e 512, um deles maskable', () => {
    expect(manifesto.icons).toEqual([
      { src: '/icones/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icones/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icones/icone-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ]);
  });

  it('os arquivos de ícone são os do mockup, byte a byte', () => {
    const pasta = join(RAIZ, 'public/icones');
    expect(readdirSync(pasta).sort()).toEqual([
      'apple-touch-180.png',
      'icone-192.png',
      'icone-512-maskable.png',
      'icone-512.png',
    ]);
    for (const nome of readdirSync(pasta)) {
      expect(readFileSync(join(pasta, nome)).equals(readFileSync(join(MOCKUP, 'icones', nome)))).toBe(true);
    }
  });
});
