// Critério: ACE-24, ACE-25, ACE-54 (mockup t06: vazio, erro, link inválido, sucesso indo a /entrar com o aviso)

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { violacoes } from '../../../test/apoio/axe';
import { corpoEnviado, erroApi, json, montarTela, simularApi } from '../../../test/apoio/tela';
import { NovaSenha } from './NovaSenha';

const TOKEN = 'b'.repeat(43);

afterEach(() => {
  vi.unstubAllGlobals();
  history.replaceState(null, '', '/');
});

function abrir(comToken = true) {
  if (comToken) history.replaceState(null, '', `/entrar/nova-senha#t=${TOKEN}`);
  return montarTela(<NovaSenha />, '/entrar/nova-senha', ['/entrar', '/entrar/esqueci']);
}

async function salvar(nova: string, confirmacao: string) {
  const u = userEvent.setup();
  await u.type(await screen.findByLabelText('Nova senha'), nova);
  await u.type(screen.getByLabelText('Confirmar nova senha'), confirmacao);
  await u.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
  return u;
}

describe('NovaSenha: vazio (t06)', () => {
  it('mostra o texto, os campos com a regra, sem "Mostrar", e apaga o fragmento da URL', async () => {
    const { container } = abrir();
    expect(await screen.findByRole('heading', { level: 1, name: 'Crie uma nova senha' })).toBeVisible();
    expect(
      screen.getByText(
        'Depois de salvar, todos os aparelhos conectados à sua conta saem e você entra de novo com a senha nova.',
      ),
    ).toBeVisible();
    expect(screen.getByLabelText('Nova senha')).toHaveAccessibleDescription('De 8 a 72 caracteres.');
    expect(screen.queryByRole('button', { name: 'Mostrar' })).toBeNull();
    expect(location.hash).toBe('');
    expect(await violacoes(container)).toEqual([]);
  });
});

describe('NovaSenha: erro de validação', () => {
  it('senhas diferentes mostram "As senhas não conferem." e não enviam', async () => {
    const f = simularApi(() => json({}));
    const { container } = abrir();
    await salvar('senha-boa-123', 'senha-boa-124');
    expect(await screen.findByRole('alert')).toHaveTextContent('As senhas não conferem.');
    expect(screen.getByLabelText('Confirmar nova senha')).toBeInvalid();
    expect(f).not.toHaveBeenCalled();
    expect(await violacoes(container)).toEqual([]);
  });

  it('senha curta mostra a regra no campo e não envia', async () => {
    const f = simularApi(() => json({}));
    abrir();
    await salvar('curta', 'curta');
    expect(await screen.findByLabelText('Nova senha')).toHaveAccessibleDescription(
      'De 8 a 72 caracteres. A senha precisa ter de 8 a 72 caracteres.',
    );
    expect(f).not.toHaveBeenCalled();
  });

  it('dois erros juntos mostram o resumo "Corrija 2 campos:"', async () => {
    simularApi(() => json({}));
    abrir();
    await salvar('curta', 'outra');
    expect(await screen.findByText('Corrija 2 campos:')).toBeVisible();
  });
});

describe('NovaSenha: envio', () => {
  it('ACE-24: envia token e senha e vai a /entrar com o aviso de senha alterada (carregando antes)', async () => {
    let liberar: (r: Response) => void = () => undefined;
    const f = simularApi(() => new Promise<Response>((r) => (liberar = r)));
    const { roteador } = abrir();
    await salvar('senha-boa-123', 'senha-boa-123');
    expect(await screen.findByRole('button', { name: 'Salvando…' })).toHaveAttribute('aria-busy', 'true');
    expect(f.mock.calls[0]?.[0]).toMatch(/\/api\/sessao\/nova-senha$/);
    expect(corpoEnviado(f)).toEqual({ token: TOKEN, senha: 'senha-boa-123' });
    liberar(json({ mensagem: 'Senha alterada. Entre com a nova senha.' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/entrar'));
    expect(roteador.state.location.search).toBe('?aviso=senha-alterada');
  });

  it('ACE-25: 410 mostra "Link inválido ou vencido" com "Pedir novo link"', async () => {
    simularApi(() => erroApi(410, 'link_invalido'));
    const { container } = abrir();
    await salvar('senha-boa-123', 'senha-boa-123');
    expect(await screen.findByRole('heading', { level: 1, name: 'Link inválido ou vencido' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Este link já foi usado ou passou do prazo de 1 hora.');
    expect(screen.getByRole('link', { name: 'Pedir novo link' })).toHaveAttribute('href', '/entrar/esqueci');
    expect(screen.getByRole('link', { name: 'Voltar para entrar' })).toHaveAttribute('href', '/entrar');
    expect(await violacoes(container)).toEqual([]);
  });

  it('abrir sem token no fragmento mostra o link inválido, sem chamar a API', async () => {
    const f = simularApi(() => json({}));
    abrir(false);
    expect(await screen.findByRole('heading', { level: 1, name: 'Link inválido ou vencido' })).toBeVisible();
    expect(f).not.toHaveBeenCalled();
  });

  it('falha de conexão mostra o erro de envio e mantém os campos', async () => {
    simularApi(() => {
      throw new TypeError('rede');
    });
    abrir();
    await salvar('senha-boa-123', 'senha-boa-123');
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível enviar. Verifique a conexão.');
    expect(screen.getByLabelText('Nova senha')).toHaveValue('senha-boa-123');
  });
});
