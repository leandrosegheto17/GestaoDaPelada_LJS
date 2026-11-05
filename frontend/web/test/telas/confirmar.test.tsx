import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TEXTO_LINK_INVALIDO } from '../../src/telas/confirmar/Confirmar.tsx';
import { TEXTO_REENVIADO } from '../../src/telas/entrar/Entrar.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, erroApi, json, pendente } from '../apoio/tela.tsx';

const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJ-_01234';

/** A tela lê o token da barra do navegador (`window.location.hash`), não do roteador em memória. */
function comFragmento(hash: string) {
  window.history.replaceState(null, '', `/confirmar${hash}`);
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

describe('tela Confirmar e-mail', () => {
  it('ACE-06: 200 envia o token do fragmento, apaga o fragmento e navega para /entrar com o aviso "E-mail confirmado. Entre com a sua senha."', async () => {
    comFragmento(`#t=${TOKEN}`);
    const { chamadasA, local } = abrirTela('/confirmar', {
      'POST /api/conta/confirmar': () => json(200, { mensagem: 'E-mail confirmado. Entre com a sua senha.' }),
    });
    await waitFor(() => expect(local()).toBe('/entrar?aviso=email-confirmado'));
    expect(chamadasA('POST', '/api/conta/confirmar').map((c) => c.corpo)).toEqual([{ token: TOKEN }]);
    expect(window.location.hash).toBe('');
    expect((await screen.findByRole('status')).textContent).toBe('E-mail confirmado. Entre com a sua senha.');
  });

  it('ACE-06: enquanto confirma, mostra "Confirmando seu e-mail" ocupado; axe sem violação', async () => {
    comFragmento(`#t=${TOKEN}`);
    const { container } = abrirTela('/confirmar', { 'POST /api/conta/confirmar': () => pendente() });
    expect(await screen.findByRole('heading', { level: 1, name: 'Confirmando seu e-mail' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Confirmando…');
    expect(screen.getByRole('main').getAttribute('aria-busy')).toBe('true');
    await esperarSemViolacoes(container);
  });

  it('ACE-07: 410 mostra "Link inválido ou vencido" com o pedido de novo link; axe sem violação', async () => {
    comFragmento(`#t=${TOKEN}`);
    const { container } = abrirTela('/confirmar', {
      'POST /api/conta/confirmar': () => erroApi(410, 'link_invalido', 'Link inválido ou vencido.'),
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Link inválido ou vencido' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe(TEXTO_LINK_INVALIDO);
    expect(screen.getByLabelText('E-mail da conta')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enviar novo link' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Voltar para entrar' }).getAttribute('href')).toBe('/entrar');
    await esperarSemViolacoes(container);
  });

  for (const [nome, hash] of [
    ['sem fragmento', ''],
    ['com token malformado', '#t=curto'],
  ] as const) {
    it(`ACE-07: ${nome}, mostra o link inválido sem chamar a API`, async () => {
      comFragmento(hash);
      const { chamadasA } = abrirTela('/confirmar');
      expect(await screen.findByRole('heading', { level: 1, name: 'Link inválido ou vencido' })).toBeTruthy();
      expect(chamadasA('POST', '/api/conta/confirmar')).toHaveLength(0);
    });
  }

  it('ACE-08: pedir novo link chama o reenvio com o e-mail e mostra o estado reenviado; axe sem violação', async () => {
    comFragmento(`#t=${TOKEN}`);
    const { container, chamadasA } = abrirTela('/confirmar', {
      'POST /api/conta/confirmar': () => erroApi(410, 'link_invalido'),
      'POST /api/conta/reenviar-confirmacao': () => json(200, { mensagem: 'ok' }),
    });
    fireEvent.change(await screen.findByLabelText('E-mail da conta'), { target: { value: 'leandro@exemplo.com.br' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar novo link' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Verifique seu e-mail' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe(TEXTO_REENVIADO);
    expect(TEXTO_REENVIADO).toMatch(/^Se houver uma conta/);
    expect(chamadasA('POST', '/api/conta/reenviar-confirmacao').map((c) => c.corpo)).toEqual([{ email: 'leandro@exemplo.com.br' }]);
    await esperarSemViolacoes(container);
  });

  it('ACE-08: e-mail inválido no pedido de novo link marca o campo e não chama a API', async () => {
    comFragmento('');
    const { chamadasA } = abrirTela('/confirmar');
    fireEvent.change(await screen.findByLabelText('E-mail da conta'), { target: { value: 'leandro@' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar novo link' }));
    await waitFor(() => expect(screen.getByLabelText('E-mail da conta').getAttribute('aria-invalid')).toBe('true'));
    expect(chamadasA('POST', '/api/conta/reenviar-confirmacao')).toHaveLength(0);
  });

  it('ACE-08: falha no reenvio mostra a mensagem e mantém o formulário', async () => {
    comFragmento('');
    abrirTela('/confirmar', {
      'POST /api/conta/reenviar-confirmacao': () =>
        erroApi(503, 'email_indisponivel', 'Não conseguimos enviar o e-mail agora. Tente de novo em alguns minutos.'),
    });
    fireEvent.change(await screen.findByLabelText('E-mail da conta'), { target: { value: 'leandro@exemplo.com.br' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar novo link' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Não conseguimos enviar o e-mail agora/);
    expect(screen.getByRole('button', { name: 'Enviar novo link' })).toBeTruthy();
  });

  it('falha de rede na confirmação mostra o erro com "Tentar de novo", que repete o pedido', async () => {
    comFragmento(`#t=${TOKEN}`);
    let vezes = 0;
    const { chamadasA, local } = abrirTela('/confirmar', {
      'POST /api/conta/confirmar': () => {
        vezes += 1;
        return vezes === 1 ? Promise.reject(new TypeError('Failed to fetch')) : json(200, { mensagem: 'ok' });
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(local()).toBe('/entrar?aviso=email-confirmado'));
    expect(chamadasA('POST', '/api/conta/confirmar')).toHaveLength(2);
  });
});
