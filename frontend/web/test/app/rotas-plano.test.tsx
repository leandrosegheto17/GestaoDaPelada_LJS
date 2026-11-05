import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { abrirTela, json, pendente, SESSAO_ANA } from '../apoio/tela.tsx';

/**
 * Rota de Meu plano e item no início do grupo (planos-e-cobranca T47; PLA-59, AD-063):
 * `/app/grupos/:grupoId/plano` renderiza a tela `meu-plano` com sessão e passa pela `GuardaApp`; o início do grupo
 * mostra "Meu plano" para a criadora e para a admin convidada. Molde: `rotas-simulador.test.tsx`.
 */

afterEach(() => {
  cleanup();
});

/** Sessão de Ana e toda outra leitura pendente: a rota e a guarda bastam; a tela tem o próprio teste. */
function comSessaoEPendentes() {
  const api = { 'GET /api/sessao': () => json(200, SESSAO_ANA) };
  return new Proxy(api as Record<string, () => Response | Promise<Response>>, {
    get: (alvo, chave: string) =>
      alvo[chave] ?? (chave.startsWith('GET ') ? () => pendente() : undefined),
  });
}

function abrirInicio(souCriador: boolean) {
  return abrirTela('/app/grupos/g-quinta', {
    'GET /api/sessao': () => json(200, SESSAO_ANA),
    'GET /api/grupos/g-quinta': () => json(200, { ...QUINTA, souCriador }),
    'GET /api/grupos/g-quinta/plano': () => pendente(),
  });
}

describe('rota de Meu plano', () => {
  it('PLA-59: /app/grupos/g-quinta/plano renderiza a tela meu-plano com sessão', async () => {
    const { tela, local } = abrirTela('/app/grupos/g-quinta/plano', comSessaoEPendentes());
    await waitFor(() => expect(tela()).toBe('meu-plano'));
    expect(local()).toBe('/app/grupos/g-quinta/plano');
  });

  it('PLA-59: sem sessão, a GuardaApp leva a /entrar', async () => {
    const { tela, local } = abrirTela('/app/grupos/g-quinta/plano');
    await waitFor(() => expect(local().startsWith('/entrar')).toBe(true));
    expect(tela()).not.toBe('meu-plano');
  });

  it('PLA-59: o início do grupo mostra "Meu plano" para a criadora e abre a rota', async () => {
    const t = abrirInicio(true);
    const lista = await screen.findByRole('list', { name: 'Plano' });
    const item = within(lista).getByRole('link', { name: /Meu plano/ });
    expect(item.getAttribute('href')).toBe('/app/grupos/g-quinta/plano');
    fireEvent.click(item);
    await waitFor(() => expect(t.tela()).toBe('meu-plano'));
    expect(t.local()).toBe('/app/grupos/g-quinta/plano');
  });

  it('PLA-59: o início do grupo mostra "Meu plano" para a admin convidada', async () => {
    abrirInicio(false);
    const lista = await screen.findByRole('list', { name: 'Plano' });
    const item = within(lista).getByRole('link', { name: /Meu plano/ });
    expect(item.getAttribute('href')).toBe('/app/grupos/g-quinta/plano');
  });
});

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
  admins: 2,
  souCriador: true,
  dataSugeridaPartida: '2026-10-22',
  partidaNaDataSugerida: false,
  partidasNoMes: 3,
  pesosVigentesDesde: '2026-09-01',
  pesosPadrao: false,
  aparelhosNaSemana: 12,
  proximoDiaDeJogo: '2026-10-22',
  escalacaoNoProximoDia: false,
};
