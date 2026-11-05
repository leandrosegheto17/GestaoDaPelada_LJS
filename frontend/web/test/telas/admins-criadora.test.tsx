import { adminsResposta } from '@pelada/contrato/acesso';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TEXTO_CRIADORA_NAO_REMOVIVEL } from '../../src/telas/admins/Admins.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, erroApi, json } from '../apoio/tela.tsx';

/**
 * Admins sem remover a criadora (grupos-e-elenco T70, SEC-001). A conta da sessão é Marquinhos, outra admin; a criadora
 * é Ana.
 */

const SESSAO_MARQUINHOS = {
  id: 'c-marq',
  nome: 'Marquinhos',
  email: 'marquinhos@exemplo.com.br',
  grupos: [
    { id: 'g-quinta', nome: 'Pelada de Quinta', slug: 'pelada-de-quinta', acessaFinanceiro: false },
  ],
};
const ANA = {
  id: 'c-ana',
  nome: 'Ana',
  email: 'ana@exemplo.test',
  acessaFinanceiro: true,
  criador: true,
};
const MARQUINHOS = {
  id: 'c-marq',
  nome: 'Marquinhos',
  email: 'marquinhos@exemplo.com.br',
  acessaFinanceiro: false,
  criador: false,
};
const BIA = {
  id: 'c-bia',
  nome: 'Bia',
  email: 'bia@exemplo.test',
  acessaFinanceiro: false,
  criador: false,
};

const BASE = '/api/grupos/g-quinta/admins';

afterEach(() => {
  cleanup();
});

describe('admins: a criadora não é removida (SEC-001)', () => {
  it('o contrato aceita a marca criador e continua aceitando a resposta sem ela', () => {
    expect(adminsResposta.safeParse({ admins: [ANA], convites: [] }).success).toBe(true);
    const { criador: _sem, ...anaSemMarca } = ANA;
    expect(adminsResposta.safeParse({ admins: [anaSemMarca], convites: [] }).success).toBe(true);
  });

  it('SEC-001: a linha da criadora não tem botão de remover; as outras têm; axe sem violação', async () => {
    const { container } = abrirTela('/app/grupos/g-quinta/admins', {
      'GET /api/sessao': () => json(200, SESSAO_MARQUINHOS),
      [`GET ${BASE}`]: () => json(200, { admins: [ANA, MARQUINHOS, BIA], convites: [] }),
    });
    const lista = await screen.findByRole('list', { name: 'Admins' });
    expect(within(lista).getByText('Ana')).toBeTruthy();
    expect(within(lista).queryByRole('button', { name: 'Remover Ana' })).toBeNull();
    expect(within(lista).getByRole('button', { name: 'Remover Bia' })).toBeTruthy();
    // A própria conta continua sem "Remover", como na CA.
    expect(within(lista).queryByRole('button', { name: 'Remover Marquinhos' })).toBeNull();
    await esperarSemViolacoes(container);
  });

  it('SEC-001: 409 criadora_nao_removivel mostra a mensagem em português e a tela segue de pé', async () => {
    // A lista antiga, sem a marca, deixa o botão aparecer; a API recusa e a tela explica.
    const { criador: _sem, ...anaSemMarca } = ANA;
    abrirTela('/app/grupos/g-quinta/admins', {
      'GET /api/sessao': () => json(200, SESSAO_MARQUINHOS),
      [`GET ${BASE}`]: () => json(200, { admins: [anaSemMarca, MARQUINHOS], convites: [] }),
      [`DELETE ${BASE}/c-ana`]: () => erroApi(409, 'criadora_nao_removivel'),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Remover Ana' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remover do grupo' }),
    );
    expect((await screen.findByRole('alert')).textContent).toBe(TEXTO_CRIADORA_NAO_REMOVIVEL);
    expect(TEXTO_CRIADORA_NAO_REMOVIVEL).toBe(
      'Quem criou o grupo não pode ser removida por outra admin.',
    );
    expect(screen.getByRole('list', { name: 'Admins' })).toBeTruthy();
    expect(screen.getByText('Ana')).toBeTruthy();
  });
});
