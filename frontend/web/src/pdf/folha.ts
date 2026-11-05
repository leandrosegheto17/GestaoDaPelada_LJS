import type { LinhaPublica, PdfPublico, RodadaPublica } from '@pelada/contrato/publico';

/**
 * Folha do PDF do ranking (partidas-e-ranking T68; PAR-103, PAR-104), de `.specs/mockup/telas/p01-pdf--{sucesso,
 * mes-vazio}.html` e do bloco `.pdf-*` de `.specs/mockup/base.css:300-327`. Modelo puro, sem `jspdf`: a lista de
 * elementos de cada página, em pontos (1 px do mockup = 0,75 pt). `gerar-pdf.ts` só desenha o que está aqui, e os
 * testes conferem página, fonte e texto sem depender do arquivo binário.
 *
 * - A4 retrato (595,28 × 841,89 pt); até 40 jogadores e 12 colunas cabem em 1 página (PAR-103);
 * - fonte da tabela de 8,5 pt, reduzida até 7 pt quando as linhas não cabem; nenhum texto abaixo de 7 pt (PAR-103);
 * - nome do grupo, "Ranking: <mês> de <ano>", "Gerado em dd/mm/aaaa hh:mm" (hora de São Paulo), meses sobre as colunas,
 *   sol e chuva, legenda com equivalente que não depende de cor ("L", "E", tracejado, "–") e o rodapé "Gestão da
 *   Pelada" com o endereço público sem o esquema (PAR-104).
 */

export const A4 = { largura: 595.28, altura: 841.89 } as const;

/** Cores de `.specs/mockup/tokens.css` (o PDF não lê CSS). */
export const CORES_PDF = {
  superficie: '#FEFFFD',
  zebra: '#F2F6F3',
  texto: '#14201A',
  textoSec: '#4A5A50',
  linha: '#DCE5DF',
  verde: '#0B6B34',
  pFundo: '#D7F0DF',
  pTexto: '#0A4D26',
  lFundo: '#FFF0C2',
  lTexto: '#6B4A00',
  eFundo: '#FBD9D9',
  eTexto: '#8A1414',
  fFundo: '#ECEFED',
  fTexto: '#4A5A50',
  chuva: '#1E5AA8',
  sol: '#8A5A00',
} as const;

/** Tamanhos de `--pdf-*` em `tokens.css`, em pt. */
export const TAMANHOS_PDF = { titulo: 20, sub: 12, pontos: 10, texto: 8.5, pequeno: 7.5, rodape: 7, mes: 7 } as const;

export const FONTE_MINIMA = 7;
export const FONTE_MAXIMA = TAMANHOS_PDF.texto;

export type Familia = 'titulo' | 'texto';
export type Peso = 'normal' | 'negrito';

export interface ElTexto {
  tipo: 'texto';
  x: number;
  /** Linha de base. */
  y: number;
  texto: string;
  tamanho: number;
  familia: Familia;
  peso: Peso;
  cor: string;
  alinhar: 'left' | 'center' | 'right';
}

/** Texto que quebra em linhas na largura dada (a legenda). */
export interface ElParagrafo {
  tipo: 'paragrafo';
  x: number;
  y: number;
  largura: number;
  texto: string;
  tamanho: number;
  cor: string;
}

export interface ElRetangulo {
  tipo: 'retangulo';
  x: number;
  y: number;
  largura: number;
  altura: number;
  raio: number;
  preenchimento?: string;
  borda?: string;
  espessura?: number;
  tracejado?: boolean;
}

export interface ElLinha {
  tipo: 'linha';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cor: string;
  espessura: number;
}

export interface ElIcone {
  tipo: 'icone';
  icone: 'sol' | 'chuva';
  /** Centro. */
  x: number;
  y: number;
  tamanho: number;
  cor: string;
}

export type Elemento = ElTexto | ElParagrafo | ElRetangulo | ElLinha | ElIcone;

export interface Folha {
  largura: number;
  altura: number;
  /** Fonte do corpo da tabela, depois do ajuste. */
  fonteTabela: number;
  paginas: Elemento[][];
}

