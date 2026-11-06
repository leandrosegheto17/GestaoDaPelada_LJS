// @vitest-environment node
import { pdfPublico, type PdfPublico } from '@pelada/contrato/publico';
import { describe, expect, it } from 'vitest';
import { carregarFontesPadrao, FONTES_TTF, gerarPdf } from '../../src/pdf/gerar-pdf.ts';

/**
 * Geração do PDF com o `jspdf` de verdade (partidas-e-ranking T68; PAR-103, PAR-104). Sem as TTF (`fontes: null`), o
 * arquivo sai em Helvetica e sem compressão: as páginas e o texto aparecem no conteúdo do PDF.
 */

const DATAS = [
  '2026-06-25',
  '2026-08-06',
  '2026-08-13',
  '2026-08-20',
  '2026-08-27',
  '2026-09-03',
  '2026-09-10',
  '2026-09-17',
  '2026-09-24',
  '2026-10-01',
  '2026-10-08',
  '2026-10-15',
];

function projecao(linhas: number): PdfPublico {
  return pdfPublico.parse({
    grupo: { nome: 'Pelada de Quinta', slug: 'pelada-de-quinta' },
    mes: '2026-10',
    geradoEm: '2026-10-22T21:40:00.000Z',
    urlPublica: 'https://pelada.gestaodapelada.exemplo.test/g/pelada-de-quinta',
    semPartidasNoMes: false,
    colunas: DATAS.map((data) => ({
      data,
      choveu: data.endsWith('-08'),
      doMesExibido: data.startsWith('2026-10'),
    })),
    linhas: Array.from({ length: linhas }, (_, i) => ({
      posicao: i + 1,
      apelido: `Jogador ${i + 1}`,
      ptsInicial: 10,
      rodadas: DATAS.map((_, j) =>
        j % 3 === 0 ? { situacao: 'expulso', pontos: -1 } : { situacao: 'presente', pontos: 1 },
      ),
      ptsFinal: 15,
    })),
  });
}

const semFontes = { fontes: async () => null };

async function conteudo(blob: Blob): Promise<string> {
  return new TextDecoder('latin1').decode(await blob.arrayBuffer());
}

describe('gerarPdf', () => {
  it('PAR-103: 40 linhas × 12 colunas geram exatamente 1 página A4 retrato', async () => {
    const blob = await gerarPdf(projecao(40), semFontes);
    expect(blob.type).toBe('application/pdf');
    const pdf = await conteudo(blob);
    expect(pdf.startsWith('%PDF-')).toBe(true);
    expect(pdf.match(/\/Type \/Page(?!s)\b/g) ?? []).toHaveLength(1);
    expect(pdf).toMatch(/\/MediaBox \[0 0 595\.28 841\.89\]/);
  });

  it('PAR-103: nenhuma fonte abaixo de 7 pt no conteúdo do PDF', async () => {
    const pdf = await conteudo(await gerarPdf(projecao(40), semFontes));
    const tamanhos = [...pdf.matchAll(/\/F\d+ ([\d.]+) Tf/g)].map((m) => Number(m[1]));
    expect(tamanhos.length).toBeGreaterThan(0);
    expect(Math.min(...tamanhos)).toBeGreaterThanOrEqual(7);
  });

  it('PAR-104: o texto extraído tem o nome, "Ranking: outubro de 2026", "Gerado em" e o rodapé sem https://', async () => {
    const pdf = await conteudo(await gerarPdf(projecao(5), semFontes));
    expect(pdf).toContain('(PELADA DE QUINTA)');
    expect(pdf).toContain('(Ranking: outubro de 2026)');
    expect(pdf).toContain('(Gerado em 22/10/2026 18:40)');
    expect(pdf).toContain('(pelada.gestaodapelada.exemplo.test/g/pelada-de-quinta)');
    expect(pdf).not.toContain('https://');
    // O menos do expulso vira hífen na Helvetica (fora do WinAnsi).
    expect(pdf).toContain('(-1)');
  });

  it('as fontes TTF que falham ao carregar viram null (Helvetica)', async () => {
    const falha = (async () => new Response('x', { status: 404 })) as unknown as typeof fetch;
    expect(await carregarFontesPadrao(falha)).toBeNull();
    const semRede = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await carregarFontesPadrao(semRede)).toBeNull();
  });

  it('as fontes TTF carregadas vão em base64, uma por arquivo', async () => {
    const pedidos: string[] = [];
    const ok = (async (url: string) => {
      pedidos.push(url);
      return new Response(new Uint8Array([0, 1, 2, 255]));
    }) as unknown as typeof fetch;
    const fontes = await carregarFontesPadrao(ok);
    expect(pedidos).toEqual(FONTES_TTF.map((f) => `/fontes/pdf/${f.arquivo}`));
    expect(Object.values(fontes?.arquivos ?? {})).toEqual(FONTES_TTF.map(() => 'AAEC/w=='));
  });

  it('fonte ausente com o servidor devolvendo HTML (200) cai na Helvetica em vez de quebrar o PDF', async () => {
    const html = (async () =>
      new Response('<!doctype html><html></html>', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })) as unknown as typeof fetch;
    expect(await carregarFontesPadrao(html)).toBeNull();
    const blob = await gerarPdf(projecao(5), { fontes: async () => carregarFontesPadrao(html) });
    expect((await conteudo(blob)).startsWith('%PDF-')).toBe(true);
  });
});
