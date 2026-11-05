import {
  planoResposta,
  type AssinaturaCorpo,
  type AssinaturaCriada,
  type PlanoResposta,
} from '@pelada/contrato/plano';
import type { RecursoPro } from '@pelada/dominio';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ErroApi, PREFIXO_CHAVE_PLANO } from './cliente.ts';
import { useCliente } from './ContextoCliente.tsx';
import { caminhoGrupo } from './grupos.ts';

/**
 * Dados do plano no front (planos-e-cobranca T41; PLA-21, PLA-54), sobre o cliente HTTP da CA:
 * - `usePlano(grupoId)`: `GET /api/grupos/:grupoId/plano`, conferido pelo contrato (`planoResposta`). Reabrir a tela
 *   relê o plano (PLA-54): sem cache velho entre visitas (`staleTime` 0, refetch ao montar);
 * - `useAssinar(grupoId)`: `POST …/assinatura` com nome e CPF; devolve `faturaUrl`;
 * - `useCancelar(grupoId)`: `DELETE …/assinatura`;
 * - 403 `plano_pro` ou `somente_leitura` em qualquer escrita invalida o plano: quem faz é o cliente HTTP
 *   (`cliente.ts`), para valer em toda tela sem cada mutação lembrar.
 *
 * SPEC_DEVIATION: a tarefa chama os hooks `usarPlano`, `usarAssinar` e `usarCancelar`; ficam `usePlano`, `useAssinar` e
 * `useCancelar`, porque a regra `rules-of-hooks` só aceita hook com o prefixo `use` (molde: `dados/grupos.ts`).
 */

export function chavePlano(grupoId: string) {
  return [PREFIXO_CHAVE_PLANO, grupoId] as const;
}

export function caminhoPlano(grupoId: string): string {
  return `${caminhoGrupo(grupoId)}/plano`;
}

export function caminhoAssinatura(grupoId: string): string {
  return `${caminhoGrupo(grupoId)}/assinatura`;
}

export async function invalidarPlano(consultas: QueryClient, grupoId: string): Promise<void> {
  await consultas.invalidateQueries({ queryKey: chavePlano(grupoId) });
}

export function usePlano(grupoId: string) {
  const api = useCliente();
  return useQuery<PlanoResposta>({
    queryKey: chavePlano(grupoId),
    queryFn: async () => planoResposta.parse(await api.get<unknown>(caminhoPlano(grupoId))),
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
    enabled: grupoId !== '',
  });
}

/**
 * O grupo não tem o recurso Pro (planos-e-cobranca T50; PLA-27): só com o plano lido e sem o recurso na lista.
 * Carregando ou com erro, conta como liberado: quem decide é a API (403 `plano_pro`), e o 403 relê o plano (T41).
 */
export function useSemRecurso(grupoId: string, recurso: RecursoPro): boolean {
  const plano = usePlano(grupoId);
  return plano.data !== undefined && !plano.data.recursos.includes(recurso);
}

export function useAssinar(grupoId: string) {
  const api = useCliente();
  const consultas = useQueryClient();
  return useMutation({
    mutationFn: (dados: AssinaturaCorpo) =>
      api.post<AssinaturaCriada>(caminhoAssinatura(grupoId), dados),
    // O 409 também muda o que Meu plano mostra (há assinatura pendente): relê nos dois casos.
    onSettled: () => invalidarPlano(consultas, grupoId),
  });
}

export function useCancelar(grupoId: string) {
  const api = useCliente();
  const consultas = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<unknown>(caminhoAssinatura(grupoId)),
    onSettled: () => invalidarPlano(consultas, grupoId),
  });
}

export type ErroDePlano =
  | { tipo: 'plano_pro'; recurso: string }
  | { tipo: 'somente_leitura'; motivo: string }
  | { tipo: 'assinatura_pendente'; faturaUrl: string | null }
  | { tipo: 'assinatura_ativa' }
  | { tipo: 'pagamento_indisponivel'; mensagem: string };

/** Lê um erro de plano (AD-091) de um `ErroApi`; outro erro devolve `null`. */
export function erroDePlano(erro: unknown): ErroDePlano | null {
  if (!(erro instanceof ErroApi)) return null;
  const corpo = erro.corpo;
  if (typeof corpo !== 'object' || corpo === null) return null;
  const c = corpo as Record<string, unknown>;
  const texto = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  switch (c.erro) {
    case 'plano_pro':
      return { tipo: 'plano_pro', recurso: texto(c.recurso) ?? '' };
    case 'somente_leitura':
      return { tipo: 'somente_leitura', motivo: texto(c.motivo) ?? '' };
    case 'assinatura_pendente':
      return { tipo: 'assinatura_pendente', faturaUrl: texto(c.faturaUrl) };
    case 'assinatura_ativa':
      return { tipo: 'assinatura_ativa' };
    case 'pagamento_indisponivel':
      return { tipo: 'pagamento_indisponivel', mensagem: texto(c.mensagem) ?? '' };
    default:
      return null;
  }
}
