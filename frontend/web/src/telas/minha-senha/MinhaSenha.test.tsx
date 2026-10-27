// Critério: ACE-26, ACE-27, ACE-54 (mockup t25: vazio, erro, sucesso)

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { violacoes } from '../../../test/apoio/axe';
import { corpoEnviado, erroApi, json, montarTela, simularApi } from '../../../test/apoio/tela';
import { MinhaSenha } from './MinhaSenha';

afterEach(() => vi.unstubAllGlobals());

const ehTroca = (url: string) => url.endsWith('/api/conta/senha');

async function trocar(atual: string, nova: string, confirmacao: string) {
  const u = userEvent.setup();
  if (atual) await u.type(screen.getByLabelText('Senha atual'), atual);
  if (nova) await u.type(screen.getByLabelText('Nova senha'), nova);
  if (confirmacao) await u.type(screen.getByLabelText('Confirmar nova senha'), confirmacao);
  await u.click(screen.getByRole('button', { name: 'Trocar senha' }));
  return u;
}

describe('MinhaSenha: vazio (t25)', () => {
  it('mostra o título, os três campos com a regra e o "Voltar" ao início, sem violações do axe', async () => {
    const { container } = montarTela(<MinhaSenha />, '/app/conta/senha', ['/app']);
    expect(screen.getByRole('heading', { level: 1, name: 'Minha senha' })).toBeVisible();
    expect(screen.getByLabelText('Senha atual')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByLabelText('Nova senha')).toHaveAccessibleDescription('De 8 a 72 caracteres.');
    expect(screen.getByLabelText('Confirmar nova senha')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByRole('link', { name: /Início/ })).toHaveAttribute('href', '/app');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(await violacoes(container)).toEqual([]);
  });
});

describe('MinhaSenha: validação no cliente', () => {
  it('senhas diferentes mostram "As senhas não conferem." e não enviam', async () => {
    const f = simularApi(() => json({}));
    const { container } = montarTela(<MinhaSenha />, '/app/conta/senha', ['/app']);
    await trocar('senha-antiga-1', 'senha-boa-123', 'senha-boa-124');
    expect(await screen.findByRole('alert')).toHaveTextContent('As senhas não conferem.');
    expect(f).not.toHaveBeenCalled();
    expect(await violacoes(container)).toEqual([]);
  });

  it('senha nova curta mostra a regra no campo e não envia', async () => {
    const f = simularApi(() => json({}));
    montarTela(<MinhaSenha />, '/app/conta/senha', ['/app']);
    await trocar('senha-antiga-1', 'curta', 'curta');
    expect(await screen.findByLabelText('Nova senha')).toHaveAccessibleDescription(
      'De 8 a 72 caracteres. A senha precisa ter de 8 a 72 caracteres.',
    );
    expect(f).not.toHaveBeenCalled();
  });

  it('senha atual em branco pede a senha e não envia', async () => {
    const f = simularApi(() => json({}));
    montarTela(<MinhaSenha />, '/app/conta/senha', ['/app']);
    await trocar('', 'senha-boa-123', 'senha-boa-123');
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe a senha.');
    expect(f).not.toHaveBeenCalled();
  });
});

describe('MinhaSenha: envio', () => {
  it('ACE-26: envia as senhas, mostra o sucesso e limpa os campos (carregando durante o envio)', async () => {
    let liberar: (r: Response) => void = () => undefined;
    const f = simularApi(() => new Promise<Response>((r) => (liberar = r)));
    const { container } = montarTela(<MinhaSenha />, '/app/conta/senha', ['/app']);
    await trocar('senha-antiga-1', 'senha-boa-123', 'senha-boa-123');
    expect(await screen.findByRole('button', { name: 'Trocando…' })).toHaveAttribute('aria-busy', 'true');
    expect(corpoEnviado(f)).toEqual({ senhaAtual: 'senha-antiga-1', novaSenha: 'senha-boa-123' });
    liberar(new Response(null, { status: 204 }));
    expect(await screen.findByRole('status')).toHaveTextContent('Senha trocada. Outros aparelhos foram desconectados.');
    expect(screen.getByLabelText('Senha atual')).toHaveValue('');
    expect(screen.getByLabelText('Nova senha')).toHaveValue('');
    expect(screen.getByLabelText('Confirmar nova senha')).toHaveValue('');
    expect(await violacoes(container)).toEqual([]);
  });

  it('ACE-27: 401 marca o campo "Senha atual" com "Senha atual incorreta."', async () => {
    simularApi((url) => (ehTroca(url) ? erroApi(401, 'senha_atual_incorreta') : json({})));
    const { container } = montarTela(<MinhaSenha />, '/app/conta/senha', ['/app']);
    await trocar('errada-12345', 'senha-boa-123', 'senha-boa-123');
    expect(await screen.findByRole('alert')).toHaveTextContent('Senha atual incorreta.');
    expect(screen.getByLabelText('Senha atual')).toBeInvalid();
    expect(screen.getByLabelText('Senha atual')).toHaveAccessibleDescription('Senha atual incorreta.');
    expect(screen.getByLabelText('Nova senha')).toHaveValue('senha-boa-123');
    expect(screen.queryByRole('status')).toBeNull();
    expect(await violacoes(container)).toEqual([]);
  });

  it('falha de conexão mostra o erro de envio e mantém os campos', async () => {
    simularApi(() => {
      throw new TypeError('rede');
    });
    montarTela(<MinhaSenha />, '/app/conta/senha', ['/app']);
    await trocar('senha-antiga-1', 'senha-boa-123', 'senha-boa-123');
    expect(await screen.findByText('Não foi possível enviar. Verifique a conexão.')).toBeVisible();
    expect(screen.getByLabelText('Nova senha')).toHaveValue('senha-boa-123');
  });
});
