// Critério: T63 (GEL-41, GEL-97, GEL-103, GEL-114): mockup t16 edição, carregando e erro; dar 8, 7, 6, 7, 8 e 5 mostra
// "Nível 6,8"; apagar todas mostra "sem nota"; jogador inativo ainda edita notas; sem habilidades, o vazio do mockup.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { violacoes } from '../../../test/apoio/axe';
import { corpoEnviado, erroApi, json, montarTelaEm, simularApi } from '../../../test/apoio/tela';
import { FichaJogador } from './FichaJogador';

afterEach(() => vi.unstubAllGlobals());

const GRUPO = {
  id: 'g1',
  nome: 'Pelada de Quinta',
  slug: 'quinta',
  diaSemana: 'quinta',
  frequencia: 'semanal',
  horario: '20:00',
  linkPublico: 'https://app.invalid/g/quinta',
  jogadoresAtivos: 1,
  habilidades: 6,
  admins: 1,
  souCriador: true,
};
const HABILIDADES = ['Visão de Jogo', 'Passe', 'Preparo Físico', 'Drible', 'Chute', 'Desarme'];
interface NotaFicha {
  habilidadeId: string;
  habilidade: string;
  nota: number | null;
}
type Notas = NotaFicha[];
const notasVazias = (): Notas => HABILIDADES.map((h, i) => ({ habilidadeId: `h${i + 1}`, habilidade: h, nota: null }));

const detalhe = (notas: Notas, extra: object = {}) => {
  const dadas = notas.filter((n) => n.nota !== null).map((n) => n.nota as number);
  const media = dadas.length > 0 ? dadas.reduce((a, b) => a + b, 0) / dadas.length : 5.5;
  return {
    id: 'j1',
    apelido: 'Toninho',
    posicao: 'atacante',
    situacao: 'ativo',
    desde: '2026-02-05',
    nivel: Math.round(media * 100),
    semNota: dadas.length === 0,
    anoNascimento: 1978,
    telefone: '11987654321',
    pontuacaoInicial: 0,
    inicioPontuacao: '2026-02-05',
    periodos: [{ id: 'p1', inicio: '2026-02-05', fim: null }],
    notas,
    ...extra,
  };
};

/** Servidor de mentira com estado: a nota gravada volta na ficha e o nível é a média (como a API). */
function api(inicial: Notas = notasVazias(), extra: object = {}, aoEditar?: () => Response) {
  let notas = inicial;
  return simularApi((url, init) => {
    const nota = /\/notas\/(h\d+)$/.exec(url);
    if (nota && init?.method === 'PUT') {
      const corpo = JSON.parse(String(init.body)) as { nota: number | null };
      notas = notas.map((n) => (n.habilidadeId === nota[1] ? { ...n, nota: corpo.nota } : n));
      const { nivel, semNota } = detalhe(notas);
      return json({ nivel, semNota });
    }
    if (url.endsWith('/jogadores/j1') && init?.method === 'PATCH')
      return aoEditar ? aoEditar() : json(detalhe(notas, extra));
    if (url.endsWith('/jogadores/j1')) return json(detalhe(notas, extra));
    return json(GRUPO);
  });
}

const abrir = () =>
  montarTelaEm(<FichaJogador />, '/app/grupos/:grupoId/jogadores/:jogadorId', '/app/grupos/g1/jogadores/j1');

