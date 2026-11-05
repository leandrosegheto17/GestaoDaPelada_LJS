import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PaginaSimulador, TEXTO_SEM_JOGADORES, TEXTO_SEM_JOGADORES_AJUDA } from '../../src/telas/simulador/PaginaSimulador.tsx';
import { TEXTO_PROXIMO_DIA, TEXTO_SEM_ANO } from '../../src/telas/simulador/EntradasSimulador.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, json, pendente, SESSAO_ANA, type Manipulador } from '../apoio/tela.tsx';

/**
 * Entradas do simulador (t12; simulador T45; SIM-05, SIM-06, SIM-07, SIM-95), a partir dos critérios de `S:93-95` e
 * `S:346` e do mockup `t12-simulador--{vazio,dois-times,tres-times}.html`. O servidor falso de `apoio/tela.tsx` corta a
 * query: `GET …/simulador/contexto` responde em sequência. A prévia fica pendente (é da T46).
 */

afterEach(() => {
  cleanup();
});

const ALEMAO = '00000000-0000-4000-8000-000000000001';
const BIGODE = '00000000-0000-4000-8000-000000000002';
const LEO = '00000000-0000-4000-8000-000000000003';

const CONTEXTO = 'GET /api/grupos/g-quinta/simulador/contexto';
const PREVIA = 'POST /api/grupos/g-quinta/simulador/previa';

function contexto(extra: Record<string, unknown> = {}) {
  return {
    dataSugerida: '2026-10-22',
    hoje: '2026-10-20',
    jogadores: [
      { id: ALEMAO, apelido: 'Alemão', nivel: 610, semNota: false, semAno: false },
      { id: BIGODE, apelido: 'Bigode', nivel: 685, semNota: false, semAno: true },
      { id: LEO, apelido: 'Léo Baiano', nivel: 550, semNota: true, semAno: false },
    ],
    ...extra,
  };
}

const rotas = () => [
  { path: '/app/grupos/:grupoId/simulador', element: <PaginaSimulador /> },
  { path: '*', element: <p>destino</p> },
];

function emSequencia(...respostas: Array<() => Response | Promise<Response>>): Manipulador {
  let i = 0;
  return () => {
    const r = respostas[Math.min(i, respostas.length - 1)];
    i += 1;
    if (!r) throw new Error('sem resposta');
    return r();
  };
}

function abrir(api: Record<string, Manipulador>) {
  return abrirTela(
    '/app/grupos/g-quinta/simulador',
    { 'GET /api/sessao': () => json(200, SESSAO_ANA), 'GET /api/grupos/g-quinta': () => pendente(), [PREVIA]: () => pendente(), ...api },
    rotas,
  );
}

