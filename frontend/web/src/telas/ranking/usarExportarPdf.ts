import { useCallback, useEffect, useRef, useState } from 'react';
import { useEnviarPdfExportado } from '../../dados/eventos.ts';
import { useBuscarPdfPublico } from '../../dados/publico.ts';
import { baixarArquivo, entregar, nomeDoArquivo } from '../../pdf/entregar.ts';
import { mesPorExtenso } from '../../pdf/folha.ts';
import { gerarPdf } from '../../pdf/gerar-pdf.ts';

/**
 * "Exportar PDF" da t01 (partidas-e-ranking T70; PAR-102, PAR-107, PAR-125; P21 de `BC:33`), de
 * `.specs/mockup/telas/t01-ranking--{pdf-preparando,pdf-erro,pdf-baixado,pdf-compartilhar}.html`:
 * 1. o toque mostra "Preparando PDF…" e busca a projeção do mês exibido (`GET /api/publico/:slug/pdf`);
 * 2. `gerarPdf` carrega o `jspdf` nesse momento (PAR-102) e gera o arquivo;
 * 3. `entregar`: o diálogo "PDF pronto." ou o download com a faixa "PDF baixado." (some em 4 s);
 * 4. PDF entregue (baixado ou compartilhado) envia `pdf_exportado` com o mês da projeção (PAR-125);
 * 5. falha da projeção ou da geração: a faixa "Não foi possível gerar o PDF." com "Tentar de novo" (PAR-107).
 */

export const TEXTO_PREPARANDO_PDF = 'Preparando PDF…';
export const TEXTO_ERRO_PDF = 'Não foi possível gerar o PDF.';
export const MS_FAIXA_BAIXADO = 4000;

export type EstadoExportar =
  | { tipo: 'ocioso' }
  | { tipo: 'preparando' }
  | { tipo: 'erro' }
  | { tipo: 'baixado' }
  | { tipo: 'dialogo'; arquivo: File; mes: string; mesPorExtenso: string; grupo: string };

export interface ExportarPdf {
  estado: EstadoExportar;
  exportar: () => void;
  /** Ações do diálogo "PDF pronto.". */
  baixarDoDialogo: () => void;
  compartilhado: () => void;
  falhou: () => void;
  fecharDialogo: () => void;
}

export function usarExportarPdf(slug: string, mes: string | undefined): ExportarPdf {
  const buscarPdf = useBuscarPdfPublico(slug);
  const enviarPdfExportado = useEnviarPdfExportado(slug);
  const [estado, setEstado] = useState<EstadoExportar>({ tipo: 'ocioso' });
  const emAndamento = useRef(false);

  // A faixa "PDF baixado." some sozinha (mockup t01 pdf-baixado).
  useEffect(() => {
    if (estado.tipo !== 'baixado') return;
    const id = setTimeout(() => setEstado({ tipo: 'ocioso' }), MS_FAIXA_BAIXADO);
    return () => clearTimeout(id);
  }, [estado]);

  const exportar = useCallback(() => {
    if (emAndamento.current) return;
    emAndamento.current = true;
    setEstado({ tipo: 'preparando' });
    void (async () => {
      try {
        const projecao = await buscarPdf(mes);
        const blob = await gerarPdf(projecao);
        const nome = nomeDoArquivo(projecao.grupo.slug, projecao.mes);
        const entrega = entregar(blob, nome);
        if (entrega.tipo === 'baixado') {
          setEstado({ tipo: 'baixado' });
          void enviarPdfExportado(projecao.mes);
        } else {
          setEstado({ tipo: 'dialogo', arquivo: entrega.arquivo, mes: projecao.mes, mesPorExtenso: mesPorExtenso(projecao.mes), grupo: projecao.grupo.nome });
        }
      } catch {
        setEstado({ tipo: 'erro' });
      } finally {
        emAndamento.current = false;
      }
    })();
  }, [buscarPdf, enviarPdfExportado, mes]);

  const baixarDoDialogo = useCallback(() => {
    if (estado.tipo !== 'dialogo') return;
    baixarArquivo(estado.arquivo, estado.arquivo.name);
    void enviarPdfExportado(estado.mes);
    setEstado({ tipo: 'baixado' });
  }, [estado, enviarPdfExportado]);

  const compartilhado = useCallback(() => {
    if (estado.tipo !== 'dialogo') return;
    void enviarPdfExportado(estado.mes);
    setEstado({ tipo: 'ocioso' });
  }, [estado, enviarPdfExportado]);

  const falhou = useCallback(() => setEstado({ tipo: 'erro' }), []);
  const fecharDialogo = useCallback(() => setEstado({ tipo: 'ocioso' }), []);

  return { estado, exportar, baixarDoDialogo, compartilhado, falhou, fecharDialogo };
}