describe('FichaJogador: edição (t16 edição, GEL-41)', () => {
  it('mostra os dados do jogador, a data de início e as seis habilidades, sem violações do axe', async () => {
    api();
    const { container } = abrir();
    expect(await screen.findByRole('heading', { level: 1, name: 'Toninho' })).toBeVisible();
    expect(screen.getByRole('link', { name: /Jogadores/ })).toHaveAttribute('href', '/app/grupos/g1/jogadores');
    expect(screen.getByLabelText('Apelido')).toHaveValue('Toninho');
    expect(screen.getByLabelText('Ano de nascimento')).toHaveValue(1978);
    expect(screen.getByLabelText('Posição')).toHaveDisplayValue('Atacante');
    expect(screen.getByLabelText('Telefone (opcional)')).toHaveValue('(11) 98765-4321');
    expect(screen.queryByLabelText('Data de entrada')).toBeNull();
    for (const h of HABILIDADES) expect(screen.getByLabelText(h)).toBeVisible();
    expect(await violacoes(container)).toEqual([]);
  });

  it('salvar envia PATCH sem data de entrada e mostra "Jogador salvo."', async () => {
    const f = api();
    abrir();
    const u = userEvent.setup();
    const campo = await screen.findByLabelText('Apelido');
    await u.clear(campo);
    await u.type(campo, 'Toninho Jr');
    await u.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Jogador salvo.')).toBeVisible();
    const i = f.mock.calls.findIndex(([, init]) => init?.method === 'PATCH');
    expect(corpoEnviado(f, i)).toEqual({
      apelido: 'Toninho Jr',
      anoNascimento: 1978,
      posicao: 'atacante',
      telefone: '(11) 98765-4321',
      pontuacaoInicial: 0,
    });
  });

  it('422 mostra a mensagem no campo (t16 erro)', async () => {
    api(notasVazias(), {}, () =>
      erroApi(422, 'validacao', 'Corrija.', { apelido: 'Já existe um jogador com esse apelido neste grupo.' }),
    );
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Já existe um jogador com esse apelido neste grupo.')).toBeVisible();
  });
});

describe('FichaJogador: notas e nível (GEL-97, GEL-103)', () => {
  it('dar 8, 7, 6, 7, 8 e 5 mostra "Nível 6,8"; apagar todas mostra "sem nota"', async () => {
    const f = api();
    abrir();
    const u = userEvent.setup();
    await screen.findByLabelText('Passe');
    expect(screen.getByText('sem nota')).toBeVisible();
    const dadas = [8, 7, 6, 7, 8, 5];
    for (const [i, h] of HABILIDADES.entries()) {
      await u.selectOptions(screen.getByLabelText(h), String(dadas[i]));
    }
    await waitFor(() => expect(screen.getByText('Nível 6,8')).toBeVisible());
    const puts = f.mock.calls.filter(([, init]) => init?.method === 'PUT');
    expect(puts).toHaveLength(6);
    expect(corpoEnviado(f, f.mock.calls.indexOf(puts[0]!))).toEqual({ nota: 8 });
    expect(String(puts[0]![0])).toMatch(/\/api\/grupos\/g1\/jogadores\/j1\/notas\/h1$/);

    for (const h of HABILIDADES) await u.selectOptions(screen.getByLabelText(h), '');
    await waitFor(() => expect(screen.getByText('sem nota')).toBeVisible());
    expect(screen.queryByText(/Nível/)).toBeNull();
  });

  it('mostra "salvo" ao lado da nota gravada', async () => {
    api();
    abrir();
    const u = userEvent.setup();
    await u.selectOptions(await screen.findByLabelText('Chute'), '9');
    expect(await screen.findByText('salvo')).toBeVisible();
  });

  it('jogador inativo ainda edita notas', async () => {
    const f = api(notasVazias(), { situacao: 'inativo' });
    abrir();
    const u = userEvent.setup();
    const seletor = await screen.findByLabelText('Drible');
    expect(seletor).toBeEnabled();
    await u.selectOptions(seletor, '7');
    await waitFor(() => expect(f.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true));
  });

  it('sem habilidades cadastradas mostra "Sem nota", "Usa 5,5 no simulador." e o caminho para cadastrar', async () => {
    api([]);
    abrir();
    expect(await screen.findByText('Usa 5,5 no simulador.', { exact: false })).toBeVisible();
    const secao = screen.getByRole('region', { name: 'Habilidades e nível' });
    expect(within(secao).getByText('Nenhuma habilidade cadastrada.')).toBeVisible();
    expect(within(secao).getByRole('link', { name: 'Cadastrar habilidades' })).toHaveAttribute(
      'href',
      '/app/grupos/g1/habilidades',
    );
  });
});

describe('FichaJogador: carregando e erro (GEL-114)', () => {
  it('carregando anuncia "Carregando…" e erro de rede oferece "Tentar de novo"', async () => {
    simularApi((url) => (url.endsWith('/jogadores/j1') ? Promise.reject(new TypeError('x')) : json(GRUPO)));
    abrir();
    expect(screen.getByText('Carregando…')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Tentar de novo/ })).toBeVisible();
  });
});
