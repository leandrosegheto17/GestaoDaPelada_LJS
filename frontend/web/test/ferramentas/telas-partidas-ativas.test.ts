// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { entradasAtivas, type MapaTelas } from '../../e2e/ferramentas/telas-reais.mjs';

/**
 * Telas de partidas e ranking na comparação visual (partidas-e-ranking T76; PAR-146): t01 (`sucesso`, `vazio`,
 * `vazio-mes`, `carregando`, `erro`), t03, t09 `sem-jogadores`, t10, t11 (`nova`, `edicao`, `carregando`, `vazio`,
 * `data-futura`, `duplicada`), t18 e t21, em PC e celular, até 1% (o limite padrão do runner). Os estados que exigem
 * interação fora do runner (PDF, sem conexão, instalar, prévias da t16) ficam na `revisaoManual` do `telas.json`.
 */

const MAPA = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../../.specs/mockup/telas.json', import.meta.url)),
    'utf8',
  ),
) as MapaTelas & { revisaoManual?: { id: string; estado: string }[] };
const ATIVAS = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../e2e/telas-ativas.json', import.meta.url)), 'utf8'),
) as {
  telas: { id: string; estado: string }[];
};

const DA_FEATURE = [
  'T01 sucesso',
  'T01 vazio',
  'T01 vazio-mes',
  'T01 carregando',
  'T01 erro',
  'T03 erro',
  'T09 sem-jogadores',
  'T10 sucesso',
  'T10 vazio',
  'T11 nova',
  'T11 edicao',
  'T11 carregando',
  'T11 vazio',
  'T11 data-futura',
  'T11 duplicada',
  'T18 sucesso',
  'T21 sucesso',
  'T21 vazio',
];

describe('telas ativas de partidas e ranking', () => {
  const ativos = ATIVAS.telas.map((t) => `${t.id} ${t.estado}`);
  const entradas = entradasAtivas(MAPA, ATIVAS).filter((t) =>
    DA_FEATURE.includes(`${t.id} ${t.estado}`),
  );

  it('PAR-146: as telas listadas estão ativas, são reais e existem no telas.json', () => {
    for (const e of DA_FEATURE) expect(ativos).toContain(e);
    expect(entradas).toHaveLength(DA_FEATURE.length);
  });

  it('PAR-146: todas em PC e celular, sem limite acima de 1%', () => {
    for (const t of entradas) {
      expect({ tela: `${t.id} ${t.estado}`, viewports: t.viewports }).toEqual({
        tela: `${t.id} ${t.estado}`,
        viewports: ['pc', 'celular'],
      });
      expect(t.limite === undefined || t.limite <= 1).toBe(true);
    }
  });

  it('PAR-146: as rotas são as do app (/g/... público e /app/grupos/... admin)', () => {
    for (const t of entradas) expect(t.rota).toMatch(/^\/(g\/[a-z0-9-]+|app\/grupos\/g-[a-z]+)/);
  });

  it('PAR-146: os estados de interação da t01 e da t16 estão na revisão manual', () => {
    const manuais = (MAPA.revisaoManual ?? []).map((t) => `${t.id} ${t.estado}`);
    for (const e of [
      'T01 sem-conexao',
      'T01 sem-conexao-admin',
      'T01 carregando-cache',
      'T01 pdf-preparando',
      'T01 pdf-compartilhar',
      'T01 pdf-erro',
      'T01 pdf-baixado',
    ]) {
      expect(manuais).toContain(e);
    }
  });

  it('PAR-146: sem entrada repetida', () => {
    expect(new Set(ativos).size).toBe(ativos.length);
  });
});
