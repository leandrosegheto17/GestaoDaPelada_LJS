import { habilidadeItem, listaHabilidades } from '@pelada/contrato';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { escrever, ler, semCorpo } from './cliente';
import { chavesElenco } from './elenco';
import { chaveGrupo } from './grupos';

export const chaveHabilidades = (grupoId: string) => [...chaveGrupo(grupoId), 'habilidades'] as const;

const base = (grupoId: string) => `/grupos/${encodeURIComponent(grupoId)}/habilidades`;
const daHabilidade = (grupoId: string, id: string) => `${base(grupoId)}/${encodeURIComponent(id)}`;

/** Habilidades do grupo, na ordem de cadastro (GEL-88). */
export function useHabilidades(grupoId: string) {
  return useQuery({
    queryKey: chaveHabilidades(grupoId),
    queryFn: ({ signal }) => ler(base(grupoId), listaHabilidades, { signal }),
  });
}

/**
 * Depois de mudar o catálogo: a lista de habilidades, a contagem do resumo do grupo e o elenco (o nível muda quando
 * uma habilidade sai com as notas, GEL-93; a ficha mostra o nome novo).
 */
function useDepois(grupoId: string) {
  const cliente = useQueryClient();
  return async () => {
    await Promise.all([
      cliente.invalidateQueries({ queryKey: chaveHabilidades(grupoId) }),
      cliente.invalidateQueries({ queryKey: chavesElenco.lista(grupoId) }),
      cliente.invalidateQueries({ queryKey: chaveGrupo(grupoId), exact: true }),
    ]);
  };
}

export function useCriarHabilidade(grupoId: string) {
  const depois = useDepois(grupoId);
  return useMutation({
    mutationFn: (nome: string) => escrever('POST', base(grupoId), { nome }, habilidadeItem),
    onSuccess: depois,
  });
}

export function useRenomearHabilidade(grupoId: string) {
  const depois = useDepois(grupoId);
  return useMutation({
    mutationFn: ({ id, nome }: { id: string; nome: string }) =>
      escrever('PATCH', daHabilidade(grupoId, id), { nome }, habilidadeItem),
    onSuccess: depois,
  });
}

export function useExcluirHabilidade(grupoId: string) {
  const depois = useDepois(grupoId);
  return useMutation({
    mutationFn: (id: string) => escrever('DELETE', daHabilidade(grupoId, id), undefined, semCorpo),
    onSuccess: depois,
  });
}
