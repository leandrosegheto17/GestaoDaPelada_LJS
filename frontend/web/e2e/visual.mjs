#!/usr/bin/env node
/* global document -- usado só dentro de pagina.evaluate, que roda no navegador */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { compararPng, LIMITE_PADRAO, porcentagem } from './ferramentas/comparar.mjs';
import { aplicarRespostas, cssOcultar, entradasAtivas, ocultarDe, printTela, recorteDe, RELOGIO_VISUAL } from './ferramentas/telas-reais.mjs';

/**
 * Comparação visual das telas de vitrine com o mockup (FUN-38).
 *
 * 1. Faz o build de teste (`VITE_VITRINE=1`) numa pasta própria, fora do `dist/` da prévia.
 * 2. Serve esse build com `vite preview` em 127.0.0.1.
 * 3. Para cada tela × viewport de `.specs/mockup/telas.json`: print do HTML do mockup e da rota
 *    `/_vitrine/<id>`, do viewport (não da página inteira, para os tamanhos baterem), e compara
 *    com o limite de 1%.
 * 4. Telas reais (T54, AD-021): as entradas do `telas.json` listadas em `e2e/telas-ativas.json`
 *    abrem a `rota` do app com as `respostas` interceptadas, rodam os `passos` e o `esperar` e
 *    comparam o viewport, ou só o `recorte` (ver `ferramentas/telas-reais.mjs`).
 *    Com `ocultar` (escondido nos dois lados), `userAgent` (contexto próprio do app) e o relógio
 *    do app congelado em `RELOGIO_VISUAL` (partidas-e-ranking T75, AD-044).
 * 5. Controle: a mesma comparação com um componente deslocado de propósito tem de reprovar; se
 *    passar, o comparador não está enxergando a diferença e o runner reprova.
 *
 * Saída: `test-results/visual/<tela>-<viewport>--{mockup,app,diff}.png`. Sai com 1 se alguma
 * comparação passar do limite ou se o controle não reprovar.
 *
 * Uso: `pnpm --filter @pelada/web visual` (com `playwright install chromium` feito).
 */

const WEB = fileURLToPath(new URL('..', import.meta.url));
const MOCKUP = join(WEB, '..', '..', '.specs', 'mockup');
const SAIDA = join(WEB, 'test-results', 'visual');
const BUILD = join(WEB, 'test-results', 'vitrine-build');
const ATIVAS = join(WEB, 'e2e', 'telas-ativas.json');
const PORTA = 4174;
const URL_BASE = `http://127.0.0.1:${PORTA}`;

/** As 3 telas da fundação: rota de vitrine → HTML do mockup (mesmo caminho do telas.json). */
export const TELAS = [
  { vitrine: 'erro-rede', mockup: 'telas/padrao--erro-rede.html' },
  { vitrine: 'carregando-lista', mockup: 'telas/padrao--carregando-lista.html' },
  { vitrine: 'indisponivel', mockup: 'telas/t03-indisponivel--erro.html' },
];

/** Deslocamento usado no controle: o conteúdo principal desce 40px. */
const DEFORMACAO = 'main { transform: translateY(40px) !important; }';

/** Monta as comparações a partir do telas.json: viewports e limite de cada tela. */
export function comparacoes(mapa) {
  const lista = [];
  for (const tela of TELAS) {
    const entrada = (mapa.telas ?? []).find((t) => t.mockup === tela.mockup);
    if (!entrada) throw new Error(`${tela.mockup} não está no telas.json.`);
    for (const nome of entrada.viewports ?? Object.keys(mapa.viewports)) {
      const viewport = mapa.viewports[nome];
      if (!viewport) throw new Error(`Viewport ${nome} não está no telas.json.`);
      lista.push({
        ...tela,
        viewportNome: nome,
        viewport,
        limite: typeof entrada.limite === 'number' ? entrada.limite / 100 : LIMITE_PADRAO,
      });
    }
  }
  return lista;
}

