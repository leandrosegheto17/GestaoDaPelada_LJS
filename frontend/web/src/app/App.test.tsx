import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { violacoes } from '../../test/apoio/axe';

const RAIZ = join(import.meta.dirname, '../..');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function rotasCom(vitrine: '1' | undefined) {
  vi.resetModules();
  if (vitrine) vi.stubEnv('VITE_VITRINE', vitrine);
  else vi.stubEnv('VITE_VITRINE', '');
  return (await import('./rotas')).criarRotas();
}

function abrir(rotas: Awaited<ReturnType<typeof rotasCom>>, caminho: string) {
  render(<RouterProvider router={createMemoryRouter(rotas, { initialEntries: [caminho] })} />);
}

// FUN-37
describe('página provisória', () => {
  it('/ mostra o nome do produto e "Em breve"', async () => {
    abrir(await rotasCom(undefined), '/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Em breve' })).toBeVisible();
    expect(screen.getByText('Gestão da Pelada')).toBeVisible();
  });

  it('não tem violações de acessibilidade', async () => {
    abrir(await rotasCom(undefined), '/');
    await screen.findByRole('heading', { level: 1 });
    expect(await violacoes(document.body)).toEqual([]);
  });
});

describe('rotas de vitrine', () => {
  const VITRINES = ['/vitrine/erro-rede', '/vitrine/carregando-lista', '/vitrine/grupo-indisponivel'];

  it.each(VITRINES)('sem VITE_VITRINE, %s não existe', async (caminho) => {
    abrir(await rotasCom(undefined), caminho);
    expect(await screen.findByText(/404|Not Found/i)).toBeInTheDocument();
  });

  it('com VITE_VITRINE=1, o erro de rede aparece com "Tentar de novo"', async () => {
    abrir(await rotasCom('1'), '/vitrine/erro-rede');
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar. Verifique a conexão.');
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
  });

  it('com VITE_VITRINE=1, o carregando de lista aparece em esqueleto', async () => {
    abrir(await rotasCom('1'), '/vitrine/carregando-lista');
    expect(await screen.findByRole('status')).toHaveTextContent('Carregando…');
    expect(screen.getByRole('heading', { level: 1, name: 'Jogadores' })).toBeVisible();
  });

  it('com VITE_VITRINE=1, a tela de grupo indisponível aparece', async () => {
    abrir(await rotasCom('1'), '/vitrine/grupo-indisponivel');
    expect(await screen.findByRole('heading', { level: 1, name: 'Grupo indisponível' })).toBeVisible();
  });
});

describe('build', () => {
  async function textoDoBuild(vitrine: string): Promise<string> {
    vi.stubEnv('VITE_VITRINE', vitrine);
    const saida = await build({
      root: RAIZ,
      configFile: false,
      logLevel: 'silent',
      plugins: [react()],
      build: { write: false, outDir: join(RAIZ, 'dist-teste'), emptyOutDir: false },
    });
    const resultados = Array.isArray(saida) ? saida : [saida];
    return resultados
      .flatMap((r) => ('output' in r ? r.output : []))
      .map((o) => (o.type === 'chunk' ? o.code : ''))
      .join('\n');
  }

  it('o build de produção (sem VITE_VITRINE) não leva nenhuma tela de vitrine', async () => {
    expect(await textoDoBuild('')).not.toContain('data-vitrine');
  }, 60000);

  it('o build de teste (VITE_VITRINE=1) leva as telas de vitrine', async () => {
    expect(await textoDoBuild('1')).toContain('data-vitrine');
  }, 60000);
});
