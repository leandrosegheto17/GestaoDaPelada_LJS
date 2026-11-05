// @vitest-environment node
import type { PdfPublico } from '@pelada/contrato/publico';
import { pdfPublico } from '@pelada/contrato/publico';
import { describe, expect, it } from 'vitest';
import {
  A4,
  ajustarFonte,
  enderecoSemEsquema,
  FONTE_MINIMA,
  gruposDeMes,
  montarFolha,
  TEXTO_LEGENDA,
  TEXTO_RODAPE,
  TEXTO_SEM_PARTIDAS_NO_MES,
  textoGeradoEm,
  textosDaFolha,
  type Elemento,
} from '../../src/pdf/folha.ts';

/**
 * Folha do PDF (partidas-e-ranking T68; PAR-103, PAR-104), de `p01-pdf--{sucesso,mes-vazio}.html`. O modelo é o que
 * `gerar-pdf.ts` desenha: os textos daqui são o "texto extraído" do arquivo.
 */

const DATAS_12 = ['2026-06-25', '2026-08-06', '2026-08-13', '2026-08-20', '2026-08-27', '2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24', '2026-10-01', '2026-10-08', '2026-10-15'];
const CHUVA = new Set(['2026-08-13', '2026-09-17', '2026-10-08']);

function projecao(linhas: number, colunas = 12, extra: Partial<PdfPublico> = {}): PdfPublico {
  const datas = DATAS_12.slice(12 - colunas);
  const bruto = {
    grupo: { nome: 'Pelada de Quinta', slug: 'pelada-de-quinta' },
    mes: '2026-10',
    geradoEm: '2026-10-22T21:40:00.000Z',
    urlPublica: 'https://pelada.gestaodapelada.workers.dev/g/pelada-de-quinta',
    semPartidasNoMes: false,
    colunas: datas.map((data) => ({ data, choveu: CHUVA.has(data), doMesExibido: data.startsWith('2026-10') })),
    linhas: Array.from({ length: linhas }, (_, i) => ({
      posicao: i + 1,
      apelido: `Jogador ${i + 1}`,
      ptsInicial: 40 - i,
      rodadas: datas.map((_, j) => {
        const situacoes = ['presente', 'lesionado', 'expulso', 'falta', 'fora'] as const;
        const situacao = situacoes[(i + j) % situacoes.length] ?? 'presente';
        const pontos = situacao === 'fora' ? null : situacao === 'expulso' ? -1 : situacao === 'falta' ? 0 : 1;
        return { situacao, pontos };
      }),
      ptsFinal: 50 - i,
    })),
    ...extra,
  };
  return pdfPublico.parse(bruto);
}

function textos(els: Elemento[]): Extract<Elemento, { tipo: 'texto' | 'paragrafo' }>[] {
  return els.filter((e): e is Extract<Elemento, { tipo: 'texto' | 'paragrafo' }> => e.tipo === 'texto' || e.tipo === 'paragrafo');
}

describe('PAR-103: uma página A4 retrato', () => {
  it('PAR-103: 40 linhas × 12 colunas geram exatamente 1 página A4 retrato e nenhuma fonte abaixo de 7 pt', () => {
    const folha = montarFolha(projecao(40, 12));
    expect(folha.paginas).toHaveLength(1);
    expect({ largura: folha.largura, altura: folha.altura }).toEqual({ largura: 595.28, altura: 841.89 });
    expect(folha.altura).toBeGreaterThan(folha.largura);
    const tamanhos = textos(folha.paginas.flat()).map((t) => t.tamanho);
    expect(Math.min(...tamanhos)).toBeGreaterThanOrEqual(FONTE_MINIMA);
    expect(folha.fonteTabela).toBeGreaterThanOrEqual(7);
    expect(folha.fonteTabela).toBeLessThanOrEqual(8.5);
  });

  it('PAR-103: com 40 linhas, todo elemento fica dentro da folha', () => {
    const folha = montarFolha(projecao(40, 12));
    for (const e of folha.paginas.flat()) {
      const ys = e.tipo === 'linha' ? [e.y1, e.y2] : e.tipo === 'retangulo' ? [e.y, e.y + e.altura] : [e.y];
      const xs = e.tipo === 'linha' ? [e.x1, e.x2] : e.tipo === 'retangulo' ? [e.x, e.x + e.largura] : [e.x];
      for (const y of ys) expect(y).toBeLessThanOrEqual(A4.altura);
      for (const x of xs) expect(x).toBeLessThanOrEqual(A4.largura);
      for (const y of ys) expect(y).toBeGreaterThanOrEqual(0);
    }
  });

  it('PAR-103: a última linha da tabela fica acima da legenda e do rodapé', () => {
    const folha = montarFolha(projecao(40, 12));
    const els = folha.paginas[0] ?? [];
    const ultima = textos(els).find((t) => t.texto === 'Jogador 40');
    const legenda = textos(els).find((t) => t.texto === TEXTO_LEGENDA);
    const rodape = textos(els).find((t) => t.texto === TEXTO_RODAPE);
    expect(ultima && legenda && rodape).toBeTruthy();
    expect(ultima!.y).toBeLessThan(legenda!.y);
    expect(legenda!.y).toBeLessThan(rodape!.y);
  });

  it('PAR-103: ajuste da fonte entre 8,5 e 7 pt; poucas linhas ficam em 8,5', () => {
    expect(ajustarFonte(10, 600).fonte).toBe(8.5);
    expect(ajustarFonte(40, 600).fonte).toBe(8.5);
    const apertado = ajustarFonte(48, 600);
    expect(apertado.fonte).toBeLessThan(8.5);
    expect(apertado.fonte).toBeGreaterThanOrEqual(7);
    expect(ajustarFonte(500, 600).fonte).toBe(7);
  });

  it('PAR-103: mais linhas do que cabem com 7 pt seguem em outra página, sem fonte menor que 7', () => {
    const folha = montarFolha(projecao(120, 12));
    expect(folha.paginas.length).toBeGreaterThan(1);
    expect(folha.fonteTabela).toBe(7);
    expect(Math.min(...textos(folha.paginas.flat()).map((t) => t.tamanho))).toBeGreaterThanOrEqual(7);
    expect(textosDaFolha(folha)).toContain('Jogador 120');
  });
});

