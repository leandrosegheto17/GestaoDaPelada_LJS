import {
  partidaNova,
  partidaResposta,
  partidasDoMes,
  type PartidaCorpo,
  type PartidaNova,
  type PartidaResposta,
  type PartidasDoMes,
} from '@pelada/contrato/partidas';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCliente } from './ContextoCliente.tsx';
import { caminhoGrupo, chaveGrupo } from './grupos.ts';
import { chavePublico } from './publico.ts';

/**
 * Dados de partidas no front (partidas-e-ranking T59; PAR-42, PAR-43), no molde de `dados/financeiro.ts`:
 * - `usePartidasDoMes(grupoId, mes?)`: `GET …/partidas[?mes=AAAA-MM]`, conferido pelo `partidasDoMes`;
 * - `usePartidaNova(grupoId, data?)`: `GET …/partidas/nova[?data=AAAA-MM-DD]` (os ativos na data, t11 nova);
 * - `usePartida(grupoId, data)`: `GET …/partidas/:data` (t11 edição);
 * - `useLancarPartida`, `useEditarPartida` e `useExcluirPartida`: `POST …/partidas`, `PUT` e `DELETE …/partidas/:data`.
 *
 * Toda escrita invalida as partidas do grupo (o mês e a tela de lançar), o detalhe do grupo (o "Dia de jogo" e o
 * "N em <mês>" do início, PAR-132) e todo ranking público em cache (a chave pública é do slug, que a tela de admin
 * não tem à mão; invalidar todos é barato: só a página aberta consulta de novo).
 */

export function chavePartidas(grupoId: string) {
  return [...chaveGrupo(grupoId), 'partidas'] as const;
}

export function chaveMesPartidas(grupoId: string, mes: string | undefined) {
  return [...chavePartidas(grupoId), 'mes', mes ?? 'atual'] as const;
}

export function chavePartidaNova(grupoId: string, data: string | undefined) {
  return [...chavePartidas(grupoId), 'nova', data ?? 'sugerida'] as const;
}

export function chavePartida(grupoId: string, data: string) {
  return [...chavePartidas(grupoId), 'data', data] as const;
}

function caminhoPartidas(grupoId: string): string {
  return `${caminhoGrupo(grupoId)}/partidas`;
}

/** `…/partidas`, com `?mes=` só quando há mês escolhido. */
export function caminhoMesPartidas(grupoId: string, mes?: string): string {
  const base = caminhoPartidas(grupoId);
  return mes === undefined ? base : `${base}?mes=${encodeURIComponent(mes)}`;
}

/** `…/partidas/nova`, com `?data=` só quando há data escolhida. */
export function caminhoPartidaNova(grupoId: string, data?: string): string {
  const base = `${caminhoPartidas(grupoId)}/nova`;
  return data === undefined ? base : `${base}?data=${encodeURIComponent(data)}`;
}

export function caminhoPartida(grupoId: string, data: string): string {
  return `${caminhoPartidas(grupoId)}/${encodeURIComponent(data)}`;
}

/** Invalida as partidas do grupo, o detalhe do grupo (o início) e os rankings públicos em cache. */
export async function invalidarPartidas(consultas: QueryClient, grupoId: string): Promise<void> {
  await Promise.all([
    consultas.invalidateQueries({ queryKey: chavePartidas(grupoId) }),
    consultas.invalidateQueries({ queryKey: chaveGrupo(grupoId), exact: true }),
    consultas.invalidateQueries({ queryKey: [chavePublico('')[0]] }),
  ]);
}

export function usePartidasDoMes(grupoId: string, mes?: string) {
  const api = useCliente();
  return useQuery<PartidasDoMes>({
    queryKey: chaveMesPartidas(grupoId, mes),
    queryFn: async () =>
      partidasDoMes.parse(await api.get<unknown>(caminhoMesPartidas(grupoId, mes))),
    retry: false,
    enabled: grupoId !== '',
  });
}

export function usePartidaNova(grupoId: string, data?: string) {
  const api = useCliente();
  return useQuery<PartidaNova>({
    queryKey: chavePartidaNova(grupoId, data),
    queryFn: async () =>
      partidaNova.parse(await api.get<unknown>(caminhoPartidaNova(grupoId, data))),
    retry: false,
    enabled: grupoId !== '',
  });
}

export function usePartida(grupoId: string, data: string) {
  const api = useCliente();
  return useQuery<PartidaResposta>({
    queryKey: chavePartida(grupoId, data),
    queryFn: async () =>
      partidaResposta.parse(await api.get<unknown>(caminhoPartida(grupoId, data))),
    retry: false,
    enabled: grupoId !== '' && data !== '',
  });
}

export function useLancarPartida(grupoId: string) {
  const api = useCliente();
  const consultas = useQueryClient();
  return useMutation({
    mutationFn: async (corpo: PartidaCorpo) =>
      partidaResposta.parse(await api.post<unknown>(caminhoPartidas(grupoId), corpo)),
    onSuccess: async (lancada) => {
      await invalidarPartidas(consultas, grupoId);
      consultas.setQueryData(chavePartida(grupoId, lancada.data), lancada);
    },
  });
}

export function useEditarPartida(grupoId: string, data: string) {
  const api = useCliente();
  const consultas = useQueryClient();
  return useMutation({
    mutationFn: async (corpo: PartidaCorpo) =>
      partidaResposta.parse(await api.put<unknown>(caminhoPartida(grupoId, data), corpo)),
    onSuccess: async (editada) => {
      await invalidarPartidas(consultas, grupoId);
      consultas.setQueryData(chavePartida(grupoId, data), editada);
    },
  });
}

export function useExcluirPartida(grupoId: string, data: string) {
  const api = useCliente();
  const consultas = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<undefined>(caminhoPartida(grupoId, data)),
    onSuccess: async () => {
      consultas.removeQueries({ queryKey: chavePartida(grupoId, data), exact: true });
      await invalidarPartidas(consultas, grupoId);
    },
  });
}
