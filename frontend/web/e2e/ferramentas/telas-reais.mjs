/* global document -- usado só dentro de pagina.evaluate, que roda no navegador */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Telas reais na comparação visual (T54; ACE-54, ACE-55; AD-021): as entradas do
 * `.specs/mockup/telas.json` com `rota` de verdade (`real: true`), além das rotas de vitrine.
 *
 * - `respostas`: cada `{ url, metodo, arquivo, status, pendente, sequencia, abortar }` vira uma rota do
 *   Playwright. As globais do `telas.json` entram primeiro e as da entrada depois (no Playwright
 *   vale a última registrada). Toda outra chamada a `/api/` responde 404 `nao_encontrado`: o
 *   build é servido pelo `vite preview`, que devolveria o `index.html` com 200.
 * - Os JSONs do mockup trazem o erro no formato antigo (`{ "erro": { "codigo", "mensagem",
 *   "grupos" } }`); `adaptarCorpo` o converte no `corpoErro` do contrato
 *   (`{ erro, codigo, grupos }`). O código `nao_autenticado` do mockup vira `sem_sessao`.
 * - `passos` (`preencher` e `selecionar` + `valor`, `clicar` com `indice` opcional, `esperar`, `aguardarMs`, `rolar`) e o
 *   `esperar` da entrada rodam só no app; o mockup é estático.
 * - `recorte`: compara só o seletor (ou a caixa que envolve a lista de seletores) nas duas
 *   imagens. No app, cada `.classe` do seletor vale também para o nome do CSS Module do build
 *   visual (`<classe>--m-<hash>`, `vite.config.ts`); ver `seletorDoApp`.
 * - `ocultar` (partidas-e-ranking T75; o do `telas.json` e o da entrada): seletores escondidos
 *   com `visibility: hidden` nos dois lados (o espaço fica), como no runner do LJS.
 * - `cssApp`: CSS acrescentado só ao app antes do print (ex.: esconder seções que a ficha reduzida do mockup não tem).
 * - `userAgent` (T75): user agent só do lado do app (o visual abre um contexto próprio).
 * - Relógio congelado (T75, AD-044): o app abre com `Date` fixo em `RELOGIO_VISUAL` (o "hoje" do
 *   mockup), ou no `relogio` da entrada; o mockup é estático e não precisa.
 */

/** "Agora" do mockup para o app (AD-044): a t09 `sem-jogadores` mostra outubro em qualquer data real. */
export const RELOGIO_VISUAL = '2026-10-16T12:00:00-03:00';

/** Seletores a esconder numa entrada: os globais do `telas.json` e os da entrada. */
export function ocultarDe(mapa, entrada) {
  return [...(mapa.ocultar ?? []), ...(entrada.ocultar ?? [])];
}

/** CSS que esconde os seletores (lado do app com os seletores reescritos para o CSS Module). */
export function cssOcultar(seletores, lado = 'mockup') {
  if (!seletores || seletores.length === 0) return '';
  const lista = lado === 'app' ? seletores.map(seletorDoApp) : seletores;
  return `${lista.join(', ')} { visibility: hidden !important; }`;
}

/** Separador do nome das classes de CSS Module no build visual (`vite.config.ts`). */
export const SUFIXO_MODULO = '--m-';

const CODIGOS_ANTIGOS = { nao_autenticado: 'sem_sessao', validacao: 'dados_invalidos' };

/** Lê o `e2e/telas-ativas.json` e devolve as entradas do `telas.json` que ele lista, na ordem. */
export function entradasAtivas(mapa, ativas) {
  const lista = [];
  for (const { id, estado } of ativas.telas ?? []) {
    const entrada = (mapa.telas ?? []).find(
      (t) => t.id === id && t.estado === estado && t.real === true,
    );
    if (!entrada)
      throw new Error(`${id} ${estado} não é uma tela real (real: true) do telas.json.`);
    lista.push(entrada);
  }
  return lista;
}

