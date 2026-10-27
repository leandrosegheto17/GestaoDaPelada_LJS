// Critério: ACE-18, ACE-57 (mockup t08 vazio e sucesso; t09 menu da conta)

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { violacoes } from '../../../test/apoio/axe';
import { json, montarTela, simularApi } from '../../../test/apoio/tela';
import { SeusGrupos } from './SeusGrupos';

afterEach(() => vi.unstubAllGlobals());

const EU_SEM_GRUPOS = { id: 'c1', nome: 'Leandro', email: 'leandro@exemplo.com.br', grupos: [] };
const EU_COM_GRUPOS = {
  ...EU_SEM_GRUPOS,
  grupos: [
    { id: 'g1', nome: 'Pelada de Quinta', slug: 'quinta', acessaFinanceiro: true },
    { id: 'g2', nome: 'Racha de Domingo', slug: 'domingo', acessaFinanceiro: false },
  ],
};

describe('SeusGrupos: estado vazio (ACE-57, t08)', () => {
  it('sem vínculos mostra "Nenhum grupo ainda" e a explicação, sem violações do axe', async () => {
    simularApi(() => json(EU_SEM_GRUPOS));
    const { container } = montarTela(<SeusGrupos />, '/app');
    expect(await screen.findByRole('heading', { level: 2, name: 'Nenhum grupo ainda' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Seus grupos' })).toBeVisible();
    expect(screen.getByText('Quando um admin convidar você, o grupo aparece aqui.')).toBeVisible();
    expect(screen.queryByRole('list')).toBeNull();
    expect(await violacoes(container)).toEqual([]);
  });
});

describe('SeusGrupos: lista (ACE-18, t08)', () => {
  it('lista os grupos como links e marca "Sem acesso ao financeiro" só onde falta', async () => {
    simularApi(() => json(EU_COM_GRUPOS));
    const { container } = montarTela(<SeusGrupos />, '/app');
    const lista = await screen.findByRole('list');
    const itens = within(lista).getAllByRole('listitem');
    expect(itens).toHaveLength(2);
    expect(within(itens[0]!).getByRole('link', { name: /Pelada de Quinta/ })).toHaveAttribute(
      'href',
      '/app/grupos/g1/admins',
    );
    expect(within(itens[0]!).queryByText('Sem acesso ao financeiro')).toBeNull();
    expect(within(itens[1]!).getByRole('link', { name: /Racha de Domingo/ })).toBeVisible();
    expect(within(itens[1]!).getByText('Sem acesso ao financeiro')).toBeVisible();
    expect(screen.queryByText('Nenhum grupo ainda')).toBeNull();
    expect(await violacoes(container)).toEqual([]);
  });

  it('falha ao carregar mostra o erro de rede com "Tentar de novo"', async () => {
    let chamadas = 0;
    simularApi(() => {
      chamadas += 1;
      if (chamadas <= 2) throw new TypeError('rede');
      return json(EU_COM_GRUPOS);
    });
    montarTela(<SeusGrupos />, '/app');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Tentar de novo' }, { timeout: 3000 }));
    expect(await screen.findByRole('link', { name: /Pelada de Quinta/ })).toBeVisible();
  });
});

describe('SeusGrupos: menu da conta (t09)', () => {
  it('o botão abre a folha com o nome da pessoa e as quatro opções', async () => {
    simularApi(() => json(EU_COM_GRUPOS));
    const { container } = montarTela(<SeusGrupos />, '/app');
    const u = userEvent.setup();
    await screen.findByRole('list');
    await u.click(screen.getByRole('button', { name: 'Menu da conta' }));
    const folha = screen.getByRole('dialog', { name: 'Leandro' });
    expect(within(folha).getByRole('link', { name: 'Minha conta' })).toHaveAttribute('href', '/app/conta');
    expect(within(folha).getByRole('link', { name: 'Privacidade' })).toHaveAttribute('href', '/privacidade');
    expect(within(folha).getByRole('link', { name: 'Termos de uso' })).toHaveAttribute('href', '/termos');
    expect(within(folha).getByRole('button', { name: 'Sair' })).toBeVisible();
    expect(within(folha).queryByText('Área do dono')).toBeNull();
    expect(await violacoes(container.ownerDocument.body)).toEqual([]);
  });

  it('Sair encerra a sessão (POST /api/sessao/sair) e leva a /entrar', async () => {
    const f = simularApi((url, init) =>
      url.endsWith('/api/sessao/sair') && init?.method === 'POST'
        ? new Response(null, { status: 204 })
        : json(EU_COM_GRUPOS),
    );
    const { roteador } = montarTela(<SeusGrupos />, '/app');
    const u = userEvent.setup();
    await screen.findByRole('list');
    await u.click(screen.getByRole('button', { name: 'Menu da conta' }));
    await u.click(screen.getByRole('button', { name: 'Sair' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/entrar'));
    expect(f.mock.calls.some(([url]) => String(url).endsWith('/api/sessao/sair'))).toBe(true);
  });

  it('Esc fecha a folha', async () => {
    simularApi(() => json(EU_COM_GRUPOS));
    montarTela(<SeusGrupos />, '/app');
    const u = userEvent.setup();
    await screen.findByRole('list');
    await u.click(screen.getByRole('button', { name: 'Menu da conta' }));
    await u.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
