import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PaginaEditarPartida,
  textoUltimaAlteracaoPartida,
} from '../../src/telas/partida/PaginaEditarPartida.tsx';
import { PaginaPartidas } from '../../src/telas/partidas/PaginaPartidas.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import {
  abrirTela,
  erroApi,
  json,
  pendente,
  SESSAO_ANA,
  type Manipulador,
} from '../apoio/tela.tsx';

/** Editar e excluir partida (partidas-e-ranking T61; PAR-52 a PAR-54), a partir de `B:213-215` e do mockup t11. */

afterEach(() => {
  cleanup();
});

const ALEMAO = '00000000-0000-4000-8000-000000000001';
const BIGODE = '00000000-0000-4000-8000-000000000002';

const rotas = () => [
  { path: '/app/grupos/:grupoId/partidas/:data', element: <PaginaEditarPartida /> },
  { path: '/app/grupos/:grupoId/partidas', element: <PaginaPartidas /> },
  { path: '*', element: <p>destino</p> },
];

const LER = 'GET /api/grupos/g-quinta/partidas/2026-10-15';
const EDITAR = 'PUT /api/grupos/g-quinta/partidas/2026-10-15';
const EXCLUIR = 'DELETE /api/grupos/g-quinta/partidas/2026-10-15';

const PARTIDA = {
  data: '2026-10-15',
  hoje: '2026-10-22',
  choveu: true,
  alteradaPor: 'Leandro',
  // 01:41 em UTC do dia 16 é 22:41 do dia 15 em São Paulo.
  alteradaEm: '2026-10-16T01:41:00.000Z',
  jogadores: [
    { id: ALEMAO, apelido: 'Alemão', situacao: 'presente' },
    { id: BIGODE, apelido: 'Bigode', situacao: 'expulso' },
  ],
};

const MES = {
  mes: '2026-10',
  hoje: '2026-10-22',
  navegacao: { mesAnterior: null, mesSeguinte: null },
  partidas: [],
};

function abrir(api: Record<string, Manipulador>) {
  return abrirTela(
    '/app/grupos/g-quinta/partidas/2026-10-15',
    {
      'GET /api/sessao': () => json(200, SESSAO_ANA),
      'GET /api/grupos/g-quinta': () => pendente(),
      'GET /api/grupos/g-quinta/partidas': () => json(200, MES),
      ...api,
    },
    rotas,
  );
}

async function abrirDialogo() {
  fireEvent.click(await screen.findByRole('button', { name: 'Excluir partida' }));
  return screen.findByRole('alertdialog');
}

describe('Editar partida (t11)', () => {
  it('PAR-52: "Última alteração" com hora em São Paulo', () => {
    expect(
      textoUltimaAlteracaoPartida({
        alteradaPor: 'Leandro',
        alteradaEm: '2026-10-16T01:41:00.000Z',
      }),
    ).toBe('Última alteração: Leandro, 15/10 22:41');
  });

  it('PAR-52: a data aparece sem campo editável, com a última alteração e as situações gravadas', async () => {
    abrir({ [LER]: () => json(200, PARTIDA) });
    const data = (await screen.findByLabelText('Data')) as HTMLInputElement;
    expect(data.value).toBe('2026-10-15');
    expect(data.readOnly).toBe(true);
    expect(screen.getByText('Última alteração: Leandro, 15/10 22:41')).toBeDefined();
    expect((screen.getByRole('switch', { name: /Choveu\?/ }) as HTMLInputElement).checked).toBe(
      true,
    );
    const expulso = within(screen.getByRole('group', { name: 'Situação de Bigode' })).getByRole(
      'radio',
      { name: /Expulso/ },
    );
    expect((expulso as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('Presentes 1 · Lesionados 0 · Expulsos 1 · Ausentes 0')).toBeDefined();
  });

  it('PAR-46: salvar envia a mesma data, a chuva e as marcações, e volta às partidas do mês', async () => {
    const t = abrir({ [LER]: () => json(200, PARTIDA), [EDITAR]: () => json(200, PARTIDA) });
    await screen.findByRole('group', { name: 'Situação de Alemão' });
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Situação de Alemão' })).getByRole('radio', {
        name: /Lesionado/,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Salvar partida (0 presentes)' }));
    await waitFor(() =>
      expect(t.chamadasA('PUT', '/api/grupos/g-quinta/partidas/2026-10-15')).toHaveLength(1),
    );
    expect(t.chamadasA('PUT', '/api/grupos/g-quinta/partidas/2026-10-15')[0]?.corpo).toEqual({
      data: '2026-10-15',
      choveu: true,
      marcacoes: [
        { jogadorId: ALEMAO, situacao: 'lesionado' },
        { jogadorId: BIGODE, situacao: 'expulso' },
      ],
    });
    await waitFor(() => expect(t.local()).toBe('/app/grupos/g-quinta/partidas?mes=2026-10'));
  });

  it('PAR-53: o diálogo tem "Excluir a partida de dd/mm?", o texto do recálculo, "Cancelar" e "Excluir partida"', async () => {
    abrir({ [LER]: () => json(200, PARTIDA) });
    const dialogo = await abrirDialogo();
    expect(
      within(dialogo).getByRole('heading', { name: 'Excluir a partida de 15/10?' }),
    ).toBeDefined();
    expect(
      within(dialogo).getByText(
        'As presenças dessa partida saem do ranking, e os pontos de todos são recalculados.',
      ),
    ).toBeDefined();
    expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toBeDefined();
    expect(within(dialogo).getByRole('button', { name: 'Excluir partida' })).toBeDefined();
  });

  it('PAR-53: "Cancelar" fecha o diálogo sem excluir', async () => {
    const t = abrir({ [LER]: () => json(200, PARTIDA) });
    const dialogo = await abrirDialogo();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(t.chamadasA('DELETE', '/api/grupos/g-quinta/partidas/2026-10-15')).toHaveLength(0);
  });

  it('PAR-54: sucesso vai às partidas com "Partida de dd/mm excluída."', async () => {
    const t = abrir({ [LER]: () => json(200, PARTIDA), [EXCLUIR]: () => json(204) });
    const dialogo = await abrirDialogo();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Excluir partida' }));
    await waitFor(() => expect(t.local()).toBe('/app/grupos/g-quinta/partidas?mes=2026-10'));
    expect(await screen.findByText('Partida de 15/10 excluída.')).toBeDefined();
    expect(t.chamadasA('DELETE', '/api/grupos/g-quinta/partidas/2026-10-15')).toHaveLength(1);
  });

  it('PAR-54: falha mostra "Não foi possível excluir a partida. Tente de novo." e fica na edição', async () => {
    const t = abrir({
      [LER]: () => json(200, PARTIDA),
      [EXCLUIR]: () => erroApi(500, 'erro_interno'),
    });
    const dialogo = await abrirDialogo();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Excluir partida' }));
    expect(
      await screen.findByText('Não foi possível excluir a partida. Tente de novo.'),
    ).toBeDefined();
    expect(t.local()).toBe('/app/grupos/g-quinta/partidas/2026-10-15');
  });

  it('PAR-45: partida que não existe mostra "Partida não encontrada."', async () => {
    abrir({ [LER]: () => erroApi(404, 'nao_encontrado') });
    expect(await screen.findByText('Partida não encontrada.')).toBeDefined();
  });

  it('axe sem violações', async () => {
    const { container } = abrir({ [LER]: () => json(200, PARTIDA) });
    await screen.findByRole('group', { name: 'Situação de Alemão' });
    await esperarSemViolacoes(container);
  });
});
