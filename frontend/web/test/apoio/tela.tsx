import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { criarClienteConsultas } from '../../src/dados/consultas';

export const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

export const erroApi = (status: number, codigo: string, mensagem = 'Erro.', campos?: Record<string, string>) =>
  json({ erro: { codigo, mensagem, ...(campos ? { campos } : {}) } }, status);

/** Troca o `fetch` por um simulado e devolve o espião (chamadas em `mock.calls`). */
export function simularApi(resposta: (url: string, init: RequestInit | undefined) => Response | Promise<Response>) {
  const f = vi.fn<typeof fetch>((entrada, init) => Promise.resolve().then(() => resposta(String(entrada), init)));
  vi.stubGlobal('fetch', f);
  return f;
}

/** Corpo JSON enviado numa chamada do `fetch` simulado. */
export function corpoEnviado(f: ReturnType<typeof simularApi>, indice = 0): unknown {
  const init = f.mock.calls[indice]?.[1];
  return typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
}

/** Monta a tela numa rota própria, com uma página de destino simples em cada rota extra. */
export function montarTela(elemento: ReactElement, caminho: string, destinos: string[] = ['/app', '/entrar']) {
  const roteador = createMemoryRouter(
    [
      { path: caminho.split(/[?#]/)[0] ?? '/', element: elemento },
      ...destinos.filter((d) => d !== caminho.split(/[?#]/)[0]).map((d) => ({ path: d, element: <p>Destino {d}</p> })),
    ],
    { initialEntries: [caminho] },
  );
  const retorno = render(
    <QueryClientProvider client={criarClienteConsultas({ aoSessaoExpirada: () => undefined })}>
      <RouterProvider router={roteador} />
    </QueryClientProvider>,
  );
  return { roteador, ...retorno };
}
