import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function renderizar(caminho: string) {
  // o módulo lê VITE_VITRINE na carga: cada cenário importa de novo
  vi.resetModules();
  const { Rotas } = await import('./rotas.tsx');
  return render(
    <MemoryRouter initialEntries={[caminho]}>
      <Rotas />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubEnv('VITE_VITRINE', '');
});
afterEach(() => vi.unstubAllEnvs());

describe('rotas', () => {
  it('"/" mostra a página provisória', async () => {
    await renderizar('/');
    expect(screen.getByRole('heading', { name: 'Em breve' })).toBeInTheDocument();
  });

  it('uma rota qualquer mostra o 404', async () => {
    await renderizar('/qualquer');
    expect(screen.getByRole('heading', { name: 'Página não encontrada' })).toBeInTheDocument();
  });

  it.each([
    ['/_vitrine/erro-rede', 'alert', undefined],
    ['/_vitrine/carregando-lista', 'status', undefined],
    ['/_vitrine/indisponivel', 'heading', 'Grupo indisponível'],
  ] as const)('FUN-38: com VITE_VITRINE=1, %s renderiza', async (caminho, papel, nome) => {
    vi.stubEnv('VITE_VITRINE', '1');
    await renderizar(caminho);
    expect(await screen.findByRole(papel, nome ? { name: nome } : undefined)).toBeInTheDocument();
  });

  it.each(['/_vitrine/erro-rede', '/_vitrine/carregando-lista', '/_vitrine/indisponivel'])(
    'FUN-38: sem a variável, %s cai no 404',
    async (caminho) => {
      await renderizar(caminho);
      expect(screen.getByRole('heading', { name: 'Página não encontrada' })).toBeInTheDocument();
    },
  );

  it('FUN-38: vitrine com id desconhecido cai no 404', async () => {
    vi.stubEnv('VITE_VITRINE', '1');
    await renderizar('/_vitrine/nao-existe');
    expect(
      await screen.findByRole('heading', { name: 'Página não encontrada' }),
    ).toBeInTheDocument();
  });
});