/** Corpo de um arquivo de resposta do mockup, já no formato do contrato quando é um erro. */
export function adaptarCorpo(texto) {
  if (texto.trim() === '') return texto;
  let dado;
  try {
    dado = JSON.parse(texto);
  } catch {
    return texto;
  }
  const erro = dado && typeof dado === 'object' ? dado.erro : undefined;
  if (!erro || typeof erro !== 'object' || typeof erro.codigo !== 'string') return texto;
  const codigo = CODIGOS_ANTIGOS[erro.codigo] ?? erro.codigo;
  const corpo = { erro: typeof erro.mensagem === 'string' ? erro.mensagem : '', codigo };
  if (Array.isArray(erro.campos)) corpo.campos = erro.campos;
  // Formato antigo das rotas de grupo: `campos` era o mapa { campo: mensagem }; no contrato, `campos` lista os
  // nomes e `mensagens` traz o texto de cada um.
  else if (erro.campos && typeof erro.campos === 'object') {
    corpo.campos = Object.keys(erro.campos);
    corpo.mensagens = erro.campos;
  }
  if (typeof erro.sugestao === 'string') corpo.sugestao = erro.sugestao;
  if (typeof erro.dataExistente === 'string') corpo.dataExistente = erro.dataExistente;
  if (Array.isArray(erro.grupos)) corpo.grupos = erro.grupos;
  return JSON.stringify(corpo);
}

/**
 * Seletor do app: em cada parte CSS (separadas por ` >> `; as de `role=` e `text=` ficam como
 * estão), `.classe` vira `:is(.classe, [class^="classe--m-"], [class*=" classe--m-"])`, que casa
 * a classe global e a do CSS Module do build visual, sem casar outra classe que só começa igual.
 */
export function seletorDoApp(seletor) {
  return seletor
    .split(' >> ')
    .map((parte) => {
      const p = parte.trim();
      if (/^(role|text|xpath|internal:)/.test(p)) return parte;
      return parte.replace(
        /\.([A-Za-z_][\w-]*)/g,
        (_, nome) =>
          `:is(.${nome}, [class^="${nome}${SUFIXO_MODULO}"], [class*=" ${nome}${SUFIXO_MODULO}"])`,
      );
    })
    .join(' >> ');
}

function respostaDoArquivo(mockup, item) {
  const status = typeof item.status === 'number' ? item.status : 200;
  if (status === 204 || status === 304) return { status };
  const corpo = item.arquivo ? adaptarCorpo(readFileSync(join(mockup, item.arquivo), 'utf8')) : '';
  return { status, contentType: 'application/json', body: corpo };
}

/** Registra as rotas de API falsas de uma entrada na página (antes do `goto`). */
export async function aplicarRespostas(pagina, entrada, { mockup, globais = [] }) {
  await pagina.route('**/api/**', (rota) =>
    rota.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ erro: 'Não encontrado.', codigo: 'nao_encontrado' }),
    }),
  );
  for (const item of [...globais, ...(entrada.respostas ?? [])]) {
    // `metodo` (ex.: "PUT"): a rota só responde a esse método; os outros caem na rota anterior da mesma URL
    // (o GET e o PUT de `/api/grupos/:id` têm respostas diferentes).
    const doMetodo = (tratar) => (rota, requisicao) =>
      item.metodo && requisicao.method() !== String(item.metodo).toUpperCase()
        ? rota.fallback()
        : tratar(rota);
    if (item.pendente) {
      await pagina.route(
        item.url,
        doMetodo(() => new Promise(() => undefined)),
      );
    } else if (item.abortar) {
      await pagina.route(
        item.url,
        doMetodo((rota) => rota.abort()),
      );
    } else if (Array.isArray(item.sequencia)) {
      let vez = 0;
      await pagina.route(
        item.url,
        doMetodo((rota) => {
          const passo = item.sequencia[Math.min(vez, item.sequencia.length - 1)];
          vez += 1;
          return rota.fulfill(respostaDoArquivo(mockup, { status: item.status, ...passo }));
        }),
      );
    } else {
      await pagina.route(
        item.url,
        doMetodo((rota) => rota.fulfill(respostaDoArquivo(mockup, item))),
      );
    }
  }
}

