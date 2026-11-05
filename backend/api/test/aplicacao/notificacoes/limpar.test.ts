import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { limparNotificacoes } from '../../../src/aplicacao/notificacoes/limpar.ts';
import type { Env } from '../../../src/entrada/ambiente.ts';
import worker from '../../../src/entrada/worker.ts';
import { envCom, fabricaComoApp } from '../../db/requisicao.ts';
import { abrirCenario, type CenarioAberto } from '../../isolamento/apoio.ts';

/**
 * Limpeza diária pelo Cron (notificacoes T26; NOT-56, NOT-57), contra um banco `teste_*` migrado. As linhas vencidas e
 * as em dia são semeadas como superusuário com as datas recuadas; a limpeza roda como `pelada_app` sem contexto (o que
 * o Cron faz) e, à parte, pelo `scheduled` do Worker.
 */

let aberto: CenarioAberto;
let env: Env;

beforeAll(async () => {
  aberto = await abrirCenario();
  env = envCom(aberto.url);
});

afterAll(async () => {
  await aberto?.fechar();
});

/** Semeia, no grupo A, assinaturas e avisos com idades em dias; devolve nada, a leitura é por marca. */
async function semear(): Promise<void> {
  const { db, cenario } = aberto;
  await db.query('DELETE FROM push_ranking');
  await db.query('DELETE FROM avisos_cobranca');
  const ranking: Array<[string, string | null, string]> = [
    // marca, último envio aceito, criada
    ['velha-sem-envio', null, '181 days'],
    ['velha-com-envio', '181 days', '400 days'],
    ['nova-sem-envio', null, '179 days'],
    ['velha-mas-enviada-ontem', '1 day', '400 days'],
  ];
  for (const [marca, envio, criada] of ranking) {
    await db.query(
      `INSERT INTO push_ranking (grupo_id, endpoint, p256dh, auth, criada_em, ultimo_envio_em)
       VALUES ($1, $2, 'chave', 'segredo', now() - $3::interval, CASE WHEN $4::text IS NULL THEN NULL ELSE now() - $4::interval END)`,
      [cenario.grupoA, `https://fcm.googleapis.com/fcm/send/t26-${marca}`, criada, envio],
    );
  }
  for (const [id, idade] of [
    ['pay_t26_velho', '91 days'],
    ['pay_t26_novo', '89 days'],
  ] as const) {
    await db.query(
      `INSERT INTO avisos_cobranca (id_externo, tipo, grupo_id, enviado_em) VALUES ($1, 'cobranca_gerada', $2, now() - $3::interval)`,
      [id, cenario.grupoA, idade],
    );
  }
}

async function restantes(): Promise<{ ranking: string[]; avisos: string[] }> {
  const r = await aberto.db.query<{ endpoint: string }>('SELECT endpoint FROM push_ranking ORDER BY endpoint');
  const a = await aberto.db.query<{ id_externo: string }>('SELECT id_externo FROM avisos_cobranca ORDER BY id_externo');
  return {
    ranking: r.rows.map((l) => l.endpoint.replace('https://fcm.googleapis.com/fcm/send/t26-', '')),
    avisos: a.rows.map((l) => l.id_externo),
  };
}

beforeEach(async () => {
  await semear();
});

describe('limpeza diária', () => {
  it('NOT-56, NOT-57: como pelada_app sem contexto, apaga 180 dias sem envio aceito e avisos com mais de 90 dias', async () => {
    const apagadas = await limparNotificacoes(env, { fabrica: fabricaComoApp().fabrica });
    expect(apagadas).toEqual({ ranking: 2, avisos: 1 });
    expect(await restantes()).toEqual({
      ranking: ['nova-sem-envio', 'velha-mas-enviada-ontem'],
      avisos: ['pay_t26_novo'],
    });
  });

  it('NOT-56: rodar de novo no mesmo dia não apaga mais nada', async () => {
    await limparNotificacoes(env, { fabrica: fabricaComoApp().fabrica });
    await expect(limparNotificacoes(env, { fabrica: fabricaComoApp().fabrica })).resolves.toEqual({ ranking: 0, avisos: 0 });
  });

  it('NOT-56, NOT-57: o handler scheduled do Worker faz a mesma limpeza', async () => {
    expect(worker.scheduled).toBeTypeOf('function');
    await worker.scheduled?.({ cron: '0 6 * * *', scheduledTime: Date.now() }, env, {});
    expect(await restantes()).toEqual({
      ranking: ['nova-sem-envio', 'velha-mas-enviada-ontem'],
      avisos: ['pay_t26_novo'],
    });
  });
});
