import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  dataDoConvite,
  ERRO_JA_ADMIN,
  TEXTO_CONVITE_ENVIADO,
  TEXTO_ULTIMO_ADMIN,
  TEXTO_UNICO_ADMIN_GRUPO,
} from '../../src/telas/admins/Admins.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, erroApi, json, pendente, type Manipulador } from '../apoio/tela.tsx';

const SESSAO_LEANDRO = {
  id: 'c-leandro',
  nome: 'Leandro',
  email: 'leandro@exemplo.com.br',
  grupos: [{ id: 'g-quinta', nome: 'Pelada de Quinta', slug: 'pelada-de-quinta', acessaFinanceiro: true }],
};
const LEANDRO = { id: 'c-leandro', nome: 'Leandro', email: 'leandro@exemplo.com.br', acessaFinanceiro: true };
const MARQUINHOS = { id: 'c-marq', nome: 'Marquinhos', email: 'marquinhos@exemplo.com.br', acessaFinanceiro: false };
const PAULO = { id: 'cv-paulo', email: 'paulo.goleiro@exemplo.com.br', expiraEm: '2026-10-30T12:00:00.000Z' };
const RODRIGO = { id: 'cv-rodrigo', email: 'rodrigo@exemplo.com.br', expiraEm: '2026-11-03T12:00:00.000Z' };

const BASE = '/api/grupos/g-quinta/admins';

afterEach(() => {
  cleanup();
});

/** Lista que muda: cada manipulador pode trocar `estado` e a próxima leitura já vem nova. */
function abrir(inicial: { admins: unknown[]; convites: unknown[] }, api: (estado: typeof inicial) => Record<string, Manipulador> = () => ({})) {
  const estado = { ...inicial };
  return abrirTela('/app/grupos/g-quinta/admins', {
    'GET /api/sessao': () => json(200, SESSAO_LEANDRO),
    [`GET ${BASE}`]: () => json(200, estado),
    ...api(estado),
  });
}

