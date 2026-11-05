import type { AdminsResposta } from '@pelada/contrato/acesso';
import {
  mesFinanceiroResposta,
  type ConfigFinanceiraCorpo,
  type ConfigFinanceiraResposta,
  type MesFinanceiroResposta,
} from '@pelada/contrato/financeiro';
import {
  CODIGOS_ERRO_FINANCEIRO,
  lancamentoResposta,
  type CodigoErroFinanceiro,
  type LancamentoCorpo,
  type LancamentoResposta,
  type PagamentoCorpo,
} from '@pelada/contrato/financeiro-lancamentos';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ErroApi } from './cliente.ts';
import { useCliente } from './ContextoCliente.tsx';
import { mensagensDosCampos } from './erros-campo.ts';
import { caminhoGrupo, chaveGrupo } from './grupos.ts';

/**
 * Dados do financeiro no front (financeiro T36; FIN-07), no molde de `dados/elenco.ts`:
 * - `useMesFinanceiro(grupoId, mes?)`: `GET …/financeiro/mes[?mes=AAAA-MM]`, conferido pelo `mesFinanceiroResposta`;
 * - `useSalvarConfig`: `PUT …/financeiro/config`;
 * - `useMarcarPagamento` e `useDesmarcarPagamento`: `POST …/financeiro/pagamentos` e
 *   `DELETE …/financeiro/pagamentos/:jogadorId/:mes`;
 * - `useLancamento`, `useCriarLancamento`, `useEditarLancamento` e `useExcluirLancamento`: `…/financeiro/lancamentos`;
 * - `useAlterarAcessoFinanceiro`: `PATCH …/admins/:contaId/financeiro`, que devolve a lista de admins e a grava na
 *   consulta dos admins (`['admins', grupoId]`, a chave da tela t19).
 *
 * Toda escrita do caixa invalida os meses do grupo e o detalhe do grupo (o saldo do início, FIN-34).
 *
 * Erros: o cliente HTTP só reconhece os códigos da conta e acesso; os do financeiro chegam no corpo bruto
 * (`ErroApi.corpo`). `erroDoFinanceiro` os traduz: `sem_permissao_financeiro`, `pagamento_ja_marcado`,
 * `lancamento_vinculado`, `acao_na_propria_conta`, `plano_pro` (na forma `{ erro: 'plano_pro', recurso, mensagem }` da
 * AD-091), `dados_invalidos` com a mensagem de cada campo, `nao_encontrado` e `grupo_arquivado`.
 */

export function chaveFinanceiro(grupoId: string) {
  return [...chaveGrupo(grupoId), 'financeiro'] as const;
}

export function chaveMesFinanceiro(grupoId: string, mes: string | undefined) {
  return [...chaveFinanceiro(grupoId), 'mes', mes ?? 'atual'] as const;
}

export function chaveLancamento(grupoId: string, id: string) {
  return [...chaveFinanceiro(grupoId), 'lancamento', id] as const;
}

function caminhoFinanceiro(grupoId: string): string {
  return `${caminhoGrupo(grupoId)}/financeiro`;
}

/** `…/financeiro/mes`, com `?mes=` só quando há mês escolhido. */
export function caminhoMes(grupoId: string, mes?: string): string {
  const base = `${caminhoFinanceiro(grupoId)}/mes`;
  return mes === undefined ? base : `${base}?mes=${encodeURIComponent(mes)}`;
}

function caminhoLancamentos(grupoId: string): string {
  return `${caminhoFinanceiro(grupoId)}/lancamentos`;
}

function caminhoLancamento(grupoId: string, id: string): string {
  return `${caminhoLancamentos(grupoId)}/${encodeURIComponent(id)}`;
}

/** Invalida os meses e os lançamentos do grupo e o detalhe do grupo (o saldo do início). */
export async function invalidarFinanceiro(consultas: QueryClient, grupoId: string): Promise<void> {
  await Promise.all([
    consultas.invalidateQueries({ queryKey: chaveFinanceiro(grupoId) }),
    consultas.invalidateQueries({ queryKey: chaveGrupo(grupoId), exact: true }),
  ]);
}

export function useMesFinanceiro(grupoId: string, mes?: string) {
  const api = useCliente();
  return useQuery<MesFinanceiroResposta>({
    queryKey: chaveMesFinanceiro(grupoId, mes),
    queryFn: async () =>
      mesFinanceiroResposta.parse(await api.get<unknown>(caminhoMes(grupoId, mes))),
    retry: false,
    enabled: grupoId !== '',
  });
}

export function useSalvarConfig(grupoId: string) {
  const api = useCliente();
  const consultas = useQueryClient();
  return useMutation({
    mutationFn: (dados: ConfigFinanceiraCorpo) =>
      api.put<ConfigFinanceiraResposta>(`${caminhoFinanceiro(grupoId)}/config`, dados),
    onSuccess: () => invalidarFinanceiro(consultas, grupoId),
  });
}

export function useMarcarPagamento(grupoId: string) {
  const api = useCliente();
  const consultas = useQueryClient();
  return useMutation({
    mutationFn: (dados: PagamentoCorpo) =>
      api.post<undefined>(`${caminhoFinanceiro(grupoId)}/pagamentos`, dados),
    onSuccess: () => invalidarFinanceiro(consultas, grupoId),
  });
}