/** Telas reais × viewports, a partir do `telas-ativas.json` (T54). */
export function comparacoesReais(mapa, ativas) {
  const lista = [];
  for (const entrada of entradasAtivas(mapa, ativas)) {
    for (const nome of entrada.viewports ?? Object.keys(mapa.viewports)) {
      const viewport = mapa.viewports[nome];
      if (!viewport) throw new Error(`Viewport ${nome} não está no telas.json.`);
      lista.push({
        entrada,
        nome: `${entrada.id}-${entrada.estado}-${nome}`.toLowerCase(),
        viewport,
        limite: typeof entrada.limite === 'number' ? entrada.limite / 100 : LIMITE_PADRAO,
      });
    }
  }
  return lista;
}

function rodar(comando, args, env = {}) {
  return new Promise((resolver, rejeitar) => {
    const filho = spawn(comando, args, { cwd: WEB, env: { ...process.env, ...env }, stdio: 'inherit', shell: true });
    filho.on('exit', (codigo) => (codigo === 0 ? resolver() : rejeitar(new Error(`${comando} ${args.join(' ')} saiu com ${codigo}.`))));
  });
}

async function esperarServidor(url, tentativas = 60) {
  for (let i = 0; i < tentativas; i += 1) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      // Ainda subindo.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`O servidor de vitrine não respondeu em ${url}.`);
}

/** Print do viewport, com fontes carregadas, animações paradas e cursor escondido. */
async function print(pagina, url, viewport, css) {
  await pagina.setViewportSize(viewport);
  await pagina.goto(url, { waitUntil: 'networkidle' });
  if (css) await pagina.addStyleTag({ content: css });
  await pagina.evaluate(() => document.fonts.ready);
  return pagina.screenshot({ animations: 'disabled', caret: 'hide' });
}

