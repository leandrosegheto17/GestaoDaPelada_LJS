// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  cssOcultar,
  ocultarDe,
  RELOGIO_VISUAL,
  type MapaTelas,
} from '../../e2e/ferramentas/telas-reais.mjs';

/**
 * Campos novos do runner visual (partidas-e-ranking T75; PAR-146; AD-044): `ocultar` (global e da entrada, nos dois
 * lados), `userAgent` e o relógio congelado; e o `telas.json` com o patch do LJS (R-35: entradas `real`, `ocultar` do
 * Financeiro, `abortar` na t01 `erro`).
 */

const MAPA = JSON.parse(
  readFileSync(new URL('../../../../.specs/mockup/telas.json', import.meta.url), 'utf8'),
) as MapaTelas;

describe('ocultar', () => {
  it('PAR-146: junta os seletores do telas.json e os da entrada', () => {
    const mapa = { viewports: {}, ocultar: ['.relogio'] } as MapaTelas;
    expect(ocultarDe(mapa, { id: 'X', estado: 'y', mockup: 'm', ocultar: ['.aviso'] })).toEqual([
      '.relogio',
      '.aviso',
    ]);
    expect(ocultarDe({ viewports: {} }, { id: 'X', estado: 'y', mockup: 'm' })).toEqual([]);
  });

  it('PAR-146: o CSS esconde com visibility hidden; no app, a classe casa também o CSS Module', () => {
    expect(cssOcultar([])).toBe('');
    expect(cssOcultar(['.a', '#b'])).toBe('.a, #b { visibility: hidden !important; }');
    const app = cssOcultar(['.botao-icone'], 'app');
    expect(app).toContain('[class^="botao-icone--m-"]');
    expect(app).toContain('visibility: hidden !important');
  });

  it('PAR-161: o telas.json esconde o atalho Financeiro do mockup do ranking público', () => {
    expect(MAPA.ocultar).toEqual([".botao-icone[aria-label='Financeiro']"]);
  });
});

describe('telas.json com o patch do LJS', () => {
  it('PAR-146: a t01 sucesso é real, em /g/pelada-de-quinta', () => {
    const t01 = (MAPA.telas ?? []).find((t) => t.id === 'T01' && t.estado === 'sucesso');
    expect(t01?.real).toBe(true);
    expect(t01?.rota).toBe('/g/pelada-de-quinta');
  });

  it('PAR-151 (P28): a t01 erro simula falha de rede com abortar', () => {
    const t01 = (MAPA.telas ?? []).find((t) => t.id === 'T01' && t.estado === 'erro');
    expect(
      t01?.respostas?.some(
        (r) => r.abortar === true && r.url.includes('/api/publico/pelada-de-quinta/ranking'),
      ),
    ).toBe(true);
  });

  it('PAR-146: a t01 instalar-iphone leva o userAgent do Safari do iPhone', () => {
    const t01 = (MAPA.telas ?? []).find((t) => t.id === 'T01' && t.estado === 'instalar-iphone');
    expect(t01?.userAgent).toMatch(/iPhone.*Safari/);
  });

  it('PAR-146 (P27): nenhuma resposta do mockup traz enderecoNovo', () => {
    for (const arquivo of [
      'publico-ranking-2026-10.json',
      'publico-ranking-2026-07.json',
      'publico-ranking-vazio.json',
      'sessao-eu-admin.json',
    ]) {
      const texto = readFileSync(
        new URL(`../../../../.specs/mockup/respostas/${arquivo}`, import.meta.url),
        'utf8',
      );
      expect({ arquivo, tem: texto.includes('enderecoNovo') }).toEqual({ arquivo, tem: false });
    }
  });

  it('PAR-146: as entradas do financeiro da v2 ficaram (rotas /app, real)', () => {
    const t22 = (MAPA.telas ?? []).filter((t) => t.id === 'T22');
    expect(t22.length).toBeGreaterThan(0);
    for (const t of t22)
      expect({ estado: t.estado, real: t.real, rota: t.rota?.startsWith('/app/') }).toEqual({
        estado: t.estado,
        real: true,
        rota: true,
      });
  });
});

describe('relógio congelado (AD-044)', () => {
  it('PAR-146: o "agora" do app na comparação é 16/10/2026 em São Paulo', () => {
    const d = new Date(RELOGIO_VISUAL);
    expect(Number.isNaN(d.getTime())).toBe(false);
    expect(d.toISOString()).toBe('2026-10-16T15:00:00.000Z');
  });
});
