import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  TEXTO_ARQUIVADOS,
  TEXTO_GRUPO_REATIVADO,
  TEXTO_REATIVAR,
  TEXTO_VAZIO,
  TITULO_VAZIO,
  tituloReativar,
} from '../../src/telas/grupos/Grupos.tsx';
import { textoRecorrencia } from '../../src/telas/grupos/recorrencia.ts';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, erroApi, json, pendente } from '../apoio/tela.tsx';

/**
 * Seus grupos no módulo (T58; GEL-27, GEL-114, GEL-117), estados de `t08-grupos--*.html` do mockup do módulo.
 */

const SESSAO = {
  id: 'c-leandro',
  nome: 'Leandro',
  email: 'leandro@exemplo.com.br',
  grupos: [
    { id: 'g-quinta', nome: 'Pelada de Quinta', slug: 'pelada-de-quinta', acessaFinanceiro: true },
    { id: 'g-domingo', nome: 'Racha de Domingo', slug: 'racha-de-domingo', acessaFinanceiro: false },
  ],
};

const QUINTA = { id: 'g-quinta', nome: 'Pelada de Quinta', slug: 'pelada-de-quinta', diaSemana: 'quinta', frequencia: 'semanal', horario: '20:00' };
const DOMINGO = { id: 'g-domingo', nome: 'Racha de Domingo', slug: 'racha-de-domingo', diaSemana: 'domingo', frequencia: 'quinzenal', horario: '09:00' };
const FIRMA = { id: 'g-firma', nome: 'Futebol da Firma', slug: 'futebol-da-firma', diaSemana: 'terca', frequencia: 'semanal', horario: '19:00' };

const COM_ARQUIVADO = { ativos: [QUINTA, DOMINGO], arquivados: [FIRMA] };

afterEach(() => {
  cleanup();
});

describe('textoRecorrencia', () => {
  it('semanal: "Toda quinta · 20:00", com "Todo" nos dias masculinos', () => {
    expect(textoRecorrencia({ diaSemana: 'quinta', frequencia: 'semanal', horario: '20:00' })).toBe('Toda quinta · 20:00');
    expect(textoRecorrencia({ diaSemana: 'terca', frequencia: 'semanal', horario: '19:00' })).toBe('Toda terça · 19:00');
    expect(textoRecorrencia({ diaSemana: 'sabado', frequencia: 'semanal', horario: '08:00' })).toBe('Todo sábado · 08:00');
    expect(textoRecorrencia({ diaSemana: 'domingo', frequencia: 'semanal', horario: '09:00' })).toBe('Todo domingo · 09:00');
  });

  it('quinzenal e mensal: "Domingo, quinzenal · 09:00"', () => {
    expect(textoRecorrencia({ diaSemana: 'domingo', frequencia: 'quinzenal', horario: '09:00' })).toBe('Domingo, quinzenal · 09:00');
    expect(textoRecorrencia({ diaSemana: 'quinta', frequencia: 'mensal', horario: '20:00' })).toBe('Quinta, mensal · 20:00');
  });
});

