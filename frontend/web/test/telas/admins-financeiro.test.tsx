import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TEXTO_AJUDA_PROPRIO_ACESSO } from '../../src/telas/admins/Admins.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, json, type Manipulador } from '../apoio/tela.tsx';

/**
 * Selo e interruptor "Acessa financeiro" nos admins (financeiro T44; FIN-35, FIN-36, FIN-51), do mockup do legado
 * (`L:.md/mockup/telas/t19-admins--sucesso.html:18-19`) com os tokens do guia. Molde: `admins.test.tsx`.
 */

const SESSAO_LEANDRO = {
  id: 'c-leandro',
  nome: 'Leandro',
  email: 'leandro@exemplo.com.br',
  grupos: [
    { id: 'g-quinta', nome: 'Pelada de Quinta', slug: 'pelada-de-quinta', acessaFinanceiro: true },
  ],
};
const SESSAO_MARQUINHOS = {
  id: 'c-marq',
  nome: 'Marquinhos',
  email: 'marquinhos@exemplo.com.br',
  grupos: [
    { id: 'g-quinta', nome: 'Pelada de Quinta', slug: 'pelada-de-quinta', acessaFinanceiro: false },
  ],
};
const LEANDRO = {
  id: 'c-leandro',
  nome: 'Leandro',
  email: 'leandro@exemplo.com.br',
  acessaFinanceiro: true,
};
const MARQUINHOS = {
  id: 'c-marq',
  nome: 'Marquinhos',
  email: 'marquinhos@exemplo.com.br',
  acessaFinanceiro: false,
};
const BIA = { id: 'c-bia', nome: 'Bia', email: 'bia@exemplo.test', acessaFinanceiro: true };

const BASE = '/api/grupos/g-quinta/admins';

function abrir(sessao: unknown, admins: unknown[], api: Record<string, Manipulador> = {}) {
  return abrirTela('/app/grupos/g-quinta/admins', {
    'GET /api/sessao': () => json(200, sessao),
    [`GET ${BASE}`]: () => json(200, { admins, convites: [] }),
    ...api,
  });
}

function interruptor(nome: string): HTMLInputElement {
  return screen.getByRole('switch', { name: `Acessa financeiro: ${nome}` }) as HTMLInputElement;
}

afterEach(() => {
  cleanup();
});

