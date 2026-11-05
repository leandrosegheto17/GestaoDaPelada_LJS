import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ERRO_SENHAS_DIFERENTES, TEXTO_LINK_VENCIDO } from '../../src/telas/nova-senha/NovaSenha.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, erroApi, json, pendente } from '../apoio/tela.tsx';

const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJ-_01234';

function comFragmento(hash: string) {
  window.history.replaceState(null, '', `/entrar/nova-senha${hash}`);
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

function preencher(nova = 'NovaSenha123', conf = nova) {
  fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: nova } });
  fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: conf } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
}

describe('tela Nova senha', () => {
  it('ACE-56: com o token, mostra o formulário e apaga o fragmento; axe sem violação', async () => {
    comFragmento(`#t=${TOKEN}`);
    const { container } = abrirTela('/entrar/nova-senha');
    expect(await screen.findByRole('heading', { level: 1, name: 'Crie uma nova senha' })).toBeTruthy();
    await screen.findByLabelText('Nova senha');
    expect(window.location.hash).toBe('');
    await esperarSemViolacoes(container);
  });

  it('ACE-24: 200 envia o token e a senha e navega para /entrar com "Senha alterada. Entre com a nova senha."', async () => {
    comFragmento(`#t=${TOKEN}`);
    const { chamadasA, local } = abrirTela('/entrar/nova-senha', {
      'POST /api/sessao/nova-senha': () => json(200, { mensagem: 'ok' }),
    });
    await screen.findByLabelText('Nova senha');
    preencher();
    await waitFor(() => expect(local()).toBe('/entrar?aviso=senha-alterada'));
    expect(chamadasA('POST', '/api/sessao/nova-senha').map((c) => c.corpo)).toEqual([{ token: TOKEN, senha: 'NovaSenha123' }]);
    expect((await screen.findByRole('status')).textContent).toBe('Senha alterada. Entre com a nova senha.');
  });

  it('ACE-24: senhas diferentes marcam a confirmação com "As senhas não conferem." e não chamam a API; axe sem violação', async () => {
    comFragmento(`#t=${TOKEN}`);
    const { container, chamadasA } = abrirTela('/entrar/nova-senha');
    await screen.findByLabelText('Nova senha');
    preencher('Senha12345', 'Senha1234');
    const resumo = await screen.findByRole('alert');
    expect(resumo.textContent).toContain('Corrija 1 campo:');
    expect(screen.getByRole('link', { name: 'Confirmar nova senha' }).getAttribute('href')).toBe('#conf');
    expect(document.getElementById('conf-erro')?.textContent).toBe(ERRO_SENHAS_DIFERENTES);
    expect(chamadasA('POST', '/api/sessao/nova-senha')).toHaveLength(0);
    await esperarSemViolacoes(container);
  });

  it('ACE-24: senha curta marca a nova senha', async () => {
    comFragmento(`#t=${TOKEN}`);
    const { chamadasA } = abrirTela('/entrar/nova-senha');
    await screen.findByLabelText('Nova senha');
    preencher('curta');
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Nova senha').getAttribute('aria-invalid')).toBe('true');
    expect(chamadasA('POST', '/api/sessao/nova-senha')).toHaveLength(0);
  });

  it('ACE-25: 410 mostra o estado inválido com "Pedir novo link"; axe sem violação', async () => {
    comFragmento(`#t=${TOKEN}`);
    const { container } = abrirTela('/entrar/nova-senha', {
      'POST /api/sessao/nova-senha': () => erroApi(410, 'link_invalido', 'Link inválido ou vencido.'),
    });
    await screen.findByLabelText('Nova senha');
    preencher();
    expect(await screen.findByRole('heading', { level: 1, name: 'Link inválido ou vencido' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe(TEXTO_LINK_VENCIDO);
    expect(screen.getByRole('link', { name: 'Pedir novo link' }).getAttribute('href')).toBe('/entrar/esqueci');
    expect(screen.getByRole('link', { name: 'Voltar para entrar' }).getAttribute('href')).toBe('/entrar');
    await esperarSemViolacoes(container);
  });

  for (const [nome, hash] of [
    ['sem fragmento', ''],
    ['com token malformado', '#t=curto'],
  ] as const) {
    it(`ACE-25: ${nome}, mostra o estado inválido sem chamar a API`, async () => {
      comFragmento(hash);
      const { chamadasA } = abrirTela('/entrar/nova-senha');
      expect(await screen.findByRole('heading', { level: 1, name: 'Link inválido ou vencido' })).toBeTruthy();
      expect(chamadasA('POST', '/api/sessao/nova-senha')).toHaveLength(0);
    });
  }

  it('salvando, o botão fica desabilitado com "Salvando…"', async () => {
    comFragmento(`#t=${TOKEN}`);
    abrirTela('/entrar/nova-senha', { 'POST /api/sessao/nova-senha': () => pendente() });
    await screen.findByLabelText('Nova senha');
    preencher();
    expect(((await screen.findByRole('button', { name: 'Salvando…' })) as HTMLButtonElement).disabled).toBe(true);
  });
});
