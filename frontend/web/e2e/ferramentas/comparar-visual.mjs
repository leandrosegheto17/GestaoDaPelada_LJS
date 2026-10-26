#!/usr/bin/env node
// Compara, tela a tela, o mockup aprovado (.specs/mockup/) com a aplicação rodando.
//
// Para cada tela × tamanho (viewport) do mapa `.specs/mockup/telas.json`:
//   1. abre a página do mockup (arquivo local) e tira um print da página inteira;
//   2. abre a rota da aplicação, com as chamadas de API interceptadas e respondidas
//      pelos mesmos JSON do mockup (assim os dois mostram exatamente os mesmos dados),
//      e tira o print;
//   3. calcula a diferença pixel a pixel dentro do próprio navegador (canvas) e grava
//      mockup.png, app.png e diff.png (vermelho = pixel diferente).
//
// Única dependência: `playwright` (com o Chromium instalado: `npx playwright install
// chromium`), resolvida a partir de --pacote (padrão: pasta atual).
//
// Uso:
//   node frontend/web/e2e/ferramentas/comparar-visual.mjs --base-url http://localhost:5173
//        [--config .specs/mockup/telas.json] [--tela T1[,T2]] [--viewport pc|celular]
//        [--saida .specs/.visual/<data>] [--limite 1] [--limiar 0.1]
//        [--pacote web] [--iniciar "pnpm --filter web dev"]
//
//   --limite  porcentagem máxima de pixels divergentes por comparação (padrão 1)
//   --limiar  diferença mínima por canal (0–1) para um pixel contar como divergente
//             (padrão 0.1; absorve suavização de fonte)
//   --iniciar comando que sobe a aplicação; o script espera --base-url responder,
//             compara e derruba o processo no fim
//
// Formato de telas.json:
// {
//   "viewports": { "pc": { "width": 1440, "height": 900 },
//                  "celular": { "width": 390, "height": 844 } },
//   "respostas": [                      // valem para todas as telas
//     { "url": "**/api/v1/resumo", "arquivo": "respostas/resumo.json" }
//   ],
//   "ocultar": [".relogio"],            // seletores escondidos nos dois lados (conteúdo variável)
//   "telas": [
//     { "id": "T1", "nome": "Divergências", "estado": "sucesso",
//       "mockup": "telas/divergencias--sucesso.html", "rota": "/",
//       "viewports": ["pc", "celular"], "esperar": "main table",
//       "respostas": [ { "url": "**/api/v1/divergencias*", "arquivo": "respostas/divergencias.json" } ] },
//     { "id": "T1", "nome": "Divergências", "estado": "erro",
//       "mockup": "telas/divergencias--erro.html", "rota": "/",
//       "respostas": [ { "url": "**/api/v1/divergencias*", "status": 500,
//                        "arquivo": "respostas/erro-interno.json" } ] },
//     { "id": "T1", "estado": "carregando", "mockup": "telas/divergencias--carregando.html",
//       "rota": "/", "respostas": [ { "url": "**/api/v1/divergencias*", "pendente": true } ] }
//   ]
// }
// "recorte": { "mockup": "<seletor>", "app": "<seletor>" } (opcional, por tela) compara só o
// elemento indicado em cada lado, ignorando o que está atrás (usado nas folhas: a página de
// fundo é real no app e vazia no mockup). Com recorte, ".conteudo" deixa de ser ocultado.
// "userAgent": "<string>" (opcional, por tela) define o user agent só do lado da aplicação (usado quando
// o app muda conforme a plataforma, como a folha de instalar no iOS/Android).
// "passos": [ ... ] (opcional, por tela) interações executadas só no lado da aplicação, em ordem,
// depois do carregamento e antes do print (estados que exigem toque, digitação ou diálogo). Cada passo:
//   { "clicar": "<seletor Playwright>", "indice": 0 }            (ex.: "role=button[name='Reativar']")
//   { "preencher": "<seletor>", "valor": "2026-10-07", "indice": 0 }
//   { "esperar": "<seletor>" }                                    (espera ficar visível)
//   { "aguardarMs": 300 }
// Uma resposta com "pendente": true nunca responde; com "abortar": true a chamada falha como
// se não houvesse conexão. Em tela com passos, "pendente" vale só para a chamada disparada por
// eles (a página carrega normalmente).
// Respostas da tela têm prioridade sobre as globais. "pendente": true nunca responde
// (mantém a tela em "carregando"). Caminhos são relativos à pasta do telas.json.
// "sequencia": [ { "arquivo": "...", "status": 200 }, ... ] no lugar de "arquivo" responde a cada
// chamada da URL com o item seguinte (o último se repete): serve para a leitura que muda depois
// de uma gravação (ex.: ficha inativa que, depois de reativar, volta ativa).
// "recorte" aceita lista de seletores em cada lado (ex.: ["a", "b"]): os elementos são capturados
// um a um e empilhados na ordem dada, para comparar trechos separados da página.
//
// Código de saída: 0 = tudo dentro do limite; 1 = alguma comparação acima do limite
// ou com erro; 2 = uso incorreto / dependência ausente.