async function principal() {
  const mapa = JSON.parse(readFileSync(join(MOCKUP, 'telas.json'), 'utf8'));
  const lista = comparacoes(mapa);
  const reais = comparacoesReais(mapa, JSON.parse(readFileSync(ATIVAS, 'utf8')));
  mkdirSync(SAIDA, { recursive: true });

  await rodar('pnpm', ['exec', 'vite', 'build', '--outDir', JSON.stringify(BUILD), '--emptyOutDir'], { VITE_VITRINE: '1' });
  if (!existsSync(join(BUILD, 'index.html'))) throw new Error('O build de vitrine não gerou o index.html.');

  const servidor = spawn(
    'pnpm',
    ['exec', 'vite', 'preview', '--outDir', JSON.stringify(BUILD), '--host', '127.0.0.1', '--port', String(PORTA), '--strictPort'],
    { cwd: WEB, stdio: 'inherit', shell: true },
  );
  const navegador = await chromium.launch();
  let falhas = 0;
  try {
    await esperarServidor(URL_BASE);
    // Sem service worker: a comparação é do visual, e o SW da prévia não deve cachear a vitrine.
    const contexto = await navegador.newContext({ serviceWorkers: 'block', deviceScaleFactor: 1 });
    const pagina = await contexto.newPage();

    for (const c of lista) {
      const nome = `${c.vitrine}-${c.viewportNome}`;
      const mockup = await print(pagina, pathToFileURL(join(MOCKUP, c.mockup)).href, c.viewport);
      const app = await print(pagina, `${URL_BASE}/_vitrine/${c.vitrine}`, c.viewport);
      const r = compararPng(mockup, app, { limite: c.limite });
      writeFileSync(join(SAIDA, `${nome}--mockup.png`), mockup);
      writeFileSync(join(SAIDA, `${nome}--app.png`), app);
      if (r.diff) writeFileSync(join(SAIDA, `${nome}--diff.png`), r.diff);
      console.log(`${r.passou ? 'ok   ' : 'FALHA'} ${nome}: ${r.mensagem}`);
      if (!r.passou) falhas += 1;
    }

    for (const c of reais) {
      // Página nova por tela: as rotas falsas e o estado do app não passam de uma para a outra.
      // `userAgent` (T75): contexto próprio só para o lado do app.
      const contextoApp = c.entrada.userAgent
        ? await navegador.newContext({ serviceWorkers: 'block', deviceScaleFactor: 1, userAgent: c.entrada.userAgent })
        : contexto;
      const paginaMockup = await contexto.newPage();
      const paginaApp = await contextoApp.newPage();
      const ocultar = ocultarDe(mapa, c.entrada);
      try {
        await aplicarRespostas(paginaApp, c.entrada, { mockup: MOCKUP, globais: mapa.respostas ?? [] });
        const mockup = await printTela(paginaMockup, pathToFileURL(join(MOCKUP, c.entrada.mockup)).href, c.viewport, {
          recorte: recorteDe(c.entrada, 'mockup'),
          ocultar: cssOcultar(ocultar, 'mockup'),
        });
        const app = await printTela(paginaApp, `${URL_BASE}${c.entrada.rota}`, c.viewport, {
          passos: c.entrada.passos,
          esperar: c.entrada.esperar,
          recorte: recorteDe(c.entrada, 'app'),
          ocultar: cssOcultar(ocultar, 'app'),
          relogio: c.entrada.relogio ?? RELOGIO_VISUAL,
        });
        const r = compararPng(mockup, app, { limite: c.limite });
        writeFileSync(join(SAIDA, `${c.nome}--mockup.png`), mockup);
        writeFileSync(join(SAIDA, `${c.nome}--app.png`), app);
        if (r.diff) writeFileSync(join(SAIDA, `${c.nome}--diff.png`), r.diff);
        console.log(`${r.passou ? 'ok   ' : 'FALHA'} ${c.nome}: ${r.mensagem}`);
        if (!r.passou) falhas += 1;
      } catch (erro) {
        console.log(`FALHA ${c.nome}: ${erro instanceof Error ? erro.message : String(erro)}`);
        falhas += 1;
      } finally {
        await paginaMockup.close();
        await paginaApp.close();
        if (contextoApp !== contexto) await contextoApp.close();
      }
    }

    // Controle: um componente deformado tem de reprovar.
    const controle = lista[0];
    const mockup = await print(pagina, pathToFileURL(join(MOCKUP, controle.mockup)).href, controle.viewport);
    const deformado = await print(pagina, `${URL_BASE}/_vitrine/${controle.vitrine}`, controle.viewport, DEFORMACAO);
    const r = compararPng(mockup, deformado, { limite: controle.limite });
    if (r.passou) {
      console.log(`FALHA controle: o componente deslocado passou (${porcentagem(r.proporcao)}); a comparação não pega deformação.`);
      falhas += 1;
    } else {
      console.log(`ok    controle: o componente deslocado reprovou (${porcentagem(r.proporcao)}).`);
    }

    // Controle das telas reais (T55): a primeira, deformada, também tem de reprovar.
    const real = reais[0];
    if (real) {
      const paginaMockup = await contexto.newPage();
      const paginaApp = await contexto.newPage();
      try {
        await aplicarRespostas(paginaApp, real.entrada, { mockup: MOCKUP, globais: mapa.respostas ?? [] });
        const ocultar = ocultarDe(mapa, real.entrada);
        const m = await printTela(paginaMockup, pathToFileURL(join(MOCKUP, real.entrada.mockup)).href, real.viewport, {
          recorte: recorteDe(real.entrada, 'mockup'),
          ocultar: cssOcultar(ocultar, 'mockup'),
        });
        const d = await printTela(paginaApp, `${URL_BASE}${real.entrada.rota}`, real.viewport, {
          passos: real.entrada.passos,
          esperar: real.entrada.esperar,
          recorte: recorteDe(real.entrada, 'app'),
          css: DEFORMACAO,
          ocultar: cssOcultar(ocultar, 'app'),
          relogio: real.entrada.relogio ?? RELOGIO_VISUAL,
        });
        const rr = compararPng(m, d, { limite: real.limite });
        if (rr.passou) {
          console.log(`FALHA controle ${real.nome}: a tela deformada passou (${porcentagem(rr.proporcao)}).`);
          falhas += 1;
        } else {
          console.log(`ok    controle ${real.nome}: a tela deformada reprovou (${porcentagem(rr.proporcao)}).`);
        }
      } finally {
        await paginaMockup.close();
        await paginaApp.close();
      }
    }
    await contexto.close();
  } finally {
    await navegador.close();
    servidor.kill();
  }

  const total = lista.length + reais.length;
  console.log(falhas === 0 ? `Comparação visual: ${total} telas em até 1%.` : `Comparação visual: ${falhas} falha(s). Prints em ${SAIDA}.`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  principal().catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  });
}
