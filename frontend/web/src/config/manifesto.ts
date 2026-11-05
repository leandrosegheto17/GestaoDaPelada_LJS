/**
 * Manifest do PWA (FUN-33, design C6), entregue ao `vite-plugin-pwa`, que o grava como
 * `manifest.webmanifest` no build.
 *
 * O manifest não lê CSS: as cores são os valores de `tokens.css` escritos aqui, e o teste
 * (`test/config/manifesto.test.ts`) reprova se divergirem do token.
 * - `theme_color`: `--cor-verde` (a barra do app).
 * - `background_color`: `--cor-fundo`.
 */

export const NOME_DO_APP = 'Gestão da Pelada';

export interface IconeDoManifesto {
  src: string;
  sizes: string;
  type: 'image/png';
  purpose?: 'any' | 'maskable';
}

export interface Manifesto {
  name: string;
  short_name: string;
  description: string;
  lang: string;
  dir: 'ltr';
  start_url: string;
  scope: string;
  display: 'standalone';
  theme_color: string;
  background_color: string;
  icons: IconeDoManifesto[];
}

export const manifesto: Manifesto = {
  name: NOME_DO_APP,
  short_name: 'Pelada',
  description: 'Organize a pelada: grupos, elenco, partidas, ranking e financeiro.',
  lang: 'pt-BR',
  dir: 'ltr',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  theme_color: '#0B6B34',
  background_color: '#F9FBF8',
  icons: [
    { src: '/icones/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icones/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icones/icone-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
