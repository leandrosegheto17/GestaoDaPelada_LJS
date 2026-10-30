import { criarGrupoResposta, grupoDetalhe, gruposResposta } from '@pelada/contrato';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { escrever, ler } from './cliente';
import { chaveSessao } from './sessao';

/** Lista de grupos da conta (ativos e arquivados que ela criou, GEL-27). */
export const chaveGrupos = ['grupos'] as const;
/** Detalhe do grupo. As chaves do que é do grupo (admins, jogadores, habilidades) começam por ela. */
export const chaveGrupo = (grupoId: string) => ['grupo', grupoId] as const;

const caminhoGrupo = (grupoId: string) => `/grupos/${encodeURIComponent(grupoId)}`;

/** Corpo de criar e de editar (`dadosGrupo` do contrato): o slug e o link nunca vão (GEL-07, GEL-16). */
export interface CorpoGrupo {
  nome: string;
  diaSemana: string;
  frequencia: string;
  horario: string;
}

export function useGrupos() {
  return useQuery({
    queryKey: chaveGrupos,
    queryFn: ({ signal }) => ler('/grupos', gruposResposta, { signal }),
  });
}

export function useGrupo(grupoId: string) {
  return useQuery({
    queryKey: chaveGrupo(grupoId),
    queryFn: ({ signal }) => ler(caminhoGrupo(grupoId), grupoDetalhe, { signal }),
  });
}

/**
 * Depois de qualquer escrita no grupo: a lista, o detalhe do grupo (e o que mora sob ele) e a sessão, que traz os
 * grupos ativos da conta para a guarda e a barra.
 */
function useInvalidarGrupos() {
  const cliente = useQueryClient();
  return async (grupoId?: string) => {
    await Promise.all([
      cliente.invalidateQueries({ queryKey: chaveGrupos }),
      cliente.invalidateQueries({ queryKey: chaveSessao }),
      ...(grupoId ? [cliente.invalidateQueries({ queryKey: chaveGrupo(grupoId) })] : []),
    ]);
  };
}

/** `POST /api/grupos` (GEL-01): devolve id, slug e link público. */
export function useCriarGrupo() {
  const invalidar = useInvalidarGrupos();
  return useMutation({
    mutationFn: (corpo: CorpoGrupo) => escrever('POST', '/grupos', corpo, criarGrupoResposta),
    onSuccess: (criado) => invalidar(criado.id),
  });
}

/** `PATCH /api/grupos/:grupoId` (GEL-18): nome, dia, frequência e horário. */
export function useEditarGrupo(grupoId: string) {
  const invalidar = useInvalidarGrupos();
  return useMutation({
    mutationFn: (corpo: CorpoGrupo) => escrever('PATCH', caminhoGrupo(grupoId), corpo, grupoDetalhe),
    onSuccess: () => invalidar(grupoId),
  });
}

/** `POST …/arquivar` com o nome digitado (GEL-22, GEL-23). */
export function useArquivarGrupo(grupoId: string) {
  const invalidar = useInvalidarGrupos();
  return useMutation({
    mutationFn: (nomeConfirmacao: string) =>
      escrever('POST', `${caminhoGrupo(grupoId)}/arquivar`, { nomeConfirmacao }, grupoDetalhe),
    onSuccess: () => invalidar(grupoId),
  });
}

/** `POST …/reativar` (GEL-28). O id vai na chamada: a lista de grupos reativa qualquer arquivado dela. */
export function useReativarGrupo() {
  const invalidar = useInvalidarGrupos();
  return useMutation({
    mutationFn: (grupoId: string) => escrever('POST', `${caminhoGrupo(grupoId)}/reativar`, undefined, grupoDetalhe),
    onSuccess: (_detalhe, grupoId) => invalidar(grupoId),
  });
}
