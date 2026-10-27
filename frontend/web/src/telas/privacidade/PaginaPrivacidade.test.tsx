// Critério: ACE-58, ACE-60 (mockup t07 novo: versão, selo de rascunho, e-mails, exclusão pela própria conta)

import { TERMOS_VERSAO } from '@pelada/contrato';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { violacoes } from '../../../test/apoio/axe';
import { montarTela } from '../../../test/apoio/tela';
import { PaginaPrivacidade } from './PaginaPrivacidade';

describe('PaginaPrivacidade (t07)', () => {
  it('mostra título, selo, versão e as seções do mockup, sem violações do axe', async () => {
    const { container } = montarTela(<PaginaPrivacidade />, '/privacidade', ['/']);
    expect(screen.getByRole('heading', { level: 1, name: 'Privacidade' })).toBeVisible();
    expect(screen.getByText('Rascunho para revisão')).toBeVisible();
    expect(screen.getByText(`Versão ${TERMOS_VERSAO}`)).toBeVisible();
    for (const secao of ['O que guardamos', 'E-mails', 'Quem vê', 'Como excluir seus dados']) {
      expect(screen.getByRole('heading', { level: 2, name: secao })).toBeVisible();
    }
    expect(await violacoes(container)).toEqual([]);
  });

  it('diz que guarda nome, e-mail e a data de aceite dos termos dos admins', () => {
    montarTela(<PaginaPrivacidade />, '/privacidade', ['/']);
    expect(
      screen.getByText(/Dos admins: nome, e-mail, a senha guardada de um jeito que ninguém consegue ler/),
    ).toBeVisible();
    expect(screen.getByText(/a data em que aceitou estes termos/)).toBeVisible();
  });

  it('explica os e-mails enviados e a exclusão pela própria conta', () => {
    montarTela(<PaginaPrivacidade />, '/privacidade', ['/']);
    expect(
      screen.getByText('Enviamos e-mails só para confirmar a conta, recuperar a senha e entregar convites de admin.'),
    ).toBeVisible();
    expect(screen.getByText(/Admin: em Minha conta, use "Excluir minha conta"/)).toBeVisible();
    expect(screen.getByText(/Jogador: fale com o admin do seu grupo/)).toBeVisible();
  });

  it('aberta direto, "Voltar" leva ao início', () => {
    montarTela(<PaginaPrivacidade />, '/privacidade', ['/']);
    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute('href', '/');
  });
});
