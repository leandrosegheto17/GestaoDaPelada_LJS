// Critério: ACE-22, ACE-52, ACE-54 (mockup t05: vazio, enviado, e-mail indisponível)

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { violacoes } from '../../../test/apoio/axe';
import { corpoEnviado, erroApi, json, montarTela, simularApi } from '../../../test/apoio/tela';
import { EsqueciSenha } from './EsqueciSenha';

afterEach(() => vi.unstubAllGlobals());

async function enviar(email = 'ana@exemplo.com.br') {
  const u = userEvent.setup();
  await u.type(screen.getByLabelText('E-mail'), email);
  await u.click(screen.getByRole('button', { name: 'Enviar link' }));
  return u;
}

describe('EsqueciSenha: vazio (t05)', () => {
  it('mostra o texto do fluxo por e-mail, o campo e "Voltar para entrar", sem violações do axe', async () => {
    const { container } = montarTela(<EsqueciSenha />, '/entrar/esqueci');
    expect(screen.getByRole('heading', { level: 1, name: 'Esqueci a senha' })).toBeVisible();
    expect(
      screen.getByText('Informe o e-mail da sua conta. Vamos enviar um link para você criar uma nova senha.'),
    ).toBeVisible();
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByRole('button', { name: 'Enviar link' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Voltar para entrar' })).toHaveAttribute('href', '/entrar');
    expect(await violacoes(container)).toEqual([]);
  });
});

describe('EsqueciSenha: envio', () => {
  it('ACE-22: mostra a mesma mensagem de sucesso (carregando durante o envio)', async () => {
    let liberar: (r: Response) => void = () => undefined;
    const f = simularApi(() => new Promise<Response>((r) => (liberar = r)));
    const { container } = montarTela(<EsqueciSenha />, '/entrar/esqueci');
    await enviar();
    expect(await screen.findByRole('button', { name: 'Enviando…' })).toHaveAttribute('aria-busy', 'true');
    expect(f.mock.calls[0]?.[0]).toMatch(/\/api\/sessao\/esqueci-senha$/);
    expect(corpoEnviado(f)).toEqual({ email: 'ana@exemplo.com.br' });
    liberar(json({ mensagem: 'Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha. Ele vale por 1 hora.',
    );
    expect(screen.getByRole('link', { name: 'Voltar para entrar' })).toHaveAttribute('href', '/entrar');
    expect(screen.queryByLabelText('E-mail')).toBeNull();
    expect(await violacoes(container)).toEqual([]);
  });

  it('e-mail em formato inválido não envia e mostra o erro no campo', async () => {
    const f = simularApi(() => json({}));
    montarTela(<EsqueciSenha />, '/entrar/esqueci');
    await enviar('ana@');
    expect(f).not.toHaveBeenCalled();
    expect(screen.getByLabelText('E-mail')).toHaveAccessibleDescription('Informe um e-mail válido.');
    expect(screen.getByLabelText('E-mail')).toBeInvalid();
  });

  it('ACE-52: 503 email_indisponivel mostra o erro e mantém o e-mail digitado', async () => {
    simularApi(() => erroApi(503, 'email_indisponivel'));
    const { container } = montarTela(<EsqueciSenha />, '/entrar/esqueci');
    await enviar();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não conseguimos enviar o e-mail agora. Tente de novo em alguns minutos.',
    );
    expect(screen.getByLabelText('E-mail')).toHaveValue('ana@exemplo.com.br');
    expect(screen.getByRole('button', { name: 'Enviar link' })).toBeVisible();
    expect(await violacoes(container)).toEqual([]);
  });

  it('falha de conexão mostra o erro de envio', async () => {
    simularApi(() => {
      throw new TypeError('rede');
    });
    montarTela(<EsqueciSenha />, '/entrar/esqueci');
    await enviar();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível enviar. Verifique a conexão.');
  });
});
