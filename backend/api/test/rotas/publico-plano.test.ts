import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { camposProibidosEm, erroPlanoPro, rankingPublico } from '@pelada/contrato';
import { criarApp } from '../../src/entrada/app.ts';
import { relogioFixo } from '../../src/infraestrutura/relogio.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * PDF público e `pdf_exportado` pelo plano (planos-e-cobranca T26; PLA-19, PLA-25, PLA-26), com o app real como
 * `pelada_app` (contexto só do slug) e o relógio fixo em 2026-11-20 (12h de São Paulo). G é posto como superusuário em
 * cada situação; o `afterAll` devolve a original. G tem a partida de 2026-01-08 (cenário).
 *
 * Evidência da rede (registrar na T26 do tasks.md, pelo /executar): tirar a trava da rota do PDF deixa vermelho
 * "Free → PDF 403"; tirar a do `pdf_exportado` deixa vermelho "não cria linha em eventos_uso".
 */

const AGORA = '2026-11-20T15:00:00.000Z';
const URL_PUBLICA = 'https://pelada.exemplo.test';
const app = criarApp({ fabricaBanco: fabricaComoApp().fabrica, relogio: relogioFixo(AGORA) });

let aberto: CenarioGruposAberto;
let original: { s: string; t: string | null };
const extras: string[] = [];

async function publico(caminho: string, init: RequestInit = { method: 'GET' }): Promise<Response> {
  const ctx = contextoFalso();
  const headers = new Headers(init.headers);
  headers.set('cf-connecting-ip', '203.0.113.9');
  const r = await app.request(
    `/api/publico/${aberto.cenario.slugG}${caminho}`,
    { ...init, headers },
    envAcesso(aberto.url, { URL_PUBLICA }),
    ctx,
  );
  await ctx.esperar();
  return r;
}

function evento(corpo: unknown): Promise<Response> {
  return publico('/eventos', {
    method: 'POST',
    headers: { 'x-pelada': '1', 'content-type': 'application/json' },
    body: JSON.stringify(corpo),
  });
}

async function situacao(s: string, t: string | null): Promise<void> {
  await aberto.db.query(
    'UPDATE grupos SET situacao_comercial = $2, trial_inicio = $3::date WHERE id = $1',
    [aberto.cenario.grupoG, s, t],
  );
}

const free = () => situacao('trial', '2026-10-01');

async function eventosPdf(): Promise<number> {
  const r = await aberto.db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM eventos_uso WHERE grupo_id = $1 AND tipo = 'pdf_exportado'`,
    [aberto.cenario.grupoG],
  );
  return r.rows[0]!.n;
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const r = await aberto.db.query<{ s: string; t: string | null }>(
    'SELECT situacao_comercial AS s, trial_inicio::text AS t FROM grupos WHERE id = $1',
    [aberto.cenario.grupoG],
  );
  original = r.rows[0]!;
});

afterEach(async () => {
  await aberto.db.query(
    `DELETE FROM eventos_uso WHERE grupo_id = $1 AND tipo IN ('ranking_aberto', 'pdf_exportado')`,
    [aberto.cenario.grupoG],
  );
});

afterAll(async () => {
  if (aberto) {
    await aberto.db.query(
      `UPDATE periodos_ativos SET fim = '2026-01-02' WHERE jogador_id = ANY($1::uuid[]) AND fim IS NULL`,
      [extras],
    );
    await situacao(original.s, original.t);
    await aberto.fechar();
  }
});

describe('PDF público (PLA-25)', () => {
  it('PLA-25: grupo Free → PDF 403 plano_pro (pdf)', async () => {
    await free();
    const r = await publico('/pdf?mes=2026-01');
    expect(r.status).toBe(403);
    expect(erroPlanoPro.parse(await r.json())).toMatchObject({ erro: 'plano_pro', recurso: 'pdf' });
  });

  it('PLA-25: cortesia → PDF 200', async () => {
    await situacao('uso_proprio', null);
    const r = await publico('/pdf?mes=2026-01');
    expect(r.status).toBe(200);
  });

  it('PLA-25: trial válido → PDF 200', async () => {
    await situacao('trial', '2026-11-10');
    expect((await publico('/pdf?mes=2026-01')).status).toBe(200);
  });
});

describe('pdf_exportado (PLA-26)', () => {
  it('PLA-26: pdf_exportado de grupo Free responde 403 e não cria linha em eventos_uso', async () => {
    await free();
    const antes = await eventosPdf();
    const r = await evento({ tipo: 'pdf_exportado', mes: '2026-01' });
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ erro: 'plano_pro', recurso: 'pdf' });
    expect(await eventosPdf()).toBe(antes);
  });

  it('PLA-26: pdf_exportado de grupo em cortesia grava (204)', async () => {
    await situacao('uso_proprio', null);
    const antes = await eventosPdf();
    expect((await evento({ tipo: 'pdf_exportado', mes: '2026-01' })).status).toBe(204);
    expect(await eventosPdf()).toBe(antes + 1);
  });

  it('PLA-19: ranking_aberto de grupo Free segue gravando (204)', async () => {
    await free();
    const r = await evento({ tipo: 'ranking_aberto', dispositivoId: crypto.randomUUID() });
    expect(r.status).toBe(204);
  });
});

describe('pdfLiberado no ranking público (T27; PLA-25)', () => {
  it('PLA-25: Free → pdfLiberado falso', async () => {
    await free();
    const r = await publico('/ranking?mes=2026-01');
    expect(r.status).toBe(200);
    const corpo = rankingPublico.parse(await r.json());
    expect(corpo.pdfLiberado).toBe(false);
    expect(camposProibidosEm(corpo)).toEqual([]);
  });

  it('PLA-25: trial → pdfLiberado verdadeiro', async () => {
    await situacao('trial', '2026-11-10');
    const corpo = rankingPublico.parse(await (await publico('/ranking?mes=2026-01')).json());
    expect(corpo.pdfLiberado).toBe(true);
  });
});

describe('ranking público no Free (PLA-19)', () => {
  it('PLA-19: GET …/ranking de grupo Free somente leitura responde 200 com a última partida', async () => {
    const { db, cenario } = aberto;
    await free();
    for (let i = 0; i < 19; i++) {
      const r = await db.query<{ id: string }>(
        `INSERT INTO jogadores (grupo_id, apelido, posicao, criado_por, criado_em, alterado_por, alterado_em)
         VALUES ($1, $2, 'meia', $3, now(), $3, now()) RETURNING id`,
        [cenario.grupoG, `Público ${i + 1}`, cenario.contaC],
      );
      extras.push(r.rows[0]!.id);
      await db.query(
        `INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio, fim) VALUES ($1, $2, '2026-01-01', NULL)`,
        [r.rows[0]!.id, cenario.grupoG],
      );
    }
    const r = await publico('/ranking?mes=2026-01');
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as { partidas: Array<{ data: string }> };
    expect(corpo.partidas.map((p) => p.data)).toContain('2026-01-08');
  });
});
