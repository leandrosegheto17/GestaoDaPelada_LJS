// Critério: ACE-18, ACE-57 (mockup t08 vazio e sucesso; t09 menu da conta); GEL-27, GEL-28, GEL-114, GEL-117 (t08
// carregando, erro, vazio, sucesso, arquivado, reativar e reativado).
// Motivo da mudança (grupos-e-elenco, T57, aprovada pelo usuário): a tela troca de fonte de dados e de texto conforme o
// mockup aprovado; ACE-18 e ACE-57 continuam cobertos. A lista vem de `GET /api/grupos` (simulada conforme o
// contrato), o estado vazio ganha o texto novo e "Criar grupo", e o grupo leva ao início dele (t09).

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { violacoes } from '../../../test/apoio/axe';
import { corpoEnviado, json, montarTela, simularApi } from '../../../test/apoio/tela';
import { SeusGrupos } from './SeusGrupos';

afterEach(() => vi.unstubAllGlobals());

const EU_SEM_GRUPOS = { id: 'c1', nome: 'Leandro', email: 'leandro@exemplo.com.br', grupos: [] };
const EU_COM_GRUPOS = {
  ...EU_SEM_GRUPOS,
  grupos: [
    { id: 'g1', nome: 'Pelada de Quinta', slug: 'quinta', acessaFinanceiro: true },
    { id: 'g2', nome: 'Racha de Domingo', slug: 'domingo', acessaFinanceiro: false },
  ],
};
const QUINTA = {
  id: 'g1',
  nome: 'Pelada de Quinta',
  slug: 'quinta',
  diaSemana: 'quinta',
  frequencia: 'semanal',
  horario: '20:00',
};
const DOMINGO = {
  id: 'g2',
  nome: 'Racha de Domingo',
  slug: 'domingo',
  diaSemana: 'domingo',
  frequencia: 'quinzenal',
  horario: '09:00',
};
const FIRMA = {
  id: 'g3',
  nome: 'Futebol da Firma',
  slug: 'firma',
  diaSemana: 'terca',
  frequencia: 'semanal',
  horario: '19:00',
};
const SEM_GRUPOS = { ativos: [], arquivados: [] };
const COM_GRUPOS = { ativos: [QUINTA, DOMINGO], arquivados: [] };
const DETALHE_FIRMA = {
  ...FIRMA,
  linkPublico: 'https://app.invalid/g/firma',
  jogadoresAtivos: 0,
  habilidades: 6,
  admins: 1,
  souCriador: true,
};

type Extra = (url: string, init: RequestInit | undefined) => Response | undefined;

/** Sessão em `/api/sessao` e a lista em `/api/grupos`, no formato do contrato. */
function api(eu: unknown, grupos: unknown, extra?: Extra) {
  return simularApi((url, init) => {
    const outra = extra?.(url, init);
    if (outra) return outra;
    if (url.endsWith('/api/grupos')) return json(grupos);
    return json(eu);
  });
}

