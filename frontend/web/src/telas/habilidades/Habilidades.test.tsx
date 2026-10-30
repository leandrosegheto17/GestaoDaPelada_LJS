// Critério: T67 (GEL-88 a GEL-95, GEL-114): mockup t17 vazio, sucesso, erro e carregando; vazio mostra "Nenhuma
// habilidade" e "O simulador vai usar nível 5,5 para todos."; excluir confirma com "Excluir “<nome>”?" e "…apaga as
// notas de todos os jogadores nessa habilidade."; axe sem violação.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { violacoes } from '../../../test/apoio/axe';
import { corpoEnviado, erroApi, json, montarTelaEm, simularApi } from '../../../test/apoio/tela';
import { Habilidades } from './Habilidades';

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
const NOMES = ['Visão de Jogo', 'Passe', 'Preparo Físico', 'Drible', 'Chute', 'Desarme'];
const SEIS = NOMES.map((nome, i) => ({ id: `h${i + 1}`, nome }));

function api(habilidades: unknown[], escrita?: (url: string, init: RequestInit) => Response | undefined) {
  return simularApi((url, init) => {
    if (init?.method && init.method !== 'GET') {
      const r = escrita?.(url, init);
      if (r) return r;
    }
    if (url.endsWith('/habilidades')) return json({ habilidades });
    return json(GRUPO);
  });
}
const abrir = () =>
  montarTelaEm(<Habilidades />, '/app/grupos/:grupoId/habilidades', '/app/grupos/g1/habilidades', [
    '/app',
    '/app/grupos/g1',
  ]);

describe('Habilidades: lista e vazio (t17 sucesso e vazio, GEL-88, GEL-95)', () => {
  it('lista as seis na ordem de cadastro, cada uma com campo de nome e Excluir, e "Nova habilidade", sem violações do axe', async () => {
    api(SEIS);
    const { container } = abrir();
    expect(await screen.findByLabelText('Nome da habilidade 1')).toHaveValue('Visão de Jogo');
    expect(screen.getByRole('heading', { level: 1, name: 'Habilidades' })).toBeVisible();
    expect(screen.getByRole('link', { name: /Início/ })).toHaveAttribute('href', '/app/grupos/g1');
    for (const [i, nome] of NOMES.entries()) {
      expect(screen.getByLabelText(`Nome da habilidade ${i + 1}`)).toHaveValue(nome);
    }
    expect(screen.getByRole('button', { name: 'Excluir Passe' })).toBeVisible();
    expect(screen.getByLabelText('Nova habilidade')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Adicionar' })).toBeVisible();
    expect(await violacoes(container)).toEqual([]);
  });

  it('sem habilidades mostra "Nenhuma habilidade" e "O simulador vai usar nível 5,5 para todos."', async () => {
    api([]);
    const { container } = abrir();
    expect(await screen.findByRole('heading', { level: 2, name: 'Nenhuma habilidade' })).toBeVisible();
    expect(screen.getByText('O simulador vai usar nível 5,5 para todos.')).toBeVisible();
    expect(screen.getByLabelText('Nova habilidade')).toBeVisible();
    expect(await violacoes(container)).toEqual([]);
  });

  it('carregando anuncia "Carregando…" e erro de rede oferece "Tentar de novo"', async () => {
    simularApi((url) => (url.endsWith('/habilidades') ? Promise.reject(new TypeError('x')) : json(GRUPO)));
    abrir();
    expect(screen.getByText('Carregando…')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Tentar de novo/ })).toBeVisible();
  });
});

