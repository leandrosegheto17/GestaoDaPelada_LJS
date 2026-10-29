// Critério: T58 (GEL-01, GEL-03, GEL-06, GEL-114, GEL-118): mockup t27 vazio, carregando e erro; "Corrija N campos"
// com a mensagem ao lado de cada campo; envio válido cria e vai ao início do grupo; sem "Primeiro admin".

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { violacoes } from '../../../test/apoio/axe';
import { corpoEnviado, erroApi, json, montarTela, simularApi } from '../../../test/apoio/tela';
import { NovoGrupo } from './NovoGrupo';

afterEach(() => vi.unstubAllGlobals());

const EU = { id: 'c1', nome: 'Leandro', email: 'leandro@exemplo.com.br', grupos: [] };
const CRIADO = { id: 'g9', slug: 'pelada-de-quinta', linkPublico: 'https://app.invalid/g/pelada-de-quinta' };

function api(criar: (init: RequestInit | undefined) => Response | Promise<Response>) {
  return simularApi((url, init) => {
    if (url.endsWith('/api/grupos') && init?.method === 'POST') return criar(init);
    return json(EU);
  });
}

const abrir = () => montarTela(<NovoGrupo />, '/app/grupos/novo', ['/app', '/app/grupos/g9']);

async function preencher(u: ReturnType<typeof userEvent.setup>, nome = 'Pelada de Quinta') {
  await u.type(screen.getByLabelText('Nome'), nome);
  await u.selectOptions(screen.getByLabelText('Dia da semana'), 'quinta');
  await u.type(screen.getByLabelText('Horário'), '20:00');
}

const postsDeGrupo = (f: ReturnType<typeof simularApi>) =>
  f.mock.calls.filter(([url, init]) => String(url).endsWith('/api/grupos') && init?.method === 'POST');

describe('NovoGrupo: vazio (t27)', () => {
  it('mostra nome com a ajuda do link, dia com "Escolha", horário, frequência semanal e "Criar grupo"; sem "Primeiro admin"', async () => {
    api(() => json(CRIADO, 201));
    const { container } = abrir();
    expect(screen.getByRole('heading', { level: 1, name: 'Novo grupo' })).toBeVisible();
    expect(screen.getByRole('link', { name: /Seus grupos/ })).toHaveAttribute('href', '/app');
    expect(screen.getByLabelText('Nome')).toHaveValue('');
    expect(screen.getByText('O link do ranking será criado a partir do nome e não muda depois.')).toBeVisible();
    expect(screen.getByLabelText('Dia da semana')).toHaveDisplayValue('Escolha');
    expect(screen.getByLabelText('Horário')).toHaveValue('');
    const frequencia = screen.getByRole('group', { name: 'Frequência' });
    expect(within(frequencia).getByRole('radio', { name: 'Semanal' })).toBeChecked();
    expect(within(frequencia).getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Criar grupo' })).toBeVisible();
    expect(screen.queryByText(/Primeiro admin/i)).toBeNull();
    expect(await violacoes(container)).toEqual([]);
  });
});

describe('NovoGrupo: envio (GEL-01)', () => {
  it('válido: POST /api/grupos com o corpo do contrato e vai a /app/grupos/:id', async () => {
    const f = api(() => json(CRIADO, 201));
    const { roteador } = abrir();
    const u = userEvent.setup();
    await preencher(u, '  Pelada de Quinta  ');
    await u.click(screen.getByRole('radio', { name: 'Quinzenal' }));
    await u.click(screen.getByRole('button', { name: 'Criar grupo' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/app/grupos/g9'));
    const posts = postsDeGrupo(f);
    expect(posts).toHaveLength(1);
    expect(corpoEnviado(f, f.mock.calls.indexOf(posts[0]!))).toEqual({
      nome: 'Pelada de Quinta',
      diaSemana: 'quinta',
      frequencia: 'quinzenal',
      horario: '20:00',
    });
  });

  it('carregando: o botão vira "Criando grupo…" e o formulário fica ocupado', async () => {
    api(() => new Promise<Response>(() => undefined));
    abrir();
    const u = userEvent.setup();
    await preencher(u);
    await u.click(screen.getByRole('button', { name: 'Criar grupo' }));
    const botao = await screen.findByRole('button', { name: 'Criando grupo…' });
    expect(botao).toHaveAttribute('aria-busy', 'true');
    expect(botao.closest('form')).toHaveAttribute('aria-busy', 'true');
  });
});

describe('NovoGrupo: erros (GEL-03, GEL-06, GEL-118, t27 erro)', () => {
  it('nome curto e horário vazio: "Corrija 3 campos" com os rótulos, mensagem ao lado de cada campo e nada enviado', async () => {
    const f = api(() => json(CRIADO, 201));
    const { container } = abrir();
    const u = userEvent.setup();
    await u.type(screen.getByLabelText('Nome'), 'Ra');
    await u.click(screen.getByRole('button', { name: 'Criar grupo' }));
    const resumo = await screen.findByText('Corrija 3 campos:');
    const lista = within(resumo.closest('[role="alert"]') as HTMLElement);
    expect(lista.getAllByRole('link').map((l) => l.textContent)).toEqual(['Nome', 'Dia da semana', 'Horário']);
    expect(lista.getByRole('link', { name: 'Nome' })).toHaveAttribute('href', '#nome');
    expect(screen.getByText('O nome precisa ter de 3 a 60 caracteres.')).toBeVisible();
    expect(screen.getByText('Escolha o dia da semana.')).toBeVisible();
    expect(screen.getByText('Informe o horário.')).toBeVisible();
    expect(screen.getByLabelText('Nome')).toHaveAttribute('aria-invalid', 'true');
    expect(postsDeGrupo(f)).toHaveLength(0);
    expect(await violacoes(container)).toEqual([]);
  });

  it('o 422 da API com campos aparece no resumo e ao lado de cada campo', async () => {
    api(() =>
      erroApi(422, 'dados_invalidos', 'Corrija os campos indicados.', {
        nome: 'O nome precisa ter de 3 a 60 caracteres.',
        horario: 'Horário inválido.',
      }),
    );
    const { roteador } = abrir();
    const u = userEvent.setup();
    await preencher(u);
    await u.click(screen.getByRole('button', { name: 'Criar grupo' }));
    expect(await screen.findByText('Corrija 2 campos:')).toBeVisible();
    expect(screen.getByText('Horário inválido.')).toBeVisible();
    expect(screen.getByText('O nome precisa ter de 3 a 60 caracteres.')).toBeVisible();
    expect(roteador.state.location.pathname).toBe('/app/grupos/novo');
  });

  it('falha de rede: aviso de envio e os campos continuam preenchidos', async () => {
    api(() => {
      throw new TypeError('rede');
    });
    abrir();
    const u = userEvent.setup();
    await preencher(u);
    await u.click(screen.getByRole('button', { name: 'Criar grupo' }));
    expect(await screen.findByText('Não foi possível enviar. Verifique a conexão.')).toBeVisible();
    expect(screen.getByLabelText('Nome')).toHaveValue('Pelada de Quinta');
  });
});
