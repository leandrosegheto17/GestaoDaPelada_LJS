import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { criarCliente } from '../../src/dados/cliente.ts';
import { ProvedorCliente } from '../../src/dados/ContextoCliente.tsx';
import { erroApi, type Chamada, type Manipulador } from './tela.tsx';

/**
 * Apoio dos testes dos hooks de dados (grupos-e-elenco T53 a T55): o hook com um `QueryClient` e o cliente HTTP sobre
 * o mesmo servidor falso de `tela.tsx` (`"MÉTODO /caminho"` → resposta; rota não dada responde 404).
 */
export function montarHook<T>(hook: () => T, api: Record<string, Manipulador> = {}) {
  const chamadas: Chamada[] = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const metodo = (init?.method ?? 'GET').toUpperCase();
    const caminho = String(url).split('?')[0] ?? '';
    const corpo = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    chamadas.push({ metodo, caminho, corpo, cabecalhos: (init?.headers ?? {}) as Record<string, string> });
    const manipulador = api[`${metodo} ${caminho}`];
    if (manipulador) return manipulador(corpo);
    return erroApi(404, 'nao_encontrado');
  }) as unknown as typeof globalThis.fetch;

  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const cliente = criarCliente({ consultas, navegar: () => undefined, fetch });
  const envoltorio = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={consultas}>
      <ProvedorCliente cliente={cliente}>{children}</ProvedorCliente>
    </QueryClientProvider>
  );
  const resultado = renderHook(hook, { wrapper: envoltorio });
  return {
    ...resultado,
    consultas,
    chamadas,
    chamadasA: (metodo: string, caminho: string) => chamadas.filter((c) => c.metodo === metodo && c.caminho === caminho),
  };
}

/** A consulta da chave está marcada como velha (invalidada) no cache. */
export function estaInvalidada(consultas: QueryClient, chave: readonly unknown[]): boolean {
  return consultas.getQueryState(chave)?.isInvalidated === true;
}