const PX = 0.75;
const MARGEM_X = 38 * PX;
const MARGEM_TOPO = 38 * PX;
const MARGEM_BASE = 30 * PX;
const ALTURA_CABECALHO = 52 * PX;
const ESPACO_CABECALHO = 12 * PX;
const ALTURA_LINHA_CABECALHO = 20 * PX;
const ALTURA_LINHA = 20 * PX;
const RESERVA_LEGENDA = 46 * PX;
const RESERVA_RODAPE = 26 * PX;
const LARGURA_POSICAO = 22;
const LARGURA_PTS_INICIAL = 34;
const LARGURA_PTS_FINAL = 36;
const LARGURA_RODADA = 28;
const MARCA = { largura: 22 * PX, altura: 15 * PX, raio: 3 * PX };

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export const TEXTO_RODAPE = 'Gestão da Pelada';
export const TEXTO_SEM_PARTIDAS_NO_MES = 'Nenhuma partida registrada neste mês';
export const TEXTO_LEGENDA =
  'Cor = situação; número = pontos da rodada. Verde: presente · amarelo com “L”: lesionado (foi e não jogou) · ' +
  'vermelho com “E”: expulso · cinza tracejado: falta · “–”: fora do grupo ou antes da data de início · sol: sem ' +
  'chuva · nuvem: com chuva. Pts inicial = pontos antes da 1ª coluna; Pts inicial + rodadas = Pts final (acumulado ' +
  'até hoje). Ordem pelos pontos acumulados até hoje.';

/** "outubro de 2026" de `2026-10`. */
export function mesPorExtenso(mes: string): string {
  const [ano, numero] = mes.split('-');
  return `${MESES[Number(numero) - 1] ?? mes} de ${ano}`;
}

const DATA_HORA_SP = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "Gerado em 22/10/2026 18:40" do `geradoEm` (instante ISO), na hora de São Paulo. */
export function textoGeradoEm(geradoEm: string): string {
  const partes = DATA_HORA_SP.formatToParts(new Date(geradoEm));
  const v = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value ?? '';
  return `Gerado em ${v('day')}/${v('month')}/${v('year')} ${v('hour')}:${v('minute')}`;
}

/** O endereço público sem o esquema (PAR-104). */
export function enderecoSemEsquema(url: string): string {
  return url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
}

/** "15/10" de `2026-10-15`. */
function diaMes(data: string): string {
  const [, mes, dia] = data.split('-');
  return `${dia}/${mes}`;
}

/** Colunas seguidas do mesmo mês: o rótulo e a primeira coluna do grupo. */
export function gruposDeMes(colunas: PdfPublico['colunas']): Array<{ rotulo: string; inicio: number; quantas: number }> {
  const grupos: Array<{ rotulo: string; inicio: number; quantas: number; chave: string }> = [];
  colunas.forEach((c, i) => {
    const chave = c.data.slice(0, 7);
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.chave === chave) ultimo.quantas += 1;
    else grupos.push({ chave, rotulo: MESES_CURTOS[Number(c.data.slice(5, 7)) - 1] ?? chave, inicio: i, quantas: 1 });
  });
  return grupos.map(({ rotulo, inicio, quantas }) => ({ rotulo, inicio, quantas }));
}

/** Altura da linha e fonte do corpo para `n` linhas no espaço da página (PAR-103): 8,5 pt, reduzida até 7 pt. */
export function ajustarFonte(n: number, disponivel: number): { fonte: number; alturaLinha: number } {
  if (n <= 0) return { fonte: FONTE_MAXIMA, alturaLinha: ALTURA_LINHA };
  const cabe = Math.min(ALTURA_LINHA, disponivel / n);
  const fonte = Math.max(FONTE_MINIMA, Math.min(FONTE_MAXIMA, (FONTE_MAXIMA * cabe) / ALTURA_LINHA));
  const alturaLinha = Math.max(cabe, (ALTURA_LINHA * FONTE_MINIMA) / FONTE_MAXIMA);
  return { fonte: Math.round(fonte * 100) / 100, alturaLinha };
}

/** Texto da marca: os pontos ("−1" com o sinal de menos) ou "–" na rodada fora. */
function textoDosPontos(r: RodadaPublica): string {
  if (r.situacao === 'fora' || r.pontos === null) return '–';
  return r.pontos < 0 ? `−${Math.abs(r.pontos)}` : String(r.pontos);
}

interface Geometria {
  xPosicao: number;
  xNome: number;
  xPtsInicial: number;
  xRodadas: number;
  xPtsFinal: number;
  fim: number;
}

