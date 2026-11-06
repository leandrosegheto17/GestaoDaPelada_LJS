import {
  jogadorDetalhe,
  listaJogadores,
  type EditarJogadorCorpo,
  type JogadorCorpo,
  type JogadorDetalhe,
  type ListaJogadores,
} from '@pelada/contrato/elenco';
import type {
  CorrigirPeriodoCorpo,
  CorrigirPeriodoResposta,
  DataCorpo,
  InicioCorpo,
} from '@pelada/contrato/periodos';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCliente } from './ContextoCliente.tsx';
import { caminhoGrupo, chaveGrupo } from './grupos.ts';

/**
 * Dados do elenco no front (grupos-e-elenco T54; GEL-31, GEL-46, GEL-51, GEL-54), no molde de `dados/grupos.ts`:
 * - `useJogadores(grupoId)`: a lista, conferida pelo `listaJogadores` (cada item pelo `jogadorItem`, GEL-46);
 * - `useJogador(grupoId, id)`: a ficha (`jogadorDetalhe`);
 * - mutações de cadastrar, editar, excluir, inativar, reativar, corrigir período e alterar início. Toda escrita invalida
 *   a lista, a ficha do jogador e o detalhe do grupo (a contagem de jogadores ativos, GEL-20).
 */

export function chaveJogadores(grupoId: string) {
  return [...chaveGrupo(grupoId), 'jogadores'] as const;
}

export function chaveJogador(grupoId: string, id: string) {
  return [...chaveJogadores(grupoId), id] as const;
}

function caminhoJogadores(grupoId: string): string {
  return `${caminhoGrupo(grupoId)}/jogadores`;
}

function caminhoJogador(grupoId: string, id: string): string {
  return `${caminhoJogadores(grupoId)}/${encodeURIComponent(id)}`;
}

/** Invalida a lista, a ficha (quando dada) e o detalhe do grupo. */
export async function invalidarElenco(
  consultas: QueryClient,
  grupoId: string,
  id?: string,
): Promise<void> {
  void consultas.invalidateQueries({ queryKey: chaveGrupo(grupoId), exact: true });
  await Promise.all([
    consultas.invalidateQueries({ queryKey: chaveJogadores(grupoId), exact: true }),
    id === undefined
      ? Promise.resolve()
      : consultas.invalidateQueries({ queryKey: chaveJogador(grupoId, id), exact: true }),
  ]);
}

export function useJogadores(grupoId: string) {
  const api = useCliente();
  return useQuery<ListaJogadores>({
    queryKey: chaveJogadores(grupoId),
    queryFn: async () => listaJogadores.parse(await api.get<unknown>(caminhoJogadores(grupoId))),
    retry: false,
    enabled: grupoId !== '',
  });
}

export function useJogador(grupoId: string, id: string) {
  const api = useCliente();
  return useQuery<JogadorDetalhe>({
    queryKey: chaveJogador(grupoId, id),
    queryFn: async () => jogadorDetalhe.parse(await api.get<unknown>(caminhoJogador(grupoId, id))),
    retry: false,
    enabled: grupoId !== '' && id !== '',
  });
}

export function useCadastrarJogador(grupoId: string) {
  const api = useCliente();
  const consultas = useQueryClient();
  return useMutation({
    mutationFn: (dados: JogadorCorpo) => api.post<JogadorDetalhe>(caminhoJogadores(grupoId), dados),
    onSuccess: (ficha) => {
      consultas.setQueryData(chaveJogador(grupoId, ficha.id), ficha);
      return invalidarElenco(consultas, grupoId);
    },
  });
}

export function useEditarJogador(grupoId: string, id: string) {
  const api = useCliente();
  const consultas = useQueryClient();
  return useMutation({
    mutationFn: (dados: EditarJogadorCorpo) =>
      api.patch<JogadorDetalhe>(caminhoJogador(grupoId, id), dados),
    onSuccess: (ficha) => {
      consultas.setQueryData(chaveJogador(grupoId, id), ficha);
      return invalidarElenco(consultas, grupoId, id);
    },
  });
}

export function useExcluirJogador(grupoId: string, id: string) {
  const api = useCliente();
  const consultas = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<undefined>(caminhoJogador(grupoId, id)),
    onSuccess: () => {
      consultas.removeQueries({ queryKey: chaveJogador(grupoId, id), exact: true });
      return invalidarElenco(consultas, grupoId);
    },
  });
}

function usePeriodo(grupoId: string, id: string, acao: 'inativar' | 'reativar') {
  const api = useCliente();
  const consultas = useQueryClient();
  return useMutation({
    mutationFn: (dados: DataCorpo) =>
      api.post<{ alterado: boolean }>(`${caminhoJogador(grupoId, id)}/${acao}`, dados),
    onSuccess: () => invalidarElenco(consultas, grupoId, id),
  });
}

export function useInativarJogador(grupoId: string, id: string) {
  return usePeriodo(grupoId, id, 'inativar');
}

export function useReativarJogador(grupoId: string, id: string) {
  return usePeriodo(grupoId, id, 'reativar');
}

export function useCorrigirPeriodo(grupoId: string, id: string) {
  const api = useCliente();
  const consultas = useQueryClient();
  return useMutation({
    mutationFn: ({ periodoId, dados }: { periodoId: string; dados: CorrigirPeriodoCorpo }) =>
      api.patch<CorrigirPeriodoResposta>(
        `${caminhoJogador(grupoId, id)}/periodos/${encodeURIComponent(periodoId)}`,
        dados,
      ),
    onSuccess: () => invalidarElenco(consultas, grupoId, id),
  });
}

export function useAlterarInicio(grupoId: string, id: string) {
  const api = useCliente();
  const consultas = useQueryClient();
  return useMutation({
    mutationFn: (dados: InicioCorpo) =>
      api.put<CorrigirPeriodoResposta>(`${caminhoJogador(grupoId, id)}/inicio`, dados),
    onSuccess: () => invalidarElenco(consultas, grupoId, id),
  });
}
