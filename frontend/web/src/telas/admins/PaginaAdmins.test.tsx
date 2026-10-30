// Critério: ACE-31, ACE-32, ACE-37, ACE-38, ACE-39, ACE-40, ACE-54 (mockup t19: lista, convite enviado, já admin,
// remover, último admin, carregando)

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarClienteConsultas } from '../../dados/consultas';
import { violacoes } from '../../../test/apoio/axe';
import { corpoEnviado, erroApi, json, simularApi } from '../../../test/apoio/tela';
import { PaginaAdmins } from './PaginaAdmins';

afterEach(() => vi.unstubAllGlobals());

const CAMINHO = '/app/grupos/g1/admins';
const EU = {
  id: 'c1',
  nome: 'Leandro',
  email: 'leandro@exemplo.com.br',
  grupos: [{ id: 'g1', nome: 'Pelada de Quinta', slug: 'quinta', acessaFinanceiro: true }],
};
const LEANDRO = { id: 'c1', nome: 'Leandro', email: 'leandro@exemplo.com.br', acessaFinanceiro: true };
const MARQUINHOS = { id: 'c2', nome: 'Marquinhos', email: 'marquinhos@exemplo.com.br', acessaFinanceiro: false };
const PAULO = { id: 'v1', email: 'paulo.goleiro@exemplo.com.br', expiraEm: '2026-10-30T15:00:00.000Z' };

const termina = (url: string, fim: string) => url.endsWith(`/api${fim}`);

interface Estado {
  admins: unknown[];
  convites: unknown[];
}

/** API em memória: lista, convida, cancela e remove, e deixa o teste sobrescrever respostas. */
function api(estado: Estado, extras?: (url: string, init: RequestInit | undefined) => Response | undefined) {
  return simularApi((url, init) => {
    const extra = extras?.(url, init);
    if (extra) return extra;
    if (termina(url, '/sessao')) return json(EU);
    if (termina(url, '/grupos/g1/admins')) return json(estado);
    return json({});
  });
}

function abrir() {
  const roteador = createMemoryRouter(
    [
      { path: '/app/grupos/:grupoId/admins', element: <PaginaAdmins /> },
      { path: '/app', element: <p>Destino /app</p> },
    ],
    { initialEntries: [CAMINHO] },
  );
  return render(
    <QueryClientProvider client={criarClienteConsultas({ aoSessaoExpirada: () => undefined })}>
      <RouterProvider router={roteador} />
    </QueryClientProvider>,
  );
}

