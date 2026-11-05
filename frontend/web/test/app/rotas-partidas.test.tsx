import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { abrirTela, json, pendente, SESSAO_ANA } from '../apoio/tela.tsx';

/**
 * Rotas de partidas e ranking (partidas-e-ranking T58; PAR-143, PAR-83): cada rota renderiza a sua tela; `/g/:slug`
 * abre sem sessão; as do admin passam pela `GuardaApp`. Molde: `rotas-financeiro.test.tsx`.
 */

afterEach(() => {
  cleanup();
});

const ROTAS_ADMIN = [
  ['/app/grupos/g-quinta/partidas', 'partidas'],
  ['/app/grupos/g-quinta/partidas/nova', 'nova-partida'],
  ['/app/grupos/g-quinta/partidas/2026-10-15', 'partida'],
  ['/app/grupos/g-quinta/pontuacao', 'pontuacao'],
  ['/app/grupos/g-quinta/uso', 'uso'],
] as const;

/** Sessão de Ana e toda outra leitura pendente: a rota e a guarda bastam; cada tela tem o próprio teste. */
function comSessaoEPendentes() {
  const api = { 'GET /api/sessao': () => json(200, SESSAO_ANA) };
  return new Proxy(api as Record<string, () => Response | Promise<Response>>, {
    get: (alvo, chave: string) => alvo[chave] ?? (chave.startsWith('GET ') ? () => pendente() : undefined),
  });
}

const QUINTA = {
  id: 'g-quinta',
  nome: 'Pelada de Quinta',
  slug: 'pelada-de-quinta',
  linkPublico: 'https://exemplo.test/g/pelada-de-quinta',
  diaSemana: 'quinta',
  frequencia: 'semanal',
  horario: '20:00',
  jogadoresAtivos: 20,
  habilidades: 6,
  admins: 1,
  souCriador: true,
};

describe('rotas de partidas e ranking', () => {
  for (const [caminho, esperada] of ROTAS_ADMIN) {
    it(`PAR-143: ${caminho} renderiza a tela ${esperada} com sessão`, async () => {
      const { tela, local } = abrirTela(caminho, comSessaoEPendentes());
      await waitFor(() => expect(tela()).toBe(esperada));
      expect(local()).toBe(caminho);
    });

    it(`PAR-143: ${caminho} sem sessão passa pela guarda e vai a /entrar`, async () => {
      const { local } = abrirTela(caminho);
      await waitFor(() => expect(local().startsWith('/entrar')).toBe(true));
    });
  }

  it('PAR-143: /g/:slug abre sem sessão, sem ir a /entrar, e consulta o ranking público', async () => {
    const t = abrirTela('/g/pelada-de-quinta', { 'GET /api/publico/pelada-de-quinta/ranking': () => pendente() });
    await waitFor(() => expect(t.tela()).toBe('ranking'));
    await waitFor(() => expect(t.chamadasA('GET', '/api/publico/pelada-de-quinta/ranking')).toHaveLength(1));
    expect(t.local()).toBe('/g/pelada-de-quinta');
  });

  it('PAR-143: /g/:slug com sessão também abre o ranking, sem redirecionar a /app', async () => {
    const t = abrirTela('/g/pelada-de-quinta', comSessaoEPendentes());
    await waitFor(() => expect(t.tela()).toBe('ranking'));
    expect(t.local()).toBe('/g/pelada-de-quinta');
  });

  it('PAR-143: /g/:slug com slug malformado ainda é a rota do ranking (a tela mostra o indisponível)', async () => {
    const t = abrirTela('/g/Nao_Valido');
    await waitFor(() => expect(t.tela()).toBe('ranking'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Grupo indisponível' })).toBeDefined();
  });

  it('PAR-83: o link "Ver ranking" do início do grupo aponta para /g/<slug> e abre o ranking', async () => {
    const t = abrirTela('/app/grupos/g-quinta', {
      'GET /api/sessao': () => json(200, SESSAO_ANA),
      'GET /api/grupos/g-quinta': () => json(200, QUINTA),
      'GET /api/publico/pelada-de-quinta/ranking': () => pendente(),
    });
    const link = await screen.findByRole('link', { name: 'Ver ranking' });
    expect(link.getAttribute('href')).toBe('/g/pelada-de-quinta');
    fireEvent.click(link);
    await waitFor(() => expect(t.tela()).toBe('ranking'));
    expect(t.local()).toBe('/g/pelada-de-quinta');
  });
});
