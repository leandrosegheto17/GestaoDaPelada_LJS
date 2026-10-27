// Critério: ACE-58, ACE-60 (mockup t33: página de termos com versão e selo de rascunho)

import { TERMOS_VERSAO } from '@pelada/contrato';
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
    expect(screen.getByText(`Versão ${TERMOS_VERSAO}`)).toBeVisible();
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