describe('PaginaAdmins: lista (ACE-37, t19 sucesso)', () => {
  it('mostra os admins, "(você)", o selo Financeiro, Remover só nos outros e os convites pendentes', async () => {
    api({ admins: [LEANDRO, MARQUINHOS], convites: [PAULO] });
    const { container } = abrir();
    expect(await screen.findByText('Leandro (você)')).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Admins' })).toBeVisible();
    expect(screen.getByText('leandro@exemplo.com.br')).toBeVisible();
    expect(screen.getByText('Marquinhos')).toBeVisible();
    expect(screen.getAllByText('Financeiro')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /^Remover/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Remover Marquinhos' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Convites pendentes' })).toBeVisible();
    expect(screen.getByText('paulo.goleiro@exemplo.com.br')).toBeVisible();
    expect(screen.getByText('Vale até 30/10/2026')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cancelar convite de paulo.goleiro@exemplo.com.br' })).toBeVisible();
    expect(screen.getByText('Pelada de Quinta')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Trocar grupo' })).toHaveAttribute('href', '/app');
    expect(screen.getByRole('link', { name: /Início/ })).toHaveAttribute('href', '/app');
    expect(await violacoes(container)).toEqual([]);
  });

  it('sem convites pendentes não mostra a seção', async () => {
    api({ admins: [LEANDRO, MARQUINHOS], convites: [] });
    abrir();
    await screen.findByText('Leandro (você)');
    expect(screen.queryByRole('heading', { name: 'Convites pendentes' })).toBeNull();
  });

  it('ACE-40 (t19 último admin): com um só admin não há Remover e o aviso explica a regra', async () => {
    api({ admins: [LEANDRO], convites: [] });
    const { container } = abrir();
    await screen.findByText('Leandro (você)');
    expect(screen.queryByRole('button', { name: /^Remover/ })).toBeNull();
    expect(
      screen.getByText('Você é o único admin deste grupo. Todo grupo precisa de pelo menos um admin.'),
    ).toBeVisible();
    expect(await violacoes(container)).toEqual([]);
  });

  it('carregando: mostra "Carregando…" e já traz o formulário de convite (t19 carregando)', async () => {
    simularApi((url) => (termina(url, '/sessao') ? json(EU) : new Promise<Response>(() => undefined)));
    const { container } = abrir();
    expect(screen.getByRole('status')).toHaveTextContent('Carregando…');
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByLabelText('E-mail')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Enviar convite' })).toBeVisible();
    expect(screen.queryByRole('list')).toBeNull();
    expect(await violacoes(container)).toEqual([]);
  });

  it('falha de conexão ao listar mostra o erro com "Tentar de novo"', async () => {
    let tentativas = 0;
    simularApi((url) => {
      if (termina(url, '/sessao')) return json(EU);
      tentativas += 1;
      if (tentativas <= 2) throw new TypeError('rede');
      return json({ admins: [LEANDRO], convites: [] });
    });
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Tentar de novo' }, { timeout: 3000 }));
    expect(await screen.findByText('Leandro (você)')).toBeVisible();
  });
});

