import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { esquecerAberturas } from '../../src/dados/eventos.ts';
import { PaginaRanking } from '../../src/telas/ranking/PaginaRanking.tsx';
import { abrirTela, json, pendente, type Manipulador } from '../apoio/tela.tsx';

/**
 * "Exportar PDF" na t01 (partidas-e-ranking T70; PAR-102, PAR-107, PAR-125). O `jspdf` é trocado por um documento
 * falso, e o `vi.mock` registra quando o módulo é importado: a prova de que o `import('jspdf')` só acontece no toque.
 * O download usa `URL.createObjectURL` e o clique num link, que o jsdom não tem: os dois são dublês.
 */

const jspdf = vi.hoisted(() => ({ importado: 0, documentos: 0 }));

vi.mock('jspdf', () => {
  jspdf.importado += 1;
  class DocumentoFalso {
    constructor() {
      jspdf.documentos += 1;
      return new Proxy(this, {
        get: (_alvo, prop) => {
          if (prop === 'output')
            return () => new Blob(['%PDF-1.3 falso'], { type: 'application/pdf' });
          if (prop === 'splitTextToSize') return (texto: string) => [texto];
          return () => undefined;
        },
      });
    }
  }
  return { jsPDF: DocumentoFalso };
});

const SLUG = 'pelada-de-quinta';
const RANKING = `GET /api/publico/${SLUG}/ranking`;
const PDF = `GET /api/publico/${SLUG}/pdf`;
const EVENTOS = `POST /api/publico/${SLUG}/eventos`;
const rotas = () => [{ path: '/g/:slug', element: <PaginaRanking />, handle: { tela: 'ranking' } }];

const LINHA = {
  posicao: 1,
  apelido: 'Toninho',
  ptsInicial: 27,
  rodadas: [{ situacao: 'presente', pontos: 1 }],
  ptsFinal: 28,
};

function ranking(mes = '2026-10') {
  return {
    grupo: {
      nome: 'Pelada de Quinta',
      slug: SLUG,
      diaSemana: 'quinta',
      frequencia: 'semanal',
      horario: '20:00',
    },
    mes,
    hoje: '2026-10-22',
    geradoEm: '2026-10-22T12:00:00.000Z',
    pdfLiberado: true,
    navegacao: { mesAnterior: '2026-09', mesSeguinte: null },
    resumoMes: { partidas: 1, comChuva: 0 },
    partidas: [{ data: `${mes}-15`, choveu: false }],
    linhas: [LINHA],
  };
}

function projecaoPdf(mes = '2026-10') {
  return {
    grupo: { nome: 'Pelada de Quinta', slug: SLUG },
    mes,
    geradoEm: '2026-10-22T21:40:00.000Z',
    urlPublica: `https://gestaodapelada-v2.exemplo.test/g/${SLUG}`,
    semPartidasNoMes: false,
    colunas: [{ data: `${mes}-15`, choveu: false, doMesExibido: true }],
    linhas: [LINHA],
  };
}

function emSequencia(...respostas: Array<() => Response | Promise<Response>>): Manipulador {
  let i = 0;
  return () => {
    const r = respostas[Math.min(i, respostas.length - 1)];
    i += 1;
    if (!r) throw new Error('sem resposta');
    return r();
  };
}

let baixados: string[] = [];

