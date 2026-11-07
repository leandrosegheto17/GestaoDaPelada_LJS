import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { usePrevia } from '../../src/dados/previas.ts';

/**
 * `usePrevia` e a resposta de outra chave (A-12 da validação do simulador; SIM-64): depois da troca da chave, o estado
 * não pode ser a resposta da chave anterior nem por um render, senão o resultado antigo aparece por um instante.
 */

afterEach(() => {
  cleanup();
});

describe('usePrevia: resposta de outra chave', () => {
  it('SIM-64: na troca da chave o primeiro render já é "calculando", não a resposta anterior', async () => {
    const vistos: string[] = [];
    const { result, rerender } = renderHook(
      ({ chave }) => {
        const r = usePrevia(() => Promise.resolve(`resposta-${chave}`), chave, 0);
        vistos.push(
          r.estado.tipo === 'pronta' ? `pronta:${String(r.estado.previa)}` : r.estado.tipo,
        );
        return r;
      },
      { initialProps: { chave: 'a' } },
    );
    await waitFor(() =>
      expect(result.current.estado).toEqual({ tipo: 'pronta', previa: 'resposta-a' }),
    );

    vistos.length = 0;
    await act(async () => {
      rerender({ chave: 'b' });
    });
    expect(vistos[0]).toBe('calculando');
    await waitFor(() =>
      expect(result.current.estado).toEqual({ tipo: 'pronta', previa: 'resposta-b' }),
    );
    expect(vistos).not.toContain('pronta:resposta-a');
  });
});
