import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { abrirTela } from '../apoio/tela.tsx';

/**
 * PLA-67 (planos-e-cobranca T54): preço, trial e limite dos termos vêm da tabela do domínio. Com os valores trocados
 * neste arquivo, os termos mudam junto; se estivessem escritos na tela, o teste falharia.
 */

vi.mock('@pelada/dominio', async (original) => ({
  ...(await original<typeof import('@pelada/dominio')>()),
  PRECO_PRO_CENTAVOS: 1290,
  LIMITE_JOGADORES_FREE: 25,
  DIAS_DE_TRIAL: 7,
}));

afterEach(() => {
  cleanup();
});

describe('termos com outra tabela', () => {
  it('PLA-67: com a tabela trocada, /termos mostra "7 dias", "R$ 12,90" e "25 jogadores"', async () => {
    const { container } = abrirTela('/termos');
    await screen.findByRole('heading', { level: 1, name: 'Termos de uso' });
    const texto = container.textContent ?? '';
    expect(texto).toContain('7 dias');
    expect(texto).toContain('R$ 12,90');
    expect(texto).toContain('25 jogadores');
    expect(texto).not.toContain('R$ 9,90');
    expect(texto).not.toContain('14 dias');
  });
});
