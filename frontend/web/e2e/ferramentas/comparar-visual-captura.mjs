// Captura das páginas (mockup e aplicação) e diferença pixel a pixel, usadas por comparar-visual.mjs.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CSS_ESTAVEL = `
  *, *::before, *::after {
    animation: none !important; transition: none !important; caret-color: transparent !important;
  }`;

async function prepararPagina(pagina, ocultar) {
  const css = CSS_ESTAVEL + (ocultar.length ? `${ocultar.join(',')} { visibility: hidden !important; }` : '');
  await pagina.addStyleTag({ content: css });
  await pagina.evaluate(() => document.fonts.ready);
}

async function registrarRespostas(pagina, respostas, pastaConfig) {
  // As da tela vêm primeiro na lista: no Playwright, a última rota registrada tem
  // prioridade, então registramos em ordem inversa.
  for (const r of [...respostas].reverse()) {
    let chamadas = 0;
    await pagina.route(r.url, async (rota) => {
      if (r.pendente) return; // nunca responde: mantém o estado "carregando"
      if (r.abortar) return rota.abort('connectionrefused'); // simula a falta de conexão
      const item = r.sequencia ? r.sequencia[Math.min(chamadas++, r.sequencia.length - 1)] : r;
      const corpo = item.arquivo ? readFileSync(join(pastaConfig, item.arquivo), 'utf8') : '';
      await rota.fulfill({
        status: item.status ?? 200,
        contentType:
          item.contentType ?? (item.status && item.status >= 400 ? 'application/problem+json' : 'application/json'),
        body: corpo,
      });
    });
  }
}

// Executa, na ordem, os passos de interação de um estado (só no lado da aplicação).
async function executarPassos(pagina, passos) {
  for (const passo of passos) {
    if (passo.clicar !== undefined) {
      await pagina
        .locator(passo.clicar)
        .nth(passo.indice ?? 0)
        .click({ timeout: 15000 });
    } else if (passo.preencher !== undefined) {
      await pagina
        .locator(passo.preencher)
        .nth(passo.indice ?? 0)
        .fill(String(passo.valor ?? ''), { timeout: 15000 });
    } else if (passo.selecionar !== undefined) {
      await pagina
        .locator(passo.selecionar)
        .nth(passo.indice ?? 0)
        .selectOption(String(passo.valor ?? ''), { timeout: 15000 });
    } else if (passo.esperar !== undefined) {
      await pagina.locator(passo.esperar).first().waitFor({ state: 'visible', timeout: 15000 });
    } else if (passo.aguardarMs !== undefined) {
      await pagina.waitForTimeout(passo.aguardarMs);
    } else {
      throw new Error(`passo desconhecido: ${JSON.stringify(passo)}`);
    }
  }
}

// Folha: captura só o elemento; a página de fundo (real no app, vazia no mockup) fica de fora.
async function capturarElemento(pagina, seletor) {
  const alvo = pagina.locator(seletor).first();
  await alvo.waitFor({ state: 'visible', timeout: 15000 });
  // O conteúdo acima do elemento difere entre mockup e app e deixa o topo dele em frações de pixel
  // diferentes; o texto é rasterizado conforme essa fração. Alinha o topo a um pixel inteiro nos dois lados.
  await alvo.evaluate((el) => {
    document.documentElement.style.paddingTop = '';
    const topo = el.getBoundingClientRect().top + window.scrollY;
    const folga = Math.ceil(topo - 0.001) - topo;
    if (folga > 0.001) document.documentElement.style.paddingTop = `${folga}px`;
  });
  return alvo.screenshot();
}

// Junta os prints de vários elementos numa imagem só, um embaixo do outro.
async function empilhar(navegador, pngs) {
  const pagina = await navegador.newPage();
  const base64 = await pagina.evaluate(
    async (fontes) => {
      const imagens = await Promise.all(
        fontes.map(
          (src) =>
            new Promise((ok, erro) => {
              const img = new Image();
              img.onload = () => ok(img);
              img.onerror = erro;
              img.src = src;
            }),
        ),
      );
      const largura = Math.max(...imagens.map((i) => i.width));
      const altura = imagens.reduce((soma, i) => soma + i.height, 0);
      const c = new OffscreenCanvas(largura, altura);
      const ctx = c.getContext('2d');
      let y = 0;
      for (const img of imagens) {
        ctx.drawImage(img, 0, y);
        y += img.height;
      }
      const buffer = await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer();
      let binario = '';
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(binario);
    },
    pngs.map((p) => `data:image/png;base64,${p.toString('base64')}`),
  );
  await pagina.close();
  return Buffer.from(base64, 'base64');
}

export async function capturar(navegador, viewport, url, opcoes) {
  const contexto = await navegador.newContext({
    viewport,
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    ...(opcoes.userAgent ? { userAgent: opcoes.userAgent } : {}),
  });
  const pagina = await contexto.newPage();
  if (opcoes.respostas?.length) await registrarRespostas(pagina, opcoes.respostas, opcoes.pastaConfig);
  await pagina.goto(url, { waitUntil: opcoes.pendente ? 'domcontentloaded' : 'networkidle' });
  if (opcoes.esperar) {
    await pagina.waitForSelector(opcoes.esperar, { timeout: 15000 }).catch(() => {});
  }
  await prepararPagina(pagina, opcoes.ocultar);
  if (opcoes.passos?.length) await executarPassos(pagina, opcoes.passos);
  // Estado carregando: o app só mostra o esqueleto depois do atraso de 300 ms e do carregamento da rota.
  await pagina.waitForTimeout(opcoes.pendente ? 1500 : 300);
  // O mockup é um print estático, sem estado de foco; o app foca o primeiro controle ao abrir a folha.
  await pagina.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  let png;
  if (opcoes.recorte) {
    const seletores = [].concat(opcoes.recorte);
    const pngs = [];
    for (const seletor of seletores) pngs.push(await capturarElemento(pagina, seletor));
    png = pngs.length === 1 ? pngs[0] : await empilhar(navegador, pngs);
  } else {
    png = await pagina.screenshot({ fullPage: true });
  }
  await contexto.close();
  return png;
}

export async function diferenca(navegador, pngA, pngB, limiar) {
  const pagina = await navegador.newPage();
  const resultado = await pagina.evaluate(
    async ({ a, b, limiar }) => {
      const carregar = (src) =>
        new Promise((ok, erro) => {
          const img = new Image();
          img.onload = () => ok(img);
          img.onerror = erro;
          img.src = src;
        });
      const [ia, ib] = await Promise.all([carregar(a), carregar(b)]);
      const w = Math.max(ia.width, ib.width);
      const h = Math.max(ia.height, ib.height);
      const pixels = (img) => {
        const c = new OffscreenCanvas(w, h);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ff00ff'; // área que só existe numa das imagens conta como diferente
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, w, h).data;
      };
      const pa = pixels(ia);
      const pb = pixels(ib);
      const saida = new OffscreenCanvas(w, h);
      const ctx = saida.getContext('2d');
      const dados = ctx.createImageData(w, h);
      const corte = limiar * 255;
      let diferentes = 0;
      for (let i = 0; i < pa.length; i += 4) {
        const difere =
          Math.abs(pa[i] - pb[i]) > corte ||
          Math.abs(pa[i + 1] - pb[i + 1]) > corte ||
          Math.abs(pa[i + 2] - pb[i + 2]) > corte;
        if (difere) {
          diferentes++;
          dados.data[i] = 255;
          dados.data[i + 1] = 0;
          dados.data[i + 2] = 0;
          dados.data[i + 3] = 255;
        } else {
          const cinza = (pa[i] + pa[i + 1] + pa[i + 2]) / 3;
          dados.data[i] = dados.data[i + 1] = dados.data[i + 2] = 200 + cinza * 0.2;
          dados.data[i + 3] = 255;
        }
      }
      ctx.putImageData(dados, 0, 0);
      const blob = await saida.convertToBlob({ type: 'image/png' });
      const buffer = await blob.arrayBuffer();
      let binario = '';
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      return {
        porcentagem: (diferentes / (w * h)) * 100,
        tamanhoMockup: `${ia.width}×${ia.height}`,
        tamanhoApp: `${ib.width}×${ib.height}`,
        diffBase64: btoa(binario),
      };
    },
    {
      a: `data:image/png;base64,${pngA.toString('base64')}`,
      b: `data:image/png;base64,${pngB.toString('base64')}`,
      limiar,
    },
  );
  await pagina.close();
  return resultado;
}
