// Critério: T60 (GEL-18, GEL-19, GEL-22, GEL-23, GEL-114, GEL-118): mockup t20 sucesso, salvo, erro, carregando,
// nao-criador, arquivar e arquivar-erro; arquivar só habilita com o nome exato; o 422 do nome aparece no campo; o link é
// o da API (sem URL fixa no código).

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarClienteConsultas } from '../../dados/consultas';
import { violacoes } from '../../../test/apoio/axe';
import { corpoEnviado, erroApi, json, simularApi } from '../../../test/apoio/tela';
import { DadosDoGrupo } from './DadosDoGrupo';

afterEach(() => vi.unstubAllGlobals());

const EU = { id: 'c1', nome: 'Leandro', email: 'leandro@exemplo.com.br', grupos: [] };
const LINK = 'https://exemplo.invalid/g/pelada-de-quinta';
const GRUPO = {
  id: 'g1',
  nome: 'Pelada de Quinta',
  slug: 'pelada-de-quinta',
  linkPublico: LINK,
  diaSemana: 'quinta',
  frequencia: 'semanal',
  horario: '20:00',
  jogadoresAtivos: 20,
  habilidades: 6,
  admins: 2,
  souCriador: true,
};

type Extra = (url: string, init: RequestInit | undefined) => Response | Promise<Response> | undefined;

function api(grupo: unknown, extra?: Extra) {
  return simularApi((url, init) => {
    const outra = extra?.(url, init);
    if (outra) return outra;
    if (url.endsWith('/api/grupos/g1')) return json(grupo);
    return json(EU);
  });
}

function abrir() {
  const roteador = createMemoryRouter(
    [
      { path: '/app/grupos/:grupoId/dados', element: <DadosDoGrupo /> },
      { path: '/app', element: <p>Destino /app</p> },
    ],
    { initialEntries: ['/app/grupos/g1/dados'] },
  );
  const tela = render(
    <QueryClientProvider client={criarClienteConsultas({ aoSessaoExpirada: () => undefined })}>
      <RouterProvider router={roteador} />
    </QueryClientProvider>,
  );
  return { roteador, ...tela };
}

const chamadasA = (f: ReturnType<typeof simularApi>, metodo: string, fim: string) =>
  f.mock.calls.flatMap(([url, init], i) => (init?.method === metodo && String(url).endsWith(fim) ? [i] : []));

