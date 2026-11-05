import { Buffer } from 'node:buffer';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { previaInicioResposta, previaResposta } from '@pelada/contrato';
import { AVISO_UMA_FALTA, AVISO_VARIAS_FALTAS } from '@pelada/dominio';
import { criarApp } from '../../src/entrada/app.ts';
import { relogioFixo } from '../../src/infraestrutura/relogio.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import { abrirCenarioGrupos, arquivar, reativar, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * Prévias de reativar, corrigir período e alterar o início (partidas-e-ranking T42; PAR-109 a PAR-116), com o app
 * real como `pelada_app` e o relógio fixo em 14/03/2026. Nenhuma prévia grava: cada teste compara o banco antes e
 * depois (períodos, início da pontuação, auditoria, partidas e presenças).
 *
 * Cenário, além do de grupos (partida de 2026-01-08 com Bira presente):
 * - Gil: início da pontuação e período de 2026-01-01 a 2026-02-01 (saiu);
 * - Lia: início da pontuação e período aberto desde 2026-02-10;
 * - partidas de 2026-02-05 e 2026-02-12, com Toninho presente e sem presença de Gil nem de Lia;
 * - Forasteiro, ativo no grupo H (de outro grupo).
 * Reativar Gil em 05/02 traz de volta as rodadas de 05/02 e 12/02 como falta (aviso no plural, PAR-116).
 */

let aberto: CenarioGruposAberto;
let gil: string;
let periodoGil: string;
let lia: string;
let periodoLia: string;
let periodoToninho: string;
let forasteiro: string;

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

async function pedir(metodo: string, caminho: string, corpo: unknown, conta = aberto.cenario.contaC): Promise<Response> {
  const headers = new Headers({
    'x-pelada': '1',
    'content-type': 'application/json',
    cookie: `${NOME_COOKIE_SESSAO}=${await sessao(conta)}`,
  });
  const ctx = contextoFalso();
  const r = await app.request(
    `/api/grupos/${aberto.cenario.grupoG}${caminho}`,
    { method: metodo, headers, body: JSON.stringify(corpo) },
    envAcesso(aberto.url),
    ctx,
  );
  await ctx.esperar();
  return r;
}

const previaReativar = (id: string, corpo: unknown) => pedir('POST', `/jogadores/${id}/reativar/previa`, corpo);
const previaPeriodo = (id: string, periodo: string, corpo: unknown) =>
  pedir('POST', `/jogadores/${id}/periodos/${periodo}/previa`, corpo);
const previaInicio = (id: string, corpo: unknown) => pedir('POST', `/jogadores/${id}/inicio/previa`, corpo);

async function jogador(grupo: string, apelido: string, conta: string, inicio: string, fim: string | null): Promise<[string, string]> {
  const { db } = aberto;
  const j = await db.query<{ id: string }>(
    `INSERT INTO jogadores (grupo_id, apelido, posicao, inicio_pontuacao, criado_por, criado_em, alterado_por, alterado_em)
     VALUES ($1, $2, 'meia', $3, $4, now(), $4, now()) RETURNING id`,
    [grupo, apelido, inicio, conta],
  );
  const id = j.rows[0]!.id;
  const p = await db.query<{ id: string }>(
    `INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio, fim) VALUES ($1, $2, $3, $4) RETURNING id`,
    [id, grupo, inicio, fim],
  );
  return [id, p.rows[0]!.id];
}

async function partidaComToninho(data: string): Promise<void> {
  const { db, cenario } = aberto;
  const p = await db.query<{ id: string }>(
    `INSERT INTO partidas (grupo_id, data, choveu, criada_por, criada_em, alterada_por, alterada_em)
     VALUES ($1, $2, false, $3, now(), $3, now()) RETURNING id`,
    [cenario.grupoG, data, cenario.contaC],
  );
  await db.query(`INSERT INTO presencas (partida_id, jogador_id, grupo_id, situacao) VALUES ($1, $2, $3, 'presente')`, [
    p.rows[0]!.id,
    cenario.idsG.jogadorAtivo,
    cenario.grupoG,
  ]);
}