/** Executa os `passos` de uma entrada, na ordem. */
export async function executarPassos(pagina, passos = []) {
  for (const passo of passos) {
    if ('preencher' in passo)
      await pagina
        .locator(seletorDoApp(passo.preencher))
        .first()
        .fill(String(passo.valor ?? ''));
    else if ('selecionar' in passo)
      await pagina
        .locator(seletorDoApp(passo.selecionar))
        .first()
        .selectOption(String(passo.valor ?? ''));
    else if ('clicar' in passo)
      await pagina
        .locator(seletorDoApp(passo.clicar))
        .nth(passo.indice ?? 0)
        .click();
    else if ('esperar' in passo)
      await pagina.locator(seletorDoApp(passo.esperar)).first().waitFor({ state: 'visible' });
    else if ('aguardarMs' in passo) await pagina.waitForTimeout(passo.aguardarMs);
    else if ('rolar' in passo)
      // `rolar: "topo"`: volta ao início da página (um clique no fim da tela a deixou rolada; o mockup é estático).
      await pagina.evaluate(() => globalThis.scrollTo(0, 0));
    else throw new Error(`Passo desconhecido: ${JSON.stringify(passo)}`);
  }
}

/** Caixa que envolve todos os elementos dos seletores (recorte com lista). */
async function caixaDe(pagina, seletores) {
  const caixas = [];
  for (const s of seletores) {
    const caixa = await pagina.locator(s).first().boundingBox();
    if (!caixa) throw new Error(`O recorte ${s} não está visível.`);
    caixas.push(caixa);
  }
  const x = Math.min(...caixas.map((c) => c.x));
  const y = Math.min(...caixas.map((c) => c.y));
  const largura = Math.max(...caixas.map((c) => c.x + c.width)) - x;
  const altura = Math.max(...caixas.map((c) => c.y + c.height)) - y;
  return {
    x: Math.floor(x),
    y: Math.floor(y),
    width: Math.ceil(largura),
    height: Math.ceil(altura),
  };
}

/**
 * Print de uma tela: abre a `url`, roda os passos e o `esperar`, carrega as fontes e tira o
 * print do viewport, ou só do `recorte` (seletor ou lista de seletores, já no formato da página).
 */
export async function printTela(
  pagina,
  url,
  viewport,
  { passos, esperar, recorte, css, ocultar, relogio } = {},
) {
  await pagina.setViewportSize(viewport);
  // AD-044: o relógio fica parado antes de a página carregar (Date.now e new Date()).
  if (relogio) await pagina.clock.setFixedTime(new Date(relogio));
  await pagina.goto(url, { waitUntil: 'load' });
  // Resposta `pendente` nunca chega: a rede não fica ociosa, então a espera tem teto.
  await pagina.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
  await executarPassos(pagina, passos);
  if (esperar) await pagina.locator(seletorDoApp(esperar)).first().waitFor({ state: 'visible' });
  if (css) await pagina.addStyleTag({ content: css });
  if (ocultar) await pagina.addStyleTag({ content: ocultar });
  await pagina.evaluate(() => document.fonts.ready);
  const opcoes = { animations: 'disabled', caret: 'hide' };
  if (!recorte) return pagina.screenshot(opcoes);
  // O foco (anel do botão autofocado do diálogo) não faz parte do que se compara: o mockup estático não tem foco.
  await pagina.evaluate(() => {
    const ativo = globalThis.document.activeElement;
    if (ativo && ativo !== globalThis.document.body) ativo.blur();
  });
  if (Array.isArray(recorte))
    return pagina.screenshot({ ...opcoes, clip: await caixaDe(pagina, recorte) });
  return pagina.locator(recorte).first().screenshot(opcoes);
}

/** Recorte de um lado (`mockup` ou `app`), com o seletor do app já reescrito. */
export function recorteDe(entrada, lado) {
  const r = entrada.recorte?.[lado];
  if (r === undefined) return undefined;
  if (lado === 'mockup') return r;
  return Array.isArray(r) ? r.map(seletorDoApp) : seletorDoApp(r);
}
