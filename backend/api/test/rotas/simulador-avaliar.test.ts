import { Buffer } from 'node:buffer';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  avaliarResposta,
  MENSAGEM_FORA_DOS_APTOS,
  MENSAGEM_REPETIDO_NA_COMPOSICAO,
  sugerirResposta,
  type ResultadoDois,
} from '@pelada/contrato';
import { criarApp } from '../../src/entrada/app.ts';
import { relogioFixo } from '../../src/infraestrutura/relogio.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import { abrirCenarioGrupos, arquivar, reativar, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * `POST /api/grupos/:grupoId/simulador/avaliar` (T36 da simulador; SIM-62, SIM-63), com o app real como `pelada_app`
 * e o relógio fixo numa terça (2026-03-03); a partida é da quinta 2026-03-05. Em G, Toninho, Bira e 14 criados aqui
 * (ativos desde 2026-01-01) com níveis diferentes por notas; a composição de partida é a do `sugerir`.
 *
 * Casos limite: mover um titular de A para B (somas e pares mudam, o resto fica); repetido e fora dos aptos (422 no
 * campo `composicao`); avaliar a própria sugestão devolve os mesmos indicadores e avisos; nada gravado; arquivado 409.
 */

let aberto: CenarioGruposAberto;
let ativos: string[] = [];

const DATA = '2026-03-05';
const app = criarApp({ fabricaBanco: fabricaComoApp().fabrica, relogio: relogioFixo('2026-03-03T15:00:00Z') });

async function sessao(conta: string): Promise<string> {
  const { token, hash } = await gerarToken();
  await aberto.db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  return token;
}

async function chamar(rota: 'sugerir' | 'avaliar', corpo: unknown): Promise<Response> {
  const headers = new Headers({
    'x-pelada': '1',
    'content-type': 'application/json',
    cookie: `${NOME_COOKIE_SESSAO}=${await sessao(aberto.cenario.contaC)}`,
  });
  const ctx = contextoFalso();
  const r = await app.request(
    `/api/grupos/${aberto.cenario.grupoG}/simulador/${rota}`,
    { method: 'POST', headers, body: JSON.stringify(corpo) },
    envAcesso(aberto.url),
    ctx,
  );
  await ctx.esperar();
  return r;
}

const entrada = () => ({
  formato: 'dois_times' as const,
  data: DATA,
  n: 7,
  k: 1,
  aptos: ativos.map((id) => ({ id, so1oTempo: false })),
});

/** A composição do resultado na forma do corpo (só ids e "só 1º"). */
function composicaoDe(r: Pick<ResultadoDois, 'times' | 'naoEntra'>) {
  return {
    times: r.times.map((t) => ({
      titulares: t.titulares.map((j) => ({ id: j.id, so1oTempo: j.so1oTempo })),
      entramNo2oTempo: t.entramNo2oTempo.map((j) => ({ id: j.id, so1oTempo: j.so1oTempo })),
    })),
    naoEntra: r.naoEntra.map((j) => j.id),
  };
}

async function sugestao(): Promise<ResultadoDois> {
  const s = sugerirResposta.parse(await (await chamar('sugerir', entrada())).json());
  if (s.formato !== 'dois_times') throw new Error('esperava 2 times');
  return s;
}

async function contagens(): Promise<number[]> {
  const { db, cenario } = aberto;
  const um = async (sql: string) => (await db.query<{ n: number }>(sql, [cenario.grupoG])).rows[0]?.n ?? -1;
  return [
    await um('SELECT count(*)::int AS n FROM escalacoes WHERE grupo_id = $1'),
    await um('SELECT count(*)::int AS n FROM eventos_uso WHERE grupo_id = $1'),
  ];
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const { db, cenario } = aberto;
  const novos: string[] = [];
  for (let i = 1; i <= 14; i++) {
    const r = await db.query<{ id: string }>(
      `INSERT INTO jogadores (grupo_id, apelido, ano_nascimento, posicao, pontuacao_inicial, criado_por, criado_em,
                              alterado_por, alterado_em)
       VALUES ($1, $2, $3, 'meia', $4, $5, now(), $5, now()) RETURNING id`,
      [cenario.grupoG, `Aval ${String(i).padStart(2, '0')}`, 1980 + i, i % 5, cenario.contaC],
    );
    const id = r.rows[0]!.id;
    await db.query(`INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio) VALUES ($1, $2, '2026-01-01')`, [
      id,
      cenario.grupoG,
    ]);
    // Nota na primeira habilidade do grupo: níveis diferentes entre os jogadores.
    await db.query(`INSERT INTO notas (jogador_id, habilidade_id, grupo_id, valor) VALUES ($1, $2, $3, $4)`, [
      id,
      cenario.idsG.habilidade,
      cenario.grupoG,
      1 + (i % 10),
    ]);
    novos.push(id);
  }
  ativos = [cenario.idsG.jogadorAtivo, cenario.idsG.jogadorHistorico, ...novos];
});

