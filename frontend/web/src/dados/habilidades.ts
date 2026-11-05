import type { JogadorDetalhe } from '@pelada/contrato/elenco';
import {
  listaHabilidades,
  type HabilidadeCorpo,
  type HabilidadeItem,
  type ListaHabilidades,
  type NotaResposta,
} from '@pelada/contrato/periodos';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCliente } from './ContextoCliente.tsx';
import { chaveJogador, chaveJogadores } from './elenco.ts';
import { caminhoGrupo, chaveGrupo } from './grupos.ts';

/**
 * Habilidades, notas e exibição do nível no front (grupos-e-elenco T55; GEL-88, GEL-97, GEL-103), no molde de
 * `dados/grupos.ts`:
 * - `useHabilidades(grupoId)` e as mutações de criar, renomear e excluir. Criar e renomear invalidam a lista de
 *   habilidades e o detalhe do grupo (a contagem); excluir invalida tudo do grupo, porque as notas dela somem e o nível
 *   de cada jogador muda (GEL-93);
 * - `useSalvarNota(grupoId, jogadorId)`: grava ou apaga a nota e põe o nível da resposta na ficha do jogador, sem
 *   esperar outra leitura (GEL-97); a lista do elenco é invalidada (o nível aparece nela);
 * - `exibirNivel(nivel, semNota)`: uma casa decimal, meio para cima, com vírgula (683 → "6,8"); "sem nota" (GEL-103).
 */

export const TEXTO_SEM_NOTA = 'sem nota';

/** O nível (em centésimos, 100 a 1000) como na tela: uma casa decimal com meio para cima e vírgula (GEL-103). */
export function exibirNivel(nivel: number, semNota: boolean): string {
  if (semNota) return TEXTO_SEM_NOTA;
  // Conta em inteiros: décimos com meio para cima, sem erro de ponto flutuante.
  const decimos = Math.floor((Math.round(nivel) + 5) / 10);
  return `${Math.floor(decimos / 10)},${decimos % 10}`;
}

export function chaveHabilidades(grupoId: string) {
  return [...chaveGrupo(grupoId), 'habilidades'] as const;
}

function caminhoHabilidades(grupoId: string): string {
  return `${caminhoGrupo(grupoId)}/habilidades`;
}

export function useHabilidades(grupoId: string) {
  const api = useCliente();
  return useQuery<ListaHabilidades>({
    queryKey: chaveHabilidades(grupoId),
    queryFn: async () => listaHabilidades.parse(await api.get<unknown>(caminhoHabilidades(grupoId))),
    retry: false,
    enabled: grupoId !== '',
  });
}

export function useCriarHabilidade(grupoId: string) {
  const api = useCliente();
  const consultas = useQueryClient();
  return useMutation({
    mutationFn: (dados: HabilidadeCorpo) => api.post<HabilidadeItem>(caminhoHabilidades(grupoId), dados),
    onSuccess: () =>
      Promise.all([
        consultas.invalidateQueries({ queryKey: chaveHabilidades(grupoId), exact: true }),
        consultas.invalidateQueries({ queryKey: chaveGrupo(grupoId), exact: true }),
      ]),
  });
}

export function useRenomearHabilidade(grupoId: string) {
  const api = useCliente();
  const consultas = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dados }: { id: string; dados: HabilidadeCorpo }) =>
      api.patch<HabilidadeItem>(`${caminhoHabilidades(grupoId)}/${encodeURIComponent(id)}`, dados),
    // A ficha mostra o nome da habilidade nas notas: invalida também as fichas do grupo.
    onSuccess: () => consultas.invalidateQueries({ queryKey: chaveGrupo(grupoId) }),
  });
}

export function useExcluirHabilidade(grupoId: string) {
  const api = useCliente();
  const consultas = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<undefined>(`${caminhoHabilidades(grupoId)}/${encodeURIComponent(id)}`),
    onSuccess: () => consultas.invalidateQueries({ queryKey: chaveGrupo(grupoId) }),
  });
}

export function useSalvarNota(grupoId: string, jogadorId: string) {
  const api = useCliente();
  const consultas = useQueryClient();
  return useMutation({
    mutationFn: ({ habilidadeId, nota }: { habilidadeId: string; nota: number | null }) =>
      api.put<NotaResposta>(
        `${caminhoGrupo(grupoId)}/jogadores/${encodeURIComponent(jogadorId)}/notas/${encodeURIComponent(habilidadeId)}`,
        { nota },
      ),
    onSuccess: (resposta, { habilidadeId, nota }) => {
      consultas.setQueryData<JogadorDetalhe>(chaveJogador(grupoId, jogadorId), (ficha) =>
        ficha
          ? {
              ...ficha,
              nivel: resposta.nivel,
              semNota: resposta.semNota,
              notas: ficha.notas.map((n) => (n.habilidadeId === habilidadeId ? { ...n, nota } : n)),
            }
          : ficha,
      );
      return consultas.invalidateQueries({ queryKey: chaveJogadores(grupoId), exact: true });
    },
  });
}
