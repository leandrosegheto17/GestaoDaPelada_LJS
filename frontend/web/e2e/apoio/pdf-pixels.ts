import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';

/**
 * Rasterização do PDF para a comparação visual (partidas-e-ranking T77; PAR-108; ADR-019 do legado), no molde de
 * `ljs:frontend/web/e2e/apoio/pdf-pixels.ts` @ `c6dc82c`: o `pdfjs-dist` desenha a 1ª página num canvas dentro do
 * navegador do teste e devolve o PNG. O `pdfjs-dist` só existe nos testes (devDependency): o app nunca o carrega. A
 * comparação dos pixels é a do comparador da fundação (`ferramentas/comparar.mjs`).
 */

const requerer = createRequire(import.meta.url);
const principal = () => readFileSync(requerer.resolve('pdfjs-dist/build/pdf.min.mjs'), 'utf8');
const trabalhador = () => readFileSync(requerer.resolve('pdfjs-dist/build/pdf.worker.min.mjs'), 'utf8');

/** Escala de 72 dpi (pt) para 96 dpi (px): a folha A4 vira 794 × 1123 px. */
export const ESCALA_PT_PARA_PX = 96 / 72;

export async function rasterizarPrimeiraPagina(page: Page, pdf: Buffer): Promise<Buffer> {
  await page.goto('about:blank');
  const urlDe = (texto: string) =>
    page.evaluate((conteudo) => URL.createObjectURL(new Blob([conteudo], { type: 'text/javascript' })), texto);
  const [urlLib, urlTrabalhador] = [await urlDe(principal()), await urlDe(trabalhador())];
  await page.addScriptTag({
    type: 'module',
    content: `import * as lib from '${urlLib}'; lib.GlobalWorkerOptions.workerSrc = '${urlTrabalhador}'; window.pdfjsLib = lib;`,
  });
  await page.waitForFunction(() => 'pdfjsLib' in window);
  const dataUrl = await page.evaluate(
    async ({ base64, escala }) => {
      const lib: typeof import('pdfjs-dist') = Reflect.get(window, 'pdfjsLib');
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const documento = await lib.getDocument({ data: bytes }).promise;
      const pagina = await documento.getPage(1);
      const viewport = pagina.getViewport({ scale: escala });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      // Contexto com alfa: o texto sai em tons de cinza, como no navegador (sem franjas coloridas de LCD).
      const canvasContext = canvas.getContext('2d', { alpha: true });
      if (!canvasContext) throw new Error('Sem contexto 2D.');
      await pagina.render({ canvas, canvasContext, viewport }).promise;
      return canvas.toDataURL('image/png');
    },
    { base64: pdf.toString('base64'), escala: ESCALA_PT_PARA_PX },
  );
  return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
}
