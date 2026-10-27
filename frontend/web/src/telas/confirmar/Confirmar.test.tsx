// Critério: ACE-06, ACE-07, ACE-08, ACE-55 (mockup t30: confirmando, link inválido com pedir novo, reenviado)

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { violacoes } from '../../../test/apoio/axe';
import { corpoEnviado, erroApi, json, montarTela, simularApi } from '../../../test/apoio/tela';
import { Confirmar } from './Confirmar';

const TOKEN = 'a'.repeat(43);
const EU = { id: 'c1', nome: 'Ana', email: 'ana@exemplo.com.br', grupos: [] };

afterEach(() => {
  vi.unstubAllGlobals();
  history.replaceState(null, '', '/');
});

function abrirComToken(token = TOKEN, elemento = <Confirmar />) {
  history.replaceState(null, '', `/confirmar#t=${token}`);
  return montarTela(elemento, '/confirmar');
}

describe('Confirmar: confirmando (t30, ACE-06)', () => {
  it('lê o token do fragmento, apaga o fragmento, mostra "Confirmando…" e vai a /app com a sessão aberta', async () => {
    let liberar: (r: Response) => void = () => undefined;
    const f = simularApi((url) =>
      url.endsWith('/api/conta/confirmar') ? new Promise<Response>((r) => (liberar = r)) : json(EU),
    );
    const { roteador, container } = abrirComToken();
    expect(await screen.findByRole('heading', { level: 1, name: 'Confirmando seu e-mail' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Confirmando…');
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
    expect(location.hash).toBe('');
    expect(await violacoes(container)).toEqual([]);
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(corpoEnviado(f)).toEqual({ token: TOKEN });
    liberar(new Response(null, { status: 204 }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/app'));
  });

  it('no StrictMode o token continua sendo enviado uma vez', async () => {
    const f = simularApi((url) =>
      url.endsWith('/api/conta/confirmar') ? new Response(null, { status: 204 }) : json(EU),
    );
    const { roteador } = abrirComToken(
      TOKEN,
      <StrictMode>
        <Confirmar />
      </StrictMode>,
    );
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/app'));
    expect(f.mock.calls.filter(([url]) => String(url).endsWith('/api/conta/confirmar'))).toHaveLength(1);
  });

  it('falha de conexão mostra o erro e "Tentar de novo" repete o envio', async () => {
    let chamadas = 0;
    simularApi((url) => {
      if (!url.endsWith('/api/conta/confirmar')) return json(EU);
      chamadas += 1;
      if (chamadas === 1) throw new TypeError('rede');
      return new Response(null, { status: 204 });
    });
    const { roteador } = abrirComToken();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/app'));
  });
});

describe('Confirmar: link inválido (ACE-07, ACE-08)', () => {
  const textoInvalido = 'Este link já foi usado ou passou do prazo de 24 horas.';

  it('410 mostra "Link inválido ou vencido" com o pedido de novo link, sem sessão', async () => {
    const f = simularApi(() => erroApi(410, 'link_invalido'));
    const { container, roteador } = abrirComToken();
    expect(await screen.findByRole('heading', { level: 1, name: 'Link inválido ou vencido' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(textoInvalido);
    expect(screen.getByLabelText('E-mail da conta')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Enviar novo link' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Voltar para entrar' })).toHaveAttribute('href', '/entrar');
    expect(roteador.state.location.pathname).toBe('/confirmar');
    expect(f).toHaveBeenCalledTimes(1);
    expect(await violacoes(container)).toEqual([]);
  });

  it('sem token no fragmento mostra o mesmo pedido de novo link, sem chamar a API', async () => {
    const f = simularApi(() => json({}));
    montarTela(<Confirmar />, '/confirmar');
    expect(await screen.findByRole('heading', { level: 1, name: 'Link inválido ou vencido' })).toBeVisible();
    expect(f).not.toHaveBeenCalled();
  });

  it('ACE-08: pedir novo link mostra a mesma mensagem, exista ou não a conta', async () => {
    const f = simularApi((url) =>
      url.endsWith('/api/conta/confirmar') ? erroApi(410, 'link_invalido') : json({ mensagem: 'ok' }),
    );
    const { container } = abrirComToken();
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText('E-mail da conta'), 'ana@exemplo.com.br');
    await u.click(screen.getByRole('button', { name: 'Enviar novo link' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Verifique seu e-mail' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Se houver uma conta com esse e-mail, enviamos um novo link de confirmação.',
    );
    expect(screen.getByRole('link', { name: 'Voltar para entrar' })).toHaveAttribute('href', '/entrar');
    expect(f.mock.calls[1]?.[0]).toMatch(/\/api\/conta\/reenviar-confirmacao$/);
    expect(corpoEnviado(f, 1)).toEqual({ email: 'ana@exemplo.com.br' });
    expect(await violacoes(container)).toEqual([]);
  });

  it('ACE-52: e-mail indisponível no reenvio mostra o erro e mantém o formulário', async () => {
    simularApi((url) =>
      url.endsWith('/api/conta/confirmar') ? erroApi(410, 'link_invalido') : erroApi(503, 'email_indisponivel'),
    );
    abrirComToken();
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText('E-mail da conta'), 'ana@exemplo.com.br');
    await u.click(screen.getByRole('button', { name: 'Enviar novo link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não conseguimos enviar o e-mail agora. Tente de novo em alguns minutos.',
    );
    expect(screen.getByLabelText('E-mail da conta')).toHaveValue('ana@exemplo.com.br');
  });
});
