// Critério: T62 (GEL-31, GEL-33, GEL-34, GEL-36, GEL-39, GEL-114, GEL-118): mockup t16 novo e erro; "Corrija N
// campos: …" com a mensagem ao lado de cada campo; envio válido cria, volta à lista e o jogador aparece em Ativos.

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { violacoes } from '../../../test/apoio/axe';
import { corpoEnviado, erroApi, json, montarTelaEm, simularApi } from '../../../test/apoio/tela';
import { criarClienteConsultas } from '../../dados/consultas';
import { Jogadores } from '../jogadores/Jogadores';
import { NovoJogador } from './NovoJogador';

afterEach(() => vi.unstubAllGlobals());

const HOJE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const GRUPO = {
  id: 'g1',
  nome: 'Pelada de Quinta',
  slug: 'quinta',
  diaSemana: 'quinta',
  frequencia: 'semanal',
  horario: '20:00',
  linkPublico: 'https://app.invalid/g/quinta',
  jogadoresAtivos: 0,
  habilidades: 6,
  admins: 1,
  souCriador: true,
};
const TONINHO = {
  id: 'j1',
  apelido: 'Toninho',
  posicao: 'atacante',
  situacao: 'ativo',
  desde: HOJE,
  nivel: 550,
  semNota: true,
};
const DETALHE = {
  ...TONINHO,
  anoNascimento: 1990,
  telefone: null,
  pontuacaoInicial: 0,
  inicioPontuacao: HOJE,
  periodos: [],
  notas: [],
};

function api(criar: () => Response) {
  let criado = false;
  return simularApi((url, init) => {
    if (url.endsWith('/jogadores') && init?.method === 'POST') {
      const r = criar();
      criado = r.status === 201;
      return r;
    }
    if (url.endsWith('/jogadores')) return json({ jogadores: criado ? [TONINHO] : [] });
    return json(GRUPO);
  });
}

const abrir = () =>
  montarTelaEm(<NovoJogador />, '/app/grupos/:grupoId/jogadores/novo', '/app/grupos/g1/jogadores/novo');

async function preencherValido(u: ReturnType<typeof userEvent.setup>) {
  await u.type(screen.getByLabelText('Apelido'), '  Toninho ');
  await u.type(screen.getByLabelText('Ano de nascimento'), '1990');
  await u.selectOptions(screen.getByLabelText('Posição'), 'atacante');
}

describe('NovoJogador: vazio (t16 novo)', () => {
  it('mostra os campos com a ajuda, data de entrada de hoje, pontuação 0 e "Salvar", sem violações do axe', async () => {
    api(() => json(DETALHE, 201));
    const { container } = abrir();
    expect(screen.getByRole('heading', { level: 1, name: 'Novo jogador' })).toBeVisible();
    expect(screen.getByRole('link', { name: /Jogadores/ })).toHaveAttribute('href', '/app/grupos/g1/jogadores');
    expect(screen.getByLabelText('Apelido')).toHaveValue('');
    expect(screen.getByText('De 2 a 30 caracteres. É o nome que aparece no ranking.')).toBeVisible();
    expect(screen.getByLabelText('Posição')).toHaveDisplayValue('Escolha');
    expect(screen.getByLabelText('Data de entrada')).toHaveValue(HOJE);
    expect(screen.getByLabelText('Pontuação inicial')).toHaveValue(0);
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeVisible();
    expect(await violacoes(container)).toEqual([]);
  });

  it('o telefone ganha a máscara enquanto se digita (GEL-39)', async () => {
    api(() => json(DETALHE, 201));
    abrir();
    const u = userEvent.setup();
    await u.type(screen.getByLabelText('Telefone (opcional)'), '11987654321');
    expect(screen.getByLabelText('Telefone (opcional)')).toHaveValue('(11) 98765-4321');
  });
});

describe('NovoJogador: erros (GEL-33, GEL-34, GEL-36, GEL-39, GEL-118)', () => {
  it('vazio mostra "Corrija 3 campos:" e a mensagem da spec em cada campo, sem chamar a API', async () => {
    const f = api(() => json(DETALHE, 201));
    abrir();
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Corrija 3 campos:')).toBeVisible();
    expect(screen.getByText('O apelido precisa ter de 2 a 30 caracteres.')).toBeVisible();
    expect(screen.getByText(/O ano precisa estar entre 1940 e \d{4}\./)).toBeVisible();
    expect(screen.getByText('Escolha a posição.')).toBeVisible();
    expect(f.mock.calls.filter(([, i]) => i?.method === 'POST')).toHaveLength(0);
  });

  it('data de entrada futura e telefone incompleto mostram as mensagens da spec', async () => {
    api(() => json(DETALHE, 201));
    abrir();
    const u = userEvent.setup();
    await preencherValido(u);
    await u.type(screen.getByLabelText('Telefone (opcional)'), '123');
    const futuro = `${Number(HOJE.slice(0, 4)) + 1}-01-01`;
    await u.clear(screen.getByLabelText('Data de entrada'));
    await u.type(screen.getByLabelText('Data de entrada'), futuro);
    await u.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Informe o telefone como (DD) 9XXXX-XXXX.')).toBeVisible();
    expect(screen.getByText('A data não pode ser no futuro.')).toBeVisible();
  });

  it('422 da API (apelido repetido) cai no campo apelido', async () => {
    api(() => erroApi(422, 'validacao', 'Corrija.', { apelido: 'Já existe um jogador com esse apelido neste grupo.' }));
    abrir();
    const u = userEvent.setup();
    await preencherValido(u);
    await u.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Já existe um jogador com esse apelido neste grupo.')).toBeVisible();
  });
});

describe('NovoJogador: envio válido (GEL-31)', () => {
  it('POST com o corpo do contrato, volta à lista e o jogador aparece em Ativos', async () => {
    const f = api(() => json(DETALHE, 201));
    const roteador = createMemoryRouter(
      [
        { path: '/app/grupos/:grupoId/jogadores/novo', element: <NovoJogador /> },
        { path: '/app/grupos/:grupoId/jogadores', element: <Jogadores /> },
      ],
      { initialEntries: ['/app/grupos/g1/jogadores/novo'] },
    );
    render(
      <QueryClientProvider client={criarClienteConsultas({ aoSessaoExpirada: () => undefined })}>
        <RouterProvider router={roteador} />
      </QueryClientProvider>,
    );
    const u = userEvent.setup();
    await preencherValido(u);
    await u.type(screen.getByLabelText('Telefone (opcional)'), '11987654321');
    await u.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('radio', { name: 'Ativos (1)' })).toBeChecked();
    expect(screen.getByRole('link', { name: /Toninho/ })).toBeVisible();
    expect(roteador.state.location.pathname).toBe('/app/grupos/g1/jogadores');
    const indice = f.mock.calls.findIndex(([, i]) => i?.method === 'POST');
    expect(corpoEnviado(f, indice)).toEqual({
      apelido: 'Toninho',
      anoNascimento: 1990,
      posicao: 'atacante',
      telefone: '(11) 98765-4321',
      pontuacaoInicial: 0,
      dataEntrada: HOJE,
    });
  });
});
