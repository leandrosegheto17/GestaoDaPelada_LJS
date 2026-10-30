// Critério: T61 (GEL-46 a GEL-49, GEL-114): "Ativos (2) Inativos (1)", busca sem acento, ordem por apelido sem
// acento e sem caixa, vazios com "Novo jogador" / "Nenhum jogador inativo.", axe sem violação (mockup t15).

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { violacoes } from '../../../test/apoio/axe';
import { json, montarTelaEm, simularApi } from '../../../test/apoio/tela';
import { Jogadores } from './Jogadores';

afterEach(() => vi.unstubAllGlobals());

const GRUPO = {
  id: 'g1',
  nome: 'Pelada de Quinta',
  slug: 'quinta',
  diaSemana: 'quinta',
  frequencia: 'semanal',
  horario: '20:00',
  linkPublico: 'https://app.invalid/g/quinta',
  jogadoresAtivos: 2,
  habilidades: 6,
  admins: 1,
  souCriador: true,
};
const item = (id: string, apelido: string, extra: object = {}) => ({
  id,
  apelido,
  posicao: 'meia',
  situacao: 'ativo',
  desde: '2026-10-01',
  nivel: 683,
  semNota: false,
  ...extra,
});
const TRES = [
  item('j1', 'Zé Carlos', { posicao: 'zagueiro' }),
  item('j2', 'José'),
  item('j3', 'ana', { situacao: 'inativo', semNota: true, nivel: 550 }),
];

function api(jogadores: unknown[]) {
  return simularApi((url) => {
    if (url.endsWith('/jogadores')) return json({ jogadores });
    return json(GRUPO);
  });
}
const abrir = () =>
  montarTelaEm(<Jogadores />, '/app/grupos/:grupoId/jogadores', '/app/grupos/g1/jogadores', ['/app', '/app/grupos/g1']);

describe('Jogadores: lista (GEL-46 a GEL-48)', () => {
  it('com 3 jogadores (1 inativo) mostra "Ativos (2)" e "Inativos (1)", nível e posição, sem violações do axe', async () => {
    api(TRES);
    const { container } = abrir();
    expect(await screen.findByRole('radio', { name: 'Ativos (2)' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Inativos (1)' })).not.toBeChecked();
    expect(screen.getByRole('heading', { level: 1, name: 'Jogadores' })).toBeVisible();
    expect(screen.getByText('Zagueiro · nível 6,8')).toBeVisible();
    expect(screen.getByRole('link', { name: /José/ })).toHaveAttribute('href', '/app/grupos/g1/jogadores/j2');
    expect(screen.getByRole('link', { name: /Início/ })).toHaveAttribute('href', '/app/grupos/g1');
    expect(screen.getByRole('link', { name: 'Novo jogador' })).toHaveAttribute('href', '/app/grupos/g1/jogadores/novo');
    expect(await violacoes(container)).toEqual([]);
  });

  it('buscar "jose" acha "José" e esconde os outros', async () => {
    api(TRES);
    abrir();
    const u = userEvent.setup();
    await u.type(await screen.findByRole('searchbox', { name: 'Buscar jogador' }), 'jose');
    expect(screen.getByRole('link', { name: /José/ })).toBeVisible();
    expect(screen.queryByRole('link', { name: /Zé Carlos/ })).toBeNull();
  });

  it('ordena por apelido sem acento e sem caixa; inativos mostram o selo "sem nota" quando faltam notas', async () => {
    api([item('j1', 'Beto'), item('j2', 'álvaro'), item('j3', 'Carlos'), item('j4', 'Dedé', { semNota: true })]);
    abrir();
    await screen.findByRole('link', { name: /Beto/ });
    const nomes = within(screen.getByRole('list'))
      .getAllByRole('link')
      .map((l) => l.querySelector('span span')?.textContent);
    expect(nomes).toEqual(['álvaro', 'Beto', 'Carlos', 'Dedé']);
    expect(screen.getByText('sem nota')).toBeVisible();
  });

  it('o filtro "Inativos" lista só os inativos', async () => {
    api(TRES);
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('radio', { name: 'Inativos (1)' }));
    expect(screen.getByRole('link', { name: /ana/ })).toBeVisible();
    expect(screen.queryByRole('link', { name: /José/ })).toBeNull();
  });
});

describe('Jogadores: vazios (GEL-49, t15 vazio e vazio-inativos)', () => {
  it('sem ativos mostra "Nenhum jogador cadastrado." com a ação "Novo jogador"', async () => {
    api([]);
    const { container } = abrir();
    expect(await screen.findByRole('heading', { level: 2, name: 'Nenhum jogador cadastrado.' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Novo jogador' })).toBeVisible();
    expect(await violacoes(container)).toEqual([]);
  });

  it('inativos vazio mostra "Nenhum jogador inativo."', async () => {
    api([item('j1', 'José')]);
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('radio', { name: 'Inativos (0)' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Nenhum jogador inativo.' })).toBeVisible();
  });
});

describe('Jogadores: carregando e erro (GEL-114)', () => {
  it('erro de rede mostra a mensagem e "Tentar de novo"', async () => {
    simularApi((url) => (url.endsWith('/jogadores') ? (Promise.reject(new TypeError('x')) as never) : json(GRUPO)));
    abrir();
    expect(await screen.findByRole('button', { name: /Tentar de novo/ })).toBeVisible();
  });
});
