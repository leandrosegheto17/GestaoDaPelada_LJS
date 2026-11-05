import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Landing } from '../../src/telas/landing/Landing.tsx';

/**
 * PLA-62 (planos-e-cobranca T52): o preço da landing vem da tabela do domínio. Com `PRECO_PRO_CENTAVOS` trocado por
 * 1290 neste arquivo, a landing mostra "R$ 12,90"; se o preço estivesse escrito na tela, o teste falharia.
 */

vi.mock('@pelada/dominio', async (original) => ({
  ...(await original<typeof import('@pelada/dominio')>()),
  PRECO_PRO_CENTAVOS: 1290,
}));

afterEach(() => {
  cleanup();
});

describe('Landing com outro preço na tabela', () => {
  it('PLA-62: com PRECO_PRO_CENTAVOS = 1290, mostra "R$ 12,90/mês por grupo"', () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );
    const pro = screen.getByRole('region', { name: 'Pro' });
    expect(within(pro).getByText('R$ 12,90/mês por grupo')).toBeDefined();
    expect(screen.queryByText(/9,90/)).toBeNull();
  });
});
