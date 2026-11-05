import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { entradasAtivas, type MapaTelas } from '../../e2e/ferramentas/telas-reais.mjs';

/**
 * Telas de grupos e elenco na comparação visual (grupos-e-elenco T71; GEL-116, AD-029, AD-031): todos os estados reais
 * de T08, T15, T16, T17, T20 e T27 estão ativos, inclusive as T08 `sucesso` e `vazio` (que saíram da T56 da CA), e
 * nenhum da T09 (fora até existirem partidas, uso e financeiro).
 */

const MAPA = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../../.specs/mockup/telas.json', import.meta.url)), 'utf8'),
) as MapaTelas;
const ATIVAS = JSON.parse(readFileSync(fileURLToPath(new URL('../../e2e/telas-ativas.json', import.meta.url)), 'utf8')) as {
  telas: { id: string; estado: string }[];
};

const DO_MODULO = ['T08', 'T15', 'T16', 'T17', 'T20', 'T27'];

describe('telas ativas de grupos e elenco', () => {
  const ativos = ATIVAS.telas.map((t) => `${t.id} ${t.estado}`);

  it('GEL-116: todo estado real das telas do módulo está ativo', () => {
    const esperados = (MAPA.telas ?? []).filter((t) => t.real === true && DO_MODULO.includes(t.id)).map((t) => `${t.id} ${t.estado}`);
    expect(esperados.length).toBeGreaterThanOrEqual(40);
    for (const e of esperados) expect(ativos).toContain(e);
  });

  it('GEL-116, AD-031: as T08 sucesso e vazio estão ativas', () => {
    expect(ativos).toContain('T08 sucesso');
    expect(ativos).toContain('T08 vazio');
  });

  it('GEL-116, AD-029: da T09 entram só o menu da conta da CA e os estados que as features seguintes ativaram', () => {
    // A AD-029 deixava a T09 fora "até existirem partidas, uso e financeiro": a partidas-e-ranking (T76) ativa a
    // `sem-jogadores` e o financeiro (T46, AD-118), a `sucesso`. Nenhum outro estado da T09 entra.
    expect(ativos.filter((a) => a.startsWith('T09 ')).sort()).toEqual(['T09 menu-conta', 'T09 sem-jogadores', 'T09 sucesso']);
  });

  it('GEL-116: sem entrada repetida e todas existem no telas.json', () => {
    expect(new Set(ativos).size).toBe(ativos.length);
    expect(() => entradasAtivas(MAPA, ATIVAS)).not.toThrow();
  });
});
