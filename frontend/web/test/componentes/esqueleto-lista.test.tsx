import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EsqueletoLista, LINHAS_PADRAO } from '../../src/componentes/EsqueletoLista.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';

afterEach(() => {
  cleanup();
});

const linhas = (c: HTMLElement) => c.querySelectorAll('.esqueleto--bloco').length;

describe('EsqueletoLista', () => {
  it('FUN-31: renderiza o número de linhas pedido e aria-busy="true"', () => {
    const { container } = render(<EsqueletoLista linhas={4} />);
    expect(linhas(container)).toBe(4);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('FUN-31: sem o número, usa o padrão do mockup (6 linhas)', () => {
    const { container } = render(<EsqueletoLista />);
    expect(LINHAS_PADRAO).toBe(6);
    expect(linhas(container)).toBe(6);
  });

  it('FUN-31: zero ou valor negativo não quebra e não desenha linhas', () => {
    const { container, rerender } = render(<EsqueletoLista linhas={0} />);
    expect(linhas(container)).toBe(0);
    rerender(<EsqueletoLista linhas={-3} />);
    expect(linhas(container)).toBe(0);
  });

  it('FUN-31: o leitor de tela ouve "Carregando…" e as linhas ficam escondidas dele', () => {
    const { container } = render(<EsqueletoLista />);
    expect(screen.getByRole('status').textContent).toBe('Carregando…');
    expect(container.querySelector('.lista')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('FUN-31: com prefers-reduced-motion, o esqueleto não anima', () => {
    const css = readFileSync(join(import.meta.dirname, '../../src/componentes/EsqueletoLista.module.css'), 'utf8');
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.esqueleto\s*\{\s*animation: none;/);
  });

  it('FUN-31: axe sem violações', async () => {
    const { container } = render(<EsqueletoLista />);
    await esperarSemViolacoes(container);
  });
});
