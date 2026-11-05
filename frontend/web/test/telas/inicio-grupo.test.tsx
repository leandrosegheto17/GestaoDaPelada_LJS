import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  InicioGrupo,
  TEXTO_SEM_JOGADORES,
  textoAdmins,
  textoHabilidades,
  textoJogadores,
} from '../../src/telas/grupo/InicioGrupo.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, erroApi, json, pendente, SESSAO_ANA, type Manipulador } from '../apoio/tela.tsx';

/**
 * Início do grupo (T60; GEL-20, GEL-114), de `t09-inicio--sucesso.html` e `t09-inicio--sem-jogadores.html` do
 * mockup do módulo. A rota entra no app na T69.
 */

const rotas = () => [
  { path: '/app/grupos/:grupoId', element: <InicioGrupo /> },
  { path: '*', element: <p>destino</p> },
];

const QUINTA = {
  id: 'g-quinta',
  nome: 'Pelada de Quinta',
  slug: 'pelada-de-quinta',
  linkPublico: 'https://exemplo.test/g/pelada-de-quinta',
  diaSemana: 'quinta',
  frequencia: 'semanal',
  horario: '20:00',
  jogadoresAtivos: 20,
  habilidades: 6,
  admins: 1,
  souCriador: true,
};

function abrir(api: Record<string, Manipulador>, caminho = '/app/grupos/g-quinta') {
  return abrirTela(caminho, { 'GET /api/sessao': () => json(200, SESSAO_ANA), ...api }, rotas);
}

afterEach(() => {
  cleanup();
});

describe('textos das contagens', () => {
  it('singular, plural e zero', () => {
    expect(textoJogadores(20)).toBe('20 ativos');
    expect(textoJogadores(1)).toBe('1 ativo');
    expect(textoJogadores(0)).toBe('Nenhum cadastrado');
    expect(textoHabilidades(6)).toBe('6 habilidades');
    expect(textoHabilidades(1)).toBe('1 habilidade');
    expect(textoHabilidades(0)).toBe('Nenhuma habilidade');
    expect(textoAdmins(1)).toBe('1 admin');
    expect(textoAdmins(2)).toBe('2 admins');
  });
});

describe('tela Início do grupo (t09)', () => {
  it('GEL-20: mostra o nome e as contagens do GET /api/grupos/:grupoId, sem Pontuação; axe sem violação', async () => {
    const { container } = abrir({ 'GET /api/grupos/g-quinta': () => json(200, QUINTA) });
    expect(await screen.findByRole('heading', { level: 1, name: 'Início do admin: Pelada de Quinta' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Trocar grupo' }).getAttribute('href')).toBe('/app');

    const lista = screen.getByRole('list', { name: 'Gerenciar' });
    const itens = within(lista).getAllByRole('link');
    expect(itens.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Jogadores20 ativos', '/app/grupos/g-quinta/jogadores'],
      ['Habilidades6 habilidades', '/app/grupos/g-quinta/habilidades'],
      ['Admins1 admin', '/app/grupos/g-quinta/admins'],
      ['Dados do grupoToda quinta · 20:00 · link do ranking', '/app/grupos/g-quinta/dados'],
    ]);
    expect(screen.queryByText('Pontuação')).toBeNull();
    expect(screen.queryByText(TEXTO_SEM_JOGADORES)).toBeNull();
    await esperarSemViolacoes(container);
  });

  it('GEL-20: as contagens seguem a resposta (outros números)', async () => {
    abrir({
      'GET /api/grupos/g-quinta': () => json(200, { ...QUINTA, jogadoresAtivos: 1, habilidades: 2, admins: 3 }),
    });
    const lista = await screen.findByRole('list', { name: 'Gerenciar' });
    expect(within(lista).getByText('1 ativo')).toBeTruthy();
    expect(within(lista).getByText('2 habilidades')).toBeTruthy();
    expect(within(lista).getByText('3 admins')).toBeTruthy();
  });

  it('GEL-114: sem jogadores, o Dia de jogo pede o cadastro; axe sem violação', async () => {
    const { container } = abrir({
      'GET /api/grupos/g-domingo': () =>
        json(200, {
          ...QUINTA,
          id: 'g-domingo',
          nome: 'Racha de Domingo',
          diaSemana: 'domingo',
          frequencia: 'quinzenal',
          horario: '09:00',
          jogadoresAtivos: 0,
          admins: 2,
        }),
    }, '/app/grupos/g-domingo');
    const dia = await screen.findByRole('region', { name: 'Dia de jogo' });
    expect(within(dia).getByText(TEXTO_SEM_JOGADORES)).toBeTruthy();
    expect(within(dia).getByRole('link', { name: 'Cadastrar jogadores' }).getAttribute('href')).toBe(
      '/app/grupos/g-domingo/jogadores/novo',
    );
    const lista = screen.getByRole('list', { name: 'Gerenciar' });
    expect(within(lista).getByText('Nenhum cadastrado')).toBeTruthy();
    expect(within(lista).getByText('Domingo, quinzenal · 09:00 · link do ranking')).toBeTruthy();
    await esperarSemViolacoes(container);
  });

  it('GEL-114: carregando e erro com "Tentar de novo"; axe sem violação', async () => {
    const carregando = abrir({ 'GET /api/grupos/g-quinta': () => pendente() });
    expect(await screen.findByText('Carregando…')).toBeTruthy();
    await esperarSemViolacoes(carregando.container);
    cleanup();

    let falhar = true;
    const { container } = abrir({
      'GET /api/grupos/g-quinta': () => (falhar ? erroApi(503, 'email_indisponivel') : json(200, QUINTA)),
    });
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeTruthy();
    await esperarSemViolacoes(container);
    falhar = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('list', { name: 'Gerenciar' })).toBeTruthy();
  });

  it('GEL-21: grupo sem vínculo (404) mostra "Grupo não encontrado."', async () => {
    abrir({ 'GET /api/grupos/g-quinta': () => erroApi(404, 'nao_encontrado') });
    expect(await screen.findByText('Grupo não encontrado.')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Gerenciar' })).toBeNull();
  });
});
