import { FORMATO_MES } from '@pelada/contrato/partidas';
import {
  pdfPublico,
  rankingPublico,
  type PdfPublico,
  type RankingPublico,
} from '@pelada/contrato/publico';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { guardarRanking } from '../pwa/armazenamento/ranking-guardado.ts';
import { useCliente } from './ContextoCliente.tsx';

/**
 * Dados do ranking público no front (partidas-e-ranking T54; PAR-65, PAR-89), no molde de `dados/financeiro.ts`:
 * - `useRankingPublico(slug, mes?)`: `GET /api/publico/:slug/ranking[?mes=AAAA-MM]`, conferido pelo `rankingPublico`;
 *   resposta fora do contrato vira erro da consulta, não dado;
 * - `useBuscarPdfPublico(slug)`: devolve a função que lê `GET /api/publico/:slug/pdf?mes=` sob demanda (o PDF só é
 *   gerado no clique, T70), conferida pelo `pdfPublico`;
 * - `useMesDaUrl()`: o mês do `?mes=` e a troca por substituição na história (voltar não passa por cada mês visto).
 *
 * O `?mes=` com formato inválido segue para a API como veio: ela responde 422 "Mês inválido." (PAR-65) e a tela mostra.
 * Sem sessão: as rotas públicas não pedem cookie, e o cliente só manda o da própria origem (same-origin).
 */

export function chavePublico(slug: string) {
  return ['publico', slug] as const;
}

export function chaveRankingPublico(slug: string, mes: string | undefined) {
  return [...chavePublico(slug), 'ranking', mes ?? 'atual'] as const;
}

export function chavePdfPublico(slug: string, mes: string | undefined) {
  return [...chavePublico(slug), 'pdf', mes ?? 'atual'] as const;
}

function comMes(base: string, mes: string | undefined): string {
  return mes === undefined ? base : `${base}?mes=${encodeURIComponent(mes)}`;
}

export function caminhoRankingPublico(slug: string, mes?: string): string {
  return comMes(`/api/publico/${encodeURIComponent(slug)}/ranking`, mes);
}

export function caminhoPdfPublico(slug: string, mes?: string): string {
  return comMes(`/api/publico/${encodeURIComponent(slug)}/pdf`, mes);
}

export function useRankingPublico(slug: string, mes?: string) {
  const api = useCliente();
  return useQuery<RankingPublico>({
    queryKey: chaveRankingPublico(slug, mes),
    queryFn: async () => {
      const dados = rankingPublico.parse(await api.get<unknown>(caminhoRankingPublico(slug, mes)));
      // PAR-148 (T72): guarda no aparelho para a tela sem conexão.
      guardarRanking(slug, mes, dados);
      return dados;
    },
    retry: false,
    enabled: slug !== '',
  });
}

/** A função que busca a projeção do PDF do mês; cada clique lê de novo (sem cache velho). */
export function useBuscarPdfPublico(slug: string): (mes?: string) => Promise<PdfPublico> {
  const api = useCliente();
  const consultas = useQueryClient();
  return useCallback(
    (mes?: string) =>
      consultas.fetchQuery({
        queryKey: chavePdfPublico(slug, mes),
        queryFn: async () => pdfPublico.parse(await api.get<unknown>(caminhoPdfPublico(slug, mes))),
        staleTime: 0,
        retry: false,
      }),
    [api, consultas, slug],
  );
}

export const PARAMETRO_MES = 'mes';

/** Mês do `?mes=` (ausente ou vazio: `undefined`, o mês de hoje) e a troca, que substitui a entrada da história. */
export function useMesDaUrl(): [string | undefined, (mes: string | null) => void] {
  const [busca, setBusca] = useSearchParams();
  const bruto = busca.get(PARAMETRO_MES);
  const mes = bruto === null || bruto === '' ? undefined : bruto;
  const trocar = useCallback(
    (novo: string | null) => {
      setBusca(
        (atual) => {
          const proximo = new URLSearchParams(atual);
          if (novo === null) proximo.delete(PARAMETRO_MES);
          else proximo.set(PARAMETRO_MES, novo);
          return proximo;
        },
        { replace: true },
      );
    },
    [setBusca],
  );
  return [mes, trocar];
}

/** O mês tem o formato `AAAA-MM` do contrato (para a tela não montar navegação sobre um valor inválido). */
export function ehMesValido(mes: string | undefined): mes is string {
  return mes !== undefined && FORMATO_MES.test(mes);
}
