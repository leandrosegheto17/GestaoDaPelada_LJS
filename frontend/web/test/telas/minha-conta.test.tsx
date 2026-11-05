import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TEXTO_CONTA_EXCLUIDA } from '../../src/paginas/Mensagens.tsx';
import {
  ERRO_SENHA_INCORRETA,
  TEXTO_UNICO_ADMIN,
} from '../../src/telas/minha-conta/MinhaConta.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, erroApi, json, type Manipulador } from '../apoio/tela.tsx';

const SESSAO_LEANDRO = {
  id: 'c-leandro',
  nome: 'Leandro',
  email: 'leandro@exemplo.com.br',
  grupos: [
    { id: 'g-quinta', nome: 'Pelada de Quinta', slug: 'pelada-de-quinta', acessaFinanceiro: true },
  ],
};

const ERRO_UNICO_ADMIN = {
  erro: 'Você é a única admin de alguns grupos.',
  codigo: 'unico_admin',
  grupos: [
    { id: 'g-quinta', nome: 'Pelada de Quinta' },
    { id: 'g-domingo', nome: 'Racha de Domingo' },
  ],
};

afterEach(() => {
  cleanup();
});

function abrir(api: Record<string, Manipulador> = {}) {
  return abrirTela('/app/conta', { 'GET /api/sessao': () => json(200, SESSAO_LEANDRO), ...api });
}

async function excluirCom(senha: string) {
  fireEvent.click(await screen.findByRole('button', { name: 'Excluir minha conta' }));
  const dialogo = screen.getByRole('alertdialog', { name: 'Excluir sua conta?' });
  fireEvent.change(within(dialogo).getByLabelText('Senha'), { target: { value: senha } });
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Excluir conta' }));
  return dialogo;
}

describe('tela Minha conta', () => {
  it('ACE-56: mostra nome, e-mail e o link para trocar a senha; axe sem violação', async () => {
    const { container } = abrir();
    expect(await screen.findByRole('heading', { level: 1, name: 'Minha conta' })).toBeTruthy();
    expect(screen.getByText('Leandro')).toBeTruthy();
    expect(screen.getByText('leandro@exemplo.com.br')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Trocar senha' }).getAttribute('href')).toBe(
      '/app/conta/senha',
    );
    expect(screen.getByRole('link', { name: 'Seus grupos' }).getAttribute('href')).toBe('/app');
    await esperarSemViolacoes(container);
  });

  it('ACE-56: axe sem violação com o diálogo aberto; o foco vai ao Cancelar', async () => {
    const { container } = abrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir minha conta' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Excluir sua conta?' });
    expect(
      document.getElementById(dialogo.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('Não dá para desfazer. Digite sua senha para confirmar.');
    expect(document.activeElement).toBe(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect((within(dialogo).getByLabelText('Senha') as HTMLInputElement).type).toBe('password');
    await esperarSemViolacoes(container);
  });

  it('ACE-28: confirmar com 204 envia a senha e navega para /?aviso=conta-excluida', async () => {
    let logado = true;
    const { chamadasA, local } = abrir({
      'GET /api/sessao': () => (logado ? json(200, SESSAO_LEANDRO) : erroApi(401, 'sem_sessao')),
      'POST /api/conta/excluir': () => {
        logado = false;
        return json(204);
      },
    });
    await excluirCom('SenhaForte123');
    await waitFor(() => expect(local()).toBe('/?aviso=conta-excluida'));
    expect(chamadasA('POST', '/api/conta/excluir').map((c) => c.corpo)).toEqual([
      { senha: 'SenhaForte123' },
    ]);
    expect(await screen.findByText(TEXTO_CONTA_EXCLUIDA)).toBeTruthy();
  });

  it('ACE-29: 409 unico_admin fecha o diálogo e mostra os nomes dos grupos com o link para convidar', async () => {
    const { local } = abrir({ 'POST /api/conta/excluir': () => json(409, ERRO_UNICO_ADMIN) });
    await excluirCom('SenhaForte123');
    expect(await screen.findByText(TEXTO_UNICO_ADMIN)).toBeTruthy();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    const lista = screen.getByRole('list', { name: 'Grupos em que você é o único admin' });
    expect(
      within(lista)
        .getByRole('link', { name: /Pelada de Quinta/ })
        .getAttribute('href'),
    ).toBe('/app/grupos/g-quinta/admins');
    expect(
      within(lista)
        .getByRole('link', { name: /Racha de Domingo/ })
        .getAttribute('href'),
    ).toBe('/app/grupos/g-domingo/admins');
    expect(local()).toBe('/app/conta');
  });

  it('ACE-30: 401 senha_atual_incorreta marca o campo com "Senha incorreta." e fica na tela', async () => {
    const { local } = abrir({
      'POST /api/conta/excluir': () => erroApi(401, 'senha_atual_incorreta'),
    });
    const dialogo = await excluirCom('Errada123');
    await waitFor(() =>
      expect(document.getElementById('senha-excluir-erro')?.textContent).toBe(ERRO_SENHA_INCORRETA),
    );
    expect(within(dialogo).getByLabelText('Senha').getAttribute('aria-invalid')).toBe('true');
    expect(local()).toBe('/app/conta');
  });

  it('ACE-28: senha vazia não chama a API', async () => {
    const { chamadasA } = abrir();
    await excluirCom('');
    await waitFor(() => expect(document.getElementById('senha-excluir-erro')).toBeTruthy());
    expect(chamadasA('POST', '/api/conta/excluir')).toHaveLength(0);
  });

  it('ACE-70: 429 bloqueado mostra a mensagem da API no diálogo', async () => {
    abrir({
      'POST /api/conta/excluir': () =>
        json(429, {
          erro: 'Muitas tentativas. Tente de novo em alguns minutos.',
          codigo: 'bloqueado_temporariamente',
        }),
    });
    const dialogo = await excluirCom('SenhaForte123');
    expect((await within(dialogo).findByRole('alert')).textContent).toContain('Muitas tentativas');
  });

  it('ACE-56: Cancelar fecha o diálogo sem chamar a API', async () => {
    const { chamadasA } = abrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir minha conta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(chamadasA('POST', '/api/conta/excluir')).toHaveLength(0);
  });
});
