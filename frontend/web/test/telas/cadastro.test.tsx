import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ERRO_SENHA_CURTA, ERROS_CAMPO, TEXTO_ENVIADO } from '../../src/telas/cadastro/Cadastro.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, erroApi, json, pendente } from '../apoio/tela.tsx';

afterEach(() => {
  cleanup();
});

function preencher({ nome = 'Leandro', email = 'leandro@exemplo.com.br', senha = 'SenhaForte123', termos = true } = {}) {
  fireEvent.change(screen.getByLabelText('Seu nome'), { target: { value: nome } });
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: senha } });
  if (termos) fireEvent.click(screen.getByRole('checkbox'));
}

function criar() {
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
}

describe('tela Cadastro', () => {
  it('ACE-59: o aceite nasce desmarcado e tem os links para /termos e /privacidade; axe sem violação', async () => {
    const { container } = abrirTela('/cadastro');
    expect(await screen.findByRole('heading', { level: 1, name: 'Criar conta' })).toBeTruthy();
    const aceite = screen.getByRole('checkbox') as HTMLInputElement;
    expect(aceite.checked).toBe(false);
    expect(screen.getByRole('link', { name: 'termos de uso' }).getAttribute('href')).toBe('/termos');
    expect(screen.getByRole('link', { name: 'política de privacidade' }).getAttribute('href')).toBe('/privacidade');
    expect(screen.getByRole('link', { name: 'Já tenho conta' }).getAttribute('href')).toBe('/entrar');
    await esperarSemViolacoes(container);
  });

  it('ACE-03: campos inválidos não chamam a API, marcam cada campo e preenchem o resumo "Corrija 3 campos:"; axe sem violação', async () => {
    const { container, chamadasA } = abrirTela('/cadastro');
    await screen.findByLabelText('Seu nome');
    preencher({ email: 'leandro@', senha: '12345', termos: false });
    criar();
    const resumo = await screen.findByRole('alert');
    expect(resumo.textContent).toContain('Corrija 3 campos:');
    expect(screen.getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(
      expect.arrayContaining(['#email', '#senha', '#termos']),
    );
    expect(screen.getByLabelText('E-mail').getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById('email-erro')?.textContent).toBe(ERROS_CAMPO.email);
    expect(document.getElementById('senha-erro')?.textContent).toBe(ERRO_SENHA_CURTA);
    expect(document.getElementById('termos-erro')?.textContent).toBe(ERROS_CAMPO.termos);
    expect(screen.getByLabelText('Seu nome').getAttribute('aria-invalid')).toBeNull();
    expect(chamadasA('POST', '/api/conta')).toHaveLength(0);
    await esperarSemViolacoes(container);
  });

  it('ACE-03: 422 da API com campos marca o campo inválido e preenche o ResumoErros', async () => {
    abrirTela('/cadastro', {
      'POST /api/conta': () => json(422, { erro: 'Confira os campos destacados.', codigo: 'dados_invalidos', campos: ['email'] }),
    });
    await screen.findByLabelText('Seu nome');
    preencher();
    criar();
    const resumo = await screen.findByRole('alert');
    expect(resumo.textContent).toContain('Corrija 1 campo:');
    expect(screen.getByLabelText('E-mail').getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById('email-erro')?.textContent).toBe(ERROS_CAMPO.email);
  });

  it('ACE-02: 422 termos_obrigatorios marca o aceite', async () => {
    abrirTela('/cadastro', { 'POST /api/conta': () => json(422, { erro: 'x', codigo: 'termos_obrigatorios', campos: ['termos'] }) });
    await screen.findByLabelText('Seu nome');
    preencher();
    criar();
    await screen.findByRole('alert');
    expect(document.getElementById('termos-erro')?.textContent).toBe(ERROS_CAMPO.termos);
  });

  it('ACE-01: 201 envia nome, e-mail, senha e o aceite, e mostra "Enviamos um link de confirmação para o seu e-mail"; axe sem violação', async () => {
    const { container, chamadasA } = abrirTela('/cadastro', {
      'POST /api/conta': () => json(201, { mensagem: 'Enviamos um link de confirmação para o seu e-mail' }),
    });
    await screen.findByLabelText('Seu nome');
    preencher();
    criar();
    expect(await screen.findByRole('heading', { level: 1, name: 'Verifique seu e-mail' })).toBeTruthy();
    const faixa = screen.getByRole('status');
    expect(faixa.textContent).toBe(TEXTO_ENVIADO);
    expect(faixa.textContent).toContain('Enviamos um link de confirmação para o seu e-mail');
    expect(chamadasA('POST', '/api/conta').map((c) => c.corpo)).toEqual([
      { nome: 'Leandro', email: 'leandro@exemplo.com.br', senha: 'SenhaForte123', termos: true },
    ]);
    expect(screen.getByRole('link', { name: 'Enviar outro link' }).getAttribute('href')).toBe('/confirmar');
    expect(screen.getByRole('link', { name: 'Voltar para entrar' }).getAttribute('href')).toBe('/entrar');
    await esperarSemViolacoes(container);
  });

  it('ACE-01: enviando, o botão mostra "Criando conta…" desabilitado; axe sem violação', async () => {
    const { container } = abrirTela('/cadastro', { 'POST /api/conta': () => pendente() });
    await screen.findByLabelText('Seu nome');
    preencher();
    criar();
    const botao = await screen.findByRole('button', { name: 'Criando conta…' });
    expect((botao as HTMLButtonElement).disabled).toBe(true);
    await esperarSemViolacoes(container);
  });

  it('erro da API sem campos (503) mostra a mensagem na faixa de erro', async () => {
    abrirTela('/cadastro', {
      'POST /api/conta': () =>
        erroApi(503, 'email_indisponivel', 'Não conseguimos enviar o e-mail agora. Tente de novo em alguns minutos.'),
    });
    await screen.findByLabelText('Seu nome');
    preencher();
    criar();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Não conseguimos enviar o e-mail agora/));
    expect(screen.getByRole('heading', { level: 1, name: 'Criar conta' })).toBeTruthy();
  });
});
