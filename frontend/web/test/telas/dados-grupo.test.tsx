import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DadosGrupo,
  ROTULO_CONFIRMACAO,
  TEXTO_ARQUIVAR,
  TEXTO_DADOS_SALVOS,
  TEXTO_LINK_COPIADO,
  TEXTO_SO_VOCE,
  tituloArquivar,
} from '../../src/telas/dados-grupo/DadosGrupo.tsx';
import { Grupos } from '../../src/telas/grupos/Grupos.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, erroApi, json, pendente, SESSAO_ANA, type Manipulador } from '../apoio/tela.tsx';

/**
 * Dados do grupo e arquivar (T61; GEL-18, GEL-19, GEL-22, GEL-23, GEL-114, GEL-118), estados de
 * `t20-grupo--*.html` do mockup do módulo. A rota entra no app na T69; `/app` é a tela real de Seus grupos.
 */

const rotas = () => [
  { path: '/app/grupos/:grupoId/dados', element: <DadosGrupo /> },
  { path: '/app', element: <Grupos /> },
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
  admins: 2,
  souCriador: true,
};

function abrir(api: Record<string, Manipulador>) {
  return abrirTela('/app/grupos/g-quinta/dados', { 'GET /api/sessao': () => json(200, SESSAO_ANA), ...api }, rotas);
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
  vi.unstubAllGlobals();
});

