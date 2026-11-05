import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ehSlugValido } from '../../src/telas/ranking/GrupoIndisponivel.tsx';
import { PaginaRanking } from '../../src/telas/ranking/PaginaRanking.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, erroApi } from '../apoio/tela.tsx';

/** Grupo indisponível (partidas-e-ranking T57; PAR-94), a partir de `B:307` e do mockup t03. */

afterEach(() => {
  cleanup();
});

const rotas = () => [{ path: '/g/:slug', element: <PaginaRanking />, handle: { tela: 'ranking' } }];
const AJUDA = 'Este grupo não está disponível no momento. Fale com o admin do seu grupo.';

describe('GrupoIndisponivel', () => {
  it('PAR-94: /g/Nao_Valido mostra "Grupo indisponível" sem nenhuma requisição', async () => {
    const t = abrirTela('/g/Nao_Valido', {}, rotas);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Grupo indisponível' }),
    ).toBeDefined();
    expect(screen.getByText(AJUDA)).toBeDefined();
    expect(t.chamadas.filter((c) => c.caminho.startsWith('/api/publico/'))).toEqual([]);
  });

  it('PAR-94: 404 da API mostra o mesmo texto', async () => {
    const t = abrirTela(
      '/g/grupo-que-nao-existe',
      {
        'GET /api/publico/grupo-que-nao-existe/ranking': () =>
          erroApi(404, 'nao_encontrado', 'Não encontrado.'),
      },
      rotas,
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Grupo indisponível' }),
    ).toBeDefined();
    expect(screen.getByText(AJUDA)).toBeDefined();
    expect(t.chamadasA('GET', '/api/publico/grupo-que-nao-existe/ranking')).toHaveLength(1);
    expect(screen.queryByText('Sem conexão')).toBeNull();
  });

  it('PAR-94: o formato do slug é o da API (minúsculas, dígitos e hífen, até 64)', () => {
    expect(ehSlugValido('pelada-de-quinta')).toBe(true);
    expect(ehSlugValido('quinta2')).toBe(true);
    expect(ehSlugValido('Nao_Valido')).toBe(false);
    expect(ehSlugValido('com espaco')).toBe(false);
    expect(ehSlugValido('')).toBe(false);
    expect(ehSlugValido('a'.repeat(64))).toBe(true);
    expect(ehSlugValido('a'.repeat(65))).toBe(false);
  });

  it('PAR-94: axe sem violações', async () => {
    const { container } = abrirTela('/g/Nao_Valido', {}, rotas);
    await screen.findByRole('heading', { level: 1, name: 'Grupo indisponível' });
    await esperarSemViolacoes(container);
  });
});
