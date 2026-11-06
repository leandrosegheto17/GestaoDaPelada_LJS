import type { PdfPublico } from '@pelada/contrato/publico';
import { montarFolha, type Elemento, type Familia, type Folha, type Peso } from './folha.ts';

/**
 * Geração do PDF do ranking no navegador (partidas-e-ranking T68; PAR-102, PAR-103, PAR-104; `BD:276-277`): desenha a
 * folha de `folha.ts` com o `jspdf`, que só entra por `import()` dinâmico, no toque em "Exportar PDF" (T70) ou no
 * pré-carregamento ocioso (`preCarregarJspdf`), nunca no carregamento inicial (T50, `jspdf-sob-demanda.test.ts`).
 *
 * Fontes: Barlow e Barlow Condensed em TTF de `public/fontes/pdf/` (o `jspdf` não lê WOFF2). Se não carregarem (sem
 * rede, arquivo ausente), o PDF sai em Helvetica, e os caracteres fora do WinAnsi viram os equivalentes ASCII.
 */

type ModuloJspdf = typeof import('jspdf');
type Documento = InstanceType<ModuloJspdf['jsPDF']>;

export interface FontesPdf {
  /** Arquivo TTF em base64, por nome no VFS do jspdf. */
  arquivos: Record<string, string>;
}

/** Arquivos TTF, nome da família no PDF e peso. */
export const FONTES_TTF = [
  { arquivo: 'Barlow-Regular.ttf', familia: 'Barlow', estilo: 'normal' },
  { arquivo: 'Barlow-SemiBold.ttf', familia: 'Barlow', estilo: 'bold' },
  { arquivo: 'BarlowCondensed-Bold.ttf', familia: 'BarlowCondensed', estilo: 'normal' },
  { arquivo: 'BarlowCondensed-ExtraBold.ttf', familia: 'BarlowCondensed', estilo: 'bold' },
] as const;

export const PASTA_FONTES_PDF = '/fontes/pdf/';

let modulo: Promise<ModuloJspdf> | null = null;

/** O `import('jspdf')`, feito uma vez (o toque ou o ocioso). */
export function carregarJspdf(): Promise<ModuloJspdf> {
  modulo ??= import('jspdf').catch((erro: unknown) => {
    modulo = null;
    throw erro;
  });
  return modulo;
}

/** Pré-carregamento no ocioso (ADR-008 do legado): baixa o chunk sem gerar nada; falha é ignorada. */
export function preCarregarJspdf(): void {
  void carregarJspdf().catch(() => undefined);
}

function paraBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binario = '';
  const passo = 0x8000;
  for (let i = 0; i < bytes.length; i += passo) {
    binario += String.fromCharCode(...bytes.subarray(i, i + passo));
  }
  return btoa(binario);
}

