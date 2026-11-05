// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { grupoDetalheComPartidas } from '@pelada/contrato';
import stylelint from 'stylelint';
import { describe, expect, it } from 'vitest';
import { entradasAtivas, type MapaTelas } from '../../e2e/ferramentas/telas-reais.mjs';

/**
 * Telas do simulador na comparação visual (simulador T53; SIM-85, SIM-26, SIM-38, SIM-86; AD-082, AD-118): as 15 telas
 * de t12, t13 e t14 e a t11 `pre-marcada` estão ativas em PC e celular; a t09 `sucesso` continua ativa (do financeiro)
 * e a resposta do grupo dela traz o próximo dia de jogo com escalação, que o mockup mostra; o CSS tocado pelo simulador
 * passa no Stylelint de tokens (FUN-32). A comparação em si (até 1%) é do `e2e/visual.mjs`.
 * Molde: `telas-financeiro-ativas.test.ts`.
 */

const RAIZ_MOCKUP = new URL('../../../../.specs/mockup/', import.meta.url);
const MAPA = JSON.parse(
  readFileSync(fileURLToPath(new URL('telas.json', RAIZ_MOCKUP)), 'utf8'),
) as MapaTelas;
const ATIVAS = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../e2e/telas-ativas.json', import.meta.url)), 'utf8'),
) as {
  telas: { id: string; estado: string }[];
};
const WEB = join(import.meta.dirname, '..', '..');

const DO_SIMULADOR = [
  'T12 vazio',
  'T12 dois-times',
  'T12 tres-times',
  'T12 insuficiente',
  'T12 calculando',
  'T13 sucesso',
  'T13 carregando',
  'T13 recalculando',
  'T13 erro-recalcular',
  'T13 erro-confirmar',
  'T13 mover',
  'T13 trocar',
  'T13 refazer',
  'T14 sucesso',
  'T14 mover',
  'T11 pre-marcada',
];

describe('telas ativas do simulador', () => {
  const ativos = ATIVAS.telas.map((t) => `${t.id} ${t.estado}`);

  it('SIM-85: as 16 telas do simulador estão ativas, reais e em PC e celular', () => {
    for (const e of DO_SIMULADOR) expect(ativos).toContain(e);
    const entradas = entradasAtivas(MAPA, ATIVAS).filter((t) =>
      DO_SIMULADOR.includes(`${t.id} ${t.estado}`),
    );
    expect(entradas).toHaveLength(DO_SIMULADOR.length);
    for (const t of entradas)
      expect((t as { viewports?: string[] }).viewports, `${t.id} ${t.estado}`).toEqual([
        'pc',
        'celular',
      ]);
  });

  it('SIM-85: cada tela do simulador abre a rota do app e não deixa chamada da API sem resposta do mockup', () => {
    const entradas = entradasAtivas(MAPA, ATIVAS).filter((t) =>
      DO_SIMULADOR.includes(`${t.id} ${t.estado}`),
    ) as Array<{
      id: string;
      estado: string;
      rota: string;
      respostas?: { url: string }[];
    }>;
    for (const t of entradas) {
      expect(t.rota.startsWith('/app/grupos/'), `${t.id} ${t.estado}`).toBe(true);
      expect(
        t.respostas?.some((r) => r.url === '**/api/sessao'),
        `${t.id} ${t.estado} sem sessão`,
      ).toBe(true);
    }
  });

  it('SIM-26, SIM-38, SIM-86: os resultados de 2 e de 3+ times são comparados inteiros (cartões dos times)', () => {
    const inteiras = entradasAtivas(MAPA, ATIVAS).filter(
      (t) => (t.id === 'T13' || t.id === 'T14') && t.estado === 'sucesso',
    ) as Array<{ recorte?: unknown }>;
    expect(inteiras).toHaveLength(2);
    for (const t of inteiras) expect(t.recorte).toBeUndefined();
  });

  it('SIM-08, AD-118: a t09 sucesso segue ativa e a resposta do grupo traz o próximo dia de jogo com escalação', () => {
    expect(ativos).toContain('T09 sucesso');
    const t09 = entradasAtivas(MAPA, ATIVAS).find(
      (t) => t.id === 'T09' && t.estado === 'sucesso',
    ) as {
      respostas: { url: string; arquivo: string }[];
    };
    const grupo = t09.respostas.find((r) => r.url === '**/api/grupos/g-quinta');
    const corpo = grupoDetalheComPartidas.parse(
      JSON.parse(readFileSync(fileURLToPath(new URL(grupo?.arquivo ?? '', RAIZ_MOCKUP)), 'utf8')),
    );
    expect([corpo.proximoDiaDeJogo, corpo.escalacaoNoProximoDia]).toEqual(['2026-10-22', true]);
  });

  it('SIM-85: sem entrada repetida', () => {
    expect(new Set(ativos).size).toBe(ativos.length);
  });

  it('SIM-85: o CSS do simulador, do início do grupo e do lançamento passa no Stylelint de tokens', async () => {
    const r = await stylelint.lint({
      files: [
        join(WEB, 'src/telas/simulador/simulador.module.css'),
        join(WEB, 'src/telas/grupos-elenco.module.css'),
        join(WEB, 'src/telas/partida/partida.module.css'),
      ],
      configFile: join(WEB, '.stylelintrc.json'),
      configBasedir: WEB,
    });
    expect(r.results.flatMap((x) => x.warnings.map((a) => `${a.rule}: ${a.text}`))).toEqual([]);
    expect(r.errored).toBe(false);
  });
});