describe('Simulador: entradas (t12)', () => {
  it('SIM-05: data sugerida com "Próximo dia de jogo.", formato, N com − e +, aptos com nível e "sem nota"', async () => {
    abrir({ [CONTEXTO]: () => json(200, contexto()) });
    const data = (await screen.findByLabelText('Data da partida')) as HTMLInputElement;
    expect(data.value).toBe('2026-10-22');
    expect(screen.getByText(TEXTO_PROXIMO_DIA)).toBeDefined();
    expect((screen.getByRole('radio', { name: '2 times (1º e 2º tempo)' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('radio', { name: '3 ou mais times' })).toBeDefined();
    expect(screen.getByLabelText('Jogadores por time')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Diminuir jogadores por time' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Aumentar jogadores por time' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Aptos (3)' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Marcar todos' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Desmarcar todos' })).toBeDefined();
    expect(screen.getByText('nível 6,1')).toBeDefined();
    // 685 → 6,9 (meio para cima, GEL-103).
    expect(screen.getByText('nível 6,9')).toBeDefined();
    expect(screen.getByText('sem nota')).toBeDefined();
  });

  it('SIM-05: outra data não mostra "Próximo dia de jogo." e relê os ativos dessa data', async () => {
    const t = abrir({
      [CONTEXTO]: emSequencia(
        () => json(200, contexto()),
        () => json(200, contexto({ jogadores: [contexto().jogadores[0]] })),
      ),
    });
    const data = (await screen.findByLabelText('Data da partida')) as HTMLInputElement;
    fireEvent.change(data, { target: { value: '2026-10-29' } });
    await waitFor(() => expect(screen.queryByText(TEXTO_PROXIMO_DIA)).toBeNull());
    expect(await screen.findByRole('heading', { name: 'Aptos (1)' })).toBeDefined();
    // O servidor falso corta a query: a prova da releitura é a segunda chamada ao contexto.
    expect(t.chamadasA('GET', '/api/grupos/g-quinta/simulador/contexto')).toHaveLength(2);
  });

  it('SIM-06: em 2 times há o limite com "Ilimitado" e o "Só 1º" por apto; trocar para 3 ou mais oculta os dois', async () => {
    abrir({ [CONTEXTO]: () => json(200, contexto()) });
    await screen.findByLabelText('Data da partida');
    expect(screen.getByLabelText('Limite de substituições por time')).toBeDefined();
    expect(screen.getByRole('checkbox', { name: 'Ilimitado' })).toBeDefined();
    const so1o = screen.getByRole('switch', { name: 'Só 1º tempo: Alemão' }) as HTMLInputElement;
    expect(so1o.checked).toBe(false);

    fireEvent.click(screen.getByRole('radio', { name: '3 ou mais times' }));
    expect(screen.queryByLabelText('Limite de substituições por time')).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Ilimitado' })).toBeNull();
    expect(screen.queryByRole('switch', { name: /Só 1º tempo/ })).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: '2 times (1º e 2º tempo)' }));
    expect(screen.getByLabelText('Limite de substituições por time')).toBeDefined();
  });

  it('SIM-06: "Ilimitado" desabilita o número do limite; − e + respeitam 2 a 11', async () => {
    abrir({ [CONTEXTO]: () => json(200, contexto()) });
    await screen.findByLabelText('Data da partida');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ilimitado' }));
    expect((screen.getByLabelText('Limite de substituições por time') as HTMLInputElement).disabled).toBe(true);
    const n = screen.getByLabelText('Jogadores por time') as HTMLInputElement;
    for (let i = 0; i < 12; i++) fireEvent.click(screen.getByRole('button', { name: 'Aumentar jogadores por time' }));
    expect(n.value).toBe('11');
    for (let i = 0; i < 12; i++) fireEvent.click(screen.getByRole('button', { name: 'Diminuir jogadores por time' }));
    expect(n.value).toBe('2');
  });

  it('SIM-05: "Desmarcar todos" e "Marcar todos" mudam a contagem dos aptos', async () => {
    abrir({ [CONTEXTO]: () => json(200, contexto()) });
    await screen.findByLabelText('Data da partida');
    fireEvent.click(screen.getByRole('button', { name: 'Desmarcar todos' }));
    expect(screen.getByRole('heading', { name: 'Aptos (0)' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Marcar todos' }));
    expect(screen.getByRole('heading', { name: 'Aptos (3)' })).toBeDefined();
  });

  it('SIM-07: contexto sem jogadores mostra "Sem jogadores" e "Cadastrar jogadores"', async () => {
    abrir({ [CONTEXTO]: () => json(200, contexto({ jogadores: [] })) });
    expect(await screen.findByRole('heading', { name: TEXTO_SEM_JOGADORES })).toBeDefined();
    expect(screen.getByText(TEXTO_SEM_JOGADORES_AJUDA)).toBeDefined();
    const link = screen.getByRole('link', { name: 'Cadastrar jogadores' });
    expect(link.getAttribute('href')).toBe('/app/grupos/g-quinta/jogadores/novo');
    expect(screen.queryByRole('button', { name: 'Sugerir times' })).toBeNull();
  });

  it('SIM-95: apto sem ano mostra "sem ano"; axe sem violação', async () => {
    const t = abrir({ [CONTEXTO]: () => json(200, contexto()) });
    await screen.findByLabelText('Data da partida');
    expect(screen.getAllByText(TEXTO_SEM_ANO)).toHaveLength(1);
    await esperarSemViolacoes(t.container);
  });
});
