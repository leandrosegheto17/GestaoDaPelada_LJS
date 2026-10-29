// Critério: T55 (GEL-88): cada mutação de habilidade chama a rota certa e invalida a lista de habilidades e a de
// jogadores (o nível pode mudar na exclusão, GEL-93).

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { corpoEnviado, erroApi, json, simularApi } from '../../test/apoio/tela';
import { chavesElenco } from './elenco';
import { chaveGrupo } from './grupos';
import {
  chaveHabilidades,
  useCriarHabilidade,
  useExcluirHabilidade,
  useHabilidades,
  useRenomearHabilidade,
} from './habilidades';

afterEach(() => vi.unstubAllGlobals());

function montar() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  for (const chave of [chaveHabilidades('g1'), chavesElenco.lista('g1'), chaveGrupo('g1'), chaveHabilidades('g2')]) {
    cliente.setQueryData(chave, { x: 1 });
  }
  const envolver = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
  );
  return { cliente, envolver };
}

const invalidada = (c: QueryClient, chave: readonly unknown[]) => c.getQueryState(chave)?.isInvalidated;
const chamada = (f: ReturnType<typeof simularApi>, i = 0) => {
  const [url, init] = f.mock.calls[i]!;
  return `${init?.method ?? 'GET'} ${new URL(String(url)).pathname}`;
};

function esperaInvalidar(cliente: QueryClient) {
  return waitFor(() => {
    expect(invalidada(cliente, chaveHabilidades('g1'))).toBe(true);
    expect(invalidada(cliente, chavesElenco.lista('g1'))).toBe(true);
  });
}

describe('habilidades', () => {
  it('useHabilidades lê GET …/habilidades', async () => {
    const lista = { habilidades: [{ id: 'h1', nome: 'Passe' }] };
    const f = simularApi(() => json(lista));
    const { envolver } = montar();
    const { result } = renderHook(() => useHabilidades('g1'), { wrapper: envolver });
    await waitFor(() => expect(result.current.data).toEqual(lista));
    expect(chamada(f)).toBe('GET /api/grupos/g1/habilidades');
  });

  it('criar: POST …/habilidades com { nome } e invalida habilidades e jogadores', async () => {
    const f = simularApi(() => json({ id: 'h9', nome: 'Cabeceio' }, 201));
    const { cliente, envolver } = montar();
    const { result } = renderHook(() => useCriarHabilidade('g1'), { wrapper: envolver });
    result.current.mutate('Cabeceio');
    await esperaInvalidar(cliente);
    expect(chamada(f)).toBe('POST /api/grupos/g1/habilidades');
    expect(corpoEnviado(f)).toEqual({ nome: 'Cabeceio' });
    expect(invalidada(cliente, chaveHabilidades('g2'))).toBe(false);
  });

  it('renomear: PATCH …/habilidades/:id (id codificado) com { nome } e invalida', async () => {
    const f = simularApi(() => json({ id: 'h/1', nome: 'Drible curto' }));
    const { cliente, envolver } = montar();
    const { result } = renderHook(() => useRenomearHabilidade('g1'), { wrapper: envolver });
    result.current.mutate({ id: 'h/1', nome: 'Drible curto' });
    await esperaInvalidar(cliente);
    expect(chamada(f)).toBe('PATCH /api/grupos/g1/habilidades/h%2F1');
    expect(corpoEnviado(f)).toEqual({ nome: 'Drible curto' });
  });

  it('excluir: DELETE …/habilidades/:id e invalida habilidades, jogadores e o resumo do grupo', async () => {
    const f = simularApi(() => new Response(null, { status: 204 }));
    const { cliente, envolver } = montar();
    const { result } = renderHook(() => useExcluirHabilidade('g1'), { wrapper: envolver });
    result.current.mutate('h1');
    await esperaInvalidar(cliente);
    expect(invalidada(cliente, chaveGrupo('g1'))).toBe(true);
    expect(chamada(f)).toBe('DELETE /api/grupos/g1/habilidades/h1');
  });

  it('falha (422 de nome repetido) não invalida e chega com o campo', async () => {
    simularApi(() =>
      erroApi(422, 'dados_invalidos', 'Corrija os campos indicados.', {
        nome: 'Já existe uma habilidade com esse nome.',
      }),
    );
    const { cliente, envolver } = montar();
    const { result } = renderHook(() => useCriarHabilidade('g1'), { wrapper: envolver });
    result.current.mutate('passe');
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ campos: { nome: 'Já existe uma habilidade com esse nome.' } });
    expect(invalidada(cliente, chaveHabilidades('g1'))).toBe(false);
  });
});
