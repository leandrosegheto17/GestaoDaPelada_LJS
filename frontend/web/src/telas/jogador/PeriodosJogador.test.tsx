// Critério: T64 (GEL-59, GEL-60, GEL-114, GEL-118): mockup t16 inativar, inativo, reativar, reativar-erro e
// reativado; o aviso do GEL-59 aparece antes de confirmar, com Cancelar e Inativar; o 422 de período aparece no campo
// da data; "<apelido> reativado desde <dd/mm/aaaa>."; axe sem violação.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { violacoes } from '../../../test/apoio/axe';
import { corpoEnviado, erroApi, json, montarTelaEm, simularApi } from '../../../test/apoio/tela';
import { FichaJogador } from './FichaJogador';

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
  jogadoresAtivos: 1,
  habilidades: 6,
  admins: 1,
  souCriador: true,
};
const ATIVO = {
  id: 'j1',
  apelido: 'Toninho',
  posicao: 'atacante',
  situacao: 'ativo',
  desde: '2026-02-05',
  nivel: 683,
  semNota: false,
  anoNascimento: 1978,
  telefone: null,
  pontuacaoInicial: 0,
  inicioPontuacao: '2026-02-05',
  periodos: [{ id: 'p1', inicio: '2026-02-05', fim: null }],
  notas: [],
};
const INATIVO = {
  ...ATIVO,
  apelido: 'Beto',
  situacao: 'inativo',
  desde: '2026-10-05',
  periodos: [{ id: 'p1', inicio: '2026-02-05', fim: '2026-10-05' }],
};

function api(ficha: unknown, acao?: (url: string, init: RequestInit | undefined) => Response | undefined) {
  return simularApi((url, init) => {
    const r = acao?.(url, init);
    if (r) return r;
    if (url.endsWith('/jogadores/j1')) return json(ficha);
    return json(GRUPO);
  });
}
const abrir = () =>
  montarTelaEm(<FichaJogador />, '/app/grupos/:grupoId/jogadores/:jogadorId', '/app/grupos/g1/jogadores/j1');
const dialogo = () => screen.getByRole('dialog');

describe('Situação do jogador ativo (t16 edição)', () => {
  it('mostra "Ativo desde 05/02/2026.", o período "Entrada" aberto e o botão Inativar', async () => {
    api(ATIVO);
    const { container } = abrir();
    expect(await screen.findByText('Ativo desde 05/02/2026.')).toBeVisible();
    const lista = screen.getByRole('list', { name: 'Períodos de atividade' });
    expect(within(lista).getByText('Entrada')).toBeVisible();
    expect(within(lista).getByText(/05\/02\/2026/)).toHaveTextContent('atual');
    expect(screen.getByRole('button', { name: 'Inativar' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Reativar' })).toBeNull();
    expect(await violacoes(container)).toEqual([]);
  });
});

describe('Inativar (t16 inativar, GEL-59)', () => {
  it('o aviso aparece antes de confirmar, com Cancelar e Inativar, e Cancelar não envia nada', async () => {
    const f = api(ATIVO);
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Inativar' }));
    const d = dialogo();
    expect(within(d).getByRole('heading', { name: 'Inativar Toninho' })).toBeVisible();
    expect(
      within(d).getByText(
        'Ele sai do ranking, do lançamento, do simulador e do financeiro a partir da data de saída. O histórico e os pontos ficam guardados.',
      ),
    ).toBeVisible();
    expect(within(d).getByLabelText('Data de saída')).toHaveValue(HOJE);
    expect(within(d).getByRole('button', { name: 'Inativar' })).toBeVisible();
    expect(await violacoes(d)).toEqual([]);
    await u.click(within(d).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(f.mock.calls.filter(([, i]) => i?.method === 'POST')).toHaveLength(0);
  });

  it('confirmar envia POST …/inativar com a data e fecha o diálogo', async () => {
    const f = api(ATIVO, (url, init) =>
      url.endsWith('/inativar') && init?.method === 'POST' ? json({ ...INATIVO, apelido: 'Toninho' }) : undefined,
    );
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Inativar' }));
    await u.click(within(dialogo()).getByRole('button', { name: 'Inativar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const i = f.mock.calls.findIndex(([url]) => String(url).endsWith('/jogadores/j1/inativar'));
    expect(corpoEnviado(f, i)).toEqual({ data: HOJE });
  });

  it('422 de período aparece no campo da data', async () => {
    api(ATIVO, (url, init) =>
      url.endsWith('/inativar') && init?.method === 'POST'
        ? erroApi(422, 'dados_invalidos', 'Corrija.', {
            data: 'A saída não pode ser antes do início deste período (05/02/2026).',
          })
        : undefined,
    );
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Inativar' }));
    await u.click(within(dialogo()).getByRole('button', { name: 'Inativar' }));
    expect(
      await within(dialogo()).findByText('A saída não pode ser antes do início deste período (05/02/2026).'),
    ).toBeVisible();
    expect(screen.getByRole('dialog')).toBeVisible();
  });
});

describe('Jogador inativo (t16 inativo) e Reativar (t16 reativar)', () => {
  it('mostra "Inativo desde 05/10/2026." com o texto de volta e o botão Reativar', async () => {
    api(INATIVO);
    abrir();
    expect(await screen.findByText('Inativo desde 05/10/2026.')).toBeVisible();
    expect(
      screen.getByText('Volta a aparecer no ranking e nas partidas; a data de início e os pontos não mudam.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reativar' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Inativar' })).toBeNull();
  });

  it('o diálogo mostra a data de retorno de hoje e a ajuda com a saída anterior; confirmar mostra "Beto reativado desde <data>."', async () => {
    const f = api(INATIVO, (url, init) =>
      url.endsWith('/reativar') && init?.method === 'POST' ? json({ ...ATIVO, apelido: 'Beto' }) : undefined,
    );
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Reativar' }));
    const d = dialogo();
    expect(within(d).getByRole('heading', { name: 'Reativar Beto' })).toBeVisible();
    const campo = within(d).getByLabelText('Data de retorno');
    expect(campo).toHaveValue(HOJE);
    expect(within(d).getByText(/Não pode ser antes da saída anterior \(05\/10\/2026\)\./)).toBeVisible();
    expect(await violacoes(d)).toEqual([]);
    await u.clear(campo);
    await u.type(campo, '2026-10-07');
    await u.click(within(d).getByRole('button', { name: 'Reativar' }));
    expect(await screen.findByText('Beto reativado desde 07/10/2026.')).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
    const i = f.mock.calls.findIndex(([url]) => String(url).endsWith('/jogadores/j1/reativar'));
    expect(corpoEnviado(f, i)).toEqual({ data: '2026-10-07' });
  });

  it('retorno antes da saída anterior (422) mostra o erro no campo e desabilita Reativar (t16 reativar-erro)', async () => {
    const mensagem = 'O retorno não pode ser antes da saída anterior (05/10/2026).';
    api(INATIVO, (url, init) =>
      url.endsWith('/reativar') && init?.method === 'POST'
        ? erroApi(422, 'dados_invalidos', 'Corrija.', { data: mensagem })
        : undefined,
    );
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Reativar' }));
    await u.click(within(dialogo()).getByRole('button', { name: 'Reativar' }));
    expect(await within(dialogo()).findByText(mensagem)).toBeVisible();
    expect(within(dialogo()).getByLabelText('Data de retorno')).toBeInvalid();
    expect(within(dialogo()).getByRole('button', { name: 'Reativar' })).toBeDisabled();
  });
});
