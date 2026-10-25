import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { violacoes } from '../../../test/apoio/axe';
import { Indicadores } from './Indicadores';

// Critério: FUN-30 (cada componente base tem teste de renderização e axe sem violações).
// O Indicadores não tinha teste próprio no legado.
const ITENS = [
  { rotulo: 'Jogos', valor: '12' },
  { rotulo: 'Saldo', valor: 'R$ 10,00' },
];

describe('Indicadores (FUN-30)', () => {
  it('mostra cada rótulo com seu valor, na ordem recebida', () => {
    const { container } = render(<Indicadores itens={ITENS} />);
    expect(container.querySelectorAll('dt')).toHaveLength(2);
    expect(screen.getByText('Jogos').nextElementSibling).toHaveTextContent('12');
    expect(screen.getByText('Saldo').nextElementSibling).toHaveTextContent('R$ 10,00');
  });

  it('sem itens, a lista fica vazia', () => {
    const { container } = render(<Indicadores itens={[]} />);
    expect(container.querySelectorAll('dt')).toHaveLength(0);
  });

  it('não tem violações de acessibilidade', async () => {
    const { container } = render(<Indicadores itens={ITENS} />);
    expect(await violacoes(container)).toEqual([]);
  });
});
