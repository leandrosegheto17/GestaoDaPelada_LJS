import { Buffer } from 'node:buffer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { usoResposta } from '@pelada/contrato';
import { criarApp } from '../../src/entrada/app.ts';
import { relogioFixo } from '../../src/infraestrutura/relogio.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * `GET /api/grupos/:grupoId/uso` (partidas-e-ranking T44; PAR-155), com o app real como `pelada_app`. O cenário de
 * grupos já grava um `partida_lancada` com o momento do banco (semana real de hoje); o `beforeAll` acrescenta:
 * - semana de 2026-03-02: dois `ranking_aberto` do mesmo aparelho e um `escalacao_confirmada`;
 * - semana de 2026-02-23: um `pdf_exportado`;
 * e nenhuma na semana de 2026-03-09, que não pode aparecer.
 */

let aberto: CenarioGruposAberto;

const app = criarApp({ fabricaBanco: fabricaComoApp().fabrica, relogio: relogioFixo('2026-03-14T15:00:00Z') });

async function sessao(conta: string): Promise<string> {
  const { token, hash } = await gerarToken();
  await aberto.db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  return token;
}

async function uso(conta = aberto.cenario.contaC): Promise<Response> {
  const headers = new Headers({ cookie: `${NOME_COOKIE_SESSAO}=${await sessao(conta)}` });
  const ctx = contextoFalso();
  const r = await app.request(`/api/grupos/${aberto.cenario.grupoG}/uso`, { method: 'GET', headers }, envAcesso(aberto.url), ctx);
  await ctx.esperar();
  return r;
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const { db, cenario } = aberto;
  const aparelho = crypto.randomUUID();
  await db.query(
    `INSERT INTO eventos_uso (grupo_id, tipo, momento, dispositivo_id, mes_exportado, data_partida) VALUES
       ($1, 'ranking_aberto', '2026-03-04T15:00:00Z', $2, NULL, NULL),
       ($1, 'ranking_aberto', '2026-03-05T15:00:00Z', $2, NULL, NULL),
       ($1, 'escalacao_confirmada', '2026-03-05T16:00:00Z', NULL, NULL, '2026-03-05'),
       ($1, 'pdf_exportado', '2026-02-25T15:00:00Z', NULL, '2026-02', NULL)`,
    [cenario.grupoG, aparelho],
  );
});

afterAll(async () => {
  await aberto?.fechar();
});

describe('GET /api/grupos/:grupoId/uso', () => {
  // Simulador T30 (SIM-70): escalacoesConfirmadas passa a contar os eventos; a semana de 2026-03-02 tem um, as
  // demais nenhum (autorizado, `## Autorizações`; mesmas asserções, com a contagem real).
  it('PAR-155, SIM-70: semanas só com evento, da mais recente para a mais antiga, com as escalações contadas', async () => {
    const r = await uso();
    expect(r.status).toBe(200);
    const { semanas } = usoResposta.parse(await r.json());

    const inicios = semanas.map((s) => s.inicio);
    expect([...inicios].sort().reverse()).toEqual(inicios);
    expect(inicios).not.toContain('2026-03-09');
    expect(inicios.indexOf('2026-03-02')).toBeLessThan(inicios.indexOf('2026-02-23'));
    for (const s of semanas) expect(s.escalacoesConfirmadas).toBe(s.inicio === '2026-03-02' ? 1 : 0);

    expect(semanas.find((s) => s.inicio === '2026-03-02')).toEqual({
      inicio: '2026-03-02',
      fim: '2026-03-08',
      aparelhosRanking: 1,
      pdfsExportados: 0,
      partidasLancadas: 0,
      partidasEm48h: 0,
      escalacoesConfirmadas: 1,
    });
    expect(semanas.find((s) => s.inicio === '2026-02-23')).toMatchObject({ pdfsExportados: 1, aparelhosRanking: 0 });
  });

  it('PAR-155: a outra admin também vê o painel', async () => {
    expect((await uso(aberto.cenario.contaO)).status).toBe(200);
  });

  it('PAR-155: sem vínculo, 404', async () => {
    const r = await uso(aberto.cenario.contaB);
    expect(r.status).toBe(404);
    expect(await r.json()).toMatchObject({ codigo: 'nao_encontrado' });
  });
});
