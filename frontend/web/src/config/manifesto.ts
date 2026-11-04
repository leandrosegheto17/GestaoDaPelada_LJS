/**
 * Manifest do PWA (FUN-33). As cores são as de `src/estilos/tokens.css` (`--cor-verde` e `--cor-fundo`): o teste
 * confere a igualdade, porque o manifest não lê CSS. Os ícones saem de `public/icones` (copiados do mockup).
 */
export interface IconeManifesto {
  src: string;
  sizes: string;
  type: 'image/png';
  purpose: 'any' | 'maskable';
}

export interface Manifesto {
  name: string;
  short_name: string;
  description: string;
  lang: string;
  start_url: string;
  scope: string;
  display: 'standalone';
  theme_color: string;
  background_color: string;
  icons: IconeManifesto[];
}

export const manifesto: Manifesto = {
  name: 'Gestão da Pelada',
  short_name: 'Pelada',
  description: 'Ranking, partidas e financeiro do seu grupo de pelada.',
  lang: 'pt-BR',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  theme_color: '#0B6B34',
  background_color: '#F9FBF8',
  icons: [
    { src: 'icones/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icones/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    {
      src: 'icones/icone-512-maskable.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
};