import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { capturar, diferenca } from './comparar-visual-captura.mjs';

function lerArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const chave = argv[i].slice(2);
    const valor = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    args[chave] = valor;
  }
  return args;
}

async function carregarPlaywright(pasta) {
  for (const nome of ['playwright', '@playwright/test']) {
    try {
      const require = createRequire(join(resolve(pasta), 'package.json'));
      const caminho = require.resolve(nome);
      const modulo = await import(pathToFileURL(caminho).href);
      const chromium = modulo.chromium ?? modulo.default?.chromium;
      if (chromium) return chromium;
    } catch {
      // tenta o próximo
    }
  }
  return null;
}

async function esperarUrl(url, segundos) {
  const fim = Date.now() + segundos * 1000;
  while (Date.now() < fim) {
    try {
      const resposta = await fetch(url);
      if (resposta.status < 500) return true;
    } catch {
      // ainda subindo
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

function derrubar(processo) {
  if (!processo || processo.exitCode !== null) return;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${processo.pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(-processo.pid, 'SIGTERM');
    }
  } catch {
    // já terminou
  }
}

async function main() {
  const args = lerArgs(process.argv.slice(2));
  if (!args['base-url']) {
    console.error(
      'Uso: node frontend/web/e2e/ferramentas/comparar-visual.mjs --base-url <URL da aplicação> [opções] (ver cabeçalho)',
    );
    process.exit(2);
  }
  const config = resolve(args.config ?? '.specs/mockup/telas.json');
  if (!existsSync(config)) {
    console.error(`Mapa de telas não encontrado: ${config}`);
    process.exit(2);
  }
  const pastaConfig = dirname(config);
  const mapa = JSON.parse(readFileSync(config, 'utf8'));
  const limite = Number(args.limite ?? 1);
  const limiar = Number(args.limiar ?? 0.1);
  const hoje = new Date().toISOString().slice(0, 10);
  const saida = resolve(args.saida ?? join('.specs', '.visual', hoje));
  mkdirSync(saida, { recursive: true });
  const filtroTelas = args.tela ? new Set(args.tela.split(',')) : null;
  const filtroViewport = args.viewport ?? null;
  const baseUrl = args['base-url'].replace(/\/$/, '');

  const chromium = await carregarPlaywright(args.pacote ?? '.');
  if (!chromium) {
    console.error(
      'Playwright não encontrado a partir de --pacote. Instale no pacote da interface ' +
        '(ex.: `pnpm --filter web add -D playwright` e `pnpm --filter web exec playwright install chromium`).',
    );
    process.exit(2);
  }

  let servidor = null;
  if (args.iniciar) {
    servidor = spawn(args.iniciar, { shell: true, stdio: 'ignore', detached: process.platform !== 'win32' });
    if (!(await esperarUrl(baseUrl, 120))) {
      derrubar(servidor);
      console.error(`A aplicação não respondeu em ${baseUrl} em 120 s.`);
      process.exit(1);
    }
  }

  const navegador = await chromium.launch();
  const linhas = [];
  let falhou = false;
  try {
    for (const tela of mapa.telas ?? []) {
      if (filtroTelas && !filtroTelas.has(tela.id)) continue;
      const estado = tela.estado ?? 'sucesso';
      const respostas = [...(tela.respostas ?? []), ...(mapa.respostas ?? [])];
      // Com passos, a resposta pendente vale só para a chamada disparada por eles; a página carrega normalmente.
      const pendente = !tela.passos?.length && respostas.some((r) => r.pendente);
      const recorte = tela.recorte ?? null;
      // Com recorte, o `.conteudo` guarda a própria folha no app: esconder a página de fundo
      // esconderia a folha, então o seletor sai da lista (o recorte já a ignora).
      const ocultar = [...(mapa.ocultar ?? []), ...(tela.ocultar ?? [])].filter((s) => !(recorte && s === '.conteudo'));
      for (const nomeViewport of tela.viewports ?? Object.keys(mapa.viewports ?? {})) {
        if (filtroViewport && filtroViewport !== nomeViewport) continue;
        const viewport = mapa.viewports?.[nomeViewport];
        const rotulo = `${tela.id}-${estado}-${nomeViewport}`;
        try {
          if (!viewport) throw new Error(`viewport "${nomeViewport}" não definido em telas.json`);
          const arquivoMockup = join(pastaConfig, tela.mockup);
          if (!existsSync(arquivoMockup.split(/[?#]/)[0])) throw new Error(`mockup não encontrado: ${tela.mockup}`);
          const urlMockup =
            pathToFileURL(arquivoMockup.split(/[?#]/)[0]).href + (tela.mockup.match(/[?#].*$/)?.[0] ?? '');
          const pngMockup = await capturar(navegador, viewport, urlMockup, {
            ocultar,
            esperar: null,
            pastaConfig,
            recorte: recorte?.mockup,
          });
          const pngApp = await capturar(navegador, viewport, baseUrl + tela.rota, {
            ocultar,
            esperar: pendente ? null : tela.esperar,
            respostas,
            pendente,
            pastaConfig,
            recorte: recorte?.app,
            userAgent: tela.userAgent,
            passos: tela.passos,
          });
          const r = await diferenca(navegador, pngMockup, pngApp, limiar);
          writeFileSync(join(saida, `${rotulo}--mockup.png`), pngMockup);
          writeFileSync(join(saida, `${rotulo}--app.png`), pngApp);
          writeFileSync(join(saida, `${rotulo}--diff.png`), Buffer.from(r.diffBase64, 'base64'));
          const ok = r.porcentagem <= limite && r.tamanhoMockup === r.tamanhoApp;
          if (!ok) falhou = true;
          linhas.push(
            `| ${tela.id} ${tela.nome ?? ''} | ${estado} | ${nomeViewport} | ${r.porcentagem.toFixed(2)}% | ` +
              `${r.tamanhoMockup} / ${r.tamanhoApp} | **${ok ? 'OK' : 'DIVERGE'}** | \`${rotulo}--diff.png\` |`,
          );
        } catch (erro) {
          falhou = true;
          linhas.push(
            `| ${tela.id} ${tela.nome ?? ''} | ${estado} | ${nomeViewport} | — | — | **ERRO** | ${String(erro.message ?? erro).replace(/\|/g, '\\|')} |`,
          );
        }
      }
    }
  } finally {
    await navegador.close();
    derrubar(servidor);
  }

  const relatorio = [
    `# Comparação visual mockup × aplicação (${hoje})`,
    '',
    `Aplicação: \`${baseUrl}\` · Limite: ${limite}% de pixels · Limiar por canal: ${limiar} · Imagens: \`${saida.replace(/\\/g, '/')}\``,
    '',
    '| Tela | Estado | Tamanho | Pixels divergentes | Altura mockup / app | Resultado | Diferença |',
    '|---|---|---|---|---|---|---|',
    ...linhas,
    '',
    'DIVERGE = acima do limite **ou** página com tamanho diferente do mockup. Abra o `--diff.png` (vermelho = pixel ' +
      'diferente) e os prints `--mockup.png`/`--app.png` lado a lado antes de concluir.',
  ].join('\n');
  writeFileSync(join(saida, 'resumo.md'), relatorio + '\n', 'utf8');
  console.log(relatorio);
  process.exit(falhou ? 1 : 0);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