/** O que uma escrita de período mudaria: períodos, inícios, auditoria, partidas e presenças de G. */
async function retrato(): Promise<string> {
  const { db, cenario } = aberto;
  const g = cenario.grupoG;
  const periodos = await db.query('SELECT id, jogador_id, inicio::text, fim::text FROM periodos_ativos WHERE grupo_id = $1 ORDER BY id', [g]);
  const inicios = await db.query('SELECT id, inicio_pontuacao::text FROM jogadores WHERE grupo_id = $1 ORDER BY id', [g]);
  const auditoria = await db.query('SELECT count(*)::int AS n FROM auditoria WHERE grupo_id = $1', [g]);
  const partidas = await db.query('SELECT count(*)::int AS n FROM partidas WHERE grupo_id = $1', [g]);
  const presencas = await db.query('SELECT count(*)::int AS n FROM presencas WHERE grupo_id = $1', [g]);
  return JSON.stringify([periodos.rows, inicios.rows, auditoria.rows, partidas.rows, presencas.rows]);
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const { db, cenario } = aberto;
  [gil, periodoGil] = await jogador(cenario.grupoG, 'Gil', cenario.contaC, '2026-01-01', '2026-02-01');
  [lia, periodoLia] = await jogador(cenario.grupoG, 'Lia', cenario.contaC, '2026-02-10', null);
  [forasteiro] = await jogador(cenario.grupoH, 'Forasteiro', cenario.contaB, '2026-01-01', null);
  await partidaComToninho('2026-02-05');
  await partidaComToninho('2026-02-12');
  periodoToninho = (
    await db.query<{ id: string }>('SELECT id FROM periodos_ativos WHERE jogador_id = $1 AND fim IS NULL', [cenario.idsG.jogadorAtivo])
  ).rows[0]!.id;
});

afterAll(async () => {
  await aberto?.fechar();
});

beforeEach(async () => {
  await reativar(aberto.db, aberto.cenario.grupoG);
});

describe('prévia de reativar', () => {
  it('PAR-109: a prévia de Gil devolve as duas rodadas e o aviso no plural, e nenhuma linha muda no banco', async () => {
    const antes = await retrato();
    const r = await previaReativar(gil, { data: '2026-02-05' });
    expect(r.status).toBe(200);
    const corpo = previaResposta.parse(await r.json());
    expect(corpo.rodadasQuePassamAConstar).toEqual([
      { data: '2026-02-05', situacao: 'falta' },
      { data: '2026-02-12', situacao: 'falta' },
    ]);
    expect(corpo.rodadasQueDeixamDeConstar).toEqual([]);
    expect(corpo.aviso).toBe(AVISO_VARIAS_FALTAS);
    expect(await retrato()).toBe(antes);
  });

  it('PAR-113: Gil inativo hoje não tem posição antes; reativado, tem', async () => {
    const corpo = previaResposta.parse(await (await previaReativar(gil, { data: '2026-02-05' })).json());
    expect(corpo.posicaoAntes).toBeNull();
    expect(corpo.posicaoDepois).not.toBeNull();
  });

  it('PAR-109: sem data, o retorno é hoje (14/03) e nenhuma rodada passa a constar', async () => {
    const corpo = previaResposta.parse(await (await previaReativar(gil, {})).json());
    expect(corpo.rodadasQuePassamAConstar).toEqual([]);
    expect(corpo.aviso).toBeNull();
  });
});

