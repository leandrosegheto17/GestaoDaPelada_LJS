// Critério: ACE-58, ACE-60 (mockup t33: página de termos com versão e selo de rascunho)

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { violacoes } from '../../../test/apoio/axe';
import { montarTela } from '../../../test/apoio/tela';
import { PaginaTermos } from './PaginaTermos';

describe('PaginaTermos (t33)', () => {
  it('mostra título, selo de rascunho, a versão de TERMOS_VERSAO e as seções, sem violações do axe', async () => {
    const { container } = montarTela(<PaginaTermos />, '/termos', ['/cadastro']);
    expect(screen.getByRole('heading', { level: 1, name: 'Termos de uso' })).toBeVisible();
    expect(screen.getByText('Rascunho para revisão')).toBeVisible();
    // ACE-58: a versão exibida é uma data AAAA-MM-DD válida (a spec fixa o formato, não compara com a constante).
    const versao = screen.getByText(/^Versão \d{4}-\d{2}-\d{2}$/);
    expect(versao).toBeVisible();
    const data = versao.textContent?.replace('Versão ', '') ?? '';
    expect(new Date(`${data}T00:00:00Z`).toISOString().slice(0, 10)).toBe(data);
    for (const secao of ['O serviço', 'Sua conta', 'Encerramento']) {
      expect(screen.getByRole('heading', { level: 2, name: secao })).toBeVisible();
    }
    expect(screen.getByText(/Você pode excluir sua conta a qualquer momento em Minha conta\./)).toBeVisible();
    expect(await violacoes(container)).toEqual([]);
  });

  it('aberta direto, "Voltar" leva ao cadastro', () => {
    montarTela(<PaginaTermos />, '/termos', ['/cadastro']);
    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute('href', '/cadastro');
  });
});
