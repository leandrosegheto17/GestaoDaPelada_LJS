// Critério: T65 (GEL-76, GEL-77, GEL-114, GEL-118): mockup t16 corrigir, corrigir-saida, corrigir-erro, corrigido,
// inicio-igual, inicio-avancar e inicio-erro; o início do primeiro período não é editável pela correção (mostra o
// caminho "Alterar data de início"); "Datas corrigidas."; axe sem violação.

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
/** Gil: entrada em 05/02, saída em 05/10, retorno em 20/10 (mockup t16 periodos). */
const GIL = {
  id: 'j1',
  apelido: 'Gil',
  posicao: 'meia',
  situacao: 'ativo',
  desde: '2026-10-20',
  nivel: 600,
  semNota: false,
  anoNascimento: 1980,
  telefone: null,
  pontuacaoInicial: 0,
  inicioPontuacao: '2026-02-05',
  periodos: [
    { id: 'p1', inicio: '2026-02-05', fim: '2026-10-05' },
    { id: 'p2', inicio: '2026-10-20', fim: null },
  ],
  notas: [],
};
const TONINHO = {
  ...GIL,
  apelido: 'Toninho',
  desde: '2026-02-05',
  periodos: [{ id: 'p1', inicio: '2026-02-05', fim: null }],
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
const lista = () => screen.getByRole('list', { name: 'Períodos de atividade' });
const trocar = async (u: ReturnType<typeof userEvent.setup>, rotulo: string, valor: string) => {
  const campo = within(dialogo()).getByLabelText(rotulo);
  await u.clear(campo);
  await u.type(campo, valor);
};

describe('Períodos com "Corrigir datas" (t16 periodos, GEL-71)', () => {
  it('cada período tem seu botão; o aberto da entrada mostra o caminho "Alterar data de início" em vez de editar', async () => {
    api(TONINHO);
    const { container } = abrir();
    await screen.findByText('Ativo desde 05/02/2026.');
    const botao = within(lista()).getByRole('button', { name: 'Corrigir datas' });
    expect(botao).toHaveAttribute('aria-disabled', 'true');
    expect(botao).toHaveAccessibleDescription(
      /Nada a corrigir: a data de entrada é a data de início da pontuação \(use Alterar data de início\)\./,
    );
    const u = userEvent.setup();
    await u.click(botao);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Alterar data de início' })).toBeVisible();
    expect(await violacoes(container)).toEqual([]);
  });

  it('primeiro período encerrado: só a saída é editável, com a ajuda do próximo retorno; sem mudança, Confirmar fica desabilitado com "Nada a alterar."', async () => {
    api(GIL);
    abrir();
    const u = userEvent.setup();
    await screen.findByText('Ativo desde 20/10/2026.');
    await u.click(within(lista()).getAllByRole('button', { name: 'Corrigir datas' })[0]!);
    const d = dialogo();
    expect(within(d).getByRole('heading', { name: 'Corrigir datas' })).toBeVisible();
    expect(within(d).getByText(/Entrada de Gil: 05\/02\/2026/)).toHaveTextContent(
      'A entrada é a data de início da pontuação; para mudá-la, use Alterar data de início.',
    );
    expect(within(d).queryByLabelText('Data de retorno')).toBeNull();
    expect(within(d).getByLabelText('Data de saída')).toHaveValue('2026-10-05');
    expect(within(d).getByText(/Não pode ser depois do próximo retorno \(20\/10\/2026\)\./)).toBeVisible();
    expect(within(d).getByText('Nada a alterar.')).toBeVisible();
    expect(within(d).getByRole('button', { name: 'Confirmar novas datas' })).toBeDisabled();
    expect(await violacoes(d)).toEqual([]);
  });

  it('corrigir a saída envia só a saída e mostra "Datas corrigidas." (t16 corrigido)', async () => {
    const f = api(GIL, (url, init) =>
      url.endsWith('/periodos/p1') && init?.method === 'PATCH'
        ? json({ alterado: true, periodos: GIL.periodos })
        : undefined,
    );
    abrir();
    const u = userEvent.setup();
    await screen.findByText('Ativo desde 20/10/2026.');
    await u.click(within(lista()).getAllByRole('button', { name: 'Corrigir datas' })[0]!);
    await trocar(u, 'Data de saída', '2026-10-09');
    await u.click(within(dialogo()).getByRole('button', { name: 'Confirmar novas datas' }));
    expect(await screen.findByText('Datas corrigidas.')).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
    const i = f.mock.calls.findIndex(([url]) => String(url).endsWith('/jogadores/j1/periodos/p1'));
    expect(corpoEnviado(f, i)).toEqual({ saida: '2026-10-09' });
  });

  it('período de retorno aberto: só o retorno é editável, com a saída anterior na ajuda', async () => {
    const f = api(GIL, (url, init) =>
      url.endsWith('/periodos/p2') && init?.method === 'PATCH'
        ? json({ alterado: true, periodos: GIL.periodos })
        : undefined,
    );
    abrir();
    const u = userEvent.setup();
    await screen.findByText('Ativo desde 20/10/2026.');
    await u.click(within(lista()).getAllByRole('button', { name: 'Corrigir datas' })[1]!);
    const d = dialogo();
    expect(within(d).getByText(/Retorno de Gil: 20\/10\/2026/)).toBeVisible();
    expect(within(d).queryByLabelText('Data de saída')).toBeNull();
    expect(within(d).getByLabelText('Data de retorno')).toHaveValue('2026-10-20');
    expect(within(d).getByText(/Não pode ser antes da saída anterior \(05\/10\/2026\)\./)).toBeVisible();
    await trocar(u, 'Data de retorno', '2026-10-12');
    await u.click(within(d).getByRole('button', { name: 'Confirmar novas datas' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const i = f.mock.calls.findIndex(([url]) => String(url).endsWith('/jogadores/j1/periodos/p2'));
    expect(corpoEnviado(f, i)).toEqual({ retorno: '2026-10-12' });
  });

  it('a recusa da API (presença na data) aparece no campo e Confirmar fica desabilitado (t16 corrigir-erro)', async () => {
    const mensagem = 'Há presença do jogador em 01/10/2026. A saída precisa ser em 02/10/2026 ou depois.';
    api(GIL, (url, init) =>
      url.endsWith('/periodos/p1') && init?.method === 'PATCH'
        ? erroApi(422, 'dados_invalidos', 'Corrija.', { saida: mensagem })
        : undefined,
    );
    abrir();
    const u = userEvent.setup();
    await screen.findByText('Ativo desde 20/10/2026.');
    await u.click(within(lista()).getAllByRole('button', { name: 'Corrigir datas' })[0]!);
    await trocar(u, 'Data de saída', '2026-10-01');
    await u.click(within(dialogo()).getByRole('button', { name: 'Confirmar novas datas' }));
    expect(await within(dialogo()).findByText(mensagem)).toBeVisible();
    expect(within(dialogo()).getByLabelText('Data de saída')).toBeInvalid();
    expect(within(dialogo()).getByRole('button', { name: 'Confirmar novas datas' })).toBeDisabled();
  });
});

describe('Data de início (t16 inicio, GEL-76, GEL-77)', () => {
  it('a ficha mostra a data de início e o botão "Alterar data de início"; igual à atual, Confirmar fica desabilitado', async () => {
    api(TONINHO);
    abrir();
    const u = userEvent.setup();
    expect(await screen.findByText('05/02/2026', { selector: 'p' })).toBeVisible();
    await u.click(screen.getByRole('button', { name: 'Alterar data de início' }));
    const d = dialogo();
    expect(within(d).getByRole('heading', { name: 'Alterar data de início' })).toBeVisible();
    expect(within(d).getByLabelText('Data de início')).toHaveValue('2026-02-05');
    expect(
      within(d).getByText(
        'A pontuação do jogador conta a partir desta data. Nada é apagado: voltar a data devolve os pontos.',
      ),
    ).toBeVisible();
    expect(within(d).getByText('Nada a alterar.')).toBeVisible();
    expect(within(d).getByRole('button', { name: 'Confirmar nova data' })).toBeDisabled();
    expect(await violacoes(d)).toEqual([]);
  });

  it('confirmar envia PUT …/inicio com a data nova e fecha o diálogo', async () => {
    const f = api(TONINHO, (url, init) =>
      url.endsWith('/jogadores/j1/inicio') && init?.method === 'PUT'
        ? json({ ...TONINHO, inicioPontuacao: '2026-10-01' })
        : undefined,
    );
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Alterar data de início' }));
    await trocar(u, 'Data de início', '2026-10-01');
    await u.click(within(dialogo()).getByRole('button', { name: 'Confirmar nova data' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const i = f.mock.calls.findIndex(([url]) => String(url).endsWith('/jogadores/j1/inicio'));
    expect(corpoEnviado(f, i)).toEqual({ data: '2026-10-01' });
  });

  it('422 da API aparece no campo da data (t16 inicio-erro)', async () => {
    api(TONINHO, (url, init) =>
      url.endsWith('/jogadores/j1/inicio') && init?.method === 'PUT'
        ? erroApi(422, 'dados_invalidos', 'Corrija.', { data: 'A data não pode ser no futuro.' })
        : undefined,
    );
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Alterar data de início' }));
    await trocar(u, 'Data de início', '2026-10-01');
    await u.click(within(dialogo()).getByRole('button', { name: 'Confirmar nova data' }));
    expect(await within(dialogo()).findByText('A data não pode ser no futuro.')).toBeVisible();
    expect(within(dialogo()).getByRole('button', { name: 'Confirmar nova data' })).toBeDisabled();
  });
});