describe('prévia de corrigir período', () => {
  it('PAR-110: adiar a saída de Gil para 13/02 traz as duas rodadas como falta, sem gravar', async () => {
    const antes = await retrato();
    const r = await previaPeriodo(gil, periodoGil, { saida: '2026-02-13' });
    expect(r.status).toBe(200);
    const corpo = previaResposta.parse(await r.json());
    expect(corpo.rodadasQuePassamAConstar.map((x) => x.data)).toEqual(['2026-02-05', '2026-02-12']);
    expect(await retrato()).toBe(antes);
  });

  it('PAR-116: adiar a saída para 06/02 traz uma rodada e o aviso no singular', async () => {
    const corpo = previaResposta.parse(await (await previaPeriodo(gil, periodoGil, { saida: '2026-02-06' })).json());
    expect(corpo.rodadasQuePassamAConstar).toEqual([{ data: '2026-02-05', situacao: 'falta' }]);
    expect(corpo.aviso).toBe(AVISO_UMA_FALTA);
  });

  it('PAR-114: antecipar a saída para 05/01 tira a rodada de 08/01', async () => {
    const corpo = previaResposta.parse(await (await previaPeriodo(gil, periodoGil, { saida: '2026-01-05' })).json());
    expect(corpo.rodadasQueDeixamDeConstar).toEqual([{ data: '2026-01-08' }]);
    expect(corpo.rodadasQuePassamAConstar).toEqual([]);
    expect(corpo.aviso).toBeNull();
  });

  it('PAR-110: datas iguais às atuais mostram o cenário sem mudança', async () => {
    const corpo = previaResposta.parse(await (await previaPeriodo(gil, periodoGil, { saida: '2026-02-01' })).json());
    expect(corpo.acumuladoDepois).toBe(corpo.acumuladoAntes);
    expect(corpo.rodadasQuePassamAConstar).toEqual([]);
    expect(corpo.rodadasQueDeixamDeConstar).toEqual([]);
  });
});

describe('prévia da data de início', () => {
  it('PAR-111: recuar o início de Lia para 01/02 devolve 1 rodada que passa a constar, sem gravar', async () => {
    const antes = await retrato();
    const r = await previaInicio(lia, { data: '2026-02-01' });
    expect(r.status).toBe(200);
    const corpo = previaInicioResposta.parse(await r.json());
    expect(corpo.rodadasQuePassamAConstar).toBe(1);
    expect(await retrato()).toBe(antes);
  });

  it('PAR-111: data igual à atual devolve 0 e os acumulados iguais', async () => {
    const corpo = previaInicioResposta.parse(await (await previaInicio(lia, { data: '2026-02-10' })).json());
    expect(corpo.rodadasQuePassamAConstar).toBe(0);
    expect(corpo.acumuladoDepois).toBe(corpo.acumuladoAntes);
  });
});