describe('PaginaAdmins: convidar (ACE-31, ACE-32, t19 convite enviado e já admin)', () => {
  it('mostra o formulário com o texto de apoio', async () => {
    api({ admins: [LEANDRO], convites: [] });
    abrir();
    expect(await screen.findByRole('heading', { level: 2, name: 'Convidar admin' })).toBeVisible();
    expect(
      screen.getByText('A pessoa recebe um link por e-mail. Se ainda não tiver conta, cria uma pelo próprio link.'),
    ).toBeVisible();
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('type', 'email');
  });

  it('ACE-31: envia o e-mail, mostra "Convite enviado para ... Vale por 7 dias." e atualiza os pendentes', async () => {
    const estado: Estado = { admins: [LEANDRO], convites: [] };
    const novo = { id: 'v2', email: 'rodrigo@exemplo.com.br', expiraEm: '2026-11-03T15:00:00.000Z' };
    const f = api(estado, (url, init) => {
      if (termina(url, '/grupos/g1/admins/convites') && init?.method === 'POST') {
        estado.convites = [novo];
        return json(novo, 201);
      }
      return undefined;
    });
    const { container } = abrir();
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText('E-mail'), 'rodrigo@exemplo.com.br');
    await u.click(screen.getByRole('button', { name: 'Enviar convite' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Convite enviado para rodrigo@exemplo.com.br. Vale por 7 dias.',
    );
    const indice = f.mock.calls.findIndex(([url]) => termina(String(url), '/grupos/g1/admins/convites'));
    expect(corpoEnviado(f, indice)).toEqual({ email: 'rodrigo@exemplo.com.br' });
    expect(await screen.findByText('Vale até 03/11/2026')).toBeVisible();
    expect(screen.getByLabelText('E-mail')).toHaveValue('');
    expect(await violacoes(container)).toEqual([]);
  });

  it('e-mail inválido mostra o erro no campo e não envia', async () => {
    const f = api({ admins: [LEANDRO], convites: [] });
    abrir();
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText('E-mail'), 'sem-arroba');
    await u.click(screen.getByRole('button', { name: 'Enviar convite' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.getByLabelText('E-mail')).toBeInvalid();
    expect(f.mock.calls.some(([url]) => termina(String(url), '/grupos/g1/admins/convites'))).toBe(false);
  });

  it('ACE-32: 409 ja_e_admin mostra "Essa pessoa já é admin do grupo." no campo e mantém o e-mail', async () => {
    api({ admins: [LEANDRO, MARQUINHOS], convites: [] }, (url, init) =>
      termina(url, '/grupos/g1/admins/convites') && init?.method === 'POST' ? erroApi(409, 'ja_e_admin') : undefined,
    );
    const { container } = abrir();
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText('E-mail'), 'marquinhos@exemplo.com.br');
    await u.click(screen.getByRole('button', { name: 'Enviar convite' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Essa pessoa já é admin do grupo.');
    expect(screen.getByLabelText('E-mail')).toBeInvalid();
    expect(screen.getByLabelText('E-mail')).toHaveValue('marquinhos@exemplo.com.br');
    expect(await violacoes(container)).toEqual([]);
  });

  it('ACE-52: e-mail indisponível (503) mostra o erro de envio de e-mail', async () => {
    api({ admins: [LEANDRO], convites: [] }, (url, init) =>
      termina(url, '/grupos/g1/admins/convites') && init?.method === 'POST'
        ? erroApi(503, 'email_indisponivel')
        : undefined,
    );
    abrir();
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText('E-mail'), 'rodrigo@exemplo.com.br');
    await u.click(screen.getByRole('button', { name: 'Enviar convite' }));
    expect(
      await screen.findByText('Não conseguimos enviar o e-mail agora. Tente de novo em alguns minutos.'),
    ).toBeVisible();
  });

  it('falha de conexão mostra o erro de envio e mantém o e-mail', async () => {
    api({ admins: [LEANDRO], convites: [] }, (url, init) => {
      if (termina(url, '/grupos/g1/admins/convites') && init?.method === 'POST') throw new TypeError('rede');
      return undefined;
    });
    abrir();
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText('E-mail'), 'rodrigo@exemplo.com.br');
    await u.click(screen.getByRole('button', { name: 'Enviar convite' }));
    expect(await screen.findByText('Não foi possível enviar. Verifique a conexão.')).toBeVisible();
    expect(screen.getByLabelText('E-mail')).toHaveValue('rodrigo@exemplo.com.br');
  });
});

describe('PaginaAdmins: cancelar convite (ACE-38)', () => {
  it('cancela o convite pendente (DELETE) e a lista é atualizada', async () => {
    const estado: Estado = { admins: [LEANDRO, MARQUINHOS], convites: [PAULO] };
    const f = api(estado, (url, init) => {
      if (termina(url, '/grupos/g1/admins/convites/v1') && init?.method === 'DELETE') {
        estado.convites = [];
        return new Response(null, { status: 204 });
      }
      return undefined;
    });
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Cancelar convite de paulo.goleiro@exemplo.com.br' }));
    await waitFor(() => expect(screen.queryByText('paulo.goleiro@exemplo.com.br')).toBeNull());
    expect(
      f.mock.calls.some(
        ([url, init]) => termina(String(url), '/grupos/g1/admins/convites/v1') && init?.method === 'DELETE',
      ),
    ).toBe(true);
    expect(screen.queryByRole('heading', { name: 'Convites pendentes' })).toBeNull();
  });

  it('falha ao cancelar mostra o erro de envio e mantém o convite', async () => {
    api({ admins: [LEANDRO], convites: [PAULO] }, (url, init) => {
      if (init?.method === 'DELETE') throw new TypeError('rede');
      return undefined;
    });
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Cancelar convite de paulo.goleiro@exemplo.com.br' }));
    expect(await screen.findByText('Não foi possível enviar. Verifique a conexão.')).toBeVisible();
    expect(screen.getByText('paulo.goleiro@exemplo.com.br')).toBeVisible();
  });
});

describe('PaginaAdmins: remover (ACE-39, ACE-40, t19 remover)', () => {
  it('abre o alertdialog com o nome, foco em Cancelar, e Cancelar fecha sem chamar a API', async () => {
    const f = api({ admins: [LEANDRO, MARQUINHOS], convites: [] });
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Remover Marquinhos' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Remover Marquinhos do grupo?' });
    expect(within(dialogo).getByText('Ele perde o acesso a este grupo na hora.')).toBeVisible();
    expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    expect(await violacoes(document.body)).toEqual([]);
    await u.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(f.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
  });

  it('ACE-39: "Remover do grupo" apaga o vínculo (DELETE) e atualiza a lista', async () => {
    const estado: Estado = { admins: [LEANDRO, MARQUINHOS], convites: [] };
    const f = api(estado, (url, init) => {
      if (termina(url, '/grupos/g1/admins/c2') && init?.method === 'DELETE') {
        estado.admins = [LEANDRO];
        return new Response(null, { status: 204 });
      }
      return undefined;
    });
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Remover Marquinhos' }));
    await u.click(screen.getByRole('button', { name: 'Remover do grupo' }));
    await waitFor(() => expect(screen.queryByText('Marquinhos')).toBeNull());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(
      f.mock.calls.some(([url, init]) => termina(String(url), '/grupos/g1/admins/c2') && init?.method === 'DELETE'),
    ).toBe(true);
  });

  it('ACE-40: 409 ultimo_admin fecha o diálogo e explica que o grupo precisa de um admin', async () => {
    api({ admins: [LEANDRO, MARQUINHOS], convites: [] }, (url, init) =>
      termina(url, '/grupos/g1/admins/c2') && init?.method === 'DELETE' ? erroApi(409, 'ultimo_admin') : undefined,
    );
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Remover Marquinhos' }));
    await u.click(screen.getByRole('button', { name: 'Remover do grupo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('O grupo precisa de pelo menos uma pessoa admin.');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText('Marquinhos')).toBeVisible();
  });

  it('falha de conexão ao remover mostra o erro de envio dentro do diálogo', async () => {
    api({ admins: [LEANDRO, MARQUINHOS], convites: [] }, (url, init) => {
      if (init?.method === 'DELETE') throw new TypeError('rede');
      return undefined;
    });
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Remover Marquinhos' }));
    await u.click(screen.getByRole('button', { name: 'Remover do grupo' }));
    expect(await screen.findByText('Não foi possível enviar. Verifique a conexão.')).toBeVisible();
    expect(screen.getByRole('alertdialog')).toBeVisible();
  });
});

// Critério: SEC-001 (T72). A conta da sessão (c1) é convidada; a criadora é c0.
describe('PaginaAdmins: a criadora não é removível (SEC-001)', () => {
  const ROSA = { id: 'c0', nome: 'Rosa', email: 'rosa@exemplo.com.br', acessaFinanceiro: true };

  it('a linha da criadora não tem Remover; as outras mantêm', async () => {
    api({ admins: [ROSA, LEANDRO, MARQUINHOS], convites: [], criadoraId: 'c0' } as Estado);
    const { container } = abrir();
    expect(await screen.findByText('Rosa')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Remover Rosa' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remover Marquinhos' })).toBeVisible();
    expect(screen.getAllByRole('button', { name: /^Remover/ })).toHaveLength(1);
    expect(await violacoes(container)).toEqual([]);
  });

  it('409 criadora_nao_removivel fecha o diálogo, explica em português e mantém a lista', async () => {
    // Lista sem criadoraId (resposta antiga): o botão aparece e a API recusa.
    api({ admins: [ROSA, LEANDRO], convites: [] }, (url, init) =>
      termina(url, '/grupos/g1/admins/c0') && init?.method === 'DELETE'
        ? erroApi(409, 'criadora_nao_removivel')
        : undefined,
    );
    const { container } = abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Remover Rosa' }));
    await u.click(screen.getByRole('button', { name: 'Remover do grupo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A pessoa que criou o grupo não pode ser removida por outra admin.',
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText('Rosa')).toBeVisible();
    expect(screen.getByText('Leandro (você)')).toBeVisible();
    expect(screen.queryByText('Não foi possível enviar. Verifique a conexão.')).toBeNull();
    expect(await violacoes(container)).toEqual([]);
  });
});
