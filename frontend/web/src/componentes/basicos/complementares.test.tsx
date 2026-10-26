import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { violacoes } from '../../../test/apoio/axe';
import { FormaEsqueleto, Esqueleto } from './Esqueleto';
import { Icone, type NomeIcone } from './Icone';
import { SeloSalvo } from './SeloSalvo';
import { ValorDestaque } from './ValorDestaque';

// Critério: FUN-30 (cada componente base tem teste de renderização e axe sem violações).
// Estes quatro componentes não tinham teste próprio de acessibilidade no legado.
const NOMES: NomeIcone[] = [
  'atencao',
  'sucesso',
  'info',
  'fechar',
  'baixar',
  'subir',
  'engrenagem',
  'lista',
  'conta',
  'anterior',
  'cadeado',
  'seguinte',
  'atualizar',
  'erro',
];

describe('Icone (FUN-30)', () => {
  it.each(NOMES)('%s renderiza um svg decorativo, sem violações de acessibilidade', async (nome) => {
    const { container } = render(<Icone nome={nome} tamanho={16} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('width', '16');
    expect(svg?.children.length).toBeGreaterThan(0);
    expect(await violacoes(container)).toEqual([]);
  });
});

describe('SeloSalvo (FUN-30)', () => {
  it('anuncia o texto como status, sem violações', async () => {
    const { container } = render(<SeloSalvo />);
    expect(screen.getByRole('status')).toHaveTextContent('salvo');
    expect(await violacoes(container)).toEqual([]);
  });

  it('aceita outro texto', () => {
    render(<SeloSalvo texto="gravado" />);
    expect(screen.getByRole('status')).toHaveTextContent('gravado');
  });
});

describe('ValorDestaque (FUN-30)', () => {
  it('mostra o valor numa região educada, sem violações', async () => {
    const { container } = render(<ValorDestaque>R$ 10,00</ValorDestaque>);
    const valor = screen.getByText('R$ 10,00');
    expect(valor).toHaveAttribute('aria-live', 'polite');
    expect(await violacoes(container)).toEqual([]);
  });
});

describe('Esqueleto (FUN-30)', () => {
  it('a forma é decorativa e não tem violações', async () => {
    const { container } = render(<FormaEsqueleto variante="linha" quantidade={2} />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('span')).toHaveLength(2);
    expect(await violacoes(container)).toEqual([]);
  });

  it('depois do atraso, o esqueleto visível não tem violações', async () => {
    vi.useFakeTimers();
    const { container } = render(<Esqueleto variante="bloco" />);
    act(() => vi.advanceTimersByTime(300));
    vi.useRealTimers();
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(await violacoes(container)).toEqual([]);
  });
});
