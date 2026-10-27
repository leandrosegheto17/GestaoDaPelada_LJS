// Critério: ACE-28, ACE-29, ACE-30, ACE-55 (mockup t32: carregando, sucesso, excluir, único admin, excluída)

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { violacoes } from '../../../test/apoio/axe';
import { corpoEnviado, erroApi, json, montarTela, simularApi } from '../../../test/apoio/tela';
import { MinhaConta } from './MinhaConta';

afterEach(() => vi.unstubAllGlobals());

const EU = {
  id: 'c1',
  nome: 'Leandro',
  email: 'leandro@exemplo.com.br',
  grupos: [{ id: 'g1', nome: 'Pelada de Quinta', slug: 'quinta', acessaFinanceiro: true }],
};

const ehExcluir = (url: string) => url.endsWith('/api/conta/excluir');

async function abrirDialogo() {
  const u = userEvent.setup();
  await u.click(await screen.findByRole('button', { name: 'Excluir minha conta' }));
  return u;
}

describe('MinhaConta: dados (t32 sucesso e carregando)', () => {
  it('mostra nome, e-mail, Trocar senha e a explicação da exclusão, sem violações do axe', async () => {
    simularApi(() => json(EU));
    const { container } = montarTela(<MinhaConta />, '/app/conta');
    expect(screen.getByRole('heading', { level: 1, name: 'Minha conta' })).toBeVisible();
    expect(await screen.findByText('leandro@exemplo.com.br')).toBeVisible();
    expect(screen.getByText('Leandro')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Trocar senha' })).toHaveAttribute('href', '/app/conta/senha');
    expect(screen.getByRole('link', { name: /Seus grupos/ })).toHaveAttribute('href', '/app');
    expect(screen.getByRole('heading', { level: 2, name: 'Segurança' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Excluir conta' })).toBeVisible();
    expect(
      screen.getByText(
        'Seu nome e seu e-mail são apagados e você perde o acesso a todos os grupos. Os dados dos grupos continuam com os outros admins.',
      ),
    ).toBeVisible();
    expect(await violacoes(container)).toEqual([]);
  });

  it('carregando: avisa "Carregando…" e marca a página como ocupada', async () => {
    simularApi(() => new Promise<Response>(() => undefined));
    const { container } = montarTela(<MinhaConta />, '/app/conta');
    expect(screen.getByRole('status')).toHaveTextContent('Carregando…');
    expect(container.querySelector('main')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('button', { name: 'Excluir minha conta' })).toBeNull();
    expect(await violacoes(container)).toEqual([]);
  });

  it('o botão da barra abre o menu da conta', async () => {
    simularApi(() => json(EU));
    montarTela(<MinhaConta />, '/app/conta');
    const u = userEvent.setup();
    await screen.findByText('leandro@exemplo.com.br');
    await u.click(screen.getByRole('button', { name: 'Menu da conta' }));
    expect(screen.getByRole('dialog', { name: 'Leandro' })).toBeVisible();
  });
});

describe('MinhaConta: diálogo de exclusão (ACE-28, ACE-30, t32 excluir)', () => {
  it('abre o alertdialog com a senha, foco em Cancelar, e Cancelar fecha sem chamar a API', async () => {
    const f = simularApi(() => json(EU));
    montarTela(<MinhaConta />, '/app/conta');
    const u = await abrirDialogo();
    const dialogo = screen.getByRole('alertdialog', { name: 'Excluir sua conta?' });
    expect(within(dialogo).getByText('Não dá para desfazer. Digite sua senha para confirmar.')).toBeVisible();
    expect(within(dialogo).getByLabelText('Senha')).toHaveAttribute('autocomplete', 'current-password');
    expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    expect(await violacoes(document.body)).toEqual([]);
    await u.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(f.mock.calls.some(([url]) => ehExcluir(String(url)))).toBe(false);
  });

  it('senha em branco mostra "Informe a senha." e não chama a API', async () => {
    const f = simularApi(() => json(EU));
    montarTela(<MinhaConta />, '/app/conta');
    const u = await abrirDialogo();
    await u.click(screen.getByRole('button', { name: 'Excluir conta' }));
    expect(await screen.findByText('Informe a senha.')).toBeVisible();
    expect(f.mock.calls.some(([url]) => ehExcluir(String(url)))).toBe(false);
  });

  it('ACE-30: senha errada (401) mostra "Senha incorreta." no campo e mantém o diálogo', async () => {
    simularApi((url) => (ehExcluir(url) ? erroApi(401, 'senha_atual_incorreta') : json(EU)));
    montarTela(<MinhaConta />, '/app/conta');
    const u = await abrirDialogo();
    await u.type(screen.getByLabelText('Senha'), 'errada-123');
    await u.click(screen.getByRole('button', { name: 'Excluir conta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Senha incorreta.');
    expect(screen.getByLabelText('Senha')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alertdialog')).toBeVisible();
    expect(await violacoes(document.body)).toEqual([]);
  });

  it('ACE-28: exclusão aceita (204) leva a / com o aviso "Sua conta foi excluída"', async () => {
    const f = simularApi((url) => (ehExcluir(url) ? new Response(null, { status: 204 }) : json(EU)));
    const { roteador } = montarTela(<MinhaConta />, '/app/conta', ['/']);
    const u = await abrirDialogo();
    await u.type(screen.getByLabelText('Senha'), 'senha-boa-123');
    await u.click(screen.getByRole('button', { name: 'Excluir conta' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/'));
    expect(roteador.state.location.search).toBe('?aviso=conta-excluida');
    const indice = f.mock.calls.findIndex(([url]) => ehExcluir(String(url)));
    expect(corpoEnviado(f, indice)).toEqual({ senha: 'senha-boa-123' });
  });

  it('falha de conexão mostra o erro de envio e mantém o diálogo e a senha', async () => {
    simularApi((url) => {
      if (ehExcluir(url)) throw new TypeError('rede');
      return json(EU);
    });
    montarTela(<MinhaConta />, '/app/conta');
    const u = await abrirDialogo();
    await u.type(screen.getByLabelText('Senha'), 'senha-boa-123');
    await u.click(screen.getByRole('button', { name: 'Excluir conta' }));
    expect(await screen.findByText('Não foi possível enviar. Verifique a conexão.')).toBeVisible();
    expect(screen.getByLabelText('Senha')).toHaveValue('senha-boa-123');
  });
});

describe('MinhaConta: único admin (ACE-29, t32 único admin)', () => {
  it('409 fecha o diálogo e lista os grupos com o convite de admin', async () => {
    simularApi((url) =>
      ehExcluir(url)
        ? json(
            {
              erro: {
                codigo: 'unico_admin',
                mensagem: 'Você é a única pessoa admin de grupos.',
                grupos: [
                  { id: 'g1', nome: 'Pelada de Quinta' },
                  { id: 'g2', nome: 'Racha de Domingo' },
                ],
              },
            },
            409,
          )
        : json(EU),
    );
    const { container } = montarTela(<MinhaConta />, '/app/conta');
    const u = await abrirDialogo();
    await u.type(screen.getByLabelText('Senha'), 'senha-boa-123');
    await u.click(screen.getByRole('button', { name: 'Excluir conta' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(
      'Você é o único admin destes grupos. Convide outro admin ou arquive o grupo antes de excluir a conta.',
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
    const links = screen.getAllByRole('link', { name: /Convidar admin/ });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', '/app/grupos/g1/admins');
    expect(links[0]).toHaveTextContent('Pelada de Quinta');
    expect(links[1]).toHaveAttribute('href', '/app/grupos/g2/admins');
    expect(links[1]).toHaveTextContent('Racha de Domingo');
    expect(screen.getByRole('button', { name: 'Excluir minha conta' })).toBeVisible();
    expect(await violacoes(container)).toEqual([]);
  });
});
