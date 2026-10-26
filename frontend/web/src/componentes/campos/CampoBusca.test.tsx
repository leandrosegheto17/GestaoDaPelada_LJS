import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { violacoes } from '../../../test/apoio/axe';
import { CampoBusca } from './CampoBusca';

// Critério: FUN-30 (cada componente base tem teste de renderização e axe sem violações).
// O CampoBusca não tinha teste próprio no legado.
function Exemplo() {
  const [valor, setValor] = useState('');
  return <CampoBusca rotulo="Buscar jogador" valor={valor} aoMudar={setValor} />;
}

describe('CampoBusca (FUN-30)', () => {
  it('tem o rótulo como nome acessível e repassa o que se digita', async () => {
    render(<Exemplo />);
    const caixa = screen.getByRole('searchbox', { name: 'Buscar jogador' });
    expect(caixa).toHaveAttribute('placeholder', 'Buscar jogador');
    await userEvent.type(caixa, 'ale');
    expect(caixa).toHaveValue('ale');
  });

  it('não tem violações de acessibilidade', async () => {
    const { container } = render(<Exemplo />);
    expect(await violacoes(container)).toEqual([]);
  });
});