describe('tela Dados do grupo (t20)', () => {
  it('GEL-114: campos preenchidos do grupo, link do ranking e zona de arquivar para a criadora; axe sem violação', async () => {
    const { container } = abrir({ 'GET /api/grupos/g-quinta': () => json(200, QUINTA) });
    expect(await screen.findByRole('heading', { level: 1, name: 'Dados do grupo' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Início' }).getAttribute('href')).toBe('/app/grupos/g-quinta');
    expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('Pelada de Quinta');
    expect((screen.getByLabelText('Dia da semana') as HTMLSelectElement).value).toBe('quinta');
    expect((screen.getByLabelText('Horário') as HTMLInputElement).value).toBe('20:00');
    expect((screen.getByLabelText('Semanal') as HTMLInputElement).checked).toBe(true);
    const link = screen.getByRole('region', { name: 'Link do ranking' });
    expect(within(link).getByText('https://exemplo.test/g/pelada-de-quinta')).toBeTruthy();
    const zona = screen.getByRole('region', { name: 'Arquivar grupo' });
    expect(within(zona).getByText(TEXTO_SO_VOCE)).toBeTruthy();
    expect(within(zona).getByRole('button', { name: 'Arquivar grupo' })).toBeTruthy();
    await esperarSemViolacoes(container);
  });

  it('GEL-18: salvar envia o PATCH com os quatro campos e mostra "Dados salvos."', async () => {
    const { chamadasA } = abrir({
      'GET /api/grupos/g-quinta': () => json(200, QUINTA),
      'PATCH /api/grupos/g-quinta': (corpo) => json(200, { ...QUINTA, ...(corpo as object) }),
    });
    await screen.findByRole('heading', { level: 1, name: 'Dados do grupo' });
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Pelada da Quinta' } });
    fireEvent.change(screen.getByLabelText('Horário'), { target: { value: '21:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText(TEXTO_DADOS_SALVOS)).toBeTruthy();
    expect(chamadasA('PATCH', '/api/grupos/g-quinta').map((c) => c.corpo)).toEqual([
      { nome: 'Pelada da Quinta', diaSemana: 'quinta', horario: '21:00', frequencia: 'semanal' },
    ]);
  });

  it('GEL-19, GEL-118: 422 marca os campos com o resumo e não mostra "Dados salvos."; axe sem violação', async () => {
    const { container } = abrir({
      'GET /api/grupos/g-quinta': () => json(200, QUINTA),
      'PATCH /api/grupos/g-quinta': () => erro422({ nome: 'O nome precisa ter de 3 a 60 caracteres.', horario: 'Informe o horário.' }),
    });
    await screen.findByRole('heading', { level: 1, name: 'Dados do grupo' });
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Ra' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    const resumo = await screen.findByRole('alert');
    expect(within(resumo).getByText('Corrija 2 campos:')).toBeTruthy();
    expect(within(resumo).getAllByRole('link').map((a) => a.textContent)).toEqual(['Nome', 'Horário']);
    expect(document.getElementById('nome-erro')?.textContent).toBe('O nome precisa ter de 3 a 60 caracteres.');
    expect(document.getElementById('hora-erro')?.textContent).toBe('Informe o horário.');
    expect(screen.queryByText(TEXTO_DADOS_SALVOS)).toBeNull();
    await esperarSemViolacoes(container);
  });

  it('GEL-24: quem não criou o grupo não vê a zona de arquivar', async () => {
    abrir({ 'GET /api/grupos/g-quinta': () => json(200, { ...QUINTA, souCriador: false }) });
    expect(await screen.findByRole('region', { name: 'Link do ranking' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Arquivar grupo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Arquivar grupo' })).toBeNull();
  });

  it('GEL-22: a criadora digita o nome e arquiva; a tela vai a Seus grupos com "Grupo arquivado."; axe com o diálogo aberto', async () => {
    let arquivado = false;
    const { container, chamadasA, local } = abrir({
      'GET /api/grupos/g-quinta': () => json(200, QUINTA),
      'POST /api/grupos/g-quinta/arquivar': () => {
        arquivado = true;
        return json(200, {});
      },
      'GET /api/grupos': () =>
        json(200, {
          ativos: [],
          arquivados: arquivado ? [{ id: 'g-quinta', nome: 'Pelada de Quinta', slug: 'pelada-de-quinta', diaSemana: 'quinta', frequencia: 'semanal', horario: '20:00' }] : [],
        }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Arquivar grupo' }));
    const dialogo = screen.getByRole('alertdialog', { name: tituloArquivar('Pelada de Quinta') });
    expect(within(dialogo).getByText(TEXTO_ARQUIVAR)).toBeTruthy();
    await esperarSemViolacoes(container);

    fireEvent.change(within(dialogo).getByLabelText(ROTULO_CONFIRMACAO), { target: { value: 'Pelada de Quinta' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Arquivar grupo' }));
    await waitFor(() => expect(local()).toBe('/app'));
    expect(chamadasA('POST', '/api/grupos/g-quinta/arquivar').map((c) => c.corpo)).toEqual([{ nomeConfirmacao: 'Pelada de Quinta' }]);
    expect(await screen.findByText('Grupo arquivado.')).toBeTruthy();
  });

  it('GEL-23: 422 no nomeConfirmacao mostra a mensagem no campo e não arquiva; axe sem violação', async () => {
    const { container, local } = abrir({
      'GET /api/grupos/g-quinta': () => json(200, QUINTA),
      'POST /api/grupos/g-quinta/arquivar': () =>
        erro422({ nomeConfirmacao: 'O nome digitado não confere com o nome do grupo.' }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Arquivar grupo' }));
    const dialogo = screen.getByRole('alertdialog');
    const campo = within(dialogo).getByLabelText(ROTULO_CONFIRMACAO);
    fireEvent.change(campo, { target: { value: 'pelada de quinta' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Arquivar grupo' }));
    await waitFor(() => expect(campo.getAttribute('aria-invalid')).toBe('true'));
    expect(campo.getAttribute('aria-describedby')).toBe('conf-erro');
    expect(document.getElementById('conf-erro')?.textContent).toBe('O nome digitado não confere com o nome do grupo.');
    expect(local()).toBe('/app/grupos/g-quinta/dados');
    await esperarSemViolacoes(container);
  });

  it('GEL-22: Cancelar fecha o diálogo sem chamar a API', async () => {
    const { chamadasA } = abrir({ 'GET /api/grupos/g-quinta': () => json(200, QUINTA) });
    fireEvent.click(await screen.findByRole('button', { name: 'Arquivar grupo' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(chamadasA('POST', '/api/grupos/g-quinta/arquivar')).toHaveLength(0);
  });

  it('Copiar link grava o link público e mostra "Link copiado"', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    abrir({ 'GET /api/grupos/g-quinta': () => json(200, QUINTA) });
    fireEvent.click(await screen.findByRole('button', { name: 'Copiar link' }));
    expect(await screen.findByText(TEXTO_LINK_COPIADO)).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith('https://exemplo.test/g/pelada-de-quinta');
  });

  it('GEL-114: carregando e erro com "Tentar de novo"; axe sem violação', async () => {
    const carregando = abrir({ 'GET /api/grupos/g-quinta': () => pendente() });
    expect(await screen.findByText('Carregando…')).toBeTruthy();
    await esperarSemViolacoes(carregando.container);
    cleanup();

    const { container } = abrir({ 'GET /api/grupos/g-quinta': () => erroApi(503, 'email_indisponivel') });
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeTruthy();
    await esperarSemViolacoes(container);
  });
});
