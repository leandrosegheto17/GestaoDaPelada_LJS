// Critério: FUN-30 (componentes base: renderização e axe). Copiado do legado: frontend/web/src/componentes/basicos/botoes.test.tsx

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { violacoes } from '../../../test/apoio/axe';
import { Botao } from './Botao';
import { BotaoLink } from './BotaoLink';

describe('Botao', () => {
  it.each(['principal', 'secundario', 'destrutivo', 'texto', 'textoDestrutivo'] as const)('variante %s', (variante) => {
    render(<Botao variante={variante}>Salvar</Botao>);
    const botao = screen.getByRole('button', { name: 'Salvar' });
    expect(botao.className).toContain(variante === 'textoDestrutivo' ? 'textoDestrutivo' : variante);
    expect(botao).toHaveAttribute('type', 'button');
  });

  it('só a variante texto leva o marcador que a Faixa usa para herdar a cor', () => {
    render(
      <>
        <Botao variante="texto">A</Botao>
        <Botao variante="textoDestrutivo">B</Botao>
        <Botao>C</Botao>
      </>,
    );
    expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('data-variante', 'texto');
    expect(screen.getByRole('button', { name: 'B' })).not.toHaveAttribute('data-variante');
    expect(screen.getByRole('button', { name: 'C' })).not.toHaveAttribute('data-variante');
  });

  it('carregando mostra o rótulo de carregamento, não dispara onClick e continua focável', async () => {
    const aoClicar = vi.fn();
    render(
      <Botao carregando rotuloCarregando="Salvando…" onClick={aoClicar}>
        Salvar
      </Botao>,
    );
    const botao = screen.getByRole('button', { name: 'Salvando…' });
    expect(botao).toHaveAttribute('aria-busy', 'true');
    expect(botao).toHaveAttribute('aria-disabled', 'true');
    expect(botao).not.toBeDisabled();
    await userEvent.click(botao);
    expect(aoClicar).not.toHaveBeenCalled();
    botao.focus();
    expect(botao).toHaveFocus();
  });

  it('dispara onClick quando não está carregando', async () => {
    const aoClicar = vi.fn();
    render(<Botao onClick={aoClicar}>Salvar</Botao>);
    await userEvent.click(screen.getByRole('button'));
    expect(aoClicar).toHaveBeenCalledTimes(1);
  });

  it('sem violações de acessibilidade', async () => {
    const { container } = render(
      <div>
        <Botao>A</Botao>
        <Botao variante="secundario" bloco topo>
          B
        </Botao>
        <Botao carregando rotuloCarregando="Salvando…">
          C
        </Botao>
        <Botao disabled>D</Botao>
      </div>,
    );
    expect(await violacoes(container)).toEqual([]);
  });
});

describe('BotaoLink', () => {
  it('renderiza um link com a classe de botão', () => {
    render(
      <MemoryRouter>
        <BotaoLink to="/entrar" variante="secundario">
          Entrar
        </BotaoLink>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Entrar' });
    expect(link).toHaveAttribute('href', '/entrar');
    expect(link.className).toContain('secundario');
  });
});
