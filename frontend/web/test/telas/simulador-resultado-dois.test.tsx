import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PaginaSimulador, TITULO_RESULTADO } from '../../src/telas/simulador/PaginaSimulador.tsx';
import {
  cabecalhoDois,
  diaAbreviado,
  TEXTO_MONTANDO,
  TEXTO_NAO_ENTRA_NOTA,
  umaCasa,
} from '../../src/telas/simulador/ResultadoDoisTimes.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, json, pendente, SESSAO_ANA, type Manipulador } from '../apoio/tela.tsx';

/**
 * Resultado em 2 times (t13; simulador T47; SIM-20, SIM-26, SIM-41, SIM-74, SIM-86), a partir de `S:134`, `S:153`,
 * `S:207`, `S:279`, `S:330` e do mockup `t13-resultado-dois--{sucesso,carregando}.html`, com as respostas do mockup no
 * formato da v2 (T44).
 */

function resposta(nome: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../../../.specs/mockup/respostas/${nome}`, import.meta.url)),
      'utf8',
    ),
  ) as Record<string, unknown>;
}

const CONTEXTO = 'GET /api/grupos/g-quinta/simulador/contexto';
const PREVIA = 'POST /api/grupos/g-quinta/simulador/previa';
const SUGERIR = 'POST /api/grupos/g-quinta/simulador/sugerir';

const rotas = () => [{ path: '/app/grupos/:grupoId/simulador', element: <PaginaSimulador /> }];

afterEach(() => {
  cleanup();
});

function abrir(sugerir: Manipulador) {
  return abrirTela(
    '/app/grupos/g-quinta/simulador',
    {
      'GET /api/sessao': () => json(200, SESSAO_ANA),
      'GET /api/grupos/g-quinta': () => pendente(),
      [CONTEXTO]: () => json(200, resposta('simulador-contexto-2026-10-22.json')),
      [PREVIA]: () => json(200, resposta('simulador-previa-dois.json')),
      [SUGERIR]: sugerir,
    },
    rotas,
  );
}

async function sugerirTimes() {
  const botao = (await screen.findByRole('button', { name: 'Sugerir times' })) as HTMLButtonElement;
  await waitFor(() => expect(botao.disabled).toBe(false));
  fireEvent.click(botao);
}

describe('formatos do resultado', () => {
  it('SIM-74: dia abreviado e cabeçalho com K e com K ilimitado', () => {
    expect(diaAbreviado('2026-10-22')).toBe('qui, 22/10');
    expect(diaAbreviado('2026-10-25')).toBe('dom, 25/10');
    expect(cabecalhoDois('2026-10-22', 7, 2)).toBe(
      'qui, 22/10 · 2 times de 7 · até 2 substituições por time',
    );
    expect(cabecalhoDois('2026-10-22', 7, 'ilimitado')).toBe(
      'qui, 22/10 · 2 times de 7 · sem limite de substituições',
    );
  });

  it('SIM-41: nível 6845 de soma aparece como "68,5"; idade com uma casa; média nula vira "—"', () => {
    expect(umaCasa(6845)).toBe('68,5');
    expect(umaCasa(4230)).toBe('42,3');
    expect(umaCasa(630)).toBe('6,3');
    expect(umaCasa(null)).toBe('—');
  });
});

describe('Simulador: resultado em 2 times (t13)', () => {
  it('SIM-86: com o sugerir pendente, "Montando os times…"', async () => {
    const t = abrir(() => pendente());
    await sugerirTimes();
    expect(await screen.findByRole('heading', { name: TEXTO_MONTANDO })).toBeDefined();
    expect(screen.getByRole('status').textContent).toBe(TEXTO_MONTANDO);
    expect(t.chamadasA('POST', '/api/grupos/g-quinta/simulador/sugerir')[0]?.corpo).toMatchObject({
      formato: 'dois_times',
      data: '2026-10-22',
      n: 7,
      k: 2,
    });
  });

  it('SIM-74: cabeçalho do resultado com o dia, N e K da resposta', async () => {
    abrir(() => json(200, resposta('simulador-sugestao-dois.json')));
    await sugerirTimes();
    expect(await screen.findByRole('heading', { name: TITULO_RESULTADO })).toBeDefined();
    expect(
      screen.getByText('qui, 22/10 · 2 times de 7 · até 2 substituições por time'),
    ).toBeDefined();
  });

  it('SIM-74: K ilimitado mostra "sem limite de substituições"', async () => {
    abrir(() => json(200, { ...resposta('simulador-sugestao-dois.json'), k: 'ilimitado' }));
    await sugerirTimes();
    expect(
      await screen.findByText('qui, 22/10 · 2 times de 7 · sem limite de substituições'),
    ).toBeDefined();
  });

  it('SIM-26: titulares com "só 1º tempo" e "sai no intervalo", reservas, trocas "A → B" e "Não entra" à parte com a nota', async () => {
    abrir(() => json(200, resposta('simulador-sugestao-dois.json')));
    await sugerirTimes();
    const timeA = await screen.findByRole('region', { name: 'Time A' });
    expect(within(timeA).getByRole('heading', { name: 'Titulares' })).toBeDefined();
    expect(within(timeA).getByRole('heading', { name: 'Entram no 2º tempo' })).toBeDefined();
    expect(within(timeA).getByText('Pedrão → Cabeça')).toBeDefined();
    expect(
      within(within(timeA).getByRole('button', { name: /Rafinha/ })).getByText('sai no intervalo'),
    ).toBeDefined();
    const timeB = screen.getByRole('region', { name: 'Time B' });
    const juninho = within(timeB).getByRole('button', { name: /Juninho/ });
    expect(within(juninho).getByText('só 1º tempo')).toBeDefined();
    expect(within(juninho).getByText('sai no intervalo')).toBeDefined();

    const naoEntra = screen.getByRole('region', { name: 'Não entra' });
    expect(within(naoEntra).getByRole('button', { name: /Serginho/ })).toBeDefined();
    expect(within(naoEntra).getByText(TEXTO_NAO_ENTRA_NOTA)).toBeDefined();
    // "Não entra" fica fora dos cartões dos times.
    expect(within(timeA).queryByText('Serginho')).toBeNull();
    expect(within(timeB).queryByText('Serginho')).toBeNull();
  });

  it('SIM-41: "Comparação entre os times" com os níveis e a idade com uma casa e as substituições', async () => {
    abrir(() => json(200, resposta('simulador-sugestao-dois.json')));
    await sugerirTimes();
    const tabela = await screen.findByRole('table', { name: 'Comparação entre os times' });
    const linha = (rotulo: string) =>
      within(within(tabela).getByRole('rowheader', { name: rotulo }).closest('tr') as HTMLElement)
        .getAllByRole('cell')
        .map((c) => c.textContent);
    expect(linha('Nível no 1º tempo (soma · média)')).toEqual(['44,1 · 6,3', '44,8 · 6,4']);
    expect(linha('Nível no 2º tempo (soma · média)')).toEqual(['43,5 · 6,2', '43,7 · 6,2']);
    expect(linha('Idade média')).toEqual(['42,3', '41,7']);
    expect(linha('Substituições')).toEqual(['2', '2']);
  });

  it('SIM-20: "Ordem de prioridade" com os apelidos na ordem da API; avisos aparecem; axe sem violação', async () => {
    const t = abrir(() => json(200, resposta('simulador-sugestao-dois.json')));
    await sugerirTimes();
    const resumo = await screen.findByText('Ordem de prioridade');
    const itens = within(resumo.closest('details') as HTMLElement)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(itens.slice(0, 4)).toEqual(['Toninho', 'Bigode', 'Careca', 'Juninho']);
    expect(itens).toHaveLength(19);
    expect(screen.getByText('Léo Baiano e Serginho não têm nota: usamos nível 5,5.')).toBeDefined();
    await esperarSemViolacoes(t.container);
  });
});
