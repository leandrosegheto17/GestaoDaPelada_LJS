import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { AvisoRecursoPro } from '../../src/componentes/AvisoRecursoPro.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';

/** Aviso de recurso Pro (planos-e-cobranca T42; PLA-27). */

afterEach(() => {
  cleanup();
});

function montar(recurso: 'simulador' | 'financeiro' | 'pdf' | 'push' = 'simulador') {
  return render(
    <MemoryRouter>
      <AvisoRecursoPro recurso={recurso} grupoId="g-1" />
    </MemoryRouter>,
  );
}

describe('AvisoRecursoPro', () => {
  it('PLA-27: mostra o recurso, o preço "R$ 9,90/mês" e o botão para Meu plano', () => {
    montar('simulador');
    expect(screen.getByRole('heading', { level: 2, name: 'Simulador de times' })).toBeDefined();
    expect(screen.getByText('Disponível no plano Pro: R$ 9,90/mês')).toBeDefined();
    const botao = screen.getByRole('link', { name: 'Ver Meu plano' });
    expect(botao.getAttribute('href')).toBe('/app/grupos/g-1/plano');
  });

  it('PLA-27: o nome muda com o recurso', () => {
    montar('financeiro');
    expect(screen.getByRole('heading', { level: 2, name: 'Financeiro' })).toBeDefined();
  });

  it('PLA-27: o botão tem a aparência de botão principal do guia', () => {
    montar();
    expect(screen.getByRole('link', { name: 'Ver Meu plano' }).className).toContain(
      'botao--principal',
    );
  });

  it('PLA-27: axe sem violações', async () => {
    const { container } = montar();
    await esperarSemViolacoes(container);
  });
});