function geometria(colunas: number): Geometria {
  const fim = A4.largura - MARGEM_X;
  const xPtsFinal = fim - LARGURA_PTS_FINAL;
  const xRodadas = xPtsFinal - colunas * LARGURA_RODADA;
  const xPtsInicial = xRodadas - LARGURA_PTS_INICIAL;
  return { xPosicao: MARGEM_X, xNome: MARGEM_X + LARGURA_POSICAO, xPtsInicial, xRodadas, xPtsFinal, fim };
}

function texto(t: Omit<ElTexto, 'tipo' | 'familia' | 'peso' | 'alinhar' | 'cor'> & Partial<ElTexto>): ElTexto {
  return { tipo: 'texto', familia: 'texto', peso: 'normal', alinhar: 'left', cor: CORES_PDF.texto, ...t };
}

function cabecalhoDaFolha(p: PdfPublico): Elemento[] {
  const topo = MARGEM_TOPO;
  const baseSub = topo + ALTURA_CABECALHO - 10 * PX;
  const els: Elemento[] = [
    texto({ x: MARGEM_X, y: topo + 22, texto: p.grupo.nome.toUpperCase(), tamanho: TAMANHOS_PDF.titulo, familia: 'titulo', peso: 'negrito' }),
    texto({ x: MARGEM_X, y: baseSub, texto: `Ranking: ${mesPorExtenso(p.mes)}`, tamanho: TAMANHOS_PDF.sub, familia: 'titulo', peso: 'negrito' }),
  ];
  const direita = A4.largura - MARGEM_X;
  if (p.semPartidasNoMes) {
    els.push(
      texto({ x: direita, y: baseSub - 9, texto: textoGeradoEm(p.geradoEm), tamanho: TAMANHOS_PDF.pequeno, cor: CORES_PDF.textoSec, alinhar: 'right' }),
      texto({ x: direita, y: baseSub, texto: TEXTO_SEM_PARTIDAS_NO_MES, tamanho: TAMANHOS_PDF.pequeno, cor: CORES_PDF.textoSec, alinhar: 'right' }),
    );
  } else {
    els.push(texto({ x: direita, y: baseSub, texto: textoGeradoEm(p.geradoEm), tamanho: TAMANHOS_PDF.pequeno, cor: CORES_PDF.textoSec, alinhar: 'right' }));
  }
  const yBorda = topo + ALTURA_CABECALHO;
  els.push({ tipo: 'linha', x1: MARGEM_X, y1: yBorda, x2: direita, y2: yBorda, cor: CORES_PDF.verde, espessura: 3 * PX });
  return els;
}

/** Os dois andares do cabeçalho da tabela: meses (com o rótulo) e as datas com sol ou chuva. */
function cabecalhoDaTabela(p: PdfPublico, g: Geometria, y: number): Elemento[] {
  const h = ALTURA_LINHA_CABECALHO;
  const meio = (a: number, b: number) => (a + b) / 2;
  const els: Elemento[] = [];
  const comum = { tamanho: TAMANHOS_PDF.pequeno, peso: 'negrito' as const, cor: CORES_PDF.textoSec };
  els.push(
    texto({ ...comum, x: meio(g.xPosicao, g.xNome), y: y + h + 3, texto: '#', alinhar: 'center' }),
    texto({ ...comum, x: g.xNome + 2, y: y + h + 3, texto: 'Jogador' }),
    texto({ ...comum, x: meio(g.xPtsInicial, g.xRodadas), y: y + h - 2, texto: 'Pts', alinhar: 'center' }),
    texto({ ...comum, x: meio(g.xPtsInicial, g.xRodadas), y: y + h + 7, texto: 'inicial', alinhar: 'center' }),
    texto({ ...comum, x: meio(g.xPtsFinal, g.fim), y: y + h - 2, texto: 'Pts', alinhar: 'center' }),
    texto({ ...comum, x: meio(g.xPtsFinal, g.fim), y: y + h + 7, texto: 'final', alinhar: 'center' }),
  );
  for (const grupo of gruposDeMes(p.colunas)) {
    const x0 = g.xRodadas + grupo.inicio * LARGURA_RODADA;
    const x1 = x0 + grupo.quantas * LARGURA_RODADA;
    els.push(texto({ ...comum, x: meio(x0, x1), y: y + h - 6, texto: grupo.rotulo.toUpperCase(), tamanho: TAMANHOS_PDF.mes, alinhar: 'center' }));
  }
  p.colunas.forEach((c, i) => {
    const x = g.xRodadas + i * LARGURA_RODADA + LARGURA_RODADA / 2;
    els.push(
      texto({ ...comum, x, y: y + h + 7, texto: diaMes(c.data), alinhar: 'center' }),
      { tipo: 'icone', icone: c.choveu ? 'chuva' : 'sol', x, y: y + 2 * h - 4, tamanho: 7.5, cor: c.choveu ? CORES_PDF.chuva : CORES_PDF.sol },
    );
  });
  const yBase = y + 2 * h;
  els.push({ tipo: 'linha', x1: g.xPosicao, y1: yBase, x2: g.fim, y2: yBase, cor: CORES_PDF.texto, espessura: 1 });
  return els;
}

