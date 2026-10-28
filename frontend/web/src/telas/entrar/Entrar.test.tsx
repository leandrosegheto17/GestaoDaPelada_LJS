// Critério: ACE-11, ACE-12, ACE-13, ACE-20, ACE-54 (mockup t04: vazio, carregando, erro, bloqueado, não confirmado, sessão expirada)

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { violacoes } from '../../../test/apoio/axe';
import { corpoEnviado, erroApi, json, montarTela, simularApi } from '../../../test/apoio/tela';
import { Entrar } from './Entrar';

afterEach(() => vi.unstubAllGlobals());

const EU = { id: 'c1', nome: 'Ana', email: 'ana@exemplo.com.br', grupos: [] };

async function preencher(email = 'ana@exemplo.com.br', senha = 'senha-boa-123') {
  const u = userEvent.setup();
  await u.type(screen.getByLabelText('E-mail'), email);
  await u.type(screen.getByLabelText('Senha'), senha);
  await u.click(screen.getByRole('button', { name: 'Entrar' }));
  return u;
}

describe('Entrar: estado vazio (t04)', () => {
  it('mostra título, campos, ajuda do iPhone, Esqueci a senha e Criar conta, sem violações do axe', async () => {
    const { container } = montarTela(<Entrar />, '/entrar');
    expect(screen.getByRole('heading', { level: 1, name: 'Entrar' })).toBeVisible();
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Senha')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByText('No iPhone, o app instalado e o Safari pedem login separadamente.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Esqueci a senha' })).toHaveAttribute('href', '/entrar/esqueci');
    expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute('href', '/cadastro');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(await violacoes(container)).toEqual([]);
  });
});

describe('Entrar: envio', () => {
  it('envia e-mail e senha, lê a sessão e vai a /app (carregando durante o envio)', async () => {
    let liberar: (r: Response) => void = () => undefined;
    const f = simularApi((url) => {
      if (url.endsWith('/api/sessao/entrar')) return new Promise<Response>((r) => (liberar = r));
      return json(EU);
    });
    const { roteador } = montarTela(<Entrar />, '/entrar');
    await preencher();
    const botao = await screen.findByRole('button', { name: 'Entrando…' });
    expect(botao).toHaveAttribute('aria-busy', 'true');
    expect(corpoEnviado(f)).toEqual({ email: 'ana@exemplo.com.br', senha: 'senha-boa-123' });
    liberar(json({ nome: 'Ana', email: 'ana@exemplo.com.br' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/app'));
  });

  it('volta para a página pedida em ?volta=', async () => {
    simularApi((url) => (url.endsWith('/api/sessao/entrar') ? json({ nome: 'Ana', email: 'a@b.co' }) : json(EU)));
    const { roteador } = montarTela(<Entrar />, '/entrar?volta=%2Fapp%2Fconta', ['/app/conta']);
    await preencher();
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/app/conta'));
  });

  it('ACE-11: credenciais inválidas mostram o erro e limpam só a senha', async () => {
    simularApi(() => erroApi(401, 'credenciais_invalidas'));
    const { container } = montarTela(<Entrar />, '/entrar');
    await preencher();
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos.');
    expect(screen.getByLabelText('E-mail')).toHaveValue('ana@exemplo.com.br');
    expect(screen.getByLabelText('Senha')).toHaveValue('');
    expect(await violacoes(container)).toEqual([]);
  });

  it('ACE-13: bloqueio temporário mostra o aviso de 15 minutos', async () => {
    simularApi(() => erroApi(429, 'bloqueado_temporariamente'));
    montarTela(<Entrar />, '/entrar');
    await preencher();
    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas. Tente de novo em 15 minutos.');
  });

  it('falha de conexão mostra o erro de envio e mantém o e-mail', async () => {
    simularApi(() => {
      throw new TypeError('rede');
    });
    montarTela(<Entrar />, '/entrar');
    await preencher();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível enviar. Verifique a conexão.');
    expect(screen.getByLabelText('E-mail')).toHaveValue('ana@exemplo.com.br');
  });
});

describe('Entrar: e-mail não confirmado (ACE-12)', () => {
  it('mostra o aviso e "Enviar outro link", que reenvia a confirmação', async () => {
    const f = simularApi((url) =>
      url.endsWith('/api/sessao/entrar')
        ? erroApi(403, 'email_nao_confirmado')
        : json({ mensagem: 'Se houver uma conta com esse e-mail, enviamos um novo link' }),
    );
    const { container } = montarTela(<Entrar />, '/entrar');
    const u = await preencher();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Confirme seu e-mail para entrar. Enviamos o link quando você criou a conta.',
    );
    expect(await violacoes(container)).toEqual([]);
    await u.click(screen.getByRole('button', { name: 'Enviar outro link' }));
    expect(
      await screen.findByText('Se houver uma conta com esse e-mail, enviamos um novo link de confirmação.'),
    ).toBeVisible();
    expect(f.mock.calls[1]?.[0]).toMatch(/\/api\/conta\/reenviar-confirmacao$/);
    expect(corpoEnviado(f, 1)).toEqual({ email: 'ana@exemplo.com.br' });
  });

  it('ACE-52: reenvio com e-mail indisponível mostra o erro', async () => {
    simularApi((url) =>
      url.endsWith('/api/sessao/entrar') ? erroApi(403, 'email_nao_confirmado') : erroApi(503, 'email_indisponivel'),
    );
    montarTela(<Entrar />, '/entrar');
    const u = await preencher();
    await u.click(await screen.findByRole('button', { name: 'Enviar outro link' }));
    expect(
      await screen.findByText('Não conseguimos enviar o e-mail agora. Tente de novo em alguns minutos.'),
    ).toBeVisible();
  });
});

describe('Entrar: avisos vindos da URL', () => {
  it('ACE-20: aviso=sessao-expirada mostra "Sua sessão expirou. Entre de novo."', async () => {
    const { container } = montarTela(<Entrar />, '/entrar?aviso=sessao-expirada');
    expect(screen.getByRole('status')).toHaveTextContent('Sua sessão expirou. Entre de novo.');
    expect(await violacoes(container)).toEqual([]);
  });

  it('ACE-24: aviso=senha-alterada mostra "Senha alterada. Entre com a nova senha."', () => {
    montarTela(<Entrar />, '/entrar?aviso=senha-alterada');
    expect(screen.getByRole('status')).toHaveTextContent('Senha alterada. Entre com a nova senha.');
  });

  it('ACE-06: aviso=email-confirmado mostra "E-mail confirmado. Entre com a sua senha."', () => {
    montarTela(<Entrar />, '/entrar?aviso=email-confirmado');
    expect(screen.getByText('E-mail confirmado. Entre com a sua senha.')).toBeVisible();
  });

  it('aviso desconhecido é ignorado', () => {
    montarTela(<Entrar />, '/entrar?aviso=qualquer');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
