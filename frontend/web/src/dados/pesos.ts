import { pesosPainel, type PesosCorpo, type PesosPainel } from '@pelada/contrato/pesos';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCliente } from './ContextoCliente.tsx';
import { caminhoGrupo, chaveGrupo } from './grupos.ts';

/**
 * Pesos da pontuação no front (partidas-e-ranking T62; PAR-10, PAR-11), no molde de `dados/financeiro.ts`:
 * - `usePesos(grupoId)`: `GET …/pesos`, conferido pelo `pesosPainel`;
 * - `useSalvarPesos(grupoId)`: `POST …/pesos`, que devolve o painel novo e o grava na consulta; invalida o detalhe do
 *   grupo (o "Vigente desde" do início, PAR-135).
 */

export function chavePesos(grupoId: string) {
  return [...chaveGrupo(grupoId), 'pesos'] as const;
}

export function caminhoPesos(grupoId: string): string {
  return `${caminhoGrupo(grupoId)}/pesos`;
}

export function usePesos(grupoId: string) {
  const api = useCliente();
  return useQuery<PesosPainel>({
    queryKey: chavePesos(grupoId),
    queryFn: async () => pesosPainel.parse(await api.get<unknown>(caminhoPesos(grupoId))),
    retry: false,
    enabled: grupoId !== '',
  });
}

export function useSalvarPesos(grupoId: string) {
  const api = useCliente();
  const consultas = useQueryClient();
  return useMutation({
    mutationFn: async (corpo: PesosCorpo) =>
      pesosPainel.parse(await api.post<unknown>(caminhoPesos(grupoId), corpo)),
    onSuccess: async (painel) => {
      consultas.setQueryData(chavePesos(grupoId), painel);
      // O início busca de novo ao abrir; esperar a consulta do grupo seguraria a tela de pesos.
      void consultas.invalidateQueries({ queryKey: chaveGrupo(grupoId), exact: true });
    },
  });
}
