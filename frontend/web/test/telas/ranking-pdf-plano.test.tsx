import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { esquecerAberturas } from '../../src/dados/eventos.ts';
import { mostrarExportar, PaginaRanking } from '../../src/telas/ranking/PaginaRanking.tsx';
import { abrirTela, json } from '../apoio/tela.tsx';

/**
 * Ranking público sem "Exportar PDF" no Free (planos-e-cobranca T51; PLA-25): a t01 só mostra o botão (no topo e na
 * barra do celular) com `pdfLiberado` verdadeiro na resposta (T27). Molde: `ranking-pdf.test.tsx`.
 */

const SLUG = 'pelada-de-quinta';
const RANKING = `GET /api/publico/${SLUG}/ranking`;
const EVENTOS = `POST /api/publico/${SLUG}/eventos`;
const rotas = () => [{ path: '/g/:slug', element: <PaginaRanking />, handle: { tela: 'ranking' } }];

function ranking(pdfLiberado: boolean) {
  return {
    grupo: {
      nome: 'Pelada de Quinta',
      slug: SLUG,
      diaSemana: 'quinta',
      frequencia: 'semanal',
      horario: '20:00',
    },
    mes: '2026-10',
    hoje: '2026-10-22',
    geradoEm: '2026-10-22T12:00:00.000Z',
    navegacao: { mesAnterior: '2026-09', mesSeguinte: null },
    resumoMes: { partidas: 1, comChuva: 0 },
    partidas: [{ data: '2026-10-15', choveu: false }],
    linhas: [
      {
        posicao: 1,
        apelido: 'Toninho',
        ptsInicial: 27,
        rodadas: [{ situacao: 'presente', pontos: 1 }],
        ptsFinal: 28,
      },
    ],
    pdfLiberado,
  };
}

function abrir(pdfLiberado: boolean) {
  return abrirTela(
    `/g/${SLUG}`,
    {
      [RANKING]: () => json(200, ranking(pdfLiberado)),
      [EVENTOS]: () => json(204),
    },
    rotas,
  );
}

afterEach(() => {
  cleanup();
  esquecerAberturas();
});

describe('Exportar PDF pelo plano (T51)', () => {
  it('PLA-25: pdfLiberado falso → a tabela aparece e nenhum "Exportar PDF"', async () => {
    abrir(false);
    expect(await screen.findByText('Toninho')).toBeDefined();
    expect(screen.queryAllByRole('button', { name: /Exportar PDF/, hidden: true })).toHaveLength(0);
  });

  it('PLA-25: pdfLiberado verdadeiro → "Exportar PDF" no topo e na barra do celular', async () => {
    abrir(true);
    expect(await screen.findByText('Toninho')).toBeDefined();
    // O CSS do módulo vale no jsdom e sem media query o topo fica oculto: conta também os ocultos.
    expect(screen.getAllByRole('button', { name: /Exportar PDF/, hidden: true })).toHaveLength(2);
  });

  it('PLA-25: mostrarExportar exige o PDF liberado e fora do guardado sem rede', () => {
    expect(mostrarExportar({ pdfLiberado: true }, false)).toBe(true);
    expect(mostrarExportar({ pdfLiberado: false }, false)).toBe(false);
    expect(mostrarExportar({ pdfLiberado: true }, true)).toBe(false);
    expect(mostrarExportar({ pdfLiberado: false }, true)).toBe(false);
  });
});
