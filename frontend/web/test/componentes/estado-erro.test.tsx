import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EstadoErro, TEXTO_ERRO_REDE } from '../../src/componentes/EstadoErro.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';

afterEach(() => {
  cleanup();
});

describe('EstadoErro (faixa, padrao--erro-rede)', () => {
  it('FUN-31: mostra o texto da mensagem e chama aoTentarDeNovo ao clicar', () => {
    const aoTentarDeNovo = vi.fn();
    render(<EstadoErro aoTentarDeNovo={aoTentarDeNovo} />);
    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toContain(TEXTO_ERRO_REDE);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(aoTentarDeNovo).toHaveBeenCalledTimes(1);
  });

  it('FUN-31: aceita uma mensagem própria', () => {
    render(<EstadoErro mensagem="Falhou ao salvar." aoTentarDeNovo={() => undefined} />);
    expect(screen.getByRole('alert').textContent).toContain('Falhou ao salvar.');
  });

  it('FUN-31: o foco inicial vai para o botão Tentar de novo', () => {
    render(<EstadoErro aoTentarDeNovo={() => undefined} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Tentar de novo' }));
  });

  it('FUN-31: a marcação segue as classes do mockup', () => {
    const { container } = render(<EstadoErro aoTentarDeNovo={() => undefined} />);
    const faixa = container.querySelector('[role="alert"]');
    expect(faixa?.className).toContain('faixa');
    expect(faixa?.className).toContain('faixa--erro');
    expect(faixa?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(faixa?.querySelector('p')?.className).toContain('faixa__texto');
    expect(faixa?.querySelector('button')?.className).toContain('botao--texto');
  });

  it('FUN-31: axe sem violações', async () => {
    const { container } = render(<EstadoErro aoTentarDeNovo={() => undefined} />);
    await esperarSemViolacoes(container);
  });
});

describe('EstadoErro (tela, t03-indisponivel--erro)', () => {
  it('FUN-31: mostra título e texto, e o foco inicial vai para o título', () => {
    render(
      <EstadoErro
        formato="tela"
        titulo="Grupo indisponível"
        mensagem="Fale com o admin do seu grupo."
      />,
    );
    const titulo = screen.getByRole('heading', { level: 1, name: 'Grupo indisponível' });
    expect(document.activeElement).toBe(titulo);
    expect(screen.getByText('Fale com o admin do seu grupo.').className).toContain('vazio__texto');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('FUN-31: com aoTentarDeNovo, mostra o botão e chama a função ao clicar', () => {
    const aoTentarDeNovo = vi.fn();
    render(<EstadoErro formato="tela" titulo="Sem conexão" aoTentarDeNovo={aoTentarDeNovo} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(aoTentarDeNovo).toHaveBeenCalledTimes(1);
  });

  it('FUN-31: axe sem violações', async () => {
    const { container } = render(
      <main>
        <EstadoErro
          formato="tela"
          titulo="Grupo indisponível"
          mensagem="Texto."
          aoTentarDeNovo={() => undefined}
        />
      </main>,
    );
    await esperarSemViolacoes(container);
  });
});
