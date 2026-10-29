import { corrigirPeriodoResposta, jogadorDetalhe, listaJogadores } from '@pelada/contrato';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { escrever, ler, semCorpo } from './cliente';
import { ErroApi } from './erros';
import { chaveGrupo } from './grupos';

/** Chaves do elenco. Começam pela do grupo: invalidar o grupo invalida a lista, as fichas e o resumo do grupo. */
export const chavesElenco = {
  lista: (grupoId: string) => [...chaveGrupo(grupoId), 'jogadores'] as const,
  detalhe: (grupoId: string, jogadorId: string) => [...chaveGrupo(grupoId), 'jogadores', jogadorId] as const,
};

const caminhoLista = (grupoId: string) => `/grupos/${encodeURIComponent(grupoId)}/jogadores`;
export const caminhoJogador = (grupoId: string, jogadorId: string) =>
  `${caminhoLista(grupoId)}/${encodeURIComponent(jogadorId)}`;

/** Ativos e inativos juntos (GEL-46); a separação e a busca são da tela. */
export function useJogadores(grupoId: string) {
  return useQuery({
    queryKey: chavesElenco.lista(grupoId),
    queryFn: ({ signal }) => ler(caminhoLista(grupoId), listaJogadores, { signal }),
  });
}

/** Ficha do jogador: dados, situação, nível, períodos e notas. Busca de novo ao abrir. */
export function useJogador(grupoId: string, jogadorId: string) {
  return useQuery({
    queryKey: chavesElenco.detalhe(grupoId, jogadorId),
    queryFn: ({ signal }) => ler(caminhoJogador(grupoId, jogadorId), jogadorDetalhe, { signal }),
    staleTime: 0,
  });
}

/** Corpo do cadastro (`jogadorCorpo`): a data de entrada só no cadastro; sem ela, a API usa hoje (GEL-32). */
export interface CorpoJogador {
  apelido: string;
  anoNascimento: number;
  posicao: string;
  telefone: string | null;
  pontuacaoInicial?: number;
  dataEntrada?: string;
}

/** Corpo da edição (`editarJogadorCorpo`): sem data de entrada (GEL-41). */
export type CorpoEdicaoJogador = Omit<CorpoJogador, 'dataEntrada'>;

/** Toda escrita no elenco invalida o grupo: a lista, as fichas e o resumo (jogadores ativos) moram sob ele. */
function useInvalidarElenco(grupoId: string) {
  const cliente = useQueryClient();
  return () => cliente.invalidateQueries({ queryKey: chaveGrupo(grupoId) });
}

export function useCriarJogador(grupoId: string) {
  const invalidar = useInvalidarElenco(grupoId);
  return useMutation({
    mutationFn: (corpo: CorpoJogador) => escrever('POST', caminhoLista(grupoId), corpo, jogadorDetalhe),
    onSuccess: invalidar,
  });
}

export function useEditarJogador(grupoId: string, jogadorId: string) {
  const invalidar = useInvalidarElenco(grupoId);
  return useMutation({
    mutationFn: (corpo: CorpoEdicaoJogador) =>
      escrever('PATCH', caminhoJogador(grupoId, jogadorId), corpo, jogadorDetalhe),
    onSuccess: invalidar,
  });
}

export function useExcluirJogador(grupoId: string, jogadorId: string) {
  const invalidar = useInvalidarElenco(grupoId);
  return useMutation({
    mutationFn: () => escrever('DELETE', caminhoJogador(grupoId, jogadorId), undefined, semCorpo),
    onSuccess: invalidar,
  });
}

/** Sem data, a API usa hoje (GEL-52, GEL-55). */
export interface CorpoData {
  data?: string;
}

export function useInativarJogador(grupoId: string, jogadorId: string) {
  const invalidar = useInvalidarElenco(grupoId);
  return useMutation({
    mutationFn: (corpo: CorpoData) =>
      escrever('POST', `${caminhoJogador(grupoId, jogadorId)}/inativar`, corpo, jogadorDetalhe),
    onSuccess: invalidar,
  });
}

export function useReativarJogador(grupoId: string, jogadorId: string) {
  const invalidar = useInvalidarElenco(grupoId);
  return useMutation({
    mutationFn: (corpo: CorpoData) =>
      escrever('POST', `${caminhoJogador(grupoId, jogadorId)}/reativar`, corpo, jogadorDetalhe),
    onSuccess: invalidar,
  });
}

/** Corrigir a saída e/ou o retorno de um período (GEL-71). */
export interface CorpoCorrigirPeriodo {
  saida?: string;
  retorno?: string;
}

export function useCorrigirPeriodo(grupoId: string, jogadorId: string) {
  const invalidar = useInvalidarElenco(grupoId);
  return useMutation({
    mutationFn: ({ periodoId, ...corpo }: CorpoCorrigirPeriodo & { periodoId: string }) =>
      escrever(
        'PATCH',
        `${caminhoJogador(grupoId, jogadorId)}/periodos/${encodeURIComponent(periodoId)}`,
        corpo,
        corrigirPeriodoResposta,
      ),
    onSuccess: invalidar,
  });
}

export function useAlterarInicio(grupoId: string, jogadorId: string) {
  const invalidar = useInvalidarElenco(grupoId);
  return useMutation({
    mutationFn: (corpo: { data: string }) =>
      escrever('PUT', `${caminhoJogador(grupoId, jogadorId)}/inicio`, corpo, jogadorDetalhe),
    onSuccess: invalidar,
  });
}

/** Recusa da exclusão por histórico (GEL-85): a mensagem da API e a sugestão que ela manda (`inativar`). */
export interface RecusaPorHistorico {
  mensagem: string;
  sugestao: 'inativar' | null;
}

/** O 409 `jogador_com_historico`, com a mensagem e a sugestão da API; qualquer outro erro, nulo. */
export function recusaPorHistorico(erro: unknown): RecusaPorHistorico | null {
  if (!(erro instanceof ErroApi) || erro.status !== 409 || erro.codigo !== 'jogador_com_historico') return null;
  return { mensagem: erro.message, sugestao: erro.extras['sugestao'] === 'inativar' ? 'inativar' : null };
}
