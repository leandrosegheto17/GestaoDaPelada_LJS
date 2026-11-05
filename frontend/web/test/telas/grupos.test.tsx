import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TEXTO_VAZIO, TITULO_VAZIO } from '../../src/telas/grupos/Grupos.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, erroApi, json } from '../apoio/tela.tsx';

const SESSAO_LEANDRO = {
  id: 'c-leandro',
  nome: 'Leandro',
  email: 'leandro@exemplo.com.br',
  grupos: [
    { id: 'g-quinta', nome: 'Pelada de Quinta', slug: 'pelada-de-quinta', acessaFinanceiro: true },
    {
      id: 'g-domingo',
      nome: 'Racha de Domingo',
      slug: 'racha-de-domingo',
      acessaFinanceiro: false,
    },
  ],
};
const SESSAO_SEM_GRUPOS = { ...SESSAO_LEANDRO, grupos: [] };

afterEach(() => {
  cleanup();
});

describe('tela Seus grupos e menu da conta', () => {
  it('ACE-18: os grupos da resposta aparecem com nome e link; axe sem violação', async () => {
    const { container } = abrirTela('/app', { 'GET /api/sessao': () => json(200, SESSAO_LEANDRO) });
    expect(await screen.findByRole('heading', { level: 1, name: 'Seus grupos' })).toBeTruthy();
    const quinta = screen.getByRole('link', { name: /Pelada de Quinta/ });
    expect(quinta.getAttribute('href')).toBe('/app/grupos/g-quinta/admins');
    const domingo = screen.getByRole('link', { name: /Racha de Domingo/ });
    expect(domingo.getAttribute('href')).toBe('/app/grupos/g-domingo/admins');
    expect(within(domingo).getByText('Sem acesso ao financeiro')).toBeTruthy();
    expect(within(quinta).queryByText('Sem acesso ao financeiro')).toBeNull();
    expect(screen.queryByText(TITULO_VAZIO)).toBeNull();
    await esperarSemViolacoes(container);
  });

  it('ACE-57: sem grupos, o estado vazio do t08; axe sem violação', async () => {
    const { container } = abrirTela('/app', {
      'GET /api/sessao': () => json(200, SESSAO_SEM_GRUPOS),
    });
    expect(await screen.findByRole('heading', { level: 2, name: TITULO_VAZIO })).toBeTruthy();
    expect(screen.getByText(TEXTO_VAZIO)).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Seus grupos' })).toBeNull();
    await esperarSemViolacoes(container);
  });

  it('ACE-56: o menu da conta abre a folha com o nome e as opções; axe sem violação', async () => {
    const { container } = abrirTela('/app', { 'GET /api/sessao': () => json(200, SESSAO_LEANDRO) });
    fireEvent.click(await screen.findByRole('button', { name: 'Menu da conta' }));
    const folha = screen.getByRole('dialog', { name: 'Leandro' });
    expect(folha.getAttribute('aria-modal')).toBe('true');
    expect(within(folha).getByRole('link', { name: 'Minha conta' }).getAttribute('href')).toBe(
      '/app/conta',
    );
    expect(within(folha).getByRole('link', { name: 'Privacidade' }).getAttribute('href')).toBe(
      '/privacidade',
    );
    expect(within(folha).getByRole('link', { name: 'Termos de uso' }).getAttribute('href')).toBe(
      '/termos',
    );
    expect(within(folha).getByRole('button', { name: 'Sair' })).toBeTruthy();
    await esperarSemViolacoes(container);
  });

  it('ACE-56: Esc fecha o menu da conta', async () => {
    abrirTela('/app', { 'GET /api/sessao': () => json(200, SESSAO_LEANDRO) });
    fireEvent.click(await screen.findByRole('button', { name: 'Menu da conta' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ACE-17: Sair chama POST /api/sessao/sair e leva a /entrar', async () => {
    let logado = true;
    const { chamadasA, local } = abrirTela('/app', {
      'GET /api/sessao': () => (logado ? json(200, SESSAO_LEANDRO) : erroApi(401, 'sem_sessao')),
      'POST /api/sessao/sair': () => {
        logado = false;
        return json(204);
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Menu da conta' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sair' }));
    await waitFor(() => expect(local()).toBe('/entrar'));
    expect(chamadasA('POST', '/api/sessao/sair')).toHaveLength(1);
    expect(await screen.findByRole('heading', { level: 1, name: 'Entrar' })).toBeTruthy();
  });

  it('ACE-17: Sair sem resposta da API ainda leva a /entrar', async () => {
    let logado = true;
    const { local } = abrirTela('/app', {
      'GET /api/sessao': () => (logado ? json(200, SESSAO_LEANDRO) : erroApi(401, 'sem_sessao')),
      'POST /api/sessao/sair': () => {
        logado = false;
        return erroApi(503, 'email_indisponivel');
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Menu da conta' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sair' }));
    await waitFor(() => expect(local()).toBe('/entrar'));
  });
});