export function useDesmarcarPagamento(grupoId: string) {
  const api = useCliente();
  const consultas = useQueryClient();
  return useMutation({
    mutationFn: ({ jogadorId, mes }: PagamentoCorpo) =>
      api.delete<undefined>(
        `${caminhoFinanceiro(grupoId)}/pagamentos/${encodeURIComponent(jogadorId)}/${encodeURIComponent(mes)}`,
      ),
    onSuccess: () => invalidarFinanceiro(consultas, grupoId),
  });
}

export function useLancamento(grupoId: string, id: string) {
  const api = useCliente();
  return useQuery<LancamentoResposta>({
    queryKey: chaveLancamento(grupoId, id),
    queryFn: async () =>
      lancamentoResposta.parse(await api.get<unknown>(caminhoLancamento(grupoId, id))),
    retry: false,
    enabled: grupoId !== '' && id !== '',
  });
}

export function useCriarLancamento(grupoId: string) {
  const api = useCliente();
  const consultas = useQueryClient();
  return useMutation({
    mutationFn: (dados: LancamentoCorpo) =>
      api.post<LancamentoResposta>(caminhoLancamentos(grupoId), dados),
    onSuccess: (criado) => {
      consultas.setQueryData(chaveLancamento(grupoId, criado.id), criado);
      return invalidarFinanceiro(consultas, grupoId);
    },
  });
}

export function useEditarLancamento(grupoId: string, id: string) {
  const api = useCliente();
  const consultas = useQueryClient();
  return useMutation({
    mutationFn: (dados: LancamentoCorpo) =>
      api.put<LancamentoResposta>(caminhoLancamento(grupoId, id), dados),
    onSuccess: async (editado) => {
      await invalidarFinanceiro(consultas, grupoId);
      consultas.setQueryData(chaveLancamento(grupoId, id), editado);
    },
  });
}

export function useExcluirLancamento(grupoId: string, id: string) {
  const api = useCliente();
  const consultas = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<undefined>(caminhoLancamento(grupoId, id)),
    onSuccess: async () => {
      consultas.removeQueries({ queryKey: chaveLancamento(grupoId, id), exact: true });
      await invalidarFinanceiro(consultas, grupoId);
    },
  });
}

export function useAlterarAcessoFinanceiro(grupoId: string) {
  const api = useCliente();
  const consultas = useQueryClient();
  return useMutation({
    mutationFn: ({ contaId, acessaFinanceiro }: { contaId: string; acessaFinanceiro: boolean }) =>
      api.patch<AdminsResposta>(
        `${caminhoGrupo(grupoId)}/admins/${encodeURIComponent(contaId)}/financeiro`,
        { acessaFinanceiro },
      ),
    // A mesma chave da tela de admins (`telas/admins/Admins.tsx`, `chaveAdmins`).
    onSuccess: (lista) => consultas.setQueryData(['admins', grupoId], lista),
  });
}

// ---------------------------------------------------------------- erros

export type CodigoDoFinanceiro =
  CodigoErroFinanceiro | 'dados_invalidos' | 'nao_encontrado' | 'grupo_arquivado';

export interface ErroFinanceiro {
  /** Nulo quando o erro não é da API (rede) ou o código é desconhecido. */
  codigo: CodigoDoFinanceiro | null;
  /** A mensagem para mostrar: a da API, ou a do cliente HTTP (rede, inesperado). */
  mensagem: string;
  /** No 422, a mensagem de cada campo; senão vazio. */
  campos: Record<string, string>;
  status: number;
}

const OUTROS_CODIGOS = new Set(['dados_invalidos', 'nao_encontrado', 'grupo_arquivado']);

function texto(valor: unknown): string | undefined {
  return typeof valor === 'string' && valor !== '' ? valor : undefined;
}

/** Traduz o erro de uma consulta ou mutação do financeiro. */
export function erroDoFinanceiro(erro: unknown): ErroFinanceiro {
  if (!(erro instanceof ErroApi)) {
    return {
      codigo: null,
      mensagem: erro instanceof Error ? erro.message : 'Algo deu errado. Tente de novo.',
      campos: {},
      status: 0,
    };
  }
  const corpo = (typeof erro.corpo === 'object' && erro.corpo !== null ? erro.corpo : {}) as Record<
    string,
    unknown
  >;
  const campos = mensagensDosCampos(erro);

  // AD-091: `{ erro: 'plano_pro', recurso, mensagem }`, sem `codigo`.
  if (corpo.erro === 'plano_pro') {
    return {
      codigo: 'plano_pro',
      mensagem: texto(corpo.mensagem) ?? erro.message,
      campos,
      status: erro.status,
    };
  }
  const bruto = corpo.codigo;
  const conhecido =
    typeof bruto === 'string' &&
    ((CODIGOS_ERRO_FINANCEIRO as readonly string[]).includes(bruto) || OUTROS_CODIGOS.has(bruto))
      ? (bruto as CodigoDoFinanceiro)
      : null;
  return {
    codigo: conhecido,
    mensagem: texto(corpo.erro) ?? erro.message,
    campos,
    status: erro.status,
  };
}