describe('PAR-112: cada recusa da gravação sai igual na prévia', () => {
  type Caso = [nome: string, previa: () => [string, string], gravacao: () => [string, string], corpo: unknown];
  const casos: Caso[] = [
    ['reativar quem já está ativo (409)', () => ['POST', `/jogadores/${aberto.cenario.idsG.jogadorAtivo}/reativar/previa`], () => ['POST', `/jogadores/${aberto.cenario.idsG.jogadorAtivo}/reativar`], {}],
    ['reativar antes da saída anterior (422)', () => ['POST', `/jogadores/${gil}/reativar/previa`], () => ['POST', `/jogadores/${gil}/reativar`], { data: '2026-01-15' }],
    ['reativar no futuro (422)', () => ['POST', `/jogadores/${gil}/reativar/previa`], () => ['POST', `/jogadores/${gil}/reativar`], { data: '2026-03-15' }],
    ['reativar com data que não existe (422)', () => ['POST', `/jogadores/${gil}/reativar/previa`], () => ['POST', `/jogadores/${gil}/reativar`], { data: '2026-02-30' }],
    ['reativar com campo a mais (422)', () => ['POST', `/jogadores/${gil}/reativar/previa`], () => ['POST', `/jogadores/${gil}/reativar`], { data: '2026-02-05', x: 1 }],
    ['reativar jogador de outro grupo (404)', () => ['POST', `/jogadores/${forasteiro}/reativar/previa`], () => ['POST', `/jogadores/${forasteiro}/reativar`], {}],
    ['reativar id que não é uuid (404)', () => ['POST', '/jogadores/nao-e-uuid/reativar/previa'], () => ['POST', '/jogadores/nao-e-uuid/reativar'], {}],
    ['corrigir a saída do período aberto (422)', () => ['POST', `/jogadores/${aberto.cenario.idsG.jogadorAtivo}/periodos/${periodoToninho}/previa`], () => ['PATCH', `/jogadores/${aberto.cenario.idsG.jogadorAtivo}/periodos/${periodoToninho}`], { saida: '2026-03-01' }],
    ['corrigir o retorno do primeiro período (422)', () => ['POST', `/jogadores/${gil}/periodos/${periodoGil}/previa`], () => ['PATCH', `/jogadores/${gil}/periodos/${periodoGil}`], { retorno: '2025-12-01' }],
    ['corrigir com período de outro jogador (404)', () => ['POST', `/jogadores/${gil}/periodos/${periodoLia}/previa`], () => ['PATCH', `/jogadores/${gil}/periodos/${periodoLia}`], { saida: '2026-02-13' }],
    ['corrigir sem saída nem retorno (422)', () => ['POST', `/jogadores/${gil}/periodos/${periodoGil}/previa`], () => ['PATCH', `/jogadores/${gil}/periodos/${periodoGil}`], {}],
    ['corrigir a saída para o futuro (422)', () => ['POST', `/jogadores/${gil}/periodos/${periodoGil}/previa`], () => ['PATCH', `/jogadores/${gil}/periodos/${periodoGil}`], { saida: '2026-03-20' }],
    ['início no futuro (422)', () => ['POST', `/jogadores/${lia}/inicio/previa`], () => ['PUT', `/jogadores/${lia}/inicio`], { data: '2026-03-15' }],
    ['início antes do piso (422)', () => ['POST', `/jogadores/${lia}/inicio/previa`], () => ['PUT', `/jogadores/${lia}/inicio`], { data: '1999-12-31' }],
    ['início depois da saída do primeiro período (422)', () => ['POST', `/jogadores/${gil}/inicio/previa`], () => ['PUT', `/jogadores/${gil}/inicio`], { data: '2026-02-05' }],
    ['início sem data (422)', () => ['POST', `/jogadores/${lia}/inicio/previa`], () => ['PUT', `/jogadores/${lia}/inicio`], {}],
    ['início de jogador de outro grupo (404)', () => ['POST', `/jogadores/${forasteiro}/inicio/previa`], () => ['PUT', `/jogadores/${forasteiro}/inicio`], { data: '2026-02-01' }],
  ];

  it.each(casos)('PAR-112: %s', async (_nome, previa, gravacao, corpo) => {
    const antes = await retrato();
    const [mp, cp] = previa();
    const [mg, cg] = gravacao();
    const rp = await pedir(mp, cp, corpo);
    const rg = await pedir(mg, cg, corpo);
    expect(rp.status).toBeGreaterThanOrEqual(400);
    expect({ status: rp.status, corpo: await rp.json() }).toEqual({ status: rg.status, corpo: await rg.json() });
    expect(await retrato()).toBe(antes);
  });

  it('PAR-112: reativar quem já está ativo diz "O jogador já está ativo."', async () => {
    const r = await previaReativar(aberto.cenario.idsG.jogadorAtivo, {});
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ codigo: 'ja_ativo', erro: 'O jogador já está ativo.' });
  });

  it.each([
    ['reativar', () => `/jogadores/${gil}/reativar/previa`, { data: '2026-02-05' }],
    ['corrigir', () => `/jogadores/${gil}/periodos/${periodoGil}/previa`, { saida: '2026-02-13' }],
    ['início', () => `/jogadores/${lia}/inicio/previa`, { data: '2026-02-01' }],
  ] as const)('PAR-112: prévia de %s em grupo arquivado responde 409 grupo_arquivado', async (_nome, caminho, corpo) => {
    await arquivar(aberto.db, aberto.cenario.grupoG);
    const r = await pedir('POST', caminho(), corpo);
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ codigo: 'grupo_arquivado' });
  });
});
