import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ManifestOptions } from 'vite-plugin-pwa';
import { lerToken } from './tokens.ts';

const RAIZ = join(import.meta.dirname, '..');

export function lerCoresDoTema(): { tema: string; fundo: string } {
  const css = readFileSync(join(RAIZ, 'src/estilos/tokens.css'), 'utf8');
  return { tema: lerToken(css, '--cor-verde'), fundo: lerToken(css, '--cor-fundo') };
}

export function criarManifesto(): Partial<ManifestOptions> {
  const { tema, fundo } = lerCoresDoTema();
  return {
    name: 'Gestão da Pelada',
    short_name: 'Pelada',
    lang: 'pt-BR',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: tema,
    background_color: fundo,
    icons: [
      { src: '/icones/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icones/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icones/icone-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
