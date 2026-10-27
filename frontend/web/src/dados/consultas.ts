import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ErroApi, ehErroDeRede } from './erros';

/** Destino do aviso "Sua sessão expirou. Entre de novo." (ACE-20); a tela de entrada lê `aviso`. */
export const ROTA_SESSAO_EXPIRADA = '/entrar?aviso=sessao-expirada';

interface Opcoes {
  /** Chamado depois de limpar o cache, quando a API responde 401 `sessao_expirada`. */
  aoSessaoExpirada: () => void;
}

/** Retry só para falha de rede (1x); erros da API e respostas inválidas não melhoram repetindo. */
export function criarClienteConsultas({ aoSessaoExpirada }: Opcoes): QueryClient {
  const aoErrar = (erro: unknown) => {
    if (erro instanceof ErroApi && erro.status === 401 && erro.codigo === 'sessao_expirada') {
      // Nada de dado da conta fica na memória depois que a sessão acaba.
      cliente.clear();
      aoSessaoExpirada();
    }
  };
  const cliente: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: aoErrar }),
    mutationCache: new MutationCache({ onError: aoErrar }),
    defaultOptions: {
      queries: { retry: (tentativas, erro) => ehErroDeRede(erro) && tentativas < 1, retryDelay: 500 },
      mutations: { retry: false },
    },
  });
  return cliente;
}
