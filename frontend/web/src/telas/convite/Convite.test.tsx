// Critério: ACE-33, ACE-34, ACE-35, ACE-36, ACE-55 (mockup t31: carregando, logado, sem conta, outro e-mail, inválido)

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { violacoes } from '../../../test/apoio/axe';
import { corpoEnviado, erroApi, json, montarTela, simularApi } from '../../../test/apoio/tela';
import { Convite } from './Convite';

const TOKEN = 'c'.repeat(43);
const LIDO = { email: 'rodrigo@exemplo.com.br', grupoNome: 'Pelada de Quinta', contaExiste: false };
const LIDO_COM_CONTA = { ...LIDO, contaExiste: true };
const EU_IGUAL = { id: 'c2', nome: 'Rodrigo', email: 'rodrigo@exemplo.com.br', grupos: [] };
const EU_OUTRO = { id: 'c1', nome: 'Leandro', email: 'leandro@exemplo.com.br', grupos: [] };
const DESTINOS = ['/app', '/entrar', '/app/grupos/g1/admins'];

afterEach(() => {
  vi.unstubAllGlobals();
  history.replaceState(null, '', '/');
});

const termina = (url: string, fim: string) => url.endsWith(`/api${fim}`);

/** Responde às rotas do convite; `sessao` é o corpo de GET /api/sessao (ou `null` para 401). */
function api(opcoes: {
  lido?: Response | (() => Response);
  sessao: unknown;
  extras?: (url: string) => Response | undefined;
}) {
  return simularApi((url) => {
    const extra = opcoes.extras?.(url);
    if (extra) return extra;
    if (termina(url, '/convites/ler')) {
      return typeof opcoes.lido === 'function' ? opcoes.lido() : (opcoes.lido ?? json(LIDO));
    }
    if (termina(url, '/sessao')) return opcoes.sessao === null ? erroApi(401, 'nao_autenticado') : json(opcoes.sessao);
    return json({});
  });
}

function abrir(elemento = <Convite />, comToken = true) {
  if (comToken) history.replaceState(null, '', `/convite#t=${TOKEN}`);
  return montarTela(elemento, '/convite', DESTINOS);
}

describe('Convite: carregando (t31)', () => {
  it('lê o token do fragmento, apaga o fragmento e mostra "Carregando…" enquanto consulta o convite', async () => {
    const f = simularApi(() => new Promise<Response>(() => undefined));
    const { container } = abrir();
    expect(await screen.findByRole('heading', { level: 1, name: 'Convite' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Carregando…');
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
    expect(location.hash).toBe('');
    const achar = () => f.mock.calls.findIndex(([url]) => termina(String(url), '/convites/ler'));
    await waitFor(() => expect(achar()).toBeGreaterThanOrEqual(0));
    expect(corpoEnviado(f, achar())).toEqual({ token: TOKEN });
    expect(await violacoes(container)).toEqual([]);
  });

  it('no StrictMode o convite é consultado uma vez só', async () => {
    const f = api({ sessao: EU_IGUAL });
    abrir(
      <StrictMode>
        <Convite />
      </StrictMode>,
    );
    await screen.findByRole('button', { name: 'Aceitar e abrir o grupo' });
    expect(f.mock.calls.filter(([url]) => termina(String(url), '/convites/ler'))).toHaveLength(1);
  });
});

describe('Convite: logado com o e-mail do convite (ACE-33)', () => {
  it('mostra o grupo, o e-mail da conta e "Aceitar e abrir o grupo", sem violações do axe', async () => {
    api({ sessao: EU_IGUAL });
    const { container } = abrir();
    expect(await screen.findByRole('button', { name: 'Aceitar e abrir o grupo' })).toBeVisible();
    expect(screen.getByText('Pelada de Quinta')).toBeVisible();
    expect(screen.getByText(/Você está conectado como rodrigo@exemplo.com.br\./)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Agora não' })).toHaveAttribute('href', '/app');
    expect(await violacoes(container)).toEqual([]);
  });

  it('aceitar envia o token, atualiza a sessão e abre o grupo', async () => {
    let sessaoLida = 0;
    const f = simularApi((url) => {
      if (termina(url, '/convites/ler')) return json(LIDO);
      if (termina(url, '/convites/aceitar')) return json({ grupoId: 'g1' });
      sessaoLida += 1;
      return json(EU_IGUAL);
    });
    const { roteador } = abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Aceitar e abrir o grupo' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/app/grupos/g1/admins'));
    const indice = f.mock.calls.findIndex(([url]) => termina(String(url), '/convites/aceitar'));
    expect(corpoEnviado(f, indice)).toEqual({ token: TOKEN });
    expect(sessaoLida).toBeGreaterThanOrEqual(2);
  });

  it('ACE-35: 403 convite_de_outro_email mostra o estado de outro e-mail', async () => {
    api({
      sessao: EU_IGUAL,
      extras: (url) => (termina(url, '/convites/aceitar') ? erroApi(403, 'convite_de_outro_email') : undefined),
    });
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Aceitar e abrir o grupo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Este convite foi enviado para outro e-mail.');
  });

  it('ACE-36: 410 ao aceitar mostra o convite inválido', async () => {
    api({
      sessao: EU_IGUAL,
      extras: (url) => (termina(url, '/convites/aceitar') ? erroApi(410, 'link_invalido') : undefined),
    });
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Aceitar e abrir o grupo' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Convite inválido ou vencido' })).toBeVisible();
  });

  it('falha de conexão ao aceitar mostra o erro de envio e mantém o botão', async () => {
    api({
      sessao: EU_IGUAL,
      extras: (url) => {
        if (termina(url, '/convites/aceitar')) throw new TypeError('rede');
        return undefined;
      },
    });
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Aceitar e abrir o grupo' }));
    expect(await screen.findByText('Não foi possível enviar. Verifique a conexão.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Aceitar e abrir o grupo' })).toBeVisible();
  });
});

