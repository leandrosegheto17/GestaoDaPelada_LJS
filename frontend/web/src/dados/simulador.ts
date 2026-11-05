import { escalacaoResposta, type EscalacaoResposta } from '@pelada/contrato/escalacao';
import {
  avaliarResposta,
  contextoResposta,
  previaResposta,
  sugerirResposta,
  type AvaliarCorpo,
  type AvaliarResposta,
  type ContextoResposta,
  type PreviaCorpo,
  type PreviaResposta,
  type SugerirCorpo,
  type SugerirResposta,
} from '@pelada/contrato/simulador';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCliente } from './ContextoCliente.tsx';
import { caminhoGrupo, chaveGrupo } from './grupos.ts';
import { chavePartidas } from './partidas.ts';
import { usePrevia } from './previas.ts';

/**
 * Dados do simulador no front (simulador T45; SIM-01, SIM-09, SIM-15, SIM-47, SIM-62, SIM-64, SIM-67), no molde de
 * `dados/partidas.ts` e de `dados/previas.ts`:
 * - `useContextoSimulador(grupoId, data?)`: `GET …/simulador/contexto[?data=]` (ativos na data, a sugerida e hoje);
 * - `usePreviaSimulador(grupoId, corpo)`: `POST …/simulador/previa` 300 ms depois da última mudança das entradas
 *   (SIM-15), pelo `usePrevia`; a tela só mostra o que a API descreve, sem cálculo de times (SIM-15);
 * - `useSugerir(grupoId)`: `POST …/simulador/sugerir` (SIM-47);
 * - `useAvaliar(grupoId, corpo)`: `POST …/simulador/avaliar` 300 ms depois do último ajuste (SIM-64); `null` = nada a
 *   recalcular;
 * - `useConfirmarEscalacao(grupoId)`: `POST …/escalacoes` (SIM-67); o sucesso invalida o detalhe do grupo (o item do
 *   simulador no início, SIM-08) e as partidas do grupo (a partida nova pré-marcada, SIM-75).
 * Toda resposta é conferida pelo contrato.
 */

export const ATRASO_AVALIAR_MS = 300;

export function chaveSimulador(grupoId: string) {
  return [...chaveGrupo(grupoId), 'simulador'] as const;
}

export function chaveContextoSimulador(grupoId: string, data: string | undefined) {
  return [...chaveSimulador(grupoId), 'contexto', data ?? 'sugerida'] as const;
}

function caminhoSimulador(grupoId: string): string {
  return `${caminhoGrupo(grupoId)}/simulador`;
}

/** `…/simulador/contexto`, com `?data=` só quando há data escolhida. */
export function caminhoContexto(grupoId: string, data?: string): string {
  const base = `${caminhoSimulador(grupoId)}/contexto`;
  return data === undefined ? base : `${base}?data=${encodeURIComponent(data)}`;
}

export function useContextoSimulador(grupoId: string, data?: string) {
  const api = useCliente();
  return useQuery<ContextoResposta>({
    queryKey: chaveContextoSimulador(grupoId, data),
    queryFn: async () => contextoResposta.parse(await api.get<unknown>(caminhoContexto(grupoId, data))),
    retry: false,
    enabled: grupoId !== '',
  });
}

/** A prévia das entradas com debounce; `corpo` nulo (sem contexto ainda) não pede nada. */
export function usePreviaSimulador(grupoId: string, corpo: PreviaCorpo | null) {
  const api = useCliente();
  const pedir = corpo
    ? async (): Promise<PreviaResposta> => previaResposta.parse(await api.post<unknown>(`${caminhoSimulador(grupoId)}/previa`, corpo))
    : null;
  return usePrevia<PreviaResposta>(pedir, corpo ? JSON.stringify(corpo) : '');
}

export function useSugerir(grupoId: string) {
  const api = useCliente();
  return useMutation<SugerirResposta, Error, SugerirCorpo>({
    mutationFn: async (corpo) => sugerirResposta.parse(await api.post<unknown>(`${caminhoSimulador(grupoId)}/sugerir`, corpo)),
  });
}

/** O recálculo da composição ajustada, 300 ms depois do último ajuste (SIM-64); `corpo` nulo não pede nada. */
export function useAvaliar(grupoId: string, corpo: AvaliarCorpo | null) {
  const api = useCliente();
  const pedir = corpo
    ? async (): Promise<AvaliarResposta> => avaliarResposta.parse(await api.post<unknown>(`${caminhoSimulador(grupoId)}/avaliar`, corpo))
    : null;
  return usePrevia<AvaliarResposta>(pedir, corpo ? JSON.stringify(corpo) : '', ATRASO_AVALIAR_MS);
}

/** O corpo de `POST …/escalacoes`: o do contrato (`escalacaoCorpo`), montado pela tela de resultado. */
export type CorpoEscalacao =
  | { formato: 'dois_times'; data: string; n: number; k: number | 'ilimitado'; composicao: AvaliarCorpoDois['composicao'] }
  | { formato: 'varios_times'; data: string; n: number; composicao: AvaliarCorpoVarios['composicao'] };

type AvaliarCorpoDois = Extract<AvaliarCorpo, { formato: 'dois_times' }>;
type AvaliarCorpoVarios = Extract<AvaliarCorpo, { formato: 'varios_times' }>;

export function useConfirmarEscalacao(grupoId: string) {
  const api = useCliente();
  const consultas = useQueryClient();
  return useMutation<EscalacaoResposta, Error, CorpoEscalacao>({
    mutationFn: async (corpo) => escalacaoResposta.parse(await api.post<unknown>(`${caminhoGrupo(grupoId)}/escalacoes`, corpo)),
    onSuccess: async () => {
      await Promise.all([
        consultas.invalidateQueries({ queryKey: chaveGrupo(grupoId), exact: true }),
        consultas.invalidateQueries({ queryKey: chavePartidas(grupoId) }),
      ]);
    },
  });
}
