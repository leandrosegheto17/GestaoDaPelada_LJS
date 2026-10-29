// Critério: T59 (GEL-20, GEL-114): mockup t09 sucesso ("6 habilidades", "1 admin") e sem jogadores; sem o item
// "Pontuação"; links para jogadores, habilidades, admins e dados do grupo.

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { violacoes } from '../../../test/apoio/axe';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { criarClienteConsultas } from '../../dados/consultas';
import { json, simularApi } from '../../../test/apoio/tela';
import { InicioDoGrupo } from './InicioDoGrupo';

afterEach(() => vi.unstubAllGlobals());

const EU = { id: 'c1', nome: 'Leandro', email: 'leandro@exemplo.com.br', grupos: [] };
const GRUPO = {
  id: 'g1',
  nome: 'Pelada de Quinta',
  slug: 'pelada-de-quinta',
  linkPublico: 'https://app.invalid/g/pelada-de-quinta',
  diaSemana: 'quinta',
  frequencia: 'semanal',
  horario: '20:00',
  jogadoresAtivos: 20,
  habilidades: 6,
  admins: 1,
  souCriador: true,
};
const JOGADOR = {
  id: 'j1',
  apelido: 'Toninho',
  posicao: 'meia',
  situacao: 'inativo',
  desde: '2026-10-01',
  nivel: 550,
  semNota: true,
};

function api(grupo: unknown, jogadores: unknown[]) {
  return simularApi((url) => {
    if (url.endsWith('/api/grupos/g1')) return json(grupo);
    if (url.endsWith('/api/grupos/g1/jogadores')) return json({ jogadores });
    return json(EU);
  });
}

function abrir() {
  const roteador = createMemoryRouter([{ path: '/app/grupos/:grupoId', element: <InicioDoGrupo /> }], {
    initialEntries: ['/app/grupos/g1'],
  });
  return render(
    <QueryClientProvider client={criarClienteConsultas({ aoSessaoExpirada: () => undefined })}>
      <RouterProvider router={roteador} />
    </QueryClientProvider>,
  );
}

/** Os itens de "Gerenciar": texto e destino. */
async function itens() {
  const lista = await screen.findByRole('list');
  return within(lista)
    .getAllByRole('link')
    .map((l) => ({ texto: l.textContent, href: l.getAttribute('href') }));
}

describe('InicioDoGrupo: sucesso (t09)', () => {
  it('mostra os atalhos com as contagens e os destinos, sem "Pontuação", sem violações do axe', async () => {
    api(GRUPO, [JOGADOR]);
    const { container } = abrir();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Início do admin: Pelada de Quinta' }),
    ).toBeInTheDocument();
    expect(await itens()).toEqual([
      { texto: 'Jogadores20 ativos', href: '/app/grupos/g1/jogadores' },
      { texto: 'Habilidades6 habilidades', href: '/app/grupos/g1/habilidades' },
      { texto: 'Admins1 admin', href: '/app/grupos/g1/admins' },
      { texto: 'Dados do grupoToda quinta · 20:00 · link do ranking', href: '/app/grupos/g1/dados' },
    ]);
    expect(screen.queryByText('Pontuação')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Gerenciar' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Dia de jogo' })).toBeNull();
    expect(await violacoes(container)).toEqual([]);
  });

  it('a barra traz o nome do grupo, "Trocar grupo" e o atalho do ranking público pelo slug', async () => {
    api(GRUPO, [JOGADOR]);
    abrir();
    expect(await screen.findByText('Pelada de Quinta')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Trocar grupo' })).toHaveAttribute('href', '/app');
    expect(screen.getByRole('link', { name: 'Ver ranking' })).toHaveAttribute('href', '/g/pelada-de-quinta');
  });

  it('plural certo: 2 admins, 1 habilidade, 1 ativo', async () => {
    api({ ...GRUPO, admins: 2, habilidades: 1, jogadoresAtivos: 1 }, [JOGADOR]);
    abrir();
    await screen.findByText('2 admins');
    const textos = (await itens()).map((i) => i.texto);
    expect(textos).toContain('Jogadores1 ativo');
    expect(textos).toContain('Habilidades1 habilidade');
    expect(textos).toContain('Admins2 admins');
  });

  it('com jogadores cadastrados e nenhum ativo, "Nenhum ativo"', async () => {
    api({ ...GRUPO, jogadoresAtivos: 0 }, [JOGADOR]);
    abrir();
    await screen.findByText('Nenhum ativo');
    expect(screen.queryByRole('heading', { name: 'Dia de jogo' })).toBeNull();
  });
});

describe('InicioDoGrupo: sem jogadores (t09)', () => {
  it('"Dia de jogo" pede o cadastro e leva a novo jogador; Jogadores mostra "Nenhum cadastrado"', async () => {
    api({ ...GRUPO, nome: 'Racha de Domingo', jogadoresAtivos: 0, admins: 2 }, []);
    const { container } = abrir();
    const dia = await screen.findByRole('region', { name: 'Dia de jogo' });
    expect(within(dia).getByText('Cadastre os jogadores para lançar partidas.')).toBeVisible();
    expect(within(dia).getByRole('link', { name: 'Cadastrar jogadores' })).toHaveAttribute(
      'href',
      '/app/grupos/g1/jogadores/novo',
    );
    expect(screen.getByText('Nenhum cadastrado')).toBeVisible();
    expect(screen.queryByText('Pontuação')).toBeNull();
    expect(await violacoes(container)).toEqual([]);
  });
});

describe('InicioDoGrupo: carregando e erro', () => {
  it('carregando: "Carregando…" e a página ocupada', async () => {
    simularApi(() => new Promise<Response>(() => undefined));
    abrir();
    expect(await screen.findByRole('status')).toHaveTextContent('Carregando…');
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
  });

  it('erro: "Tentar de novo" carrega de novo', async () => {
    let falhas = 0;
    simularApi((url) => {
      if (url.endsWith('/api/grupos/g1')) {
        falhas += 1;
        if (falhas <= 2) throw new TypeError('rede');
        return json(GRUPO);
      }
      if (url.endsWith('/api/grupos/g1/jogadores')) return json({ jogadores: [JOGADOR] });
      return json(EU);
    });
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Tentar de novo' }, { timeout: 3000 }));
    expect(await screen.findByRole('link', { name: /Habilidades/ })).toBeVisible();
  });
});
