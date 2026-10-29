// Critério: T56 (GEL-97, GEL-103): o nível aparece com uma casa decimal, meio para cima, ou "sem nota"; salvar a nota
// chama a rota certa e invalida a ficha e a lista.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { corpoEnviado, json, simularApi } from '../../test/apoio/tela';
import { chavesElenco } from './elenco';
import { formatarNivel, useSalvarNota } from './notas';

afterEach(() => vi.unstubAllGlobals());

describe('formatarNivel (GEL-103)', () => {
  it.each([
    [683, '6,8'],
    [685, '6,9'],
    [684, '6,8'],
    [550, '5,5'],
    [1000, '10,0'],
    [100, '1,0'],
    [995, '10,0'],
    [994, '9,9'],
  ])('%i → "%s"', (nivel, texto) => {
    expect(formatarNivel(nivel)).toBe(texto);
  });

  it('semNota → "sem nota", qualquer que seja o número', () => {
    expect(formatarNivel(550, true)).toBe('sem nota');
  });
});

describe('useSalvarNota', () => {
  function montar() {
    const cliente = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    for (const chave of [
      chavesElenco.detalhe('g1', 'j1'),
      chavesElenco.lista('g1'),
      chavesElenco.detalhe('g1', 'j2'),
    ]) {
      cliente.setQueryData(chave, { x: 1 });
    }
    const envolver = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
    );
    return { cliente, envolver };
  }
  const invalidada = (c: QueryClient, chave: readonly unknown[]) => c.getQueryState(chave)?.isInvalidated;

  it.each([8, null])('nota %s: PUT …/notas/:habilidadeId e invalida a ficha e a lista', async (nota) => {
    const f = simularApi(() => json({ nivel: 683, semNota: false }));
    const { cliente, envolver } = montar();
    const { result } = renderHook(() => useSalvarNota('g1', 'j1'), { wrapper: envolver });
    result.current.mutate({ habilidadeId: 'h1', nota });
    await waitFor(() => {
      expect(invalidada(cliente, chavesElenco.detalhe('g1', 'j1'))).toBe(true);
      expect(invalidada(cliente, chavesElenco.lista('g1'))).toBe(true);
    });
    const [url, init] = f.mock.calls[0]!;
    expect(`${init?.method} ${new URL(String(url)).pathname}`).toBe('PUT /api/grupos/g1/jogadores/j1/notas/h1');
    expect(corpoEnviado(f)).toEqual({ nota });
    expect(result.current.data).toEqual({ nivel: 683, semNota: false });
    expect(invalidada(cliente, chavesElenco.detalhe('g1', 'j2'))).toBe(false);
  });
});
