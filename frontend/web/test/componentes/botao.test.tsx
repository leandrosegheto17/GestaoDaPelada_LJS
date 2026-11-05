import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Botao } from '../../src/componentes/Botao.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';

afterEach(() => {
  cleanup();
});

describe('Botao', () => {
  for (const variante of ['principal', 'secundario', 'texto'] as const) {
    it(`FUN-31: a variante ${variante} renderiza com a classe botao--${variante} e o clique dispara onClick`, () => {
      const onClick = vi.fn();
      render(
        <Botao variante={variante} onClick={onClick}>
          Salvar
        </Botao>,
      );
      const botao = screen.getByRole('button', { name: 'Salvar' });
      expect(botao.className).toContain('botao');
      expect(botao.className).toContain(`botao--${variante}`);
      expect(botao.getAttribute('type')).toBe('button');
      fireEvent.click(botao);
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  }

  it('FUN-31: sem variante, é o principal', () => {
    render(<Botao>Entrar</Botao>);
    expect(screen.getByRole('button').className).toContain('botao--principal');
  });

  it('FUN-31: bloco ocupa a largura (botao--bloco)', () => {
    render(<Botao bloco>Entrar</Botao>);
    expect(screen.getByRole('button').className).toContain('botao--bloco');
  });

  it('FUN-31: disabled não dispara o clique', () => {
    const onClick = vi.fn();
    render(
      <Botao disabled onClick={onClick}>
        Salvar
      </Botao>,
    );
    const botao = screen.getByRole('button');
    expect((botao as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(botao);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('FUN-31: carregando não dispara o clique e fica disabled com aria-busy, como no mockup', () => {
    const onClick = vi.fn();
    render(
      <Botao carregando onClick={onClick}>
        Entrando…
      </Botao>,
    );
    const botao = screen.getByRole('button', { name: 'Entrando…' });
    expect((botao as HTMLButtonElement).disabled).toBe(true);
    expect(botao.getAttribute('aria-busy')).toBe('true');
    expect(botao.className).toContain('botao--carregando');
    fireEvent.click(botao);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('FUN-31: type submit é respeitado', () => {
    render(<Botao type="submit">Enviar</Botao>);
    expect(screen.getByRole('button').getAttribute('type')).toBe('submit');
  });

  it('FUN-31: axe sem violações nas variantes e estados', async () => {
    const { container } = render(
      <div>
        <Botao>Principal</Botao>
        <Botao variante="secundario">Secundário</Botao>
        <Botao variante="texto">Tentar de novo</Botao>
        <Botao disabled>Desabilitado</Botao>
        <Botao carregando>Carregando…</Botao>
      </div>,
    );
    await esperarSemViolacoes(container);
  });
});