/** Linhas verticais de 2 pt: no começo de cada mês e antes do Pts final (`.pdf-divisa`). */
function divisas(p: PdfPublico, g: Geometria, y0: number, y1: number): Elemento[] {
  const xs = [...gruposDeMes(p.colunas).map((grupo) => g.xRodadas + grupo.inicio * LARGURA_RODADA), g.xPtsFinal];
  return xs.map((x) => ({ tipo: 'linha' as const, x1: x, y1: y0, x2: x, y2: y1, cor: CORES_PDF.texto, espessura: 2 }));
}

const ESTILO_MARCA: Record<RodadaPublica['situacao'], { fundo?: string; cor: string; sufixo?: string; tracejado?: boolean }> = {
  presente: { fundo: CORES_PDF.pFundo, cor: CORES_PDF.pTexto },
  lesionado: { fundo: CORES_PDF.lFundo, cor: CORES_PDF.lTexto, sufixo: 'L' },
  expulso: { fundo: CORES_PDF.eFundo, cor: CORES_PDF.eTexto, sufixo: 'E' },
  falta: { fundo: CORES_PDF.fFundo, cor: CORES_PDF.fTexto, tracejado: true },
  fora: { cor: CORES_PDF.textoSec },
};

function marca(r: RodadaPublica, x: number, yMeio: number, fonte: number): Elemento[] {
  const estilo = ESTILO_MARCA[r.situacao];
  const els: Elemento[] = [];
  if (estilo.fundo) {
    els.push({
      tipo: 'retangulo',
      x: x - MARCA.largura / 2,
      y: yMeio - MARCA.altura / 2,
      largura: MARCA.largura,
      altura: MARCA.altura,
      raio: MARCA.raio,
      preenchimento: estilo.fundo,
      ...(estilo.tracejado ? { borda: estilo.cor, espessura: 0.75, tracejado: true } : {}),
    });
  }
  const base = yMeio + fonte * 0.35;
  const valor = textoDosPontos(r);
  if (estilo.sufixo) {
    els.push(
      texto({ x: x - 1, y: base, texto: valor, tamanho: fonte, peso: 'negrito', cor: estilo.cor, alinhar: 'right' }),
      texto({ x: x - 0.5, y: base, texto: estilo.sufixo, tamanho: TAMANHOS_PDF.mes, peso: 'negrito', cor: estilo.cor }),
    );
  } else {
    els.push(texto({ x, y: base, texto: valor, tamanho: fonte, peso: 'negrito', cor: estilo.cor, alinhar: 'center' }));
  }
  return els;
}

