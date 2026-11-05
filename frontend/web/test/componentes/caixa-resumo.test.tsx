import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { CaixaSelecao } from '../../src/componentes/CaixaSelecao.tsx';
import { ResumoErros, tituloDoResumo } from '../../src/componentes/ResumoErros.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

function Termos({ erro }: { erro?: string }) {
  const [aceito, setAceito] = useState(false);
  return (
    <CaixaSelecao id="termos" checked={aceito} onChange={(e) => setAceito(e.target.checked)} erro={erro}>
      Li e aceito os <a href="/termos">termos de uso</a> e a <a href="/privacidade">política de privacidade</a>
    </CaixaSelecao>
  );
}

describe('CaixaSelecao', () => {
  it('ACE-59: nasce desmarcada e marca com o clique', () => {
    render(<Termos />);
    const caixa = screen.getByRole('checkbox') as HTMLInputElement;
    expect(caixa.checked).toBe(false);
    expect(caixa.id).toBe('termos');
    fireEvent.click(caixa);
    expect(caixa.checked).toBe(true);
  });

  it('ACE-59: sem estado controlado, também nasce desmarcada', () => {
    render(<CaixaSelecao id="x">Aceito</CaixaSelecao>);
    expect((screen.getByRole('checkbox', { name: 'Aceito' }) as HTMLInputElement).checked).toBe(false);
  });

  it('ACE-59: os links do rótulo apontam para os termos e a política, e clicar neles não marca a caixa', () => {
    render(<Termos />);
    const termos = screen.getByRole('link', { name: 'termos de uso' });
    const privacidade = screen.getByRole('link', { name: 'política de privacidade' });
    expect(termos.getAttribute('href')).toBe('/termos');
    expect(privacidade.getAttribute('href')).toBe('/privacidade');
    // O jsdom não navega; o clique no link não pode virar clique na caixa.
    termos.addEventListener('click', (e) => e.preventDefault());
    fireEvent.click(termos);
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
  });

  it('ACE-56: axe sem violação, sem e com erro; o erro fica ligado pela aria-describedby', async () => {
    const { container, rerender } = render(<Termos />);
    await esperarSemViolacoes(container);
    rerender(<Termos erro="Aceite os termos para criar a conta." />);
    const caixa = screen.getByRole('checkbox');
    expect(caixa.getAttribute('aria-invalid')).toBe('true');
    expect(caixa.getAttribute('aria-describedby')).toBe('termos-erro');
    expect(document.getElementById('termos-erro')?.textContent).toBe('Aceite os termos para criar a conta.');
    await esperarSemViolacoes(container);
  });
});

describe('ResumoErros', () => {
  const ERROS = [
    { id: 'email', rotulo: 'E-mail' },
    { id: 'senha', rotulo: 'Senha' },
    { id: 'termos', rotulo: 'Aceite dos termos' },
  ];

  it('ACE-56: lista os erros com o título do mockup, em role="alert", e recebe o foco', () => {
    render(<ResumoErros erros={ERROS} />);
    const resumo = screen.getByRole('alert');
    expect(resumo.textContent).toContain('Corrija 3 campos:');
    expect(screen.getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['#email', '#senha', '#termos']);
    expect(document.activeElement).toBe(resumo);
    expect(resumo.className).toContain('resumo-erros');
  });

  it('ACE-56: o link leva o foco ao campo', () => {
    render(
      <>
        <ResumoErros erros={ERROS.slice(0, 1)} />
        <input id="email" aria-label="E-mail" />
      </>,
    );
    fireEvent.click(screen.getByRole('link', { name: 'E-mail' }));
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'E-mail' }));
  });

  it('sem erros, não renderiza nada', () => {
    const { container } = render(<ResumoErros erros={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('o título concorda com a quantidade', () => {
    expect(tituloDoResumo(1)).toBe('Corrija 1 campo:');
    expect(tituloDoResumo(2)).toBe('Corrija 2 campos:');
  });

  it('ACE-56: axe sem violação', async () => {
    const { container } = render(
      <>
        <ResumoErros erros={ERROS} />
        <input id="email" aria-label="E-mail" />
        <input id="senha" aria-label="Senha" />
        <input id="termos" type="checkbox" aria-label="Aceite dos termos" />
      </>,
    );
    await esperarSemViolacoes(container);
  });
});
