import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

// ACE-20: a ligação real do App, do 401 `sessao_expirada` até a tela de entrada com o aviso.
describe('sessão que expira durante o uso (ACE-20)', () => {
  it('em /app/conta, o 401 sessao_expirada leva a /entrar com o aviso', async () => {
    window.history.pushState({}, '', '/app/conta');
    // A sessão vale na primeira consulta (a tela abre) e vence na chamada seguinte.
    const EU = { id: 'c1', nome: 'Ana', email: 'ana@exemplo.com.br', grupos: [] };
    const json = (corpo: unknown, status: number) =>
      new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
    const vencida = () => json({ erro: { codigo: 'sessao_expirada', mensagem: 'Sua sessão expirou.' } }, 401);
    const fetchFalso = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(EU, 200))
      .mockImplementation(() => Promise.resolve(vencida()));
    vi.stubGlobal('fetch', fetchFalso);
    const { App } = await import('./App');
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Minha conta' })).toBeVisible();
    // Qualquer chamada seguinte recebe o 401; aqui, pedir para sair.
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole('button', { name: 'Menu da conta' }));
    await usuario.click(await screen.findByText('Sair'));
    expect(await screen.findByText('Sua sessão expirou. Entre de novo.')).toBeVisible();
    expect(window.location.pathname).toBe('/entrar');
    expect(window.location.search).toBe('?aviso=sessao-expirada');
  });
});
