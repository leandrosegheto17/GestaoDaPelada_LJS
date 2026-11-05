import type { EventoPublicoCorpo } from '@pelada/contrato/publico';
import { useCallback, useEffect } from 'react';
import { idDoAparelho } from '../pwa/armazenamento/armazenamento-local.ts';
import type { ClienteApi } from './cliente.ts';
import { useCliente } from './ContextoCliente.tsx';

/**
 * Eventos anônimos de uso do ranking público (partidas-e-ranking T67; PAR-123 a PAR-126; `B:376-379`; P20 de
 * `BC:32`), por `POST /api/publico/:slug/eventos`:
 * - `ranking_aberto` com o identificador do aparelho, no máximo uma vez por slug a cada carregamento da página: o
 *   conjunto `abertos` vive no módulo, que só reinicia ao recarregar; trocar de mês não envia outro (PAR-124);
 * - `pdf_exportado` com o mês do PDF entregue (PAR-125, chamado pela T70);
 * - falha (rede, 4xx, 5xx) é ignorada: sem mensagem e sem nova tentativa (PAR-126).
 */

export function caminhoEventos(slug: string): string {
  return `/api/publico/${encodeURIComponent(slug)}/eventos`;
}

/** Envia o evento e engole a falha (PAR-126): a promessa nunca rejeita. */
export async function enviarEvento(api: ClienteApi, slug: string, corpo: EventoPublicoCorpo): Promise<void> {
  try {
    await api.post<unknown>(caminhoEventos(slug), corpo);
  } catch {
    // PAR-126: sem mensagem e sem nova tentativa.
  }
}

/** Slugs que já enviaram `ranking_aberto` neste carregamento da página. */
const abertos = new Set<string>();

/** Só para os testes: simula um carregamento novo da página. */
export function esquecerAberturas(): void {
  abertos.clear();
}

/** Envia `ranking_aberto` na primeira vez que o ranking do slug carrega com sucesso nesta página (PAR-124). */
export function useEventoRankingAberto(slug: string, carregou: boolean): void {
  const api = useCliente();
  useEffect(() => {
    if (!carregou || slug === '' || abertos.has(slug)) return;
    abertos.add(slug);
    void enviarEvento(api, slug, { tipo: 'ranking_aberto', dispositivoId: idDoAparelho() });
  }, [api, slug, carregou]);
}

/** A função que envia `pdf_exportado` com o mês do PDF entregue (PAR-125). */
export function useEnviarPdfExportado(slug: string): (mes: string) => Promise<void> {
  const api = useCliente();
  return useCallback((mes: string) => enviarEvento(api, slug, { tipo: 'pdf_exportado', mes }), [api, slug]);
}
