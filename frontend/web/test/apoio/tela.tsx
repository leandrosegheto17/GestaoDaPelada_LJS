import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { criarRotas, type HandleTela } from '../../src/app/rotas.tsx';
import { criarCliente } from '../../src/dados/cliente.ts';
import { ProvedorCliente } from '../../src/dados/ContextoCliente.tsx';

/**
 * Apoio dos testes de tela (T43 a T53): o app com as rotas reais, um `QueryClient` e o cliente
 * HTTP sobre um servidor falso. Cada rota da API é `"MÉTODO /caminho"` → função que recebe o
 * corpo e devolve a resposta. `GET /api/sessao` responde 401 `sem_sessao` quando não for dada.
 * Rota não dada responde 404. A resposta pode ser uma promessa que nunca resolve (carregando).
 */

export type Manipulador = (corpo: unknown) => Response | Promise<Response>;

export interface Chamada {
  metodo: string;
  caminho: string;
  corpo: unknown;
  cabecalhos: Record<string, string>;
}

export function json(status: number, corpo?: unknown): Response {
  if (corpo === undefined) return new Response(null, { status });
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function erroApi(status: number, codigo: string, erro = 'erro'): Response {
  return json(status, { erro, codigo });
}

/** Resposta que nunca chega (estado carregando). */
export function pendente(): Promise<Response> {
  return new Promise<Response>(() => undefined);
}

export const SESSAO_ANA = {
  id: 'c-ana',
  nome: 'Ana',
  email: 'ana@exemplo.test',
  grupos: [
    { id: 'g-quinta', nome: 'Pelada de Quinta', slug: 'pelada-de-quinta', acessaFinanceiro: true },
  ],
};

/**
 * `rotas` troca as rotas reais por outras (telas cujas rotas só entram no app depois, grupos-e-elenco T69); sem
 * ela, as rotas do app.
 */
export function abrirTela(
  caminho: string,
  api: Record<string, Manipulador> = {},
  rotas: () => RouteObject[] = criarRotas,
) {
  const chamadas: Chamada[] = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const metodo = (init?.method ?? 'GET').toUpperCase();
    const caminhoUrl = String(url).split('?')[0] ?? '';
    const corpo = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    chamadas.push({
      metodo,
      caminho: caminhoUrl,
      corpo,
      cabecalhos: (init?.headers ?? {}) as Record<string, string>,
    });
    const manipulador = api[`${metodo} ${caminhoUrl}`];
    if (manipulador) return manipulador(corpo);
    if (metodo === 'GET' && caminhoUrl === '/api/sessao') return erroApi(401, 'sem_sessao');
    return erroApi(404, 'nao_encontrado');
  }) as unknown as typeof globalThis.fetch;

  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const roteador = createMemoryRouter(rotas(), { initialEntries: [caminho] });
  const cliente = criarCliente({ consultas, navegar: (d) => void roteador.navigate(d), fetch });
  const resultado = render(
    <QueryClientProvider client={consultas}>
      <ProvedorCliente cliente={cliente}>
        <RouterProvider router={roteador} />
      </ProvedorCliente>
    </QueryClientProvider>,
  );
  return {
    ...resultado,
    roteador,
    consultas,
    chamadas,
    /** Caminho e busca atuais. */
    local: () => `${roteador.state.location.pathname}${roteador.state.location.search}`,
    tela: () => (roteador.state.matches.at(-1)?.route.handle as HandleTela | undefined)?.tela,
    chamadasA: (metodo: string, caminhoApi: string) =>
      chamadas.filter((c) => c.metodo === metodo && c.caminho === caminhoApi),
  };
}