describe('tela Admins do grupo', () => {
  it('ACE-56: enquanto carrega, mostra o carregando e o formulário de convite; axe sem violação', async () => {
    const { container } = abrirTela('/app/grupos/g-quinta/admins', {
      'GET /api/sessao': () => json(200, SESSAO_LEANDRO),
      [`GET ${BASE}`]: () => pendente(),
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Admins' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Carregando…');
    expect(screen.getByLabelText('E-mail')).toBeTruthy();
    await esperarSemViolacoes(container);
  });

  it('ACE-37: lista os admins e os convites pendentes; o da sessão sem "Remover"; axe sem violação', async () => {
    const { container } = abrir({ admins: [LEANDRO, MARQUINHOS], convites: [PAULO] });
    const admins = await screen.findByRole('list', { name: 'Admins' });
    expect(within(admins).getByText('Leandro (você)')).toBeTruthy();
    expect(within(admins).getByText('marquinhos@exemplo.com.br')).toBeTruthy();
    expect(within(admins).getByText('Financeiro')).toBeTruthy();
    expect(within(admins).getAllByRole('button', { name: /Remover/ })).toHaveLength(1);
    expect(within(admins).getByRole('button', { name: 'Remover Marquinhos' })).toBeTruthy();
    const convites = screen.getByRole('list', { name: 'Convites pendentes' });
    expect(within(convites).getByText('paulo.goleiro@exemplo.com.br')).toBeTruthy();
    expect(within(convites).getByText(`Vale até ${dataDoConvite(PAULO.expiraEm)}`)).toBeTruthy();
    expect(screen.getByText('Pelada de Quinta')).toBeTruthy();
    await esperarSemViolacoes(container);
  });

  it('dataDoConvite: data no formato dd/mm/aaaa no fuso de Brasília', () => {
    expect(dataDoConvite('2026-10-30T12:00:00.000Z')).toBe('30/10/2026');
    expect(dataDoConvite('2026-11-01T02:00:00.000Z')).toBe('31/10/2026');
  });

  it('ACE-31, ACE-37: convidar mostra o estado convite enviado e o convite aparece na lista de pendentes', async () => {
    const { chamadasA } = abrir({ admins: [LEANDRO, MARQUINHOS], convites: [] }, (estado) => ({
      [`POST ${BASE}/convites`]: () => {
        estado.convites = [RODRIGO];
        return json(201, RODRIGO);
      },
    }));
    fireEvent.change(await screen.findByLabelText('E-mail'), { target: { value: 'rodrigo@exemplo.com.br' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar convite' }));
    expect(await screen.findByText(TEXTO_CONVITE_ENVIADO('rodrigo@exemplo.com.br'))).toBeTruthy();
    const convites = await screen.findByRole('list', { name: 'Convites pendentes' });
    expect(within(convites).getByText('rodrigo@exemplo.com.br')).toBeTruthy();
    expect(chamadasA('POST', `${BASE}/convites`).map((c) => c.corpo)).toEqual([{ email: 'rodrigo@exemplo.com.br' }]);
    expect((screen.getByLabelText('E-mail') as HTMLInputElement).value).toBe('');
  });

  it('ACE-31: e-mail inválido marca o campo e não chama a API', async () => {
    const { chamadasA } = abrir({ admins: [LEANDRO], convites: [] });
    fireEvent.change(await screen.findByLabelText('E-mail'), { target: { value: 'rodrigo@' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar convite' }));
    await waitFor(() => expect(document.getElementById('email-convite-erro')).toBeTruthy());
    expect(chamadasA('POST', `${BASE}/convites`)).toHaveLength(0);
  });

  it('ACE-32: 409 ja_e_admin marca o campo com "Essa pessoa já é admin do grupo."; axe sem violação', async () => {
    const { container } = abrir({ admins: [LEANDRO, MARQUINHOS], convites: [] }, () => ({
      [`POST ${BASE}/convites`]: () => erroApi(409, 'ja_e_admin'),
    }));
    fireEvent.change(await screen.findByLabelText('E-mail'), { target: { value: 'marquinhos@exemplo.com.br' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar convite' }));
    await waitFor(() => expect(document.getElementById('email-convite-erro')?.textContent).toBe(ERRO_JA_ADMIN));
    expect(screen.getByLabelText('E-mail').getAttribute('aria-invalid')).toBe('true');
    expect(screen.queryByText(/Convite enviado para/)).toBeNull();
    await esperarSemViolacoes(container);
  });

  it('ACE-52: 503 email_indisponivel mostra a mensagem da API no formulário', async () => {
    abrir({ admins: [LEANDRO], convites: [] }, () => ({
      [`POST ${BASE}/convites`]: () =>
        json(503, { erro: 'Não conseguimos enviar o e-mail agora. Tente de novo em alguns minutos.', codigo: 'email_indisponivel' }),
    }));
    fireEvent.change(await screen.findByLabelText('E-mail'), { target: { value: 'rodrigo@exemplo.com.br' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar convite' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Não conseguimos enviar o e-mail agora');
  });

  it('ACE-38: cancelar chama o DELETE do convite e atualiza a lista', async () => {
    const { chamadasA } = abrir({ admins: [LEANDRO, MARQUINHOS], convites: [PAULO] }, (estado) => ({
      [`DELETE ${BASE}/convites/cv-paulo`]: () => {
        estado.convites = [];
        return json(204);
      },
    }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar convite de paulo.goleiro@exemplo.com.br' }));
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Convites pendentes' })).toBeNull());
    expect(chamadasA('DELETE', `${BASE}/convites/cv-paulo`)).toHaveLength(1);
  });

  it('ACE-39: remover pede confirmação, chama o DELETE do admin e atualiza a lista; axe sem violação com o diálogo', async () => {
    const { container, chamadasA } = abrir({ admins: [LEANDRO, MARQUINHOS], convites: [] }, (estado) => ({
      [`DELETE ${BASE}/c-marq`]: () => {
        estado.admins = [LEANDRO];
        return json(204);
      },
    }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remover Marquinhos' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Remover Marquinhos do grupo?' });
    expect(document.activeElement).toBe(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(chamadasA('DELETE', `${BASE}/c-marq`)).toHaveLength(0);
    await esperarSemViolacoes(container);
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Remover do grupo' }));
    await waitFor(() => expect(screen.queryByText('Marquinhos')).toBeNull());
    expect(chamadasA('DELETE', `${BASE}/c-marq`)).toHaveLength(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await screen.findByText(TEXTO_UNICO_ADMIN_GRUPO)).toBeTruthy();
  });

  it('ACE-39: Cancelar no diálogo não remove', async () => {
    const { chamadasA } = abrir({ admins: [LEANDRO, MARQUINHOS], convites: [] });
    fireEvent.click(await screen.findByRole('button', { name: 'Remover Marquinhos' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(chamadasA('DELETE', `${BASE}/c-marq`)).toHaveLength(0);
    expect(screen.getByText('Marquinhos')).toBeTruthy();
  });

  it('ACE-40: 409 ultimo_admin mostra o aviso de último admin e mantém a pessoa na lista', async () => {
    abrir({ admins: [LEANDRO, MARQUINHOS], convites: [] }, () => ({
      [`DELETE ${BASE}/c-marq`]: () => erroApi(409, 'ultimo_admin'),
    }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remover Marquinhos' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remover do grupo' }));
    expect((await screen.findByRole('alert')).textContent).toBe(TEXTO_ULTIMO_ADMIN);
    expect(screen.getByText('Marquinhos')).toBeTruthy();
  });

  it('ACE-40: com um admin só, sem "Remover" e com o aviso do t19 último admin', async () => {
    abrir({ admins: [LEANDRO], convites: [] });
    expect(await screen.findByText(TEXTO_UNICO_ADMIN_GRUPO)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Remover/ })).toBeNull();
  });

  it('ACE-56: erro ao carregar mostra o erro com "Tentar de novo", que relê a lista', async () => {
    let falhar = true;
    const { chamadasA } = abrirTela('/app/grupos/g-quinta/admins', {
      'GET /api/sessao': () => json(200, SESSAO_LEANDRO),
      [`GET ${BASE}`]: () => (falhar ? erroApi(500, 'nao_encontrado') : json(200, { admins: [LEANDRO], convites: [] })),
    });
    const tentar = await screen.findByRole('button', { name: 'Tentar de novo' });
    falhar = false;
    fireEvent.click(tentar);
    expect(await screen.findByText('Leandro (você)')).toBeTruthy();
    expect(chamadasA('GET', BASE)).toHaveLength(2);
  });

  it('ACE-41: 404 da lista mostra "Grupo não encontrado."', async () => {
    abrirTela('/app/grupos/g-outro/admins', {
      'GET /api/sessao': () => json(200, SESSAO_LEANDRO),
      'GET /api/grupos/g-outro/admins': () => erroApi(404, 'nao_encontrado'),
    });
    expect(await screen.findByText('Grupo não encontrado.')).toBeTruthy();
  });
});
