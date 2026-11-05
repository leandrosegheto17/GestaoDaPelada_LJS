import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Jogadores, TEXTO_SEM_ATIVOS, TEXTO_SEM_INATIVOS } from '../../src/telas/jogadores/Jogadores.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, json, pendente, SESSAO_ANA, type Manipulador } from '../apoio/tela.tsx';

/**
 * Jogadores (T62; GEL-46 a GEL-49, GEL-103, GEL-114), de `.specs/mockup/telas/t15-jogadores--*.html`. A rota entra
 * no app na T69.
 */

const rotas = () => [
  { path: '/app/grupos/:grupoId/jogadores', element: <Jogadores /> },
  { path: '*', element: <p>destino</p> },
];

function jogador(id: string, apelido: string, extra: Record<string, unknown> = {}) {
  return { id, apelido, posicao: 'meia', situacao: 'ativo', desde: '2026-01-10', nivel: 683, semNota: false, ...extra };
}

const LISTA = {
  jogadores: [
    jogador('j-ze', 'Zé Carlos', { posicao: 'zagueiro', nivel: 600 }),
    jogador('j-jose', 'José', { posicao: 'atacante', nivel: 685 }),
    jogador('j-alemao', 'alemão', { posicao: 'zagueiro', nivel: 610 }),
    jogador('j-leo', 'Léo Baiano', { semNota: true, nivel: 550 }),
    jogador('j-toninho', 'Toninho', { situacao: 'inativo', desde: '2026-09-01' }),
  ],
};

function abrir(api: Record<string, Manipulador>) {
  return abrirTela(
    '/app/grupos/g-quinta/jogadores',
    { 'GET /api/sessao': () => json(200, SESSAO_ANA), ...api },
    rotas,
  );
}

afterEach(() => {
  cleanup();
});

describe('tela Jogadores (t15)', () => {
  it('GEL-47: abas com a contagem, ativos na ordem sem acento e sem caixa; axe sem violação', async () => {
    const { container } = abrir({ 'GET /api/grupos/g-quinta/jogadores': () => json(200, LISTA) });
    const ativos = await screen.findByRole('tab', { name: 'Ativos (4)' });
    expect(ativos.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Inativos (1)' }).getAttribute('aria-selected')).toBe('false');
    const lista = screen.getByRole('list', { name: 'Jogadores ativos' });
    expect(within(lista).getAllByRole('link').map((a) => a.querySelector('[class*="item__titulo"]')?.textContent)).toEqual([
      'alemão',
      'José',
      'Léo Baiano',
      'Zé Carlos',
    ]);
    expect(within(lista).queryByText('Toninho')).toBeNull();
    await esperarSemViolacoes(container);
  });

  it('GEL-46, GEL-103: cada jogador com a posição e o nível de uma casa; sem nota, o selo; link para a ficha', async () => {
    abrir({ 'GET /api/grupos/g-quinta/jogadores': () => json(200, LISTA) });
    const lista = await screen.findByRole('list', { name: 'Jogadores ativos' });
    const jose = within(lista).getByRole('link', { name: /José/ });
    expect(within(jose).getByText('Atacante · nível 6,9')).toBeTruthy();
    expect(jose.getAttribute('href')).toBe('/app/grupos/g-quinta/jogadores/j-jose');
    const leo = within(lista).getByRole('link', { name: /Léo Baiano/ });
    expect(within(leo).getByText('Meia')).toBeTruthy();
    expect(within(leo).getByText('sem nota')).toBeTruthy();
    expect(within(leo).queryByText(/nível/)).toBeNull();
  });

  it('GEL-47: a aba Inativos mostra só os inativos', async () => {
    abrir({ 'GET /api/grupos/g-quinta/jogadores': () => json(200, LISTA) });
    fireEvent.click(await screen.findByRole('tab', { name: 'Inativos (1)' }));
    const lista = screen.getByRole('list', { name: 'Jogadores inativos' });
    expect(within(lista).getAllByRole('link')).toHaveLength(1);
    expect(within(lista).getByText('Toninho')).toBeTruthy();
  });

  it('GEL-48: buscar "jose" acha "José", sem acento e sem caixa; "ALEM" acha "alemão"', async () => {
    abrir({ 'GET /api/grupos/g-quinta/jogadores': () => json(200, LISTA) });
    const busca = await screen.findByRole('searchbox', { name: 'Buscar jogador' });
    fireEvent.change(busca, { target: { value: 'jose' } });
    let lista = screen.getByRole('list', { name: 'Jogadores ativos' });
    expect(within(lista).getAllByRole('link').map((a) => a.querySelector('[class*="item__titulo"]')?.textContent)).toEqual(['José']);
    fireEvent.change(busca, { target: { value: 'ALEM' } });
    lista = screen.getByRole('list', { name: 'Jogadores ativos' });
    expect(within(lista).getAllByRole('link').map((a) => a.querySelector('[class*="item__titulo"]')?.textContent)).toEqual(['alemão']);
  });

  it('GEL-49: sem ativos, "Nenhum jogador cadastrado." com "Novo jogador"; axe sem violação', async () => {
    const { container } = abrir({ 'GET /api/grupos/g-quinta/jogadores': () => json(200, { jogadores: [] }) });
    expect(await screen.findByRole('heading', { level: 2, name: TEXTO_SEM_ATIVOS })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Ativos (0)' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Inativos (0)' })).toBeTruthy();
    const novos = screen.getAllByRole('link', { name: 'Novo jogador' });
    expect(novos).toHaveLength(1);
    expect(novos[0]?.getAttribute('href')).toBe('/app/grupos/g-quinta/jogadores/novo');
    expect(screen.queryByRole('searchbox')).toBeNull();
    await esperarSemViolacoes(container);
  });

  it('GEL-49: sem inativos, "Nenhum jogador inativo."; axe sem violação', async () => {
    const { container } = abrir({
      'GET /api/grupos/g-quinta/jogadores': () => json(200, { jogadores: LISTA.jogadores.filter((j) => j.situacao === 'ativo') }),
    });
    fireEvent.click(await screen.findByRole('tab', { name: 'Inativos (0)' }));
    expect(screen.getByRole('heading', { level: 2, name: TEXTO_SEM_INATIVOS })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Novo jogador' })).toBeTruthy();
    await esperarSemViolacoes(container);
  });

  it('GEL-114: carregando; axe sem violação', async () => {
    const { container } = abrir({ 'GET /api/grupos/g-quinta/jogadores': () => pendente() });
    expect(await screen.findByText('Carregando…')).toBeTruthy();
    await esperarSemViolacoes(container);
  });
});
