import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PaginaSimulador } from '../../src/telas/simulador/PaginaSimulador.tsx';
import {
  cabecalhoVarios,
  rotuloIncompleto,
} from '../../src/telas/simulador/ResultadoVariosTimes.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, json, pendente, SESSAO_ANA } from '../apoio/tela.tsx';

/**
 * Resultado em 3 ou mais times (t14; simulador T48; SIM-38, SIM-74), a partir de `S:191`, `S:279` e do mockup
 * `t14-resultado-varios--sucesso.html`: 22 aptos com N = 4 dão 5 times completos e 1 incompleto de 2.
 */

afterEach(() => {
  cleanup();
});

const ids = Array.from(
  { length: 22 },
  (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
);
const apelidoDe = (i: number) => `Jogador ${String(i + 1).padStart(2, '0')}`;

const CONTEXTO = {
  dataSugerida: '2026-10-22',
  hoje: '2026-10-20',
  jogadores: ids.map((id, i) => ({
    id,
    apelido: apelidoDe(i),
    nivel: 600,
    semNota: false,
    semAno: false,
  })),
};

const DESCRICAO = '5 times de 4 + 1 time incompleto de 2';
const PREVIA = {
  formato: 'varios_times',
  valida: true,
  descricao: DESCRICAO,
  times: 6,
  timesCompletos: 5,
  tamanhoIncompleto: 2,
};
const PREVIA_DOIS = {
  formato: 'dois_times',
  valida: true,
  descricao: '2 times de 7 · 8 reservas',
  times: 2,
  reservas: 8,
};

function sugestao() {
  const times = [];
  for (let t = 0; t < 6; t++) {
    const dele = ids.slice(t * 4, t * 4 + 4);
    times.push({
      nome: `Time ${t + 1}`,
      incompleto: t === 5,
      jogadores: dele.map((id) => {
        const i = ids.indexOf(id);
        return { id, apelido: apelidoDe(i), nivel: 600, semNota: false, semAno: false };
      }),
      indicadores: {
        jogadores: dele.length,
        nivelSoma: 600 * dele.length,
        nivelMedio: 600,
        idadeMedia: t === 5 ? null : 3550,
      },
    });
  }
  return {
    formato: 'varios_times',
    data: '2026-10-22',
    n: 4,
    descricao: DESCRICAO,
    avisos: [],
    times,
  };
}

function abrir() {
  return abrirTela(
    '/app/grupos/g-quinta/simulador',
    {
      'GET /api/sessao': () => json(200, SESSAO_ANA),
      'GET /api/grupos/g-quinta': () => pendente(),
      'GET /api/grupos/g-quinta/simulador/contexto': () => json(200, CONTEXTO),
      'POST /api/grupos/g-quinta/simulador/previa': (corpo) =>
        json(200, (corpo as { formato: string }).formato === 'varios_times' ? PREVIA : PREVIA_DOIS),
      'POST /api/grupos/g-quinta/simulador/sugerir': () => json(200, sugestao()),
    },
    () => [{ path: '/app/grupos/:grupoId/simulador', element: <PaginaSimulador /> }],
  );
}

async function sugerirEmVarios() {
  fireEvent.click(await screen.findByRole('radio', { name: '3 ou mais times' }));
  for (let i = 0; i < 3; i++)
    fireEvent.click(screen.getByRole('button', { name: 'Diminuir jogadores por time' }));
  const botao = screen.getByRole('button', { name: 'Sugerir times' }) as HTMLButtonElement;
  await screen.findByText(DESCRICAO);
  await waitFor(() => expect(botao.disabled).toBe(false));
  fireEvent.click(botao);
}

describe('formatos do resultado em 3 ou mais', () => {
  it('SIM-74: cabeçalho com o dia e a descrição da prévia; SIM-38: rótulo do incompleto', () => {
    expect(cabecalhoVarios('2026-10-22', '4 times de 4 + 1 time incompleto de 2')).toBe(
      'qui, 22/10 · 4 times de 4 + 1 time incompleto de 2',
    );
    expect(rotuloIncompleto(2, 4)).toBe('Incompleto (2 de 4)');
  });
});

describe('Simulador: resultado em 3 ou mais times (t14)', () => {
  it('SIM-38: 22 aptos com N = 4 mostram 6 cartões, o último "Incompleto (2 de 4)"', async () => {
    const t = abrir();
    await sugerirEmVarios();
    const cartoes = await screen.findAllByRole('region');
    expect(cartoes).toHaveLength(6);
    expect(within(cartoes[0] as HTMLElement).getByRole('heading', { level: 2 }).textContent).toBe(
      'Time 1',
    );
    const ultimo = cartoes[5] as HTMLElement;
    expect(within(ultimo).getByText('Incompleto (2 de 4)')).toBeDefined();
    expect(within(ultimo).getAllByRole('button')).toHaveLength(2);
    expect(t.chamadasA('POST', '/api/grupos/g-quinta/simulador/sugerir')[0]?.corpo).toMatchObject({
      formato: 'varios_times',
      n: 4,
    });
  });

  it('SIM-38: cada cartão com os apelidos e "Jogadores", "Nível médio", "Nível somado" e "Idade média"', async () => {
    abrir();
    await sugerirEmVarios();
    const primeiro = (await screen.findAllByRole('region'))[0] as HTMLElement;
    expect(within(primeiro).getByRole('button', { name: 'Jogador 01' })).toBeDefined();
    const valor = (rotulo: string) =>
      within(primeiro).getByText(rotulo).nextElementSibling?.textContent;
    expect(valor('Jogadores')).toBe('4');
    expect(valor('Nível médio')).toBe('6,0');
    expect(valor('Nível somado')).toBe('24,0');
    expect(valor('Idade média')).toBe('35,5');
    // Ninguém com ano no incompleto: idade média nula vira "—".
    const ultimo = (await screen.findAllByRole('region'))[5] as HTMLElement;
    expect(within(ultimo).getByText('Idade média').nextElementSibling?.textContent).toBe('—');
  });

  it('SIM-74: cabeçalho do resultado com a descrição da prévia; axe sem violação', async () => {
    const t = abrir();
    await sugerirEmVarios();
    expect(await screen.findByText(`qui, 22/10 · ${DESCRICAO}`)).toBeDefined();
    await esperarSemViolacoes(t.container);
  });
});