/** Lê as TTF da pasta pública; qualquer falha devolve `null` (Helvetica). */
export async function carregarFontesPadrao(
  buscar: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<FontesPdf | null> {
  try {
    const pares = await Promise.all(
      FONTES_TTF.map(async ({ arquivo }) => {
        const resposta = await buscar(`${PASTA_FONTES_PDF}${arquivo}`);
        if (!resposta.ok) throw new Error(`fonte ${arquivo}: ${resposta.status}`);
        // Arquivo ausente: o servidor do app devolve o `index.html` com 200, e o `jspdf` quebraria ao ler HTML como TTF.
        const tipo = resposta.headers.get('content-type') ?? '';
        if (tipo.includes('text/html')) throw new Error(`fonte ${arquivo}: resposta é HTML`);
        return [arquivo, paraBase64(await resposta.arrayBuffer())] as const;
      }),
    );
    return { arquivos: Object.fromEntries(pares) };
  } catch {
    return null;
  }
}

/** Fora do WinAnsi da Helvetica: menos, travessão e aspas curvas viram ASCII. */
function paraWinAnsi(texto: string): string {
  return texto.replace(/−/g, '-').replace(/–/g, '-').replace(/[“”]/g, '"');
}

interface Tipografia {
  familia(f: Familia): string;
  estilo(f: Familia, p: Peso): string;
  texto(t: string): string;
}

function instalarFontes(doc: Documento, fontes: FontesPdf | null): Tipografia {
  if (fontes) {
    for (const { arquivo, familia, estilo } of FONTES_TTF) {
      const dados = fontes.arquivos[arquivo];
      if (dados === undefined) return instalarFontes(doc, null);
      doc.addFileToVFS(arquivo, dados);
      doc.addFont(arquivo, familia, estilo);
    }
    return {
      familia: (f) => (f === 'titulo' ? 'BarlowCondensed' : 'Barlow'),
      estilo: (_f, p) => (p === 'negrito' ? 'bold' : 'normal'),
      texto: (t) => t,
    };
  }
  return {
    familia: () => 'helvetica',
    estilo: (_f, p) => (p === 'negrito' ? 'bold' : 'normal'),
    texto: paraWinAnsi,
  };
}

function desenharIcone(doc: Documento, e: Extract<Elemento, { tipo: 'icone' }>): void {
  const r = e.tamanho / 2;
  doc.setDrawColor(e.cor);
  doc.setLineWidth(0.6);
  doc.setLineDashPattern([], 0);
  if (e.icone === 'sol') {
    doc.circle(e.x, e.y, r * 0.38, 'S');
    for (let i = 0; i < 8; i += 1) {
      const a = (Math.PI / 4) * i;
      doc.line(
        e.x + Math.cos(a) * r * 0.62,
        e.y + Math.sin(a) * r * 0.62,
        e.x + Math.cos(a) * r,
        e.y + Math.sin(a) * r,
      );
    }
    return;
  }
  // Nuvem: dois arcos e a base; gotas embaixo.
  doc.circle(e.x - r * 0.3, e.y - r * 0.2, r * 0.35, 'S');
  doc.circle(e.x + r * 0.25, e.y - r * 0.35, r * 0.45, 'S');
  doc.line(e.x - r * 0.65, e.y + r * 0.15, e.x + r * 0.7, e.y + r * 0.15);
  for (const dx of [-0.4, 0, 0.4]) {
    doc.line(e.x + r * dx, e.y + r * 0.4, e.x + r * dx, e.y + r * 0.8);
  }
}

function desenhar(doc: Documento, e: Elemento, tipo: Tipografia): void {
  switch (e.tipo) {
    case 'texto':
      doc.setFont(tipo.familia(e.familia), tipo.estilo(e.familia, e.peso));
      doc.setFontSize(e.tamanho);
      doc.setTextColor(e.cor);
      doc.text(tipo.texto(e.texto), e.x, e.y, { align: e.alinhar });
      return;
    case 'paragrafo': {
      doc.setFont(tipo.familia('texto'), 'normal');
      doc.setFontSize(e.tamanho);
      doc.setTextColor(e.cor);
      const linhas = doc.splitTextToSize(tipo.texto(e.texto), e.largura) as string[];
      doc.text(linhas, e.x, e.y, { lineHeightFactor: 1.25 });
      return;
    }
    case 'retangulo': {
      if (e.preenchimento) doc.setFillColor(e.preenchimento);
      if (e.borda) doc.setDrawColor(e.borda);
      doc.setLineWidth(e.espessura ?? 0);
      doc.setLineDashPattern(e.tracejado ? [1.5, 1] : [], 0);
      const estilo = e.preenchimento && e.borda ? 'FD' : e.preenchimento ? 'F' : 'S';
      if (e.raio > 0) doc.roundedRect(e.x, e.y, e.largura, e.altura, e.raio, e.raio, estilo);
      else doc.rect(e.x, e.y, e.largura, e.altura, estilo);
      doc.setLineDashPattern([], 0);
      return;
    }
    case 'linha':
      doc.setDrawColor(e.cor);
      doc.setLineWidth(e.espessura);
      doc.setLineDashPattern([], 0);
      doc.line(e.x1, e.y1, e.x2, e.y2);
      return;
    case 'icone':
      desenharIcone(doc, e);
      return;
  }
}

export interface OpcoesGerarPdf {
  /** Padrão: as TTF de `public/fontes/pdf/` (o teste passa `async () => null`, Helvetica). */
  fontes?: () => Promise<FontesPdf | null>;
  /** Padrão: o `import('jspdf')` sob demanda. */
  jspdf?: () => Promise<ModuloJspdf>;
}

/** Desenha a folha num documento novo (exportado para o teste da comparação visual, T77). */
export async function desenharFolha(folha: Folha, opcoes: OpcoesGerarPdf = {}): Promise<Documento> {
  const [{ jsPDF }, fontes] = await Promise.all([
    (opcoes.jspdf ?? carregarJspdf)(),
    (opcoes.fontes ?? carregarFontesPadrao)(),
  ]);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: false });
  const tipo = instalarFontes(doc, fontes);
  folha.paginas.forEach((elementos, i) => {
    if (i > 0) doc.addPage('a4', 'portrait');
    for (const e of elementos) desenhar(doc, e, tipo);
  });
  return doc;
}

/** O PDF do ranking da projeção (PAR-103, PAR-104). */
export async function gerarPdf(projecao: PdfPublico, opcoes: OpcoesGerarPdf = {}): Promise<Blob> {
  const doc = await desenharFolha(montarFolha(projecao), opcoes);
  return doc.output('blob');
}
