import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AVISOS_ENTRAR, TEXTO_NAO_CONFIRMADO, TEXTO_REENVIADO } from '../../src/telas/entrar/Entrar.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, erroApi, json, pendente, SESSAO_ANA, type Manipulador } from '../apoio/tela.tsx';

afterEach(() => {
  cleanup();
});

function preencher(email = 'ana@exemplo.test', senha = 'SenhaForte123') {
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: senha } });
}

function enviar() {
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
}

/** Servidor que recusa o entrar com a resposta dada. */
function recusando(resposta: () => Response, extra: Record<string, Manipulador> = {}) {
  return { 'POST /api/sessao/entrar': () => resposta(), ...extra };
}

describe('tela Entrar', () => {
  it('ACE-56: o estado vazio segue o mockup (título, campos, ajuda, links) e passa no axe', async () => {
    const { container } = abrirTela('/entrar');
    expect(await screen.findByRole('heading', { level: 1, name: 'Entrar' })).toBeTruthy();
    expect((screen.getByLabelText('E-mail') as HTMLInputElement).type).toBe('email');
    expect((screen.getByLabelText('Senha') as HTMLInputElement).type).toBe('password');
    expect(screen.getByText('No iPhone, o app instalado e o Safari pedem login separadamente.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Esqueci a senha' }).getAttribute('href')).toBe('/entrar/esqueci');
    expect(screen.getByRole('link', { name: 'Criar conta' }).getAttribute('href')).toBe('/cadastro');
    await esperarSemViolacoes(container);
  });

  it('ACE-09: entrar envia e-mail e senha e, com a sessão aberta, vai a /app', async () => {
    let logado = false;
    const { chamadasA, local } = abrirTela('/entrar', {
      'POST /api/sessao/entrar': () => {
        logado = true;
        return json(200, { nome: 'Ana', email: 'ana@exemplo.test' });
      },
      'GET /api/sessao': () => (logado ? json(200, SESSAO_ANA) : erroApi(401, 'sem_sessao')),
    });
    await screen.findByLabelText('E-mail');
    preencher();
    enviar();
    await waitFor(() => expect(local()).toBe('/app'));
    expect(chamadasA('POST', '/api/sessao/entrar')[0]?.corpo).toEqual({ email: 'ana@exemplo.test', senha: 'SenhaForte123' });
  });

  it('ACE-09: o carregando desabilita o botão com "Entrando…" e marca o formulário; axe sem violação', async () => {
    const { container } = abrirTela('/entrar', { 'POST /api/sessao/entrar': () => pendente() });
    await screen.findByLabelText('E-mail');
    preencher();
    enviar();
    const botao = await screen.findByRole('button', { name: 'Entrando…' });
    expect((botao as HTMLButtonElement).disabled).toBe(true);
    expect(botao.getAttribute('aria-busy')).toBe('true');
    expect(container.querySelector('form')?.getAttribute('aria-busy')).toBe('true');
    await esperarSemViolacoes(container);
  });

  it('ACE-11: 401 credenciais_invalidas mostra "E-mail ou senha incorretos." na faixa de erro; axe sem violação', async () => {
    const { container } = abrirTela(
      '/entrar',
      recusando(() => erroApi(401, 'credenciais_invalidas', 'E-mail ou senha incorretos.')),
    );
    await screen.findByLabelText('E-mail');
    preencher();
    enviar();
    const faixa = await screen.findByRole('alert');
    expect(faixa.textContent).toBe('E-mail ou senha incorretos.');
    expect(faixa.className).toContain('faixa--erro');
    // A senha é limpa; o e-mail fica.
    expect((screen.getByLabelText('Senha') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('E-mail') as HTMLInputElement).value).toBe('ana@exemplo.test');
    await esperarSemViolacoes(container);
  });

  it('ACE-13: 429 bloqueado_temporariamente mostra a mensagem do bloqueio; axe sem violação', async () => {
    const { container } = abrirTela(
      '/entrar',
      recusando(() => erroApi(429, 'bloqueado_temporariamente', 'Muitas tentativas. Tente de novo em 15 minutos.')),
    );
    await screen.findByLabelText('E-mail');
    preencher();
    enviar();
    expect((await screen.findByRole('alert')).textContent).toBe('Muitas tentativas. Tente de novo em 15 minutos.');
    await esperarSemViolacoes(container);
  });

  it('falha de rede mostra a mensagem de conexão', async () => {
    abrirTela('/entrar', { 'POST /api/sessao/entrar': () => Promise.reject(new TypeError('Failed to fetch')) });
    await screen.findByLabelText('E-mail');
    preencher();
    enviar();
    expect((await screen.findByRole('alert')).textContent).toMatch(/Verifique a conexão/);
  });

  it('ACE-12: 403 email_nao_confirmado mostra o aviso e "Enviar outro link", que chama POST /api/conta/reenviar-confirmacao', async () => {
    const { container, chamadasA } = abrirTela(
      '/entrar',
      recusando(() => erroApi(403, 'email_nao_confirmado', 'Confirme o seu e-mail antes de entrar.'), {
        'POST /api/conta/reenviar-confirmacao': () => json(200, { mensagem: 'ok' }),
      }),
    );
    await screen.findByLabelText('E-mail');
    preencher();
    enviar();
    expect(await screen.findByText(TEXTO_NAO_CONFIRMADO)).toBeTruthy();
    expect(TEXTO_NAO_CONFIRMADO.startsWith('Confirme seu e-mail para entrar')).toBe(true);
    await esperarSemViolacoes(container);

    fireEvent.click(screen.getByRole('button', { name: 'Enviar outro link' }));
    expect(await screen.findByText(TEXTO_REENVIADO)).toBeTruthy();
    expect(chamadasA('POST', '/api/conta/reenviar-confirmacao').map((c) => c.corpo)).toEqual([{ email: 'ana@exemplo.test' }]);
    expect(screen.queryByRole('button', { name: 'Enviar outro link' })).toBeNull();
    await esperarSemViolacoes(container);
  });

  it('ACE-12: falha no reenvio mostra a mensagem e mantém a ação', async () => {
    abrirTela(
      '/entrar',
      recusando(() => erroApi(403, 'email_nao_confirmado'), {
        'POST /api/conta/reenviar-confirmacao': () =>
          erroApi(503, 'email_indisponivel', 'Não conseguimos enviar o e-mail agora. Tente de novo em alguns minutos.'),
      }),
    );
    await screen.findByLabelText('E-mail');
    preencher();
    enviar();
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar outro link' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Não conseguimos enviar o e-mail agora/);
    expect(screen.getByRole('button', { name: 'Enviar outro link' })).toBeTruthy();
  });

  for (const [aviso, esperado] of [
    ['sessao-expirada', 'Sua sessão expirou. Entre de novo.'],
    ['email-confirmado', 'E-mail confirmado. Entre com a sua senha.'],
    ['senha-alterada', 'Senha alterada. Entre com a nova senha.'],
  ] as const) {
    it(`${aviso === 'sessao-expirada' ? 'ACE-20' : aviso === 'email-confirmado' ? 'ACE-06' : 'ACE-24'}: ?aviso=${aviso} mostra "${esperado}"; axe sem violação`, async () => {
      const { container } = abrirTela(`/entrar?aviso=${aviso}`);
      const faixa = await screen.findByRole('status');
      expect(faixa.textContent).toBe(esperado);
      expect(AVISOS_ENTRAR[aviso]?.texto).toBe(esperado);
      expect(faixa.className).toContain(aviso === 'sessao-expirada' ? 'faixa--info' : 'faixa--sucesso');
      await esperarSemViolacoes(container);
    });
  }

  it('aviso desconhecido não mostra faixa', async () => {
    abrirTela('/entrar?aviso=qualquer');
    await screen.findByLabelText('E-mail');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
