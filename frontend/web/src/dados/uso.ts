import { usoResposta, type UsoResposta } from '@pelada/contrato/previas';
import { useQuery } from '@tanstack/react-query';
import { useCliente } from './ContextoCliente.tsx';
import { caminhoGrupo, chaveGrupo } from './grupos.ts';

/**
 * Uso do app no front (partidas-e-ranking T63; PAR-144), no molde de `dados/pesos.ts`: `useUso(grupoId)` lê
 * `GET …/uso`, conferido pelo `usoResposta` (as semanas da mais recente para a mais antiga).
 */

export function chaveUso(grupoId: string) {
  return [...chaveGrupo(grupoId), 'uso'] as const;
}

export function useUso(grupoId: string) {
  const api = useCliente();
  return useQuery<UsoResposta>({
    queryKey: chaveUso(grupoId),
    queryFn: async () => usoResposta.parse(await api.get<unknown>(`${caminhoGrupo(grupoId)}/uso`)),
    retry: false,
    enabled: grupoId !== '',
  });
}
