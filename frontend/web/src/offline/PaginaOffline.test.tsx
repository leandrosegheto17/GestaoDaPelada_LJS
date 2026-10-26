import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { violacoes } from '../../test/apoio/axe';
import { PaginaOffline } from './PaginaOffline';

// FUN-34
describe('PaginaOffline', () => {
  it('avisa que está sem conexão e oferece tentar de novo', () => {
    render(<PaginaOffline />);
    expect(screen.getByRole('heading', { level: 1, name: 'Sem conexão' })).toBeVisible();
    expect(screen.getByText('Gestão da Pelada')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
  });

  it('não tem violações de acessibilidade', async () => {
    const { container } = render(<PaginaOffline />);
    expect(await violacoes(container)).toEqual([]);
  });
});
