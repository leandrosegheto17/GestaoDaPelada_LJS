import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaginaSimulador } from '../../src/telas/simulador/PaginaSimulador.tsx';
import {
  ID_PREVIA_ERRO,
  TEXTO_CALCULANDO_PREVIA,
} from '../../src/telas/simulador/PreviaSimulador.tsx';
import { abrirTela, json, pendente, SESSAO_ANA, type Manipulador } from '../apoio/tela.tsx';

/**
 * Prévia na tela de entradas (t12; simulador T46; SIM-14, SIM-15), a partir de `S:115-116` e do mockup
 * `t12-simulador--{insuficiente,calculando}.html`. Temporizador falso só para `setTimeout` (o debounce de 300 ms), com
 * o tempo andando sozinho para o `waitFor` da Testing Library.
 */

const ALEMAO = '00000000-0000-4000-8000-000000000001';
const BIGODE = '00000000-0000-4000-8000-000000000002';

const CONTEXTO = 'GET /api/grupos/g-quinta/simulador/contexto';
const PREVIA = 'POST /api/grupos/g-quinta/simulador/previa';
const CAMINHO_PREVIA = '/api/grupos/g-quinta/simulador/previa';

const CONTEXTO_OK = {
  dataSugerida: '2026-10-22',
  hoje: '2026-10-20',
  jogadores: [
    { id: ALEMAO, apelido: 'Alemão', nivel: 610, semNota: false, semAno: false },
    { id: BIGODE, apelido: 'Bigode', nivel: 690, semNota: false, semAno: false },
  ],
};

const VALIDA = {
  formato: 'dois_times',
  valida: true,
  descricao: '2 times de 7 · 5 reservas',
  times: 2,
  reservas: 5,
};
const INVALIDA = {
  formato: 'dois_times',
  valida: false,
  motivo: 'aptos_insuficientes',
  descricao: 'Faltam aptos para 2 times de 11. Maior N possível: 9.',
  maiorNPossivel: 9,
};

const rotas = () => [{ path: '/app/grupos/:grupoId/simulador', element: <PaginaSimulador /> }];

function abrir(previa: Manipulador) {
  return abrirTela(
    '/app/grupos/g-quinta/simulador',
    {
      'GET /api/sessao': () => json(200, SESSAO_ANA),
      'GET /api/grupos/g-quinta': () => pendente(),
      [CONTEXTO]: () => json(200, CONTEXTO_OK),
      [PREVIA]: previa,
    },
    rotas,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function sugerir() {
  return screen.getByRole('button', { name: 'Sugerir times' }) as HTMLButtonElement;
}

describe('Simulador: prévia (t12)', () => {
  it('SIM-15: três mudanças rápidas de N fazem uma chamada só, com o último valor', async () => {
    const t = abrir(() => json(200, VALIDA));
    await screen.findByLabelText('Jogadores por time');
    await waitFor(() => expect(t.chamadasA('POST', CAMINHO_PREVIA)).toHaveLength(1));

    const mais = screen.getByRole('button', { name: 'Aumentar jogadores por time' });
    fireEvent.click(mais);
    fireEvent.click(mais);
    fireEvent.click(mais);
    await act(() => vi.advanceTimersByTimeAsync(299));
    expect(t.chamadasA('POST', CAMINHO_PREVIA)).toHaveLength(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    await waitFor(() => expect(t.chamadasA('POST', CAMINHO_PREVIA)).toHaveLength(2));
    expect(t.chamadasA('POST', CAMINHO_PREVIA)[1]?.corpo).toMatchObject({
      formato: 'dois_times',
      n: 10,
      k: 2,
    });
  });

  it('SIM-15: trocar formato, K e aptos também pede a prévia, com o corpo das entradas', async () => {
    const t = abrir(() => json(200, VALIDA));
    await screen.findByLabelText('Jogadores por time');
    await waitFor(() => expect(t.chamadasA('POST', CAMINHO_PREVIA)).toHaveLength(1));
    expect(t.chamadasA('POST', CAMINHO_PREVIA)[0]?.corpo).toEqual({
      formato: 'dois_times',
      n: 7,
      k: 2,
      aptos: [
        { id: ALEMAO, so1oTempo: false },
        { id: BIGODE, so1oTempo: false },
      ],
    });

    fireEvent.click(screen.getByRole('radio', { name: '3 ou mais times' }));
    await act(() => vi.advanceTimersByTimeAsync(300));
    await waitFor(() => expect(t.chamadasA('POST', CAMINHO_PREVIA)).toHaveLength(2));
    expect(t.chamadasA('POST', CAMINHO_PREVIA)[1]?.corpo).toEqual({
      formato: 'varios_times',
      n: 7,
      aptos: [{ id: ALEMAO }, { id: BIGODE }],
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Bigode' }));
    await act(() => vi.advanceTimersByTimeAsync(300));
    await waitFor(() => expect(t.chamadasA('POST', CAMINHO_PREVIA)).toHaveLength(3));
    expect(t.chamadasA('POST', CAMINHO_PREVIA)[2]?.corpo).toEqual({
      formato: 'varios_times',
      n: 7,
      aptos: [{ id: ALEMAO }],
    });
  });

  it('SIM-14: prévia pendente mostra "Prévia" e "calculando…" e o botão desabilitado', async () => {
    abrir(() => pendente());
    await screen.findByLabelText('Jogadores por time');
    expect(screen.getByText('Prévia')).toBeDefined();
    expect(screen.getByText(TEXTO_CALCULANDO_PREVIA)).toBeDefined();
    expect(sugerir().disabled).toBe(true);
  });

  it('SIM-14: prévia válida mostra a descrição da API e habilita "Sugerir times"', async () => {
    abrir(() => json(200, VALIDA));
    expect(await screen.findByText('2 times de 7 · 5 reservas')).toBeDefined();
    expect(sugerir().disabled).toBe(false);
  });

  it('SIM-14: prévia inválida desabilita "Sugerir times" e mostra a descrição da API ligada ao botão', async () => {
    abrir(() => json(200, INVALIDA));
    const texto = await screen.findByText(INVALIDA.descricao);
    expect(texto.closest(`#${ID_PREVIA_ERRO}`)).not.toBeNull();
    expect(screen.queryByText(TEXTO_CALCULANDO_PREVIA)).toBeNull();
    expect(sugerir().disabled).toBe(true);
    expect(sugerir().getAttribute('aria-describedby')).toBe(ID_PREVIA_ERRO);
  });

  it('SIM-15: a prévia, as entradas e a página não importam nada de @pelada/dominio', () => {
    for (const arquivo of ['PreviaSimulador.tsx', 'EntradasSimulador.tsx', 'PaginaSimulador.tsx']) {
      const fonte = readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), `../../src/telas/simulador/${arquivo}`),
        'utf8',
      );
      expect(fonte, arquivo).not.toMatch(/@pelada\/dominio/);
    }
  });
});
