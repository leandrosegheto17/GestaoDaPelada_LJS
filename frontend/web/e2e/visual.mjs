// Comparação visual (FUN-38): as 3 telas de vitrine do app contra os HTML do mockup, nos dois viewports de
// `.specs/mockup/telas.json`. Sobe o Vite com VITE_VITRINE=1, tira os prints com o Playwright e reprova se algum
// par passar de 1% de pixels diferentes. Saída (prints e diferenças): frontend/web/test-results/visual.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { compararImagens } from './ferramentas/comparar.mjs';

const WEB = join(import.meta.dirname, '..');
const MOCKUP = join(WEB, '..', '..', '.specs', 'mockup');
const SAIDA = join(WEB, 'test-results', 'visual');
const PORTA = 5174;

/** Cada rota de vitrine e o HTML do mockup que ela reproduz. */
export const TELAS = [
  { id: 'erro-rede', mockup: 'telas/padrao--erro-rede.html' },
  { id: 'carregando-lista', mockup: 'telas/padrao--carregando-lista.html' },
  { id: 'indisponivel', mockup: 'telas/t03-indisponivel--erro.html' },
];

// Sem animação nem cursor piscando: o print precisa ser repetível nos dois lados.
const CSS_ESTATICO = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}`;

async function capturar(contexto, url, esperaFontes = true) {
  const pagina = await contexto.newPage();
  await pagina.goto(url, { waitUntil: 'networkidle' });
  await pagina.addStyleTag({ content: CSS_ESTATICO });
  if (esperaFontes) await pagina.evaluate(() => document.fonts.ready);
  const png = await pagina.screenshot({ fullPage: true });
  await pagina.close();
  return png;
}

async function main() {
  const viewports = JSON.parse(readFileSync(join(MOCKUP, 'telas.json'), 'utf8')).viewports;
  mkdirSync(SAIDA, { recursive: true });
  process.env.VITE_VITRINE = '1';
  const servidor = await createServer({
    root: WEB,
    logLevel: 'error',
    server: { port: PORTA, strictPort: true, host: '127.0.0.1' },
  });
  await servidor.listen();
  const navegador = await chromium.launch();
  let falhas = 0;
  try {
    for (const [nomeViewport, tamanho] of Object.entries(viewports)) {
      const contexto = await navegador.newContext({ viewport: tamanho, reducedMotion: 'reduce' });
      for (const tela of TELAS) {
        const mockup = await capturar(contexto, pathToFileURL(join(MOCKUP, tela.mockup)).href);
        const app = await capturar(contexto, `http://127.0.0.1:${PORTA}/_vitrine/${tela.id}`);
        const r = compararImagens(mockup, app);
        const base = join(SAIDA, `${tela.id}-${nomeViewport}`);
        writeFileSync(`${base}--mockup.png`, mockup);
        writeFileSync(`${base}--app.png`, app);
        if (r.imagemDiferenca) writeFileSync(`${base}--diff.png`, r.imagemDiferenca);
        console.log(`${r.ok ? 'ok   ' : 'FALHA'} ${tela.id} (${nomeViewport}): ${r.mensagem}`);
        if (!r.ok) falhas++;
      }
      await contexto.close();
    }
  } finally {
    await navegador.close();
    await servidor.close();
  }
  if (falhas > 0) {
    console.error(`${falhas} comparação(ões) acima do limite; veja ${SAIDA}`);
    process.exitCode = 1;
  }
}

await main();