describe('tela Seus grupos do módulo (t08)', () => {
  it('GEL-27: ativos com a recorrência e link ao início; arquivados separados, cada um com Reativar; axe sem violação', async () => {
    const { container } = abrirTela('/app', {
      'GET /api/sessao': () => json(200, SESSAO),
      'GET /api/grupos': () => json(200, COM_ARQUIVADO),
    });
    const ativos = await screen.findByRole('list', { name: 'Seus grupos' });
    const quinta = within(ativos).getByRole('link', { name: /Pelada de Quinta/ });
    expect(quinta.getAttribute('href')).toBe('/app/grupos/g-quinta');
    expect(within(quinta).getByText(/Toda quinta · 20:00/)).toBeTruthy();
    expect(within(quinta).queryByText('Sem acesso ao financeiro')).toBeNull();
    const domingo = within(ativos).getByRole('link', { name: /Racha de Domingo/ });
    expect(within(domingo).getByText(/Domingo, quinzenal · 09:00/)).toBeTruthy();
    expect(within(domingo).getByText('Sem acesso ao financeiro')).toBeTruthy();
    expect(within(ativos).queryByText('Futebol da Firma')).toBeNull();

    const secao = screen.getByRole('region', { name: 'Arquivados' });
    expect(within(secao).getByText(TEXTO_ARQUIVADOS)).toBeTruthy();
    const arquivados = within(secao).getByRole('list', { name: 'Arquivados' });
    expect(within(arquivados).getByText('Futebol da Firma')).toBeTruthy();
    expect(within(arquivados).getByText('Toda terça · 19:00')).toBeTruthy();
    expect(within(arquivados).queryByRole('link')).toBeNull();
    expect(within(arquivados).getByRole('button', { name: 'Reativar Futebol da Firma' })).toBeTruthy();

    expect(screen.getByRole('link', { name: 'Criar grupo' }).getAttribute('href')).toBe('/app/grupos/novo');
    expect(screen.queryByText(TITULO_VAZIO)).toBeNull();
    await esperarSemViolacoes(container);
  });

  it('GEL-27: sem arquivados, a seção Arquivados não aparece', async () => {
    abrirTela('/app', {
      'GET /api/sessao': () => json(200, SESSAO),
      'GET /api/grupos': () => json(200, { ativos: [QUINTA], arquivados: [] }),
    });
    expect(await screen.findByRole('list', { name: 'Seus grupos' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Arquivados' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Reativar/ })).toBeNull();
  });

  it('GEL-27: só arquivados (a criadora sem grupo ativo) não é o estado vazio', async () => {
    abrirTela('/app', {
      'GET /api/sessao': () => json(200, { ...SESSAO, grupos: [] }),
      'GET /api/grupos': () => json(200, { ativos: [], arquivados: [FIRMA] }),
    });
    expect(await screen.findByRole('region', { name: 'Arquivados' })).toBeTruthy();
    expect(screen.queryByText(TITULO_VAZIO)).toBeNull();
  });

  it('GEL-117: sem grupos, o estado vazio com "Criar grupo"; axe sem violação', async () => {
    const { container } = abrirTela('/app', {
      'GET /api/sessao': () => json(200, { ...SESSAO, grupos: [] }),
      'GET /api/grupos': () => json(200, { ativos: [], arquivados: [] }),
    });
    expect(await screen.findByRole('heading', { level: 2, name: TITULO_VAZIO })).toBeTruthy();
    expect(screen.getByText(TEXTO_VAZIO)).toBeTruthy();
    const criar = screen.getAllByRole('link', { name: 'Criar grupo' });
    expect(criar).toHaveLength(1);
    expect(criar[0]?.getAttribute('href')).toBe('/app/grupos/novo');
    expect(screen.queryByRole('list', { name: 'Seus grupos' })).toBeNull();
    await esperarSemViolacoes(container);
  });

  it('GEL-114: carregando com o leitor de tela ouvindo "Carregando…"; axe sem violação', async () => {
    const { container } = abrirTela('/app', {
      'GET /api/sessao': () => json(200, SESSAO),
      'GET /api/grupos': () => pendente(),
    });
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.getByText('Carregando…')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Seus grupos' })).toBeNull();
    await esperarSemViolacoes(container);
  });

  it('GEL-114: erro ao carregar mostra a faixa com "Tentar de novo", que relê; axe sem violação', async () => {
    let falhar = true;
    const { container, chamadasA } = abrirTela('/app', {
      'GET /api/sessao': () => json(200, SESSAO),
      'GET /api/grupos': () => (falhar ? erroApi(503, 'indisponivel') : json(200, COM_ARQUIVADO)),
    });
    expect(await screen.findByRole('alert')).toBeTruthy();
    await esperarSemViolacoes(container);
    falhar = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('list', { name: 'Seus grupos' })).toBeTruthy();
    expect(chamadasA('GET', '/api/grupos')).toHaveLength(2);
  });

  it('GEL-28: Reativar abre a confirmação; confirmar chama a API, mostra "Grupo reativado." e relê; axe sem violação', async () => {
    let reativado = false;
    const { container, chamadasA } = abrirTela('/app', {
      'GET /api/sessao': () => json(200, SESSAO),
      'GET /api/grupos': () =>
        json(200, reativado ? { ativos: [FIRMA, QUINTA, DOMINGO], arquivados: [] } : COM_ARQUIVADO),
      'POST /api/grupos/g-firma/reativar': () => {
        reativado = true;
        return json(200, {});
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Reativar Futebol da Firma' }));
    const dialogo = screen.getByRole('dialog', { name: tituloReativar('Futebol da Firma') });
    expect(within(dialogo).getByText(TEXTO_REATIVAR)).toBeTruthy();
    await esperarSemViolacoes(container);

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Reativar grupo' }));
    expect(await screen.findByText(TEXTO_GRUPO_REATIVADO)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(chamadasA('POST', '/api/grupos/g-firma/reativar')).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Arquivados' })).toBeNull());
    expect(within(screen.getByRole('list', { name: 'Seus grupos' })).getByRole('link', { name: /Futebol da Firma/ })).toBeTruthy();
    await esperarSemViolacoes(container);
  });

  it('GEL-28: Cancelar fecha a confirmação sem chamar a API', async () => {
    const { chamadasA } = abrirTela('/app', {
      'GET /api/sessao': () => json(200, SESSAO),
      'GET /api/grupos': () => json(200, COM_ARQUIVADO),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Reativar Futebol da Firma' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(chamadasA('POST', '/api/grupos/g-firma/reativar')).toHaveLength(0);
  });

  it('GEL-28: reativar que falha mostra a mensagem da API na faixa de erro', async () => {
    abrirTela('/app', {
      'GET /api/sessao': () => json(200, SESSAO),
      'GET /api/grupos': () => json(200, COM_ARQUIVADO),
      'POST /api/grupos/g-firma/reativar': () => erroApi(403, 'so_quem_criou', 'Só quem criou o grupo pode reativá-lo.'),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Reativar Futebol da Firma' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reativar grupo' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('Só quem criou o grupo pode reativá-lo.');
    expect(screen.queryByText(TEXTO_GRUPO_REATIVADO)).toBeNull();
  });

  it('GEL-22: quem chega depois de arquivar vê "Grupo arquivado."', async () => {
    const { roteador } = abrirTela('/app/conta', {
      'GET /api/sessao': () => json(200, SESSAO),
      'GET /api/grupos': () => json(200, COM_ARQUIVADO),
    });
    await roteador.navigate('/app', { state: { aviso: 'grupo-arquivado' } });
    expect(await screen.findByText('Grupo arquivado.')).toBeTruthy();
  });
});
