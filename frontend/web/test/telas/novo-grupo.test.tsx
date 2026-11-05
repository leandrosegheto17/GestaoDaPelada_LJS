import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MENSAGEM_CAMPO_PADRAO, mensagensDosCampos } from '../../src/dados/erros-campo.ts';
import { ErroApi } from '../../src/dados/cliente.ts';
import { AJUDA_NOME_GRUPO, NovoGrupo } from '../../src/telas/novo-grupo/NovoGrupo.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import {
  abrirTela,
  erroApi,
  json,
  pendente,
  SESSAO_ANA,
  type Manipulador,
} from '../apoio/tela.tsx';

/**
 * Novo grupo (T59; GEL-01, GEL-03, GEL-06, GEL-114, GEL-118), estados de `t27-novo-grupo--*.html` do mockup do
 * módulo. A rota entra no app na T69: aqui a tela é montada com uma rota própria e um destino que mostra o caminho.
 */

const rotas = () => [
  { path: '/app/grupos/novo', element: <NovoGrupo /> },
  { path: '*', element: <p>destino</p> },
];

function abrir(api: Record<string, Manipulador>) {
  return abrirTela(
    '/app/grupos/novo',
    { 'GET /api/sessao': () => json(200, SESSAO_ANA), ...api },
    rotas,
  );
}

function preencher() {
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Pelada de Quinta' } });
  fireEvent.change(screen.getByLabelText('Dia da semana'), { target: { value: 'quinta' } });
  fireEvent.change(screen.getByLabelText('Horário'), { target: { value: '20:00' } });
}

function erro422(mensagens: Record<string, string>): Response {
  return json(422, {
    erro: 'Corrija os campos indicados.',
    codigo: 'dados_invalidos',
    campos: Object.keys(mensagens).sort(),
    mensagens,
  });
}

afterEach(() => {
  cleanup();
});

describe('mensagensDosCampos', () => {
  it('GEL-118: lê a mensagem de cada campo do 422; campo sem mensagem recebe a padrão', () => {
    const erro = new ErroApi(
      422,
      { erro: 'x', codigo: 'dados_invalidos', campos: ['horario', 'nome'] },
      'x',
      {
        erro: 'x',
        codigo: 'dados_invalidos',
        campos: ['horario', 'nome'],
        mensagens: { nome: 'O nome precisa ter de 3 a 60 caracteres.' },
      },
    );
    expect(mensagensDosCampos(erro)).toEqual({
      nome: 'O nome precisa ter de 3 a 60 caracteres.',
      horario: MENSAGEM_CAMPO_PADRAO,
    });
  });

  it('outro status ou erro que não é da API não marca campo', () => {
    expect(
      mensagensDosCampos(new ErroApi(409, { erro: 'x', codigo: 'grupo_arquivado' }, 'x')),
    ).toEqual({});
    expect(mensagensDosCampos(new Error('rede'))).toEqual({});
  });
});

