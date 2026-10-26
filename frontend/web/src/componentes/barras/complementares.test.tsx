import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { violacoes } from '../../../test/apoio/axe';
import { Icone } from '../basicos/Icone';
import { BarraCarregando } from './BarraCarregando';
import { BarraInterna } from './BarraInterna';
import { BarraTitulo } from './BarraTitulo';
import { BotaoIcone } from './BotaoIcone';

// Critério: FUN-30 (cada componente base tem teste de renderização e axe sem violações).
// Estes quatro componentes não tinham teste próprio no legado.
const dentro = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('BarraTitulo (FUN-30)', () => {
  it('mostra o nome do app num banner, sem violações', async () => {
    const { container } = dentro(<BarraTitulo titulo="Gestão da Pelada" />);
    expect(screen.getByRole('banner')).toHaveTextContent('Gestão da Pelada');
    expect(await violacoes(container)).toEqual([]);
  });
});

describe('BarraCarregando (FUN-30)', () => {
  it('é um banner com esqueleto decorativo, sem violações', async () => {
    const { container } = dentro(<BarraCarregando />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(await violacoes(container)).toEqual([]);
  });
});

describe('BotaoIcone (FUN-30)', () => {
  it('como link: nome acessível vem do rótulo', async () => {
    const { container } = dentro(
      <BotaoIcone rotulo="Ver ranking" para="/g/quinta">
        <Icone nome="lista" />
      </BotaoIcone>,
    );
    expect(screen.getByRole('link', { name: 'Ver ranking' })).toHaveAttribute('href', '/g/quinta');
    expect(await violacoes(container)).toEqual([]);
  });

  it('como botão de menu: aria-expanded acompanha o estado e o clique chama o callback', async () => {
    const aoClicar = vi.fn();
    const { container } = dentro(
      <BotaoIcone rotulo="Menu da conta" aoClicar={aoClicar} menu={{ aberto: false }}>
        <Icone nome="conta" />
      </BotaoIcone>,
    );
    const botao = screen.getByRole('button', { name: 'Menu da conta' });
    expect(botao).toHaveAttribute('aria-expanded', 'false');
    expect(botao).toHaveAttribute('aria-haspopup', 'true');
    await userEvent.click(botao);
    expect(aoClicar).toHaveBeenCalledOnce();
    expect(await violacoes(container)).toEqual([]);
  });
});

describe('BarraInterna (FUN-30)', () => {
  it('mostra nome, link e atalhos, sem violações', async () => {
    const { container } = dentro(
      <BarraInterna
        nome="Pelada de Quinta"
        textoLink="Trocar grupo"
        destinoLink="/admin"
        destinoRanking="/g/quinta"
        aoAbrirMenu={() => undefined}
      />,
    );
    expect(screen.getByText('Pelada de Quinta')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trocar grupo' })).toHaveAttribute('href', '/admin');
    expect(screen.getByRole('navigation', { name: 'Atalhos' })).toBeInTheDocument();
    expect(await violacoes(container)).toEqual([]);
  });

  it('sem link nem atalhos, só o nome', () => {
    dentro(<BarraInterna nome="Só o nome" />);
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