afterAll(async () => {
  await aberto?.fechar();
});

beforeEach(async () => {
  await reativar(aberto.db, aberto.cenario.grupoG);
});

describe('POST …/simulador/avaliar', () => {
  it('SIM-62: avaliar a própria sugestão devolve os mesmos indicadores e avisos, sem ordem de prioridade', async () => {
    const s = await sugestao();
    const r = await chamar('avaliar', { ...entrada(), composicao: composicaoDe(s) });
    expect(r.status).toBe(200);
    const a = avaliarResposta.parse(await r.json());
    expect(a).not.toHaveProperty('ordemPrioridade');
    const { ordemPrioridade: _o, ...semOrdem } = s;
    expect(a).toEqual(semOrdem);
  });

  it('SIM-62: mover um titular de A para B muda somas e pares e mantém o resto da composição, sem gravar', async () => {
    const s = await sugestao();
    const antes = await contagens();
    const composicao = composicaoDe(s);
    const movido = composicao.times[0]!.titulares.pop()!;
    composicao.times[1]!.titulares.push(movido);

    const r = await chamar('avaliar', { ...entrada(), composicao });
    expect(r.status).toBe(200);
    const a = avaliarResposta.parse(await r.json());
    if (a.formato !== 'dois_times') throw new Error('esperava 2 times');
    expect(a.times[0].titulares.map((j) => j.id)).toEqual(composicao.times[0]!.titulares.map((j) => j.id));
    expect(a.times[1].titulares.map((j) => j.id)).toEqual(composicao.times[1]!.titulares.map((j) => j.id));
    expect(a.naoEntra.map((j) => j.id)).toEqual(composicao.naoEntra);
    expect(a.times[0].indicadores.jogadores1oTempo).toBe(6);
    expect(a.times[1].indicadores.jogadores1oTempo).toBe(8);
    const nivelDoMovido = s.times[0].titulares.find((j) => j.id === movido.id)?.nivel ?? 0;
    expect(a.times[0].indicadores.nivelSoma1oTempo).toBe(s.times[0].indicadores.nivelSoma1oTempo - nivelDoMovido);
    expect(a.times[1].indicadores.nivelSoma1oTempo).toBe(s.times[1].indicadores.nivelSoma1oTempo + nivelDoMovido);
    expect(await contagens()).toEqual(antes);
  });

  it('SIM-63: jogador repetido na composição dá 422 no campo composicao', async () => {
    const composicao = composicaoDe(await sugestao());
    composicao.naoEntra.push(composicao.times[0]!.titulares[0]!.id);
    const r = await chamar('avaliar', { ...entrada(), composicao });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ mensagens: { composicao: MENSAGEM_REPETIDO_NA_COMPOSICAO } });
  });

  it('SIM-63: jogador fora dos aptos na composição dá 422 no campo composicao', async () => {
    const composicao = composicaoDe(await sugestao());
    composicao.naoEntra.push(crypto.randomUUID());
    const r = await chamar('avaliar', { ...entrada(), composicao });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ mensagens: { composicao: MENSAGEM_FORA_DOS_APTOS } });
  });

  it('SIM-63: com o grupo arquivado, 409 grupo_arquivado', async () => {
    const composicao = composicaoDe(await sugestao());
    await arquivar(aberto.db, aberto.cenario.grupoG);
    const r = await chamar('avaliar', { ...entrada(), composicao });
    expect(r.status).toBe(409);
  });
});