beforeEach(() => {
  esquecerAberturas();
  baixados = [];
  // jsdom: sem canShare (baixa), sem createObjectURL, e o clique no link não navega.
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:falso'), revokeObjectURL: vi.fn() }),
  );
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    baixados.push(this.download);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function botaoExportar(): HTMLElement {
  const botao = screen.getAllByRole('button', { name: /Exportar PDF|Preparando PDF…/ })[0];
  if (!botao) throw new Error('sem botão Exportar PDF');
  return botao;
}

describe('Exportar PDF', () => {
  it('PAR-102: o import do jspdf só acontece no toque em "Exportar PDF"', async () => {
    const t = abrirTela(
      `/g/${SLUG}`,
      {
        [RANKING]: () => json(200, ranking()),
        [PDF]: () => json(200, projecaoPdf()),
        [EVENTOS]: () => json(204),
      },
      rotas,
    );
    await screen.findByRole('heading', { level: 2, name: 'outubro de 2026' });
    await new Promise((r) => setTimeout(r, 30));
    expect(jspdf.importado).toBe(0);
    expect(t.chamadasA('GET', `/api/publico/${SLUG}/pdf`)).toHaveLength(0);

    fireEvent.click(botaoExportar());

    await waitFor(() => expect(jspdf.importado).toBe(1));
    await waitFor(() => expect(jspdf.documentos).toBeGreaterThan(0));
    expect(t.chamadasA('GET', `/api/publico/${SLUG}/pdf`)).toHaveLength(1);
  });

  it('PAR-102: enquanto prepara, o botão mostra "Preparando PDF…" desabilitado', async () => {
    abrirTela(
      `/g/${SLUG}`,
      { [RANKING]: () => json(200, ranking()), [PDF]: () => pendente() },
      rotas,
    );
    await screen.findByRole('heading', { level: 2, name: 'outubro de 2026' });
    fireEvent.click(botaoExportar());
    const preparando = await screen.findAllByRole('button', { name: 'Preparando PDF…' });
    expect(preparando.length).toBeGreaterThan(0);
    for (const b of preparando) expect((b as HTMLButtonElement).disabled).toBe(true);
  });

  it('PAR-107: projeção com 500 mostra o erro e "Tentar de novo" refaz', async () => {
    const t = abrirTela(
      `/g/${SLUG}`,
      {
        [RANKING]: () => json(200, ranking()),
        [PDF]: emSequencia(
          () => json(500, { erro: 'Algo deu errado.', codigo: 'erro_interno' }),
          () => json(200, projecaoPdf()),
        ),
        [EVENTOS]: () => json(204),
      },
      rotas,
    );
    await screen.findByRole('heading', { level: 2, name: 'outubro de 2026' });
    fireEvent.click(botaoExportar());

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('Não foi possível gerar o PDF.');
    expect(baixados).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('PDF baixado.')).toBeDefined();
    expect(t.chamadasA('GET', `/api/publico/${SLUG}/pdf`)).toHaveLength(2);
    expect(screen.queryByText('Não foi possível gerar o PDF.')).toBeNull();
  });

  it('PAR-107: projeção fora do contrato também mostra o erro', async () => {
    abrirTela(
      `/g/${SLUG}`,
      {
        [RANKING]: () => json(200, ranking()),
        [PDF]: () => json(200, { ...projecaoPdf(), telefone: '1' }),
      },
      rotas,
    );
    await screen.findByRole('heading', { level: 2, name: 'outubro de 2026' });
    fireEvent.click(botaoExportar());
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Não foi possível gerar o PDF.',
    );
  });

  it('PAR-106 e PAR-125: sem compartilhamento, baixa ranking-<slug>-<mês>.pdf, mostra "PDF baixado." e envia pdf_exportado com o mês exibido', async () => {
    const t = abrirTela(
      `/g/${SLUG}?mes=2026-09`,
      {
        [RANKING]: () => json(200, ranking('2026-09')),
        [PDF]: () => json(200, projecaoPdf('2026-09')),
        [EVENTOS]: () => json(204),
      },
      rotas,
    );
    await screen.findByRole('heading', { level: 2, name: 'setembro de 2026' });
    fireEvent.click(botaoExportar());
    expect(await screen.findByText('PDF baixado.')).toBeDefined();
    expect(baixados).toEqual([`ranking-${SLUG}-2026-09.pdf`]);
    await waitFor(() =>
      expect(
        t.chamadasA('POST', `/api/publico/${SLUG}/eventos`).map((c) => c.corpo),
      ).toContainEqual({ tipo: 'pdf_exportado', mes: '2026-09' }),
    );
  });

  it('PAR-125: PDF que falha não envia pdf_exportado', async () => {
    const t = abrirTela(
      `/g/${SLUG}`,
      {
        [RANKING]: () => json(200, ranking()),
        [PDF]: () => json(500, { erro: 'x', codigo: 'erro_interno' }),
        [EVENTOS]: () => json(204),
      },
      rotas,
    );
    await screen.findByRole('heading', { level: 2, name: 'outubro de 2026' });
    fireEvent.click(botaoExportar());
    await screen.findByRole('alert');
    await new Promise((r) => setTimeout(r, 30));
    const pdfs = t
      .chamadasA('POST', `/api/publico/${SLUG}/eventos`)
      .filter((c) => (c.corpo as { tipo: string }).tipo === 'pdf_exportado');
    expect(pdfs).toEqual([]);
  });

  it('PAR-105 e PAR-125: com compartilhamento, o diálogo "PDF pronto."; compartilhar envia pdf_exportado', async () => {
    const share = vi.fn(async () => undefined);
    vi.stubGlobal(
      'navigator',
      Object.assign(Object.create(navigator) as Navigator, { canShare: () => true, share }),
    );
    const t = abrirTela(
      `/g/${SLUG}`,
      {
        [RANKING]: () => json(200, ranking()),
        [PDF]: () => json(200, projecaoPdf()),
        [EVENTOS]: () => json(204),
      },
      rotas,
    );
    await screen.findByRole('heading', { level: 2, name: 'outubro de 2026' });
    fireEvent.click(botaoExportar());

    const dialogo = await screen.findByRole('dialog', { name: 'PDF pronto.' });
    expect(dialogo.textContent).toContain('Ranking de outubro de 2026 da Pelada de Quinta.');
    expect(baixados).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Compartilhar' }));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'PDF pronto.' })).toBeNull());
    await waitFor(() =>
      expect(
        t.chamadasA('POST', `/api/publico/${SLUG}/eventos`).map((c) => c.corpo),
      ).toContainEqual({ tipo: 'pdf_exportado', mes: '2026-10' }),
    );
  });
});