describe('SeusGrupos: estado vazio (ACE-57, GEL-117, t08)', () => {
  it('sem grupos mostra "Nenhum grupo ainda", o texto do mockup e "Criar grupo", sem violações do axe', async () => {
    api(EU_SEM_GRUPOS, SEM_GRUPOS);
    const { container } = montarTela(<SeusGrupos />, '/app');
    expect(await screen.findByRole('heading', { level: 2, name: 'Nenhum grupo ainda' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Seus grupos' })).toBeVisible();
    expect(
      screen.getByText('Crie o grupo da sua pelada. Se um admin convidar você, o grupo dele também aparece aqui.'),
    ).toBeVisible();
    expect(screen.getAllByRole('link', { name: 'Criar grupo' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Criar grupo' })).toHaveAttribute('href', '/app/grupos/novo');
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Arquivados' })).toBeNull();
    expect(await violacoes(container)).toEqual([]);
  });
});

describe('SeusGrupos: lista (ACE-18, GEL-27, t08)', () => {
  it('lista os grupos como links para o início, com a recorrência, e marca "Sem acesso ao financeiro" só onde falta', async () => {
    const f = api(EU_COM_GRUPOS, COM_GRUPOS);
    const { container } = montarTela(<SeusGrupos />, '/app');
    const lista = await screen.findByRole('list');
    const itens = within(lista).getAllByRole('listitem');
    expect(itens).toHaveLength(2);
    expect(within(itens[0]!).getByRole('link', { name: /Pelada de Quinta/ })).toHaveAttribute('href', '/app/grupos/g1');
    expect(within(itens[0]!).getByText('Toda quinta · 20:00')).toBeVisible();
    expect(within(itens[1]!).getByRole('link', { name: /Racha de Domingo/ })).toHaveAttribute('href', '/app/grupos/g2');
    expect(within(itens[1]!).getByText('Domingo, quinzenal · 09:00')).toBeVisible();
    expect(await within(itens[1]!).findByText('Sem acesso ao financeiro')).toBeVisible();
    expect(within(itens[0]!).queryByText('Sem acesso ao financeiro')).toBeNull();
    expect(screen.queryByText('Nenhum grupo ainda')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Arquivados' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Criar grupo' })).toHaveAttribute('href', '/app/grupos/novo');
    expect(f.mock.calls.some(([url]) => String(url).endsWith('/api/grupos'))).toBe(true);
    expect(await violacoes(container)).toEqual([]);
  });

  it('carregando: "Carregando…" para leitor de tela e a página ocupada', async () => {
    simularApi(() => new Promise<Response>(() => undefined));
    montarTela(<SeusGrupos />, '/app');
    expect(await screen.findByRole('status')).toHaveTextContent('Carregando…');
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
  });

  it('falha ao carregar mostra o erro de rede com "Tentar de novo"', async () => {
    let chamadas = 0;
    simularApi((url) => {
      if (!url.endsWith('/api/grupos')) return json(EU_COM_GRUPOS);
      chamadas += 1;
      if (chamadas <= 2) throw new TypeError('rede');
      return json(COM_GRUPOS);
    });
    montarTela(<SeusGrupos />, '/app');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Tentar de novo' }, { timeout: 3000 }));
    expect(await screen.findByRole('link', { name: /Pelada de Quinta/ })).toBeVisible();
  });
});

describe('SeusGrupos: arquivados e reativar (GEL-27, GEL-28, t08)', () => {
  it('os arquivados ficam numa seção à parte, sem link, cada um com Reativar', async () => {
    api(EU_COM_GRUPOS, { ativos: [DOMINGO], arquivados: [FIRMA] });
    const { container } = montarTela(<SeusGrupos />, '/app');
    const secao = (await screen.findByRole('heading', { level: 2, name: 'Arquivados' })).closest('section')!;
    expect(
      within(secao).getByText(
        'Só você, que criou estes grupos, os vê aqui. Os outros admins não têm acesso enquanto estiverem arquivados.',
      ),
    ).toBeVisible();
    expect(within(secao).getByText('Futebol da Firma')).toBeVisible();
    expect(within(secao).getByText('Toda terça · 19:00')).toBeVisible();
    expect(within(secao).queryByRole('link')).toBeNull();
    expect(within(secao).getByRole('button', { name: 'Reativar Futebol da Firma' })).toBeVisible();
    expect(screen.getByRole('link', { name: /Racha de Domingo/ })).toBeVisible();
    expect(await violacoes(container)).toEqual([]);
  });

  it('só com arquivados não mostra o estado vazio', async () => {
    api(EU_SEM_GRUPOS, { ativos: [], arquivados: [FIRMA] });
    montarTela(<SeusGrupos />, '/app');
    expect(await screen.findByRole('heading', { name: 'Arquivados' })).toBeVisible();
    expect(screen.queryByText('Nenhum grupo ainda')).toBeNull();
  });

  it('Reativar confirma no diálogo, chama POST …/reativar do grupo e mostra "Grupo reativado." com a lista nova', async () => {
    let reativado = false;
    const f = api(EU_COM_GRUPOS, COM_GRUPOS, (url, init) => {
      if (url.endsWith('/api/grupos/g3/reativar') && init?.method === 'POST') {
        reativado = true;
        return json(DETALHE_FIRMA);
      }
      if (url.endsWith('/api/grupos')) {
        return json(
          reativado ? { ativos: [FIRMA, QUINTA], arquivados: [] } : { ativos: [QUINTA], arquivados: [FIRMA] },
        );
      }
      return undefined;
    });
    montarTela(<SeusGrupos />, '/app');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Reativar Futebol da Firma' }));
    const dialogo = screen.getByRole('dialog', { name: 'Reativar “Futebol da Firma”?' });
    expect(
      within(dialogo).getByText('O grupo volta como estava, com o mesmo link, e os outros admins voltam a ter acesso.'),
    ).toBeVisible();
    await u.click(within(dialogo).getByRole('button', { name: 'Reativar grupo' }));
    expect(await screen.findByText('Grupo reativado.')).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByRole('link', { name: /Futebol da Firma/ })).toHaveAttribute('href', '/app/grupos/g3');
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Arquivados' })).toBeNull());
    const i = f.mock.calls.findIndex(([url]) => String(url).endsWith('/api/grupos/g3/reativar'));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(corpoEnviado(f, i)).toBeUndefined();
  });

  it('Cancelar fecha o diálogo sem chamar a API', async () => {
    const f = api(EU_COM_GRUPOS, { ativos: [], arquivados: [FIRMA] });
    montarTela(<SeusGrupos />, '/app');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Reativar Futebol da Firma' }));
    await u.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(f.mock.calls.some(([url]) => String(url).includes('/reativar'))).toBe(false);
  });

  it('falha ao reativar mantém o diálogo aberto com o erro de envio', async () => {
    const falhar: Extra = (url) => {
      if (url.endsWith('/reativar')) throw new TypeError('rede');
      return undefined;
    };
    api(EU_COM_GRUPOS, { ativos: [], arquivados: [FIRMA] }, falhar);
    montarTela(<SeusGrupos />, '/app');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Reativar Futebol da Firma' }));
    await u.click(screen.getByRole('button', { name: 'Reativar grupo' }));
    expect(await screen.findByText('Não foi possível enviar. Verifique a conexão.')).toBeVisible();
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(screen.queryByText('Grupo reativado.')).toBeNull();
  });

  it('chegando depois de arquivar (aviso no estado da navegação) mostra "Grupo arquivado."', async () => {
    api(EU_COM_GRUPOS, { ativos: [DOMINGO], arquivados: [QUINTA] });
    const { roteador } = montarTela(<SeusGrupos />, '/app');
    await screen.findByRole('heading', { name: 'Arquivados' });
    expect(screen.queryByText('Grupo arquivado.')).toBeNull();
    await roteador.navigate('/app', { state: { aviso: 'arquivado' } });
    expect(await screen.findByText('Grupo arquivado.')).toBeVisible();
  });
});

describe('SeusGrupos: menu da conta (t09)', () => {
  it('o botão abre a folha com o nome da pessoa e as quatro opções', async () => {
    api(EU_COM_GRUPOS, COM_GRUPOS);
    const { container } = montarTela(<SeusGrupos />, '/app');
    const u = userEvent.setup();
    await screen.findByRole('list');
    await u.click(screen.getByRole('button', { name: 'Menu da conta' }));
    const folha = screen.getByRole('dialog', { name: 'Leandro' });
    expect(within(folha).getByRole('link', { name: 'Minha conta' })).toHaveAttribute('href', '/app/conta');
    expect(within(folha).getByRole('link', { name: 'Privacidade' })).toHaveAttribute('href', '/privacidade');
    expect(within(folha).getByRole('link', { name: 'Termos de uso' })).toHaveAttribute('href', '/termos');
    expect(within(folha).getByRole('button', { name: 'Sair' })).toBeVisible();
    expect(within(folha).queryByText('Área do dono')).toBeNull();
    expect(await violacoes(container.ownerDocument.body)).toEqual([]);
  });

  it('Sair encerra a sessão (POST /api/sessao/sair) e leva a /entrar', async () => {
    const f = api(EU_COM_GRUPOS, COM_GRUPOS, (url, init) =>
      url.endsWith('/api/sessao/sair') && init?.method === 'POST' ? new Response(null, { status: 204 }) : undefined,
    );
    const { roteador } = montarTela(<SeusGrupos />, '/app');
    const u = userEvent.setup();
    await screen.findByRole('list');
    await u.click(screen.getByRole('button', { name: 'Menu da conta' }));
    await u.click(screen.getByRole('button', { name: 'Sair' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/entrar'));
    expect(f.mock.calls.some(([url]) => String(url).endsWith('/api/sessao/sair'))).toBe(true);
  });

  it('Esc fecha a folha', async () => {
    api(EU_COM_GRUPOS, COM_GRUPOS);
    montarTela(<SeusGrupos />, '/app');
    const u = userEvent.setup();
    await screen.findByRole('list');
    await u.click(screen.getByRole('button', { name: 'Menu da conta' }));
    await u.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
