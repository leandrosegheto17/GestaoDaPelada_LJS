// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  contextoResposta,
  escalacaoResposta,
  partidaNova,
  previaResposta,
  sugerirResposta,
} from '@pelada/contrato';
import { describe, expect, it } from 'vitest';

/** O que o teste usa de um schema do contrato (o pacote web não depende do zod direto). */
interface Schema {
  safeParse(valor: unknown): { success: true } | { success: false; error: { issues: unknown[] } };
}

/**
 * Mockup do simulador no formato da v2 (simulador T44; SIM-85, SIM-15; AD-047, AD-080, AD-081). As respostas
 * `respostas/simulador-*.json` passam no schema do contrato (nível inteiro × 100, `semAno`, sem campo fora de SIM-82);
 * a rota da t12 é a do app (`/app/grupos/...`); a t11 ganha o estado `pre-marcada`, com a resposta que traz
 * `preMarcadaPelaEscalacao`. Molde: `telas-financeiro.test.ts`.
 */

const RAIZ_MOCKUP = new URL('../../../../.specs/mockup/', import.meta.url);

function ler(caminho: string): unknown {
  return JSON.parse(readFileSync(fileURLToPath(new URL(caminho, RAIZ_MOCKUP)), 'utf8'));
}

const MAPA = ler('telas.json') as {
  telas: Array<{ id: string; estado: string; rota: string; mockup: string; respostas?: Array<{ url: string; arquivo?: string }> }>;
};

const RESPOSTAS: Array<[string, Schema]> = [
  ['simulador-contexto-2026-10-22.json', contextoResposta],
  ['simulador-contexto-vazio.json', contextoResposta],
  ['simulador-previa-dois.json', previaResposta],
  ['simulador-previa-insuficiente.json', previaResposta],
  ['simulador-previa-varios.json', previaResposta],
  ['simulador-previa-varios-insuficiente.json', previaResposta],
  ['simulador-sugestao-dois.json', sugerirResposta],
  ['simulador-sugestao-varios.json', sugerirResposta],
  ['simulador-escalacao-confirmada.json', escalacaoResposta],
  ['partida-nova-2026-10-22-pre-marcada.json', partidaNova],
];

describe('respostas do simulador no mockup', () => {
  it.each(RESPOSTAS)('SIM-85: %s passa no schema do contrato', (arquivo, schema) => {
    const r = schema.safeParse(ler(`respostas/${arquivo}`));
    expect(r.success ? [] : r.error.issues).toEqual([]);
  });

  it('SIM-85: o nível do contexto é inteiro × 100 e todo jogador tem semAno (AD-080)', () => {
    const ctx = contextoResposta.parse(ler('respostas/simulador-contexto-2026-10-22.json'));
    expect(ctx.jogadores.length).toBeGreaterThan(0);
    for (const j of ctx.jogadores) {
      expect(Number.isInteger(j.nivel)).toBe(true);
      expect(typeof j.semAno).toBe('boolean');
    }
  });

  it('SIM-85: a ordem de prioridade e as trocas da sugestão de 2 times usam ids dos jogadores do contexto', () => {
    const ids = new Set(contextoResposta.parse(ler('respostas/simulador-contexto-2026-10-22.json')).jogadores.map((j) => j.id));
    const s = sugerirResposta.parse(ler('respostas/simulador-sugestao-dois.json'));
    if (s.formato !== 'dois_times') throw new Error('esperava 2 times');
    for (const id of s.ordemPrioridade) expect(ids.has(id), id).toBe(true);
    for (const t of s.times) for (const troca of t.trocas) expect([ids.has(troca.sai), ids.has(troca.entra)]).toEqual([true, true]);
  });

  it('SIM-77: a resposta pré-marcada traz a marca e os 19 da escalação presentes', () => {
    const p = partidaNova.parse(ler('respostas/partida-nova-2026-10-22-pre-marcada.json'));
    expect(p.preMarcadaPelaEscalacao).toBe(true);
    expect(p.jogadores.filter((j) => j.situacao === 'presente')).toHaveLength(19);
  });
});

describe('telas do simulador no telas.json', () => {
  it('SIM-85: nenhuma rota do mockup fica em /admin (AD-047) e a t12 vazio usa a rota do app', () => {
    const doSimulador = MAPA.telas.filter((t) => ['T12', 'T13', 'T14'].includes(t.id));
    expect(doSimulador.length).toBeGreaterThan(0);
    for (const t of doSimulador) {
      expect(t.rota.startsWith('/app/grupos/'), `${t.id} ${t.estado}`).toBe(true);
      for (const r of t.respostas ?? []) expect(r.url).not.toContain('/admin/');
    }
    expect(MAPA.telas.find((t) => t.id === 'T12' && t.estado === 'vazio')?.rota).toBe('/app/grupos/g-domingo/simulador');
  });

  it('SIM-77: o estado pre-marcada da t11 existe, com a rota da partida nova e a resposta pré-marcada', () => {
    const t = MAPA.telas.find((x) => x.id === 'T11' && x.estado === 'pre-marcada');
    expect(t).toMatchObject({
      mockup: 'telas/t11-partida--pre-marcada.html',
      rota: '/app/grupos/g-quinta/partidas/nova?data=2026-10-22',
    });
    expect(t?.respostas?.map((r) => r.arquivo)).toContain('respostas/partida-nova-2026-10-22-pre-marcada.json');
    const html = readFileSync(fileURLToPath(new URL('telas/t11-partida--pre-marcada.html', RAIZ_MOCKUP)), 'utf8');
    expect(html).toContain('Pré-marcado pela escalação de 22/10 (inclui quem ficou como “não entra”).');
  });
});
