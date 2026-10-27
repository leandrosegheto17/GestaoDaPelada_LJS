import { sessaoEu, type SessaoEu } from '@pelada/contrato';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ler, escrever, semCorpo } from './cliente';
import { ErroApi } from './erros';

export const chaveSessao = ['sessao', 'eu'] as const;

/** `null` = sem sessão (estado normal numa página pública, não um erro). */
export async function lerSessao(): Promise<SessaoEu | null> {
  try {
    return await ler('/sessao', sessaoEu);
  } catch (erro) {
    if (erro instanceof ErroApi && erro.status === 401) return null;
    throw erro;
  }
}

export function useSessao() {
  return useQuery({ queryKey: chaveSessao, queryFn: lerSessao, staleTime: 60_000 });
}

/** Encerra a sessão e esvazia o cache: nada de dado da conta fica na memória. A navegação é de quem chama. */
export function useSair() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: () => escrever('POST', '/sessao/sair', undefined, semCorpo),
    onSuccess: () => cliente.clear(),
  });
}