describe('admins: acesso ao financeiro (t19)', () => {
  it('FIN-51: com acesso, um switch por admin com o rótulo; o próprio marcado, desabilitado e com a ajuda; axe sem violação', async () => {
    const { container } = abrir(SESSAO_LEANDRO, [LEANDRO, MARQUINHOS, BIA]);
    const lista = await screen.findByRole('list', { name: 'Admins' });
    expect(within(lista).getAllByRole('switch')).toHaveLength(3);

    const proprio = interruptor('Leandro');
    expect(proprio.checked).toBe(true);
    expect(proprio.disabled).toBe(true);
    const ajuda = document.getElementById(proprio.getAttribute('aria-describedby') ?? '');
    expect(ajuda?.textContent).toBe(TEXTO_AJUDA_PROPRIO_ACESSO);

    expect(interruptor('Marquinhos').checked).toBe(false);
    expect(interruptor('Marquinhos').disabled).toBe(false);
    expect(interruptor('Bia').checked).toBe(true);
    expect(interruptor('Bia').disabled).toBe(false);
    expect(interruptor('Bia').getAttribute('aria-describedby')).toBeNull();
    await esperarSemViolacoes(container);
  });

  it('FIN-51: o da própria conta segue a permissão (conta com acesso que outro admin pode retirar)', async () => {
    abrir(SESSAO_LEANDRO, [LEANDRO, MARQUINHOS]);
    await screen.findByRole('list', { name: 'Admins' });
    expect(
      screen.getByRole('switch', { name: 'Acessa financeiro: Leandro', checked: true }),
    ).toBeTruthy();
    expect(
      screen.getByRole('switch', { name: 'Acessa financeiro: Marquinhos', checked: false }),
    ).toBeTruthy();
  });

  it('FIN-51: sem acesso, só selos nos que acessam, nenhum switch; axe sem violação', async () => {
    const { container } = abrir(SESSAO_MARQUINHOS, [LEANDRO, MARQUINHOS, BIA]);
    const lista = await screen.findByRole('list', { name: 'Admins' });
    expect(within(lista).queryAllByRole('switch')).toHaveLength(0);
    expect(within(lista).getAllByText('Financeiro')).toHaveLength(2);
    const linhaMarquinhos = within(lista)
      .getByText('Marquinhos (você)')
      .closest('li') as HTMLElement;
    expect(within(linhaMarquinhos).queryByText('Financeiro')).toBeNull();
    await esperarSemViolacoes(container);
  });

  it('FIN-35: alternar chama o PATCH e mostra o estado devolvido', async () => {
    const { chamadasA } = abrir(SESSAO_LEANDRO, [LEANDRO, MARQUINHOS], {
      [`PATCH ${BASE}/c-marq/financeiro`]: () =>
        json(200, { admins: [LEANDRO, { ...MARQUINHOS, acessaFinanceiro: true }], convites: [] }),
    });
    await screen.findByRole('list', { name: 'Admins' });
    fireEvent.click(interruptor('Marquinhos'));
    await waitFor(() => expect(interruptor('Marquinhos').checked).toBe(true));
    expect(chamadasA('PATCH', `${BASE}/c-marq/financeiro`)[0]?.corpo).toEqual({
      acessaFinanceiro: true,
    });
  });

  it('FIN-35: retirar envia acessaFinanceiro false e redesenha com a lista devolvida', async () => {
    const { chamadasA } = abrir(SESSAO_LEANDRO, [LEANDRO, BIA], {
      [`PATCH ${BASE}/c-bia/financeiro`]: () =>
        json(200, { admins: [LEANDRO, { ...BIA, acessaFinanceiro: false }], convites: [] }),
    });
    await screen.findByRole('list', { name: 'Admins' });
    fireEvent.click(interruptor('Bia'));
    await waitFor(() => expect(interruptor('Bia').checked).toBe(false));
    expect(chamadasA('PATCH', `${BASE}/c-bia/financeiro`)[0]?.corpo).toEqual({
      acessaFinanceiro: false,
    });
  });

  it('FIN-36: 409 acao_na_propria_conta mostra a mensagem na faixa', async () => {
    abrir(SESSAO_LEANDRO, [LEANDRO, MARQUINHOS], {
      [`PATCH ${BASE}/c-marq/financeiro`]: () =>
        json(409, {
          erro: 'Você não pode alterar a sua própria permissão.',
          codigo: 'acao_na_propria_conta',
        }),
    });
    await screen.findByRole('list', { name: 'Admins' });
    fireEvent.click(interruptor('Marquinhos'));
    expect(await screen.findByText('Você não pode alterar a sua própria permissão.')).toBeTruthy();
    await waitFor(() => expect(interruptor('Marquinhos').checked).toBe(false));
  });

  it('FIN-36: 403 sem_permissao_financeiro mostra a mensagem na faixa e o estado não muda', async () => {
    abrir(SESSAO_LEANDRO, [LEANDRO, MARQUINHOS], {
      [`PATCH ${BASE}/c-marq/financeiro`]: () =>
        json(403, {
          erro: 'Você não tem acesso ao financeiro deste grupo.',
          codigo: 'sem_permissao_financeiro',
        }),
    });
    await screen.findByRole('list', { name: 'Admins' });
    fireEvent.click(interruptor('Marquinhos'));
    expect(await screen.findByText('Você não tem acesso ao financeiro deste grupo.')).toBeTruthy();
    expect(interruptor('Marquinhos').checked).toBe(false);
  });
});
