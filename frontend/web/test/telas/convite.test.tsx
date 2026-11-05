import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TEXTO_CONVITE_INVALIDO } from '../../src/telas/convite/Convite.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, erroApi, json, pendente, type Manipulador } from '../apoio/tela.tsx';

const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJ-_01234';
const CONVITE = { email: 'rodrigo@exemplo.com.br', grupoNome: 'Pelada de Quinta', contaExiste: false };
const SESSAO_RODRIGO = { id: 'c-rod', nome: 'Rodrigo', email: 'rodrigo@exemplo.com.br', grupos: [] };
const SESSAO_LEANDRO = { id: 'c-lea', nome: 'Leandro', email: 'leandro@exemplo.com.br', grupos: [] };

function comFragmento(hash = `#t=${TOKEN}`) {
  window.history.replaceState(null, '', `/convite${hash}`);
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

function abrir(api: Record<string, Manipulador>) {
  comFragmento();
  return abrirTela('/convite', { 'POST /api/convites/ler': () => json(200, CONVITE), ...api });
}

describe('tela Convite', () => {
  it('ACE-56: enquanto lê o convite, mostra o carregando; axe sem violação', async () => {
    comFragmento();
    const { container } = abrirTela('/convite', { 'POST /api/convites/ler': () => pendente() });
    expect(await screen.findByRole('heading', { level: 1, name: 'Convite' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Carregando…');
    await esperarSemViolacoes(container);
  });

  it('ACE-34: sem conta, o e-mail do convite aparece no campo somente leitura e o envio chama POST /api/convites/cadastrar', async () => {
    let logado = false;
    const { container, chamadasA, local } = abrir({
      'POST /api/convites/cadastrar': () => {
        logado = true;
        return json(201, { grupoId: 'g-quinta' });
      },
      'GET /api/sessao': () => (logado ? json(200, SESSAO_RODRIGO) : erroApi(401, 'sem_sessao')),
    });
    const email = (await screen.findByLabelText('E-mail')) as HTMLInputElement;
    expect(email.value).toBe('rodrigo@exemplo.com.br');
    expect(email.readOnly).toBe(true);
    expect(email.getAttribute('aria-readonly')).toBe('true');
    expect(screen.getByText('Pelada de Quinta')).toBeTruthy();
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    await esperarSemViolacoes(container);

    fireEvent.change(screen.getByLabelText('Seu nome'), { target: { value: 'Rodrigo' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'SenhaForte123' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta e aceitar' }));
    await waitFor(() => expect(local()).toBe('/app/grupos/g-quinta/admins'));
    expect(chamadasA('POST', '/api/convites/cadastrar').map((c) => c.corpo)).toEqual([
      { token: TOKEN, nome: 'Rodrigo', senha: 'SenhaForte123', termos: true },
    ]);
  });

  it('ACE-34: sem o aceite, não chama a API e marca o aceite', async () => {
    const { chamadasA } = abrir({});
    fireEvent.change(await screen.findByLabelText('Seu nome'), { target: { value: 'Rodrigo' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'SenhaForte123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta e aceitar' }));
    await waitFor(() => expect(document.getElementById('termos-erro')).toBeTruthy());
    expect(chamadasA('POST', '/api/convites/cadastrar')).toHaveLength(0);
  });

  it('ACE-33: logado no e-mail do convite, aceitar navega para /app/grupos/<id>/admins; axe sem violação', async () => {
    const { container, chamadasA, local } = abrir({
      'GET /api/sessao': () => json(200, SESSAO_RODRIGO),
      'POST /api/convites/aceitar': () => json(200, { grupoId: 'g-quinta' }),
    });
    const aceitar = await screen.findByRole('button', { name: 'Aceitar e abrir o grupo' });
    expect(screen.getByText('Você está conectado como rodrigo@exemplo.com.br.')).toBeTruthy();
    await esperarSemViolacoes(container);
    fireEvent.click(aceitar);
    await waitFor(() => expect(local()).toBe('/app/grupos/g-quinta/admins'));
    expect(chamadasA('POST', '/api/convites/aceitar').map((c) => c.corpo)).toEqual([{ token: TOKEN }]);
  });

  it('ACE-35: logado em outro e-mail, mostra o aviso de outro e-mail sem oferecer aceitar; axe sem violação', async () => {
    const { container, chamadasA } = abrir({ 'GET /api/sessao': () => json(200, SESSAO_LEANDRO) });
    const aviso = await screen.findByText(/Este convite foi enviado para outro e-mail/);
    expect(aviso.textContent).toContain('Você está conectado como leandro@exemplo.com.br.');
    expect(screen.getByRole('button', { name: 'Sair e entrar com outra conta' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Voltar aos meus grupos' }).getAttribute('href')).toBe('/app');
    expect(screen.queryByRole('button', { name: 'Aceitar e abrir o grupo' })).toBeNull();
    expect(chamadasA('POST', '/api/convites/aceitar')).toHaveLength(0);
    await esperarSemViolacoes(container);
  });

  it('ACE-35: 403 convite_de_outro_email no aceitar mostra o estado outro e-mail', async () => {
    abrir({
      'GET /api/sessao': () => json(200, SESSAO_RODRIGO),
      'POST /api/convites/aceitar': () => erroApi(403, 'convite_de_outro_email', 'Este convite foi enviado para outro e-mail.'),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Aceitar e abrir o grupo' }));
    expect(await screen.findByText(/Este convite foi enviado para outro e-mail/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sair e entrar com outra conta' })).toBeTruthy();
  });

  it('ACE-35: "Sair e entrar com outra conta" chama POST /api/sessao/sair e vai a /entrar', async () => {
    let logado = true;
    const { chamadasA, local } = abrir({
      'GET /api/sessao': () => (logado ? json(200, SESSAO_LEANDRO) : erroApi(401, 'sem_sessao')),
      'POST /api/sessao/sair': () => {
        logado = false;
        return json(204);
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Sair e entrar com outra conta' }));
    await waitFor(() => expect(local()).toBe('/entrar'));
    expect(chamadasA('POST', '/api/sessao/sair')).toHaveLength(1);
  });

  it('ACE-36: 410 no ler mostra o convite inválido; axe sem violação', async () => {
    comFragmento();
    const { container } = abrirTela('/convite', { 'POST /api/convites/ler': () => erroApi(410, 'link_invalido') });
    expect(await screen.findByRole('heading', { level: 1, name: 'Convite inválido ou vencido' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe(TEXTO_CONVITE_INVALIDO);
    expect(screen.getByRole('link', { name: 'Ir para entrar' }).getAttribute('href')).toBe('/entrar');
    await esperarSemViolacoes(container);
  });

  it('ACE-36: 410 no aceitar mostra o convite inválido', async () => {
    abrir({
      'GET /api/sessao': () => json(200, SESSAO_RODRIGO),
      'POST /api/convites/aceitar': () => erroApi(410, 'link_invalido'),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Aceitar e abrir o grupo' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Convite inválido ou vencido' })).toBeTruthy();
  });

  it('ACE-36: sem fragmento, mostra o convite inválido sem chamar a API', async () => {
    comFragmento('');
    const { chamadasA } = abrirTela('/convite');
    expect(await screen.findByRole('heading', { level: 1, name: 'Convite inválido ou vencido' })).toBeTruthy();
    expect(chamadasA('POST', '/api/convites/ler')).toHaveLength(0);
  });

  it('[LACUNA] sem sessão e com conta no e-mail do convite, pede para entrar', async () => {
    comFragmento();
    abrirTela('/convite', { 'POST /api/convites/ler': () => json(200, { ...CONVITE, contaExiste: true }) });
    expect(await screen.findByText(/Já existe uma conta com rodrigo@exemplo.com.br/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Entrar' }).getAttribute('href')).toBe('/entrar');
    expect(screen.queryByLabelText('Seu nome')).toBeNull();
  });
});
