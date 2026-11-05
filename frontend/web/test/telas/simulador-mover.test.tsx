import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { moverNoDois, TEXTO_FALHA_RECALCULAR, trocarNoVarios } from '../../src/telas/simulador/MoverJogador.tsx';
import { PaginaSimulador } from '../../src/telas/simulador/PaginaSimulador.tsx';
import { abrirTela, erroApi, json, pendente, SESSAO_ANA, type Manipulador } from '../apoio/tela.tsx';

/**
 * Mover e trocar jogador (t13, t14; simulador T49; SIM-64, SIM-65), a partir dos critérios SIM-64 e SIM-65 da spec e do mockup
 * `t13-resultado-dois--{mover,trocar,recalculando,erro-recalcular}.html` e `t14-resultado-varios--mover.html`, com as
 * respostas do mockup (T44): Japa entra no 2º tempo pelo Time A; Vini está no Time 1.
 */

type Json = Record<string, unknown>;

function resposta(nome: string): Json {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../.specs/mockup/respostas/${nome}`, import.meta.url)), 'utf8')) as Json;
}

const AVALIAR = '/api/grupos/g-quinta/simulador/avaliar';

const rotas = () => [{ path: '/app/grupos/:grupoId/simulador', element: <PaginaSimulador /> }];

function abrir(avaliar: Manipulador, varios = false) {
  return abrirTela(
    '/app/grupos/g-quinta/simulador',
    {
      'GET /api/sessao': () => json(200, SESSAO_ANA),
      'GET /api/grupos/g-quinta': () => pendente(),
      'GET /api/grupos/g-quinta/simulador/contexto': () => json(200, resposta('simulador-contexto-2026-10-22.json')),
      'POST /api/grupos/g-quinta/simulador/previa': (corpo) =>
        json(
          200,
          resposta((corpo as { formato: string }).formato === 'varios_times' ? 'simulador-previa-varios.json' : 'simulador-previa-dois.json'),
        ),
      'POST /api/grupos/g-quinta/simulador/sugerir': () =>
        json(200, resposta(varios ? 'simulador-sugestao-varios.json' : 'simulador-sugestao-dois.json')),
      [`POST ${AVALIAR}`]: avaliar,
    },
    rotas,
  );
}

/** A sugestão de 2 times sem a ordem de prioridade, como o `avaliar` responde. */
function avaliacaoDois(): Json {
  const { ordemPrioridade: _ordem, ...resto } = resposta('simulador-sugestao-dois.json');
  return resto;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function sugerir(varios = false) {
  if (varios) {
    fireEvent.click(await screen.findByRole('radio', { name: '3 ou mais times' }));
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'Diminuir jogadores por time' }));
  }
  const botao = (await screen.findByRole('button', { name: 'Sugerir times' })) as HTMLButtonElement;
  await act(() => vi.advanceTimersByTimeAsync(300));
  await waitFor(() => expect(botao.disabled).toBe(false));
  fireEvent.click(botao);
  await screen.findByRole('heading', { name: 'Times sugeridos' });
}

describe('regras do ajuste', () => {
  it('SIM-64: mover tira o jogador de onde está e o põe no fim do destino; trocar em 3+ troca os times', () => {
    const s = resposta('simulador-sugestao-dois.json') as never;
    const movido = moverNoDois(s, 'j-japa', { tipo: 'reserva', time: 1 });
    expect(movido.times[0].entramNo2oTempo.map((j) => j.id)).not.toContain('j-japa');
    expect(movido.times[1].entramNo2oTempo.at(-1)?.id).toBe('j-japa');
    const v = resposta('simulador-sugestao-varios.json') as never;
    const trocado = trocarNoVarios(v, 'j-vini', 'j-bigode');
    expect(trocado.times[0].jogadores.map((j) => j.id)).toContain('j-bigode');
    expect(trocado.times[1].jogadores.map((j) => j.id)).toContain('j-vini');
  });
});

describe('Simulador: mover e trocar jogador', () => {
  it('SIM-64: mover Japa para o Time B muda a lista na hora e chama avaliar uma vez após 300 ms', async () => {
    const t = abrir(() => json(200, avaliacaoDois()));
    await sugerir();
    fireEvent.click(within(screen.getByRole('region', { name: 'Time A' })).getByRole('button', { name: 'Japa' }));
    const folha = screen.getByRole('dialog', { name: 'Japa' });
    expect(within(folha).getByRole('button', { name: /Entra no 2º tempo pelo Time A/ }).getAttribute('aria-current')).toBe('true');
    expect(within(folha).getByRole('switch', { name: /Só 1º tempo/ })).toBeDefined();
    fireEvent.click(within(folha).getByRole('button', { name: 'Entra no 2º tempo pelo Time B' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(screen.getByRole('region', { name: 'Time B' })).getByRole('button', { name: 'Japa' })).toBeDefined();
    expect(within(screen.getByRole('region', { name: 'Time A' })).queryByRole('button', { name: 'Japa' })).toBeNull();
    expect(screen.getAllByText('recalculando…').length).toBeGreaterThan(0);

    await act(() => vi.advanceTimersByTimeAsync(299));
    expect(t.chamadasA('POST', AVALIAR)).toHaveLength(0);
    await act(() => vi.advanceTimersByTimeAsync(1));
    await waitFor(() => expect(t.chamadasA('POST', AVALIAR)).toHaveLength(1));
    const corpo = t.chamadasA('POST', AVALIAR)[0]?.corpo as { composicao: { times: Array<{ entramNo2oTempo: Array<{ id: string }> }> } };
    expect(corpo.composicao.times[1]?.entramNo2oTempo.map((j) => j.id)).toContain('j-japa');
    // Uma chamada só, mesmo depois de mais tempo.
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(t.chamadasA('POST', AVALIAR)).toHaveLength(1);
  });

  it('SIM-64: "Trocar com…" lista os outros por lugar e troca os dois', async () => {
    abrir(() => pendente());
    await sugerir();
    fireEvent.click(within(screen.getByRole('region', { name: 'Time A' })).getByRole('button', { name: 'Japa' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Japa' })).getByRole('button', { name: 'Trocar com…' }));
    const trocar = screen.getByRole('dialog', { name: 'Trocar Japa com…' });
    expect(within(trocar).getByRole('heading', { name: 'Time B · Entram no 2º tempo' })).toBeDefined();
    expect(within(trocar).getByRole('button', { name: 'Voltar' })).toBeDefined();
    fireEvent.click(within(trocar).getByRole('button', { name: 'Vini' }));
    expect(within(screen.getByRole('region', { name: 'Time B' })).getByRole('button', { name: 'Japa' })).toBeDefined();
    expect(within(screen.getByRole('region', { name: 'Time A' })).getByRole('button', { name: 'Vini' })).toBeDefined();
  });

  it('SIM-65: falha mantém Japa no B e mostra "Não foi possível recalcular." e "Tentar de novo"', async () => {
    const t = abrir(() => erroApi(429, 'limite'));
    await sugerir();
    fireEvent.click(within(screen.getByRole('region', { name: 'Time A' })).getByRole('button', { name: 'Japa' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Japa' })).getByRole('button', { name: 'Entra no 2º tempo pelo Time B' }));
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(await screen.findByText(TEXTO_FALHA_RECALCULAR)).toBeDefined();
    expect(within(screen.getByRole('region', { name: 'Time B' })).getByRole('button', { name: 'Japa' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await act(() => vi.advanceTimersByTimeAsync(300));
    await waitFor(() => expect(t.chamadasA('POST', AVALIAR)).toHaveLength(2));
  });

  it('SIM-64: em 3 ou mais, os destinos são os times, com o atual marcado', async () => {
    abrir(() => pendente(), true);
    await sugerir(true);
    fireEvent.click(within(screen.getByRole('region', { name: 'Time 1' })).getByRole('button', { name: 'Vini' }));
    const folha = screen.getByRole('dialog', { name: 'Vini' });
    const opcoes = within(folha)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(opcoes).toEqual(['Time 1atual', 'Mover para Time 2', 'Mover para Time 3', 'Mover para Time 4', 'Mover para Time 5', 'Trocar com…']);
    expect(within(folha).queryByRole('switch')).toBeNull();
    fireEvent.click(within(folha).getByRole('button', { name: 'Mover para Time 3' }));
    expect(within(screen.getByRole('region', { name: 'Time 3' })).getByRole('button', { name: 'Vini' })).toBeDefined();
  });
});