describe('DadosDoGrupo: sucesso (t20)', () => {
  it('mostra os dados do grupo, o link da API e, para quem criou, a zona de arquivar; sem violações do axe', async () => {
    api(GRUPO);
    const { container } = abrir();
    expect(await screen.findByLabelText('Nome')).toHaveValue('Pelada de Quinta');
    expect(screen.getByRole('heading', { level: 1, name: 'Dados do grupo' })).toBeVisible();
    expect(screen.getByRole('link', { name: /Início/ })).toHaveAttribute('href', '/app/grupos/g1');
    expect(screen.getByText('Mudar o nome não muda o link do ranking.')).toBeVisible();
    expect(screen.getByLabelText('Dia da semana')).toHaveValue('quinta');
    expect(within(screen.getByLabelText('Dia da semana')).queryByText('Escolha')).toBeNull();
    expect(screen.getByLabelText('Horário')).toHaveValue('20:00');
    expect(screen.getByRole('radio', { name: 'Semanal' })).toBeChecked();
    const link = screen.getByRole('region', { name: 'Link do ranking' });
    expect(within(link).getByText(LINK)).toBeVisible();
    const arquivar = screen.getByRole('region', { name: 'Arquivar grupo' });
    expect(within(arquivar).getByText('Só você vê esta opção, porque criou o grupo.')).toBeVisible();
    expect(within(arquivar).getByRole('button', { name: 'Arquivar grupo' })).toBeVisible();
    expect(screen.queryByText(/Pesos de pontuação/)).toBeNull();
    expect(await violacoes(container)).toEqual([]);
  });

  it('nao-criador: a mesma tela sem a zona de arquivar', async () => {
    api({ ...GRUPO, souCriador: false });
    abrir();
    expect(await screen.findByLabelText('Nome')).toHaveValue('Pelada de Quinta');
    expect(screen.getByRole('region', { name: 'Link do ranking' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Arquivar grupo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Arquivar grupo' })).toBeNull();
  });

  it('copiar link: grava na área de transferência o link vindo da API e mostra "Link copiado"', async () => {
    api(GRUPO);
    abrir();
    const u = userEvent.setup();
    const escrever = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    await u.click(await screen.findByRole('button', { name: 'Copiar link' }));
    expect(escrever).toHaveBeenCalledWith(LINK);
    expect(await screen.findByText('Link copiado')).toBeVisible();
  });
});

describe('DadosDoGrupo: salvar (GEL-18, GEL-19, GEL-118)', () => {
  it('salvo: PATCH com o corpo do contrato e "Dados salvos."', async () => {
    const f = api(GRUPO, (url, init) =>
      init?.method === 'PATCH' && url.endsWith('/api/grupos/g1')
        ? json({ ...GRUPO, nome: 'Pelada das Quintas', horario: '21:00' })
        : undefined,
    );
    abrir();
    const u = userEvent.setup();
    const nome = await screen.findByLabelText('Nome');
    await u.clear(nome);
    await u.type(nome, 'Pelada das Quintas');
    await u.clear(screen.getByLabelText('Horário'));
    await u.type(screen.getByLabelText('Horário'), '21:00');
    await u.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Dados salvos.')).toBeVisible();
    const [i] = chamadasA(f, 'PATCH', '/api/grupos/g1');
    expect(corpoEnviado(f, i)).toEqual({
      nome: 'Pelada das Quintas',
      diaSemana: 'quinta',
      frequencia: 'semanal',
      horario: '21:00',
    });
  });

  it('erro: nome curto e horário vazio dão "Corrija 2 campos" com a mensagem ao lado de cada campo, sem enviar', async () => {
    const f = api(GRUPO);
    const { container } = abrir();
    const u = userEvent.setup();
    const nome = await screen.findByLabelText('Nome');
    await u.clear(nome);
    await u.type(nome, 'Pe');
    await u.clear(screen.getByLabelText('Horário'));
    await u.click(screen.getByRole('button', { name: 'Salvar' }));
    const resumo = await screen.findByText('Corrija 2 campos:');
    const faixa = within(resumo.closest('[role="alert"]') as HTMLElement);
    expect(faixa.getAllByRole('link').map((l) => l.textContent)).toEqual(['Nome', 'Horário']);
    expect(screen.getByText('O nome precisa ter de 3 a 60 caracteres.')).toBeVisible();
    expect(screen.getByText('Informe o horário.')).toBeVisible();
    expect(chamadasA(f, 'PATCH', '/api/grupos/g1')).toEqual([]);
    expect(await violacoes(container)).toEqual([]);
  });

  it('o 422 da API aparece no campo', async () => {
    api(GRUPO, (url, init) =>
      init?.method === 'PATCH'
        ? erroApi(422, 'dados_invalidos', 'Corrija os campos indicados.', { horario: 'Horário inválido.' })
        : undefined,
    );
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Horário inválido.')).toBeVisible();
    expect(screen.getByLabelText('Horário')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText('Dados salvos.')).toBeNull();
  });
});

describe('DadosDoGrupo: arquivar (GEL-22, GEL-23)', () => {
  it('o diálogo pede o nome; o botão só habilita com o nome exato (caixa e espaços contam)', async () => {
    api(GRUPO);
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Arquivar grupo' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Arquivar “Pelada de Quinta”?' });
    expect(
      within(dialogo).getByText(
        'Os outros admins perdem o acesso e o grupo não pode ser alterado enquanto estiver arquivado. Os dados ficam guardados e você pode reativar em Seus grupos.',
      ),
    ).toBeVisible();
    const confirmar = within(dialogo).getByRole('button', { name: 'Arquivar grupo' });
    const campo = within(dialogo).getByLabelText('Digite o nome do grupo para confirmar');
    expect(confirmar).toBeDisabled();
    await u.type(campo, 'pelada de quinta');
    expect(confirmar).toBeDisabled();
    await u.clear(campo);
    await u.type(campo, 'Pelada de Quinta ');
    expect(confirmar).toBeDisabled();
    await u.clear(campo);
    await u.type(campo, 'Pelada de Quinta');
    expect(confirmar).toBeEnabled();
    expect(await violacoes(document.body)).toEqual([]);
  });

  it('confirmado: POST …/arquivar com o nome digitado e volta a /app com o aviso de arquivado', async () => {
    const f = api(GRUPO, (url, init) =>
      init?.method === 'POST' && url.endsWith('/api/grupos/g1/arquivar') ? json(GRUPO) : undefined,
    );
    const { roteador } = abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Arquivar grupo' }));
    const dialogo = screen.getByRole('alertdialog');
    await u.type(within(dialogo).getByLabelText('Digite o nome do grupo para confirmar'), 'Pelada de Quinta');
    await u.click(within(dialogo).getByRole('button', { name: 'Arquivar grupo' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/app'));
    expect(roteador.state.location.state).toEqual({ aviso: 'arquivado' });
    const [i] = chamadasA(f, 'POST', '/api/grupos/g1/arquivar');
    expect(corpoEnviado(f, i)).toEqual({ nomeConfirmacao: 'Pelada de Quinta' });
  });

  it('arquivar-erro: o 422 do nome aparece no campo e o diálogo continua aberto', async () => {
    api(GRUPO, (url, init) =>
      init?.method === 'POST' && url.endsWith('/arquivar')
        ? erroApi(422, 'dados_invalidos', 'Corrija os campos indicados.', {
            nomeConfirmacao: 'O nome digitado não confere com o nome do grupo.',
          })
        : undefined,
    );
    const { roteador } = abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Arquivar grupo' }));
    const dialogo = screen.getByRole('alertdialog');
    const campo = within(dialogo).getByLabelText('Digite o nome do grupo para confirmar');
    await u.type(campo, 'Pelada de Quinta');
    await u.click(within(dialogo).getByRole('button', { name: 'Arquivar grupo' }));
    expect(await within(dialogo).findByText('O nome digitado não confere com o nome do grupo.')).toBeVisible();
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(roteador.state.location.pathname).toBe('/app/grupos/g1/dados');
  });

  it('Cancelar fecha sem chamar a API', async () => {
    const f = api(GRUPO);
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Arquivar grupo' }));
    await u.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(chamadasA(f, 'POST', '/arquivar')).toEqual([]);
  });
});

describe('DadosDoGrupo: carregando e erro', () => {
  it('carregando: "Carregando…" e a página ocupada', async () => {
    simularApi(() => new Promise<Response>(() => undefined));
    abrir();
    expect(await screen.findByRole('status')).toHaveTextContent('Carregando…');
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
  });

  it('erro ao carregar: "Tentar de novo"', async () => {
    let falhas = 0;
    simularApi((url) => {
      if (url.endsWith('/api/grupos/g1')) {
        falhas += 1;
        if (falhas <= 2) throw new TypeError('rede');
        return json(GRUPO);
      }
      return json(EU);
    });
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Tentar de novo' }, { timeout: 3000 }));
    expect(await screen.findByLabelText('Nome')).toHaveValue('Pelada de Quinta');
  });
});
