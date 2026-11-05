import { grupoDetalheComSaldo, type GrupoDetalheComSaldo } from '@pelada/contrato/financeiro';
import {
  gruposResposta,
  type ArquivarCorpo,
  type CriarGrupoResposta,
  type DadosGrupo,
  type GrupoDetalhe,
  type GruposResposta,
} from '@pelada/contrato/grupo';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { CHAVE_SESSAO } from '../app/guarda.tsx';
import { useCliente } from './ContextoCliente.tsx';

/**
 * Dados de grupos no front (grupos-e-elenco T53; GEL-01, GEL-18, GEL-22, GEL-27), sobre o cliente HTTP da CA (T36):
 * - `useGrupos()`: `GET /api/grupos`, os ativos e os arquivados que a conta criou (GEL-27), conferidos pelo contrato;
 * - `useGrupo(id)`: `GET /api/grupos/:grupoId` (`grupoDetalheComSaldo`: o `grupoDetalhe` com o saldo do caixa, só para
 *   quem acessa o financeiro, financeiro T43, FIN-34, AD-079);
 * - mutações `criarGrupo`, `editarGrupo`, `arquivarGrupo` e `reativarGrupo`. Toda escrita invalida a lista, o grupo e
 *   a sessão: a sessão lista os grupos ativos da conta (`GET /api/sessao`, T24), e arquivar ou reativar muda essa lista
 *   (GEL-22, GEL-28).
 */

export const CHAVE_GRUPOS = ['grupos'] as const;

export function chaveGrupo(grupoId: string) {
  return ['grupos', grupoId] as const;
}

export function caminhoGrupo(grupoId: string): string {
  return `/api/grupos/${encodeURIComponent(grupoId)}`;
}

/** Invalida a lista, o grupo (quando dado) e a sessão. */
export async function invalidarGrupos(consultas: QueryClient, grupoId?: string): Promise<void> {
  await Promise.all([
    consultas.invalidateQueries({ queryKey: CHAVE_GRUPOS, exact: true }),
    grupoId === undefined ? Promise.resolve() : consultas.invalidateQueries({ queryKey: chaveGrupo(grupoId) }),
    consultas.invalidateQueries({ queryKey: CHAVE_SESSAO }),
  ]);
}

export function useGrupos() {
  const api = useCliente();
  return useQuery<GruposResposta>({
    queryKey: CHAVE_GRUPOS,
    queryFn: async () => gruposResposta.parse(await api.get<unknown>('/api/grupos')),
    retry: false,
  });
}

export function useGrupo(grupoId: string) {
  const api = useCliente();
  return useQuery<GrupoDetalheComSaldo>({
    queryKey: chaveGrupo(grupoId),
    queryFn: async () => grupoDetalheComSaldo.parse(await api.get<unknown>(caminhoGrupo(grupoId))),
    retry: false,
    enabled: grupoId !== '',
  });
}

export function useCriarGrupo() {
  const api = useCliente();
  const consultas = useQueryClient();
  return useMutation({
    mutationFn: (dados: DadosGrupo) => api.post<CriarGrupoResposta>('/api/grupos', dados),
    onSuccess: () => invalidarGrupos(consultas),
  });
}

export function useEditarGrupo(grupoId: string) {
  const api = useCliente();
  const consultas = useQueryClient();
  return useMutation({
    mutationFn: (dados: DadosGrupo) => api.patch<GrupoDetalhe>(caminhoGrupo(grupoId), dados),
    onSuccess: (detalhe) => {
      consultas.setQueryData(chaveGrupo(grupoId), detalhe);
      return invalidarGrupos(consultas, grupoId);
    },
  });
}

export function useArquivarGrupo(grupoId: string) {
  const api = useCliente();
  const consultas = useQueryClient();
  return useMutation({
    mutationFn: (dados: ArquivarCorpo) => api.post<unknown>(`${caminhoGrupo(grupoId)}/arquivar`, dados),
    onSuccess: () => invalidarGrupos(consultas, grupoId),
  });
}

export function useReativarGrupo(grupoId: string) {
  const api = useCliente();
  const consultas = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<unknown>(`${caminhoGrupo(grupoId)}/reativar`, {}),
    onSuccess: () => invalidarGrupos(consultas, grupoId),
  });
}