describe('Convite: logado com outro e-mail (ACE-35, t31 outro e-mail)', () => {
  it('mostra o aviso com o e-mail da conta, "Sair e entrar com outra conta" e a volta aos grupos', async () => {
    api({ sessao: EU_OUTRO });
    const { container } = abrir();
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(
      'Este convite foi enviado para outro e-mail. Você está conectado como leandro@exemplo.com.br.',
    );
    expect(
      screen.getByText('Saia e entre com a conta do e-mail convidado, ou peça um novo convite para este e-mail.'),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Aceitar e abrir o grupo' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Voltar aos meus grupos' })).toHaveAttribute('href', '/app');
    expect(await violacoes(container)).toEqual([]);
  });

  it('"Sair e entrar com outra conta" encerra a sessão e leva a /entrar', async () => {
    const f = api({
      sessao: EU_OUTRO,
      extras: (url) => (termina(url, '/sessao/sair') ? new Response(null, { status: 204 }) : undefined),
    });
    const { roteador } = abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Sair e entrar com outra conta' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/entrar'));
    expect(f.mock.calls.some(([url]) => termina(String(url), '/sessao/sair'))).toBe(true);
  });
});

describe('Convite: sem conta, e-mail travado (ACE-34, t31 sem conta)', () => {
  it('mostra o cadastro com o e-mail preenchido e só leitura, sem violações do axe', async () => {
    api({ sessao: null });
    const { container } = abrir();
    expect(await screen.findByLabelText('Seu nome')).toBeVisible();
    expect(screen.getByText('Pelada de Quinta')).toBeVisible();
    expect(screen.getByText('Crie sua conta para aceitar. O e-mail já está confirmado pelo convite.')).toBeVisible();
    const email = screen.getByLabelText('E-mail');
    expect(email).toHaveValue('rodrigo@exemplo.com.br');
    expect(email).toHaveAttribute('readonly');
    expect(email).toHaveAttribute('aria-readonly', 'true');
    expect(email).toHaveAccessibleDescription('O convite foi enviado para este e-mail.');
    expect(screen.getByLabelText('Senha')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByRole('link', { name: 'termos de uso' })).toHaveAttribute('href', '/termos');
    expect(screen.getByRole('link', { name: 'política de privacidade' })).toHaveAttribute('href', '/privacidade');
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/entrar');
    expect(await violacoes(container)).toEqual([]);
  });

  it('campos vazios e termos sem aceite mostram os erros e não enviam', async () => {
    const f = api({ sessao: null });
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Criar conta e aceitar' }));
    expect(await screen.findByText('Corrija 3 campos:')).toBeVisible();
    expect(screen.getByText('Aceite os termos para criar a conta.')).toBeVisible();
    expect(f.mock.calls.some(([url]) => termina(String(url), '/convites/cadastrar'))).toBe(false);
  });

  it('cadastra pelo convite, abre a sessão e leva ao grupo', async () => {
    let logada = false;
    const f = simularApi((url) => {
      if (termina(url, '/convites/ler')) return json(LIDO);
      if (termina(url, '/convites/cadastrar')) {
        logada = true;
        return json({ grupoId: 'g1' }, 201);
      }
      return logada ? json(EU_IGUAL) : erroApi(401, 'nao_autenticado');
    });
    const { roteador } = abrir();
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText('Seu nome'), 'Rodrigo');
    await u.type(screen.getByLabelText('Senha'), 'senha-boa-123');
    await u.click(screen.getByRole('checkbox'));
    await u.click(screen.getByRole('button', { name: 'Criar conta e aceitar' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/app/grupos/g1/admins'));
    const indice = f.mock.calls.findIndex(([url]) => termina(String(url), '/convites/cadastrar'));
    expect(corpoEnviado(f, indice)).toEqual({
      token: TOKEN,
      nome: 'Rodrigo',
      senha: 'senha-boa-123',
      termos: true,
    });
  });

  it('409 conta_existente pede para entrar', async () => {
    api({
      sessao: null,
      extras: (url) => (termina(url, '/convites/cadastrar') ? erroApi(409, 'conta_existente') : undefined),
    });
    abrir();
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText('Seu nome'), 'Rodrigo');
    await u.type(screen.getByLabelText('Senha'), 'senha-boa-123');
    await u.click(screen.getByRole('checkbox'));
    await u.click(screen.getByRole('button', { name: 'Criar conta e aceitar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este e-mail já tem conta. Entre para aceitar o convite.',
    );
  });

  it('falha de conexão no cadastro mostra o erro de envio e mantém os campos', async () => {
    api({
      sessao: null,
      extras: (url) => {
        if (termina(url, '/convites/cadastrar')) throw new TypeError('rede');
        return undefined;
      },
    });
    abrir();
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText('Seu nome'), 'Rodrigo');
    await u.type(screen.getByLabelText('Senha'), 'senha-boa-123');
    await u.click(screen.getByRole('checkbox'));
    await u.click(screen.getByRole('button', { name: 'Criar conta e aceitar' }));
    expect(await screen.findByText('Não foi possível enviar. Verifique a conexão.')).toBeVisible();
    expect(screen.getByLabelText('Seu nome')).toHaveValue('Rodrigo');
  });
});

describe('Convite: já existe conta com o e-mail e a pessoa não está logada', () => {
  it('manda entrar e abrir o convite de novo, sem oferecer o cadastro', async () => {
    api({ lido: json(LIDO_COM_CONTA), sessao: null });
    const { container } = abrir();
    expect(await screen.findByText(/Este e-mail já tem conta\. Entre e abra o link do convite de novo/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ir para entrar' })).toHaveAttribute('href', '/entrar');
    expect(screen.queryByLabelText('Seu nome')).toBeNull();
    expect(await violacoes(container)).toEqual([]);
  });
});

describe('Convite: inválido (ACE-36, t31 inválido)', () => {
  it('410 mostra o título, o aviso de 7 dias e "Ir para entrar"', async () => {
    api({ lido: erroApi(410, 'link_invalido'), sessao: null });
    const { container } = abrir();
    expect(await screen.findByRole('heading', { level: 1, name: 'Convite inválido ou vencido' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Este convite já foi usado, foi cancelado ou passou do prazo de 7 dias. Peça um novo ao admin do grupo.',
    );
    expect(screen.getByRole('link', { name: 'Ir para entrar' })).toHaveAttribute('href', '/entrar');
    expect(await violacoes(container)).toEqual([]);
  });

  it('422 (token fora do formato) também é inválido', async () => {
    api({ lido: erroApi(422, 'dados_invalidos'), sessao: null });
    abrir();
    expect(await screen.findByRole('heading', { level: 1, name: 'Convite inválido ou vencido' })).toBeVisible();
  });

  it('link sem token é inválido e não chama a API de convites', async () => {
    const f = api({ sessao: null });
    abrir(<Convite />, false);
    expect(await screen.findByRole('heading', { level: 1, name: 'Convite inválido ou vencido' })).toBeVisible();
    expect(f.mock.calls.some(([url]) => termina(String(url), '/convites/ler'))).toBe(false);
  });

  it('falha de conexão ao consultar mostra o erro com "Tentar de novo"', async () => {
    let tentativas = 0;
    simularApi((url) => {
      if (termina(url, '/convites/ler')) {
        tentativas += 1;
        if (tentativas <= 2) throw new TypeError('rede');
        return json(LIDO);
      }
      return termina(url, '/sessao') ? json(EU_IGUAL) : json({});
    });
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Tentar de novo' }, { timeout: 3000 }));
    expect(await screen.findByRole('button', { name: 'Aceitar e abrir o grupo' })).toBeVisible();
  });
});
