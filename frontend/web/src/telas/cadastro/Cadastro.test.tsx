// Critério: ACE-01, ACE-02, ACE-03, ACE-55, ACE-59 (mockup t29: vazio, carregando, erro com resumo, sucesso)

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { violacoes } from '../../../test/apoio/axe';
import { corpoEnviado, erroApi, json, montarTela, simularApi } from '../../../test/apoio/tela';
import { Cadastro } from './Cadastro';

afterEach(() => vi.unstubAllGlobals());

const MENSAGEM = 'Enviamos um link de confirmação para o seu e-mail';

async function preencher({ aceitar = true, email = 'ana@exemplo.com.br', senha = 'senha-boa-123' } = {}) {
  const u = userEvent.setup();
  await u.type(screen.getByLabelText('Seu nome'), 'Ana');
  await u.type(screen.getByLabelText('E-mail'), email);
  await u.type(screen.getByLabelText('Senha'), senha);
  if (aceitar) await u.click(screen.getByRole('checkbox'));
  await u.click(screen.getByRole('button', { name: 'Criar conta' }));
  return u;
}

describe('Cadastro: vazio (t29, ACE-59)', () => {
  it('mostra os campos, a ajuda, o aceite desmarcado com links e sem violações do axe', async () => {
    const { container } = montarTela(<Cadastro />, '/cadastro');
    expect(screen.getByRole('heading', { level: 1, name: 'Criar conta' })).toBeVisible();
    expect(screen.getByText('Organize presença, times e ranking da sua pelada. Grátis para começar.')).toBeVisible();
    expect(screen.getByLabelText('Seu nome')).toHaveAccessibleDescription('Como os outros admins vão ver você.');
    expect(screen.getByLabelText('Seu nome')).toHaveAttribute('autocomplete', 'name');
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Senha')).toHaveAccessibleDescription('De 8 a 72 caracteres.');
    expect(screen.getByLabelText('Senha')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('link', { name: 'termos de uso' })).toHaveAttribute('href', '/termos');
    expect(screen.getByRole('link', { name: 'política de privacidade' })).toHaveAttribute('href', '/privacidade');
    expect(screen.getByRole('link', { name: 'Já tenho conta' })).toHaveAttribute('href', '/entrar');
    expect(screen.getByRole('link', { name: 'Voltar para entrar' })).toHaveAttribute('href', '/entrar');
    expect(await violacoes(container)).toEqual([]);
  });
});

describe('Cadastro: envio', () => {
  it('ACE-01: envia nome, e-mail, senha e aceite, e mostra "Verifique seu e-mail" (com carregando antes)', async () => {
    let liberar: (r: Response) => void = () => undefined;
    const f = simularApi(() => new Promise<Response>((r) => (liberar = r)));
    const { container } = montarTela(<Cadastro />, '/cadastro');
    await preencher();
    const botao = await screen.findByRole('button', { name: 'Criando conta…' });
    expect(botao).toHaveAttribute('aria-busy', 'true');
    expect(f.mock.calls[0]?.[0]).toMatch(/\/api\/conta$/);
    expect(corpoEnviado(f)).toEqual({
      nome: 'Ana',
      email: 'ana@exemplo.com.br',
      senha: 'senha-boa-123',
      termos: true,
    });
    liberar(json({ mensagem: MENSAGEM }, 201));
    expect(await screen.findByRole('heading', { level: 1, name: 'Verifique seu e-mail' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(`${MENSAGEM}. Ele vale por 24 horas.`);
    expect(screen.getByText('Não chegou? Confira a caixa de spam ou peça outro link.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Enviar outro link' })).toHaveAttribute('href', '/confirmar');
    expect(screen.getByRole('link', { name: 'Voltar para entrar' })).toHaveAttribute('href', '/entrar');
    expect(await violacoes(container)).toEqual([]);
  });

  it('ACE-02: sem o aceite não envia e aponta o erro no campo', async () => {
    const f = simularApi(() => json({}, 201));
    montarTela(<Cadastro />, '/cadastro');
    await preencher({ aceitar: false });
    expect(f).not.toHaveBeenCalled();
    expect(await screen.findByText('Aceite os termos para criar a conta.')).toBeVisible();
    expect(screen.getByRole('checkbox')).toBeInvalid();
  });

  it('ACE-03: campos fora dos limites mostram o resumo com 2 ou mais erros e o erro de cada campo', async () => {
    const f = simularApi(() => json({}, 201));
    const { container } = montarTela(<Cadastro />, '/cadastro');
    await preencher({ aceitar: false, email: 'ana@', senha: 'curta' });
    expect(f).not.toHaveBeenCalled();
    const resumo = await screen.findByRole('alert');
    expect(resumo).toHaveTextContent('Corrija 3 campos:');
    expect(resumo).toHaveTextContent('E-mail');
    expect(resumo).toHaveTextContent('Senha');
    expect(resumo).toHaveTextContent('Aceite dos termos');
    expect(screen.getByLabelText('E-mail')).toHaveAccessibleDescription('Informe um e-mail válido.');
    expect(screen.getByLabelText('Senha')).toHaveAccessibleDescription(
      'De 8 a 72 caracteres. A senha precisa ter de 8 a 72 caracteres.',
    );
    expect(await violacoes(container)).toEqual([]);
  });

  it('o resumo leva o foco ao campo escolhido', async () => {
    simularApi(() => json({}, 201));
    montarTela(<Cadastro />, '/cadastro');
    const u = await preencher({ aceitar: false, email: 'ana@', senha: 'curta' });
    await u.click(screen.getByRole('link', { name: 'E-mail' }));
    expect(screen.getByLabelText('E-mail')).toHaveFocus();
  });

  it('ACE-03: erro de campo vindo da API (422) aparece no campo', async () => {
    simularApi(() => erroApi(422, 'dados_invalidos', 'Corrija os campos indicados.', { nome: 'Nome muito longo.' }));
    montarTela(<Cadastro />, '/cadastro');
    await preencher();
    expect(await screen.findByLabelText('Seu nome')).toHaveAccessibleDescription(
      'Como os outros admins vão ver você. Nome muito longo.',
    );
  });

  it('ACE-02: 422 termos_obrigatorios da API mostra o erro do aceite', async () => {
    simularApi(() => erroApi(422, 'termos_obrigatorios', 'É preciso aceitar os termos.'));
    montarTela(<Cadastro />, '/cadastro');
    await preencher();
    expect(await screen.findByText('Aceite os termos para criar a conta.')).toBeVisible();
  });

  it('ACE-52: 503 email_indisponivel mostra o erro e mantém o formulário preenchido', async () => {
    simularApi(() => erroApi(503, 'email_indisponivel'));
    montarTela(<Cadastro />, '/cadastro');
    await preencher();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não conseguimos enviar o e-mail agora. Tente de novo em alguns minutos.',
    );
    expect(screen.getByLabelText('Seu nome')).toHaveValue('Ana');
  });

  it('falha de conexão mostra o erro de envio', async () => {
    simularApi(() => {
      throw new TypeError('rede');
    });
    montarTela(<Cadastro />, '/cadastro');
    await preencher();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível enviar. Verifique a conexão.');
  });
});
