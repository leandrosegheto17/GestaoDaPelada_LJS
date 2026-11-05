/**
 * Entrega do PDF do ranking (partidas-e-ranking T69; PAR-105, PAR-106; ADR-022 do legado), de
 * `.specs/mockup/telas/t01-ranking--{pdf-compartilhar,pdf-baixado}.html`:
 * - aparelho que compartilha arquivo (`navigator.canShare({ files })`): a tela mostra o diálogo "PDF pronto." com
 *   "Baixar" e "Compartilhar" (`DialogoPdfPronto`); o compartilhamento recusado (`AbortError`, ou `NotAllowedError`
 *   quando o navegador perdeu o gesto) volta ao diálogo (PAR-105);
 * - sem esse suporte: baixa `ranking-<slug>-<AAAA-MM>.pdf` e a tela mostra "PDF baixado." (PAR-106).
 */

export const TIPO_PDF = 'application/pdf';
export const TITULO_PDF_PRONTO = 'PDF pronto.';
export const TEXTO_PDF_BAIXADO = 'PDF baixado.';

/** `ranking-pelada-de-quinta-2026-10.pdf` (PAR-106). */
export function nomeDoArquivo(slug: string, mes: string): string {
  return `ranking-${slug}-${mes}.pdf`;
}

/** O que a entrega usa do navegador (o teste passa um dublê). */
export interface NavegadorCompartilha {
  canShare?: (dados: ShareData) => boolean;
  share?: (dados: ShareData) => Promise<void>;
}

export interface AmbienteEntrega {
  navegador: NavegadorCompartilha | undefined;
  baixar: (blob: Blob, nome: string) => void;
}

export type Entrega = { tipo: 'dialogo'; arquivo: File } | { tipo: 'baixado'; nome: string };

/** Baixa o arquivo por um link temporário com `download`. */
export function baixarArquivo(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // O navegador já começou o download; liberar no próximo ciclo evita cortar o arquivo em alguns navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function ambientePadrao(): AmbienteEntrega {
  return {
    navegador: typeof navigator === 'undefined' ? undefined : (navigator as NavegadorCompartilha),
    baixar: baixarArquivo,
  };
}

function podeCompartilhar(arquivo: File, navegador: NavegadorCompartilha | undefined): boolean {
  if (!navegador || typeof navegador.canShare !== 'function' || typeof navegador.share !== 'function') return false;
  try {
    return navegador.canShare({ files: [arquivo] });
  } catch {
    return false;
  }
}

/** PAR-105 e PAR-106: diálogo quando o aparelho compartilha arquivo; senão, baixa na hora. */
export function entregar(blob: Blob, nome: string, ambiente: AmbienteEntrega = ambientePadrao()): Entrega {
  const arquivo = new File([blob], nome, { type: TIPO_PDF });
  if (podeCompartilhar(arquivo, ambiente.navegador)) return { tipo: 'dialogo', arquivo };
  ambiente.baixar(blob, nome);
  return { tipo: 'baixado', nome };
}

/** Recusa do compartilhamento: a pessoa fechou a folha ou o navegador perdeu o gesto. */
function ehRecusa(erro: unknown): boolean {
  return erro instanceof Error && (erro.name === 'AbortError' || erro.name === 'NotAllowedError');
}

/**
 * "Compartilhar" do diálogo: `compartilhado`, ou `dialogo` quando a pessoa recusou (PAR-105, volta ao diálogo). Outra
 * falha sobe para a tela mostrar o erro do PDF.
 */
export async function compartilhar(
  arquivo: File,
  dados: { title: string; text: string },
  navegador: NavegadorCompartilha | undefined = ambientePadrao().navegador,
): Promise<'compartilhado' | 'dialogo'> {
  if (!navegador?.share) return 'dialogo';
  try {
    await navegador.share({ ...dados, files: [arquivo] });
    return 'compartilhado';
  } catch (erro) {
    if (ehRecusa(erro)) return 'dialogo';
    throw erro;
  }
}
