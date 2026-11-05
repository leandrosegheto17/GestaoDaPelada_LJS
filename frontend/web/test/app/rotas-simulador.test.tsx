import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { abrirTela, json, pendente, SESSAO_ANA } from '../apoio/tela.tsx';

/**
 * Rota do simulador (simulador T51; SIM-84): `/app/grupos/:grupoId/simulador` renderiza a tela `simulador` com sessão e
 * passa pela `GuardaApp`. Molde: `rotas-partidas.test.tsx`.
 */

afterEach(() => {
  cleanup();
});

/** Sessão de Ana e toda outra leitura pendente: a rota e a guarda bastam; a tela tem o próprio teste. */
function comSessaoEPendentes() {
  const api = { 'GET /api/sessao': () => json(200, SESSAO_ANA) };
  return new Proxy(api as Record<string, () => Response | Promise<Response>>, {
    get: (alvo, chave: string) => alvo[chave] ?? (chave.startsWith('GET ') ? () => pendente() : undefined),
  });
}

describe('rota do simulador', () => {
  it('SIM-84: /app/grupos/g-quinta/simulador renderiza a tela simulador com sessão', async () => {
    const { tela, local } = abrirTela('/app/grupos/g-quinta/simulador', comSessaoEPendentes());
    await waitFor(() => expect(tela()).toBe('simulador'));
    expect(local()).toBe('/app/grupos/g-quinta/simulador');
  });

  it('SIM-84: sem sessão, a GuardaApp leva a /entrar', async () => {
    const { local } = abrirTela('/app/grupos/g-quinta/simulador');
    await waitFor(() => expect(local().startsWith('/entrar')).toBe(true));
  });

  it('SIM-84: o item "Simulador" do início do grupo abre a rota do simulador', async () => {
    const t = abrirTela('/app/grupos/g-quinta', {
      'GET /api/sessao': () => json(200, SESSAO_ANA),
      'GET /api/grupos/g-quinta': () => json(200, QUINTA),
      'GET /api/grupos/g-quinta/simulador/contexto': () => pendente(),
    });
    const item = await screen.findByRole('link', { name: 'Simulador: qui, 22/10' });
    fireEvent.click(item);
    await waitFor(() => expect(t.tela()).toBe('simulador'));
    expect(t.local()).toBe('/app/grupos/g-quinta/simulador');
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
  admins: 1,
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