describe('PAR-104: conteúdo', () => {
  it('PAR-104: nome do grupo, "Ranking: outubro de 2026", "Gerado em" e o rodapé sem https://', () => {
    const lidos = textosDaFolha(montarFolha(projecao(20, 12)));
    expect(lidos.map((t) => t.toLowerCase())).toContain('pelada de quinta');
    expect(lidos).toContain('Ranking: outubro de 2026');
    expect(lidos).toContain('Gerado em 22/10/2026 18:40');
    expect(lidos).toContain('Gestão da Pelada');
    expect(lidos).toContain('pelada.gestaodapelada.workers.dev/g/pelada-de-quinta');
    expect(lidos.join('\n')).not.toContain('https://');
    expect(lidos.join('\n')).not.toContain('http://');
  });

  it('PAR-104: "Gerado em" na hora de São Paulo', () => {
    expect(textoGeradoEm('2026-10-16T01:30:00.000Z')).toBe('Gerado em 15/10/2026 22:30');
    expect(textoGeradoEm('2026-01-01T02:59:00Z')).toBe('Gerado em 31/12/2025 23:59');
  });

  it('PAR-104: endereço sem esquema', () => {
    expect(enderecoSemEsquema('https://a.workers.dev/g/x')).toBe('a.workers.dev/g/x');
    expect(enderecoSemEsquema('http://127.0.0.1:8787/g/x')).toBe('127.0.0.1:8787/g/x');
  });

  it('PAR-104: meses sobre as colunas, datas dd/mm e um ícone de sol ou chuva por coluna', () => {
    const folha = montarFolha(projecao(5, 12));
    const lidos = textosDaFolha(folha);
    for (const mes of ['JUN', 'AGO', 'SET', 'OUT']) expect(lidos).toContain(mes);
    expect(lidos).toContain('25/06');
    expect(lidos).toContain('15/10');
    const icones = folha.paginas.flat().filter((e) => e.tipo === 'icone');
    expect(icones).toHaveLength(12);
    expect(icones.filter((e) => e.icone === 'chuva')).toHaveLength(3);
    expect(gruposDeMes(projecao(1, 12).colunas).map((g) => [g.rotulo, g.quantas])).toEqual([
      ['jun', 1],
      ['ago', 4],
      ['set', 4],
      ['out', 3],
    ]);
  });

  it('PAR-104: legenda das situações e dos ícones com equivalente que não depende de cor', () => {
    const folha = montarFolha(projecao(5, 12));
    const lidos = textosDaFolha(folha);
    expect(lidos).toContain(TEXTO_LEGENDA);
    for (const termo of ['presente', 'lesionado', '“L”', 'expulso', '“E”', 'falta', 'tracejado', '“–”', 'sol', 'chuva']) {
      expect(TEXTO_LEGENDA).toContain(termo);
    }
    // As marcas levam letra ("L", "E"), traço ("–") ou borda tracejada, além da cor.
    expect(lidos).toContain('L');
    expect(lidos).toContain('E');
    expect(lidos).toContain('–');
    expect(lidos).toContain('−1');
    expect(folha.paginas.flat().some((e) => e.tipo === 'retangulo' && e.tracejado === true)).toBe(true);
  });

  it('PAR-104: mês sem partidas mostra "Nenhuma partida registrada neste mês" com o mês exibido', () => {
    const vazio = projecao(5, 12, { mes: '2026-07', semPartidasNoMes: true });
    const lidos = textosDaFolha(montarFolha(vazio));
    expect(lidos).toContain('Ranking: julho de 2026');
    expect(lidos).toContain(TEXTO_SEM_PARTIDAS_NO_MES);
    expect(textosDaFolha(montarFolha(projecao(5, 12)))).not.toContain(TEXTO_SEM_PARTIDAS_NO_MES);
  });

  it('PAR-104: cada linha traz posição, apelido, Pts inicial e Pts final', () => {
    const lidos = textosDaFolha(montarFolha(projecao(3, 2)));
    expect(lidos).toEqual(expect.arrayContaining(['1', 'Jogador 1', '40', '50', 'Pts', 'inicial', 'final']));
  });
});
