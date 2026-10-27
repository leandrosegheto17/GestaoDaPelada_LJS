// Critério: ACE-28 (mockup t32 excluída: a tela de entrada volta a / com "Sua conta foi excluída")

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { violacoes } from '../../test/apoio/axe';
import { montarTela } from '../../test/apoio/tela';
import { PaginaProvisoria } from './PaginaProvisoria';

describe('PaginaProvisoria: aviso de conta excluída', () => {
  it('com ?aviso=conta-excluida mostra "Sua conta foi excluída."', async () => {
    const { container } = montarTela(<PaginaProvisoria />, '/?aviso=conta-excluida', []);
    expect(screen.getByText('Sua conta foi excluída.')).toBeVisible();
    expect(await violacoes(container)).toEqual([]);
  });

  it('sem o aviso, não mostra a faixa', () => {
    montarTela(<PaginaProvisoria />, '/', []);
    expect(screen.queryByText('Sua conta foi excluída.')).toBeNull();
  });

  it('aviso desconhecido é ignorado', () => {
    montarTela(<PaginaProvisoria />, '/?aviso=qualquer', []);
    expect(screen.queryByText('Sua conta foi excluída.')).toBeNull();
  });
});