describe('tela Novo grupo (t27)', () => {
  it('GEL-114: formulário vazio sem "Primeiro admin", semanal marcada; axe sem violação', async () => {
    const { container } = abrir({});
    expect(await screen.findByRole('heading', { level: 1, name: 'Novo grupo' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Seus grupos' }).getAttribute('href')).toBe('/app');
    expect(screen.getByText(AJUDA_NOME_GRUPO)).toBeTruthy();
    expect((screen.getByLabelText('Dia da semana') as HTMLSelectElement).value).toBe('');
    expect((screen.getByLabelText('Semanal') as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByText(/Primeiro admin/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    await esperarSemViolacoes(container);
  });

  it('GEL-01: 201 envia os quatro campos e navega para o início do grupo novo', async () => {
    const { chamadasA, local } = abrir({
      'POST /api/grupos': () =>
        json(201, {
          id: 'g-novo',
          slug: 'pelada-de-quinta',
          linkPublico: 'https://exemplo.test/g/pelada-de-quinta',
        }),
    });
    await screen.findByRole('heading', { level: 1, name: 'Novo grupo' });
    preencher();
    fireEvent.click(screen.getByLabelText('Quinzenal'));
    fireEvent.click(screen.getByRole('button', { name: 'Criar grupo' }));
    await waitFor(() => expect(local()).toBe('/app/grupos/g-novo'));
    expect(chamadasA('POST', '/api/grupos').map((c) => c.corpo)).toEqual([
      { nome: 'Pelada de Quinta', diaSemana: 'quinta', horario: '20:00', frequencia: 'quinzenal' },
    ]);
  });

  it('GEL-114: enviando, o botão mostra "Criando grupo…" e fica ocupado', async () => {
    const { chamadasA } = abrir({ 'POST /api/grupos': () => pendente() });
    await screen.findByRole('heading', { level: 1, name: 'Novo grupo' });
    preencher();
    fireEvent.click(screen.getByRole('button', { name: 'Criar grupo' }));
    const botao = await screen.findByRole('button', { name: 'Criando grupo…' });
    expect(botao.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(botao);
    expect(chamadasA('POST', '/api/grupos')).toHaveLength(1);
  });

  it('GEL-03, GEL-06, GEL-118: 422 com dois campos mostra "Corrija 2 campos: Nome, Horário" e cada mensagem no campo; axe sem violação', async () => {
    const { container, local } = abrir({
      'POST /api/grupos': () =>
        erro422({ nome: 'O nome precisa ter de 3 a 60 caracteres.', horario: 'Horário inválido.' }),
    });
    await screen.findByRole('heading', { level: 1, name: 'Novo grupo' });
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Ra' } });
    fireEvent.change(screen.getByLabelText('Dia da semana'), { target: { value: 'quinta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar grupo' }));

    const resumo = await screen.findByRole('alert');
    expect(within(resumo).getByText('Corrija 2 campos:')).toBeTruthy();
    expect(
      within(resumo)
        .getAllByRole('link')
        .map((a) => [a.textContent, a.getAttribute('href')]),
    ).toEqual([
      ['Nome', '#nome'],
      ['Horário', '#hora'],
    ]);

    const nome = screen.getByLabelText('Nome');
    expect(nome.getAttribute('aria-invalid')).toBe('true');
    expect(nome.getAttribute('aria-describedby')).toBe('nome-ajuda nome-erro');
    expect(document.getElementById('nome-erro')?.textContent).toBe(
      'O nome precisa ter de 3 a 60 caracteres.',
    );
    const hora = screen.getByLabelText('Horário');
    expect(hora.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById('hora-erro')?.textContent).toBe('Horário inválido.');
    expect(screen.getByLabelText('Dia da semana').getAttribute('aria-invalid')).toBeNull();
    expect(local()).toBe('/app/grupos/novo');
    await esperarSemViolacoes(container);
  });

  it('GEL-118: o link do resumo leva o foco ao campo', async () => {
    abrir({ 'POST /api/grupos': () => erro422({ horario: 'Informe o horário.' }) });
    await screen.findByRole('heading', { level: 1, name: 'Novo grupo' });
    fireEvent.click(screen.getByRole('button', { name: 'Criar grupo' }));
    const resumo = await screen.findByRole('alert');
    expect(within(resumo).getByText('Corrija 1 campo:')).toBeTruthy();
    fireEvent.click(within(resumo).getByRole('link', { name: 'Horário' }));
    expect(document.activeElement).toBe(screen.getByLabelText('Horário'));
  });

  it('GEL-118: corrigido e reenviado, o resumo e os erros somem', async () => {
    let tentativa = 0;
    const { local } = abrir({
      'POST /api/grupos': () => {
        tentativa += 1;
        return tentativa === 1
          ? erro422({ nome: 'O nome precisa ter de 3 a 60 caracteres.' })
          : json(201, { id: 'g-novo', slug: 's', linkPublico: 'l' });
      },
    });
    await screen.findByRole('heading', { level: 1, name: 'Novo grupo' });
    fireEvent.click(screen.getByRole('button', { name: 'Criar grupo' }));
    expect(await screen.findByText('Corrija 1 campo:')).toBeTruthy();
    preencher();
    fireEvent.click(screen.getByRole('button', { name: 'Criar grupo' }));
    await waitFor(() => expect(local()).toBe('/app/grupos/g-novo'));
  });

  it('falha que não é de campo vai para a faixa de erro, sem resumo', async () => {
    abrir({
      'POST /api/grupos': () =>
        erroApi(429, 'muitas_requisicoes', 'Muitas tentativas. Aguarde um pouco.'),
    });
    await screen.findByRole('heading', { level: 1, name: 'Novo grupo' });
    preencher();
    fireEvent.click(screen.getByRole('button', { name: 'Criar grupo' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('Muitas tentativas. Aguarde um pouco.');
    expect(screen.queryByText(/Corrija/)).toBeNull();
  });
});