function linhaDaTabela(l: LinhaPublica, indice: number, g: Geometria, y: number, h: number, fonte: number): Elemento[] {
  const els: Elemento[] = [];
  if (indice % 2 === 1) {
    els.push({ tipo: 'retangulo', x: g.xPosicao, y, largura: g.fim - g.xPosicao, altura: h, raio: 0, preenchimento: CORES_PDF.zebra });
  }
  const yMeio = y + h / 2;
  const base = yMeio + fonte * 0.35;
  els.push(
    texto({ x: (g.xPosicao + g.xNome) / 2, y: base, texto: String(l.posicao), tamanho: fonte, alinhar: 'center' }),
    texto({ x: g.xNome + 2, y: base, texto: l.apelido, tamanho: fonte, peso: 'negrito' }),
    texto({ x: (g.xPtsInicial + g.xRodadas) / 2, y: base, texto: String(l.ptsInicial), tamanho: fonte, peso: 'negrito', cor: CORES_PDF.textoSec, alinhar: 'center' }),
  );
  l.rodadas.forEach((r, i) => {
    els.push(...marca(r, g.xRodadas + i * LARGURA_RODADA + LARGURA_RODADA / 2, yMeio, fonte));
  });
  const fontePontos = Math.max(FONTE_MINIMA, (TAMANHOS_PDF.pontos * fonte) / FONTE_MAXIMA);
  els.push(
    texto({ x: (g.xPtsFinal + g.fim) / 2, y: yMeio + fontePontos * 0.35, texto: String(l.ptsFinal), tamanho: fontePontos, familia: 'titulo', peso: 'negrito', alinhar: 'center' }),
    { tipo: 'linha', x1: g.xPosicao, y1: y + h, x2: g.fim, y2: y + h, cor: CORES_PDF.linha, espessura: 0.5 },
  );
  return els;
}

function rodape(p: PdfPublico): Elemento[] {
  const y = A4.altura - MARGEM_BASE;
  const direita = A4.largura - MARGEM_X;
  const comum = { tamanho: TAMANHOS_PDF.rodape, cor: CORES_PDF.textoSec };
  return [
    { tipo: 'linha', x1: MARGEM_X, y1: y - 12, x2: direita, y2: y - 12, cor: CORES_PDF.linha, espessura: 0.5 },
    texto({ ...comum, x: MARGEM_X, y, texto: TEXTO_RODAPE }),
    texto({ ...comum, x: direita, y, texto: enderecoSemEsquema(p.urlPublica), alinhar: 'right' }),
  ];
}

/**
 * Monta a folha: cabeçalho, tabela (com o ajuste de fonte), legenda e rodapé. Linhas que não cabem nem com 7 pt
 * seguem em páginas novas, cada uma com o cabeçalho da tabela e o rodapé (acima de 40 jogadores, fora do PAR-103).
 */
export function montarFolha(p: PdfPublico): Folha {
  const g = geometria(p.colunas.length);
  const topoTabela = MARGEM_TOPO + ALTURA_CABECALHO + ESPACO_CABECALHO;
  const topoCorpo = topoTabela + 2 * ALTURA_LINHA_CABECALHO;
  const fimCorpo = A4.altura - MARGEM_BASE - RESERVA_RODAPE - RESERVA_LEGENDA;
  const { fonte, alturaLinha } = ajustarFonte(p.linhas.length, fimCorpo - topoCorpo);
  const porPagina = Math.max(1, Math.floor((fimCorpo - topoCorpo) / alturaLinha + 1e-6));

  const paginas: Elemento[][] = [];
  const total = Math.max(1, Math.ceil(p.linhas.length / porPagina));
  for (let n = 0; n < total; n += 1) {
    const linhas = p.linhas.slice(n * porPagina, (n + 1) * porPagina);
    const els: Elemento[] = [...cabecalhoDaFolha(p), ...cabecalhoDaTabela(p, g, topoTabela)];
    linhas.forEach((l, i) => {
      els.push(...linhaDaTabela(l, n * porPagina + i, g, topoCorpo + i * alturaLinha, alturaLinha, fonte));
    });
    const fimTabela = topoCorpo + linhas.length * alturaLinha;
    els.push(...divisas(p, g, topoTabela, fimTabela));
    if (n === total - 1) {
      els.push({ tipo: 'paragrafo', x: MARGEM_X, y: fimTabela + 12 * PX + TAMANHOS_PDF.pequeno, largura: g.fim - MARGEM_X, texto: TEXTO_LEGENDA, tamanho: TAMANHOS_PDF.pequeno, cor: CORES_PDF.textoSec });
    }
    els.push(...rodape(p));
    paginas.push(els);
  }
  return { largura: A4.largura, altura: A4.altura, fonteTabela: fonte, paginas };
}

/** Todos os textos da folha, na ordem (o "texto extraído" dos testes). */
export function textosDaFolha(folha: Folha): string[] {
  return folha.paginas.flatMap((els) => els.flatMap((e) => (e.tipo === 'texto' || e.tipo === 'paragrafo' ? [e.texto] : [])));
}
