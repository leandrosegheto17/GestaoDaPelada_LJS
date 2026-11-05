import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TEXTO_ESQUECI_ENVIADO } from '../../src/telas/esqueci/Esqueci.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, erroApi, json } from '../apoio/tela.tsx';

afterEach(() => {
  cleanup();
});

function pedir(email = 'leandro@exemplo.com.br') {
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar link' }));
}

describe('tela Esqueci a senha', () => {
  it('ACE-56: o estado vazio tem o texto de recuperação por e-mail e o link de voltar; axe sem violação', async () => {
    const { container } = abrirTela('/entrar/esqueci');
    expect(await screen.findByRole('heading', { level: 1, name: 'Esqueci a senha' })).toBeTruthy();
    expect(screen.getByText('Informe o e-mail da sua conta. Vamos enviar um link para você criar uma nova senha.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Voltar para entrar' }).getAttribute('href')).toBe('/entrar');
    await esperarSemViolacoes(container);
  });

  it('ACE-22: 200 mostra "Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha"; axe sem violação', async () => {
    const { container, chamadasA } = abrirTela('/entrar/esqueci', {
      'POST /api/sessao/esqueci-senha': () => json(200, { mensagem: 'ok' }),
    });
    await screen.findByLabelText('E-mail');
    pedir();
    const faixa = await screen.findByRole('status');
    expect(faixa.textContent).toBe(TEXTO_ESQUECI_ENVIADO);
    expect(faixa.textContent).toContain('Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha');
    expect(chamadasA('POST', '/api/sessao/esqueci-senha').map((c) => c.corpo)).toEqual([{ email: 'leandro@exemplo.com.br' }]);
    expect(screen.getByRole('link', { name: 'Voltar para entrar' }).getAttribute('href')).toBe('/entrar');
    await esperarSemViolacoes(container);
  });

  it('ACE-22: a resposta é a mesma para um e-mail que não tem conta (a tela não distingue)', async () => {
    abrirTela('/entrar/esqueci', { 'POST /api/sessao/esqueci-senha': () => json(200, { mensagem: 'ok' }) });
    await screen.findByLabelText('E-mail');
    pedir('ninguem@exemplo.test');
    expect((await screen.findByRole('status')).textContent).toBe(TEXTO_ESQUECI_ENVIADO);
  });

  it('ACE-56: 503 email_indisponivel mostra a mensagem na faixa de erro e mantém o formulário; axe sem violação', async () => {
    const { container } = abrirTela('/entrar/esqueci', {
      'POST /api/sessao/esqueci-senha': () =>
        erroApi(503, 'email_indisponivel', 'Não conseguimos enviar o e-mail agora. Tente de novo em alguns minutos.'),
    });
    await screen.findByLabelText('E-mail');
    pedir();
    const faixa = await screen.findByRole('alert');
    expect(faixa.textContent).toBe('Não conseguimos enviar o e-mail agora. Tente de novo em alguns minutos.');
    expect(faixa.className).toContain('faixa--erro');
    expect(screen.getByRole('button', { name: 'Enviar link' })).toBeTruthy();
    await esperarSemViolacoes(container);
  });

  it('e-mail inválido marca o campo e não chama a API', async () => {
    const { chamadasA } = abrirTela('/entrar/esqueci');
    await screen.findByLabelText('E-mail');
    pedir('leandro@');
    await waitFor(() => expect(screen.getByLabelText('E-mail').getAttribute('aria-invalid')).toBe('true'));
    expect(chamadasA('POST', '/api/sessao/esqueci-senha')).toHaveLength(0);
  });
});
