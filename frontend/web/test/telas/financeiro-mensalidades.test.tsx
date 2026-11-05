import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import type { LancamentoDoMes } from '@pelada/contrato/financeiro';
import { ordemDaLista } from '../../src/telas/financeiro/FinanceiroMes.tsx';
import {
  GrupoMensalidades,
  intervaloDeDatas,
  rotuloMensalidades,
} from '../../src/telas/financeiro/GrupoMensalidades.tsx';
import { abrirTela, json, pendente, SESSAO_ANA } from '../apoio/tela.tsx';

/**
 * Linha agrupada das mensalidades do mês (financeiro T40; FIN-15), com a resposta de outubro do mockup: 16
 * mensalidades de R$ 75,00 entre 01/10 e 15/10, mais duas saídas avulsas.
 */

const OUTUBRO = JSON.parse(
  readFileSync(
    resolve(process.cwd(), '../../.specs/mockup/respostas/financeiro-2026-10.json'),
    'utf8',
  ),
) as { lancamentos: LancamentoDoMes[] };

const MENSALIDADES = OUTUBRO.lancamentos.filter((l) => l.mensalidade);

function montar(mensalidades: readonly LancamentoDoMes[]) {
  const roteador = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <ul>
            <GrupoMensalidades
              mes="2026-10"
              mensalidades={mensalidades}
              base="/app/grupos/g-quinta"
            />
          </ul>
        ),
      },
    ],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={roteador} />);
}

afterEach(() => {
  cleanup();
});

describe('GrupoMensalidades (FIN-15)', () => {
  it('FIN-15: a resposta do mockup tem 16 mensalidades', () => {
    expect(MENSALIDADES).toHaveLength(16);
  });

  it('FIN-15: 16 mensalidades de outubro numa linha com o intervalo e o total; abrir mostra as 16', () => {
    montar(MENSALIDADES);
    const linha = screen.getByRole('button', { name: /16 mensalidades de 10\/2026/ });
    expect(linha.getAttribute('aria-expanded')).toBe('false');
    expect(linha.textContent).toContain('01/10 a 15/10 ·');
    expect(linha.textContent).toContain('Entrada');
    expect(within(linha).getByText('R$ 1.200,00')).toBeTruthy();
    expect(within(linha).getByText('mensalidade')).toBeTruthy();
    expect(screen.queryAllByRole('link')).toHaveLength(0);

    fireEvent.click(linha);
    expect(linha.getAttribute('aria-expanded')).toBe('true');
    const aberta = screen.getByRole('list', { name: '16 mensalidades de 10/2026' });
    expect(within(aberta).getAllByRole('link')).toHaveLength(16);
    expect(within(aberta).getByText('Mensalidade Léo Baiano 10/2026')).toBeTruthy();

    fireEvent.click(linha);
    expect(screen.queryByRole('list', { name: '16 mensalidades de 10/2026' })).toBeNull();
  });

  it('FIN-15: uma mensalidade só diz "1 mensalidade de 10/2026" e mostra só a data', () => {
    montar(MENSALIDADES.slice(0, 1));
    const linha = screen.getByRole('button', { name: /1 mensalidade de 10\/2026/ });
    expect(linha.textContent).toContain('01/10 ·');
    expect(linha.textContent).not.toContain(' a ');
    expect(rotuloMensalidades(1, '2026-10')).toBe('1 mensalidade de 10/2026');
  });

  it('sem mensalidades, nada', () => {
    const { container } = montar([]);
    expect(container.querySelector('li')).toBeNull();
  });

  it('intervaloDeDatas ordena as datas', () => {
    expect(intervaloDeDatas(['2026-10-15', '2026-10-01', '2026-10-08'])).toBe('01/10 a 15/10');
  });
});

describe('a linha na lista do mês', () => {
  it('FIN-15: a linha agrupada fica depois do Aluguel (05/10), como no mockup', () => {
    const ordem = ordemDaLista(OUTUBRO.lancamentos).map((l) =>
      l === 'mensalidades' ? l : l.descricao,
    );
    expect(ordem).toEqual(['Bolas novas (2)', 'Aluguel da quadra outubro', 'mensalidades']);
  });

  it('FIN-15: na t22, uma linha das mensalidades e a ajuda', async () => {
    abrirTela('/app/grupos/g-quinta/financeiro', {
      'GET /api/sessao': () => json(200, SESSAO_ANA),
      'GET /api/grupos/g-quinta': () => pendente(),
      'GET /api/grupos/g-quinta/financeiro/mes': () => json(200, OUTUBRO),
    });
    expect(await screen.findByRole('button', { name: /16 mensalidades de 10\/2026/ })).toBeTruthy();
    expect(
      screen.getByText('As mensalidades do mês aparecem numa linha só; toque para ver cada uma.'),
    ).toBeTruthy();
    expect(screen.queryByText('Mensalidade Léo Baiano 10/2026')).toBeNull();
  });
});