describe('Habilidades: criar (GEL-89 a GEL-91)', () => {
  it('Adicionar envia POST com o nome sem espaços das pontas e limpa o campo', async () => {
    const f = api(SEIS, (url, init) =>
      url.endsWith('/habilidades') && init.method === 'POST' ? json({ id: 'h7', nome: 'Marcação' }, 201) : undefined,
    );
    abrir();
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText('Nova habilidade'), '  Marcação ');
    await u.click(screen.getByRole('button', { name: 'Adicionar' }));
    await waitFor(() => expect(screen.getByLabelText('Nova habilidade')).toHaveValue(''));
    const i = f.mock.calls.findIndex(([, init]) => init?.method === 'POST');
    expect(corpoEnviado(f, i)).toEqual({ nome: 'Marcação' });
  });

  it('nome curto mostra "O nome precisa ter de 2 a 30 caracteres." sem chamar a API', async () => {
    const f = api(SEIS);
    abrir();
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText('Nova habilidade'), 'a');
    await u.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(await screen.findByText('O nome precisa ter de 2 a 30 caracteres.')).toBeVisible();
    expect(f.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it('nome repetido (422) mostra "Já existe uma habilidade com esse nome." no campo (t17 erro)', async () => {
    api(SEIS, (url, init) =>
      url.endsWith('/habilidades') && init.method === 'POST'
        ? erroApi(422, 'dados_invalidos', 'Corrija.', { nome: 'Já existe uma habilidade com esse nome.' })
        : undefined,
    );
    abrir();
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText('Nova habilidade'), 'passe');
    await u.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(await screen.findByText('Já existe uma habilidade com esse nome.')).toBeVisible();
    expect(screen.getByLabelText('Nova habilidade')).toBeInvalid();
  });
});

describe('Habilidades: renomear (GEL-92)', () => {
  it('mudar o nome e sair do campo envia PATCH e mostra "salvo"', async () => {
    const f = api(SEIS, (url, init) =>
      url.endsWith('/habilidades/h4') && init.method === 'PATCH' ? json({ id: 'h4', nome: 'Drible curto' }) : undefined,
    );
    abrir();
    const u = userEvent.setup();
    const campo = await screen.findByLabelText('Nome da habilidade 4');
    await u.clear(campo);
    await u.type(campo, 'Drible curto');
    await u.tab();
    expect(await screen.findByText('salvo')).toBeVisible();
    const i = f.mock.calls.findIndex(([, init]) => init?.method === 'PATCH');
    expect(corpoEnviado(f, i)).toEqual({ nome: 'Drible curto' });
  });

  it('sair do campo sem mudar o nome não envia nada', async () => {
    const f = api(SEIS);
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByLabelText('Nome da habilidade 2'));
    await u.tab();
    expect(f.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0);
  });

  it('nome repetido na renomeação aparece na linha', async () => {
    api(SEIS, (url, init) =>
      init.method === 'PATCH'
        ? erroApi(422, 'dados_invalidos', 'Corrija.', { nome: 'Já existe uma habilidade com esse nome.' })
        : undefined,
    );
    abrir();
    const u = userEvent.setup();
    const campo = await screen.findByLabelText('Nome da habilidade 4');
    await u.clear(campo);
    await u.type(campo, 'passe');
    await u.tab();
    expect(await screen.findByText('Já existe uma habilidade com esse nome.')).toBeVisible();
  });
});

describe('Habilidades: excluir (t17 excluir, GEL-93, GEL-94)', () => {
  it('confirma com “Excluir “Drible”?” e o texto das notas, foco em Cancelar; Cancelar não apaga', async () => {
    const f = api(SEIS);
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Excluir Drible' }));
    const d = screen.getByRole('alertdialog', { name: 'Excluir “Drible”?' });
    expect(
      within(d).getByText('Excluir “Drible” apaga as notas de todos os jogadores nessa habilidade.'),
    ).toBeVisible();
    expect(within(d).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    expect(await violacoes(d)).toEqual([]);
    await u.click(within(d).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(f.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(0);
  });

  it('confirmar envia DELETE da habilidade e fecha o diálogo', async () => {
    const f = api(SEIS, (url, init) =>
      url.endsWith('/habilidades/h4') && init.method === 'DELETE' ? new Response(null, { status: 204 }) : undefined,
    );
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Excluir Drible' }));
    await u.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Excluir habilidade' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(
      f.mock.calls.some(([url, init]) => init?.method === 'DELETE' && String(url).endsWith('/habilidades/h4')),
    ).toBe(true);
  });
});
