import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ERRO_SENHA_ATUAL, TEXTO_SENHA_TROCADA } from '../../src/telas/minha-senha/MinhaSenha.tsx';
import { ERRO_SENHAS_DIFERENTES } from '../../src/telas/nova-senha/NovaSenha.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, erroApi, json, SESSAO_ANA, type Manipulador } from '../apoio/tela.tsx';

afterEach(() => {
  cleanup();
});

function abrir(api: Record<string, Manipulador> = {}) {
  return abrirTela('/app/conta/senha', { 'GET /api/sessao': () => json(200, SESSAO_ANA), ...api });
}

async function preencher(atual = 'Antiga12', nova = 'NovaSenha1', conf = nova) {
  fireEvent.change(await screen.findByLabelText('Senha atual'), { target: { value: atual } });
  fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: nova } });
  fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: conf } });
  fireEvent.click(screen.getByRole('button', { name: 'Trocar senha' }));
}

describe('tela Minha senha', () => {
  it('ACE-56: mostra os três campos de senha e o botão; axe sem violação', async () => {
    const { container } = abrir();
    expect(await screen.findByRole('heading', { level: 1, name: 'Minha senha' })).toBeTruthy();
    for (const rotulo of ['Senha atual', 'Nova senha', 'Confirmar nova senha']) {
      expect((screen.getByLabelText(rotulo) as HTMLInputElement).type).toBe('password');
    }
    expect(screen.getByText('De 8 a 72 caracteres.')).toBeTruthy();
    await esperarSemViolacoes(container);
  });

  it('ACE-26: 204 envia senha atual e nova e mostra o estado de sucesso; axe sem violação', async () => {
    const { container, chamadasA } = abrir({ 'POST /api/conta/senha': () => json(204) });
    await preencher();
    expect((await screen.findByRole('status')).textContent).toBe(TEXTO_SENHA_TROCADA);
    expect(chamadasA('POST', '/api/conta/senha').map((c) => c.corpo)).toEqual([{ senhaAtual: 'Antiga12', senhaNova: 'NovaSenha1' }]);
    expect((screen.getByLabelText('Senha atual') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Nova senha') as HTMLInputElement).value).toBe('');
    await esperarSemViolacoes(container);
  });

  it('ACE-27: 401 senha_atual_incorreta marca o campo da senha atual com a mensagem; axe sem violação', async () => {
    const { container } = abrir({ 'POST /api/conta/senha': () => erroApi(401, 'senha_atual_incorreta') });
    await preencher();
    await waitFor(() => expect(document.getElementById('atual-erro')?.textContent).toBe(ERRO_SENHA_ATUAL));
    expect(screen.getByLabelText('Senha atual').getAttribute('aria-invalid')).toBe('true');
    expect(screen.queryByText(TEXTO_SENHA_TROCADA)).toBeNull();
    await esperarSemViolacoes(container);
  });

  it('ACE-27: o 401 da troca não leva a /entrar (só sessao_expirada leva)', async () => {
    const { local } = abrir({ 'POST /api/conta/senha': () => erroApi(401, 'senha_atual_incorreta') });
    await preencher();
    await waitFor(() => expect(document.getElementById('atual-erro')).toBeTruthy());
    expect(local()).toBe('/app/conta/senha');
  });

  it('ACE-26: confirmação diferente marca a confirmação e não chama a API', async () => {
    const { chamadasA } = abrir();
    await preencher('Antiga12', 'NovaSenha1', 'NovaSenha2');
    await waitFor(() => expect(document.getElementById('conf-erro')?.textContent).toBe(ERRO_SENHAS_DIFERENTES));
    expect(screen.getByRole('alert').textContent).toContain('Corrija 1 campo:');
    expect(chamadasA('POST', '/api/conta/senha')).toHaveLength(0);
  });

  it('ACE-26: nova senha curta marca a nova senha e não chama a API', async () => {
    const { chamadasA } = abrir();
    await preencher('Antiga12', 'curta', 'curta');
    await waitFor(() => expect(document.getElementById('nova-erro')).toBeTruthy());
    expect(chamadasA('POST', '/api/conta/senha')).toHaveLength(0);
  });

  it('ACE-70: 429 bloqueado mostra a mensagem da API na faixa de erro', async () => {
    abrir({
      'POST /api/conta/senha': () =>
        json(429, { erro: 'Muitas tentativas. Tente de novo em alguns minutos.', codigo: 'bloqueado_temporariamente' }),
    });
    await preencher();
    expect((await screen.findByRole('alert')).textContent).toContain('Muitas tentativas');
  });
});
