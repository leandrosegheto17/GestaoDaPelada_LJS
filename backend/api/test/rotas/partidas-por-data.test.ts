import { Buffer } from 'node:buffer';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MENSAGEM_DATA_ALTERADA, MENSAGEM_JOGADOR_INATIVO, partidaResposta } from '@pelada/contrato';
import { criarApp } from '../../src/entrada/app.ts';
import { relogioFixo } from '../../src/infraestrutura/relogio.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import { abrirCenarioGrupos, arquivar, reativar, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * `GET`, `PUT` e `DELETE /api/grupos/:grupoId/partidas/:data` (partidas-e-ranking T41; PAR-44 a PAR-48, PAR-50), com
 * o app real como `pelada_app` e o relógio fixo em 14/03/2026. Cada teste parte de uma partida em 2026-03-05 (Toninho
 * presente, Bira lesionado), gravada pelo superusuário no `beforeEach` e apagada no `afterEach`. Caco entra no grupo
 * só em 2026-03-10: está ativo hoje, mas não na data da partida (PAR-48).
 */

let aberto: CenarioGruposAberto;
let partida: string;
let caco: string;

const DATA = '2026-03-05';
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

async function pedir(metodo: 'GET' | 'PUT' | 'DELETE', data: string, corpo?: unknown, conta = aberto.cenario.contaC): Promise<Response> {
  const headers = new Headers({ 'x-pelada': '1', cookie: `${NOME_COOKIE_SESSAO}=${await sessao(conta)}` });
  if (corpo !== undefined) headers.set('content-type', 'application/json');
  const ctx = contextoFalso();
  const r = await app.request(
    `/api/grupos/${aberto.cenario.grupoG}/partidas/${data}`,
    { method: metodo, headers, ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}) },
    envAcesso(aberto.url),
    ctx,
  );
  await ctx.esperar();
  return r;
}

async function presencas(): Promise<Array<{ jogador_id: string; situacao: string }>> {
  const r = await aberto.db.query<{ jogador_id: string; situacao: string }>(
    'SELECT jogador_id, situacao FROM presencas WHERE partida_id = $1 ORDER BY jogador_id',
    [partida],
  );
  return r.rows;
}

async function choveu(): Promise<boolean | null> {
  const r = await aberto.db.query<{ choveu: boolean }>('SELECT choveu FROM partidas WHERE id = $1', [partida]);
  return r.rows[0]?.choveu ?? null;
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const { db, cenario } = aberto;
  const r = await db.query<{ id: string }>(
    `INSERT INTO jogadores (grupo_id, apelido, posicao, criado_por, criado_em, alterado_por, alterado_em)
     VALUES ($1, 'Caco', 'meia', $2, now(), $2, now()) RETURNING id`,
    [cenario.grupoG, cenario.contaC],
  );
  caco = r.rows[0]!.id;
  await db.query(`INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio, fim) VALUES ($1, $2, '2026-03-10', NULL)`, [
    caco,
    cenario.grupoG,
  ]);
});

afterAll(async () => {
  await aberto?.fechar();
});

beforeEach(async () => {
  const { db, cenario } = aberto;
  await reativar(db, cenario.grupoG);
  const r = await db.query<{ id: string }>(
    `INSERT INTO partidas (grupo_id, data, choveu, criada_por, criada_em, alterada_por, alterada_em)
     VALUES ($1, $2, false, $3, now(), $3, now()) RETURNING id`,
    [cenario.grupoG, DATA, cenario.contaC],
  );
  partida = r.rows[0]!.id;
  await db.query(
    `INSERT INTO presencas (partida_id, jogador_id, grupo_id, situacao) VALUES ($1, $2, $4, 'presente'), ($1, $3, $4, 'lesionado')`,
    [partida, cenario.idsG.jogadorAtivo, cenario.idsG.jogadorHistorico, cenario.grupoG],
  );
});

afterEach(async () => {
  await aberto.db.query('DELETE FROM partidas WHERE grupo_id = $1 AND data = $2', [aberto.cenario.grupoG, DATA]);
});

describe('GET …/partidas/:data', () => {
  it('PAR-44: devolve a partida com a situação gravada de cada ativo na data', async () => {
    const r = await pedir('GET', DATA);
    expect(r.status).toBe(200);
    const corpo = partidaResposta.parse(await r.json());
    const { idsG } = aberto.cenario;
    expect(corpo).toMatchObject({ data: DATA, hoje: '2026-03-14', choveu: false });
    expect(corpo.jogadores).toEqual([
      { id: idsG.jogadorHistorico, apelido: 'Bira', situacao: 'lesionado' },
      { id: idsG.jogadorAtivo, apelido: 'Toninho', situacao: 'presente' },
    ]);
  });
});

describe('PUT …/partidas/:data', () => {
  it('PAR-46: troca a chuva e as presenças e responde 200 com a partida relida', async () => {
    const { idsG } = aberto.cenario;
    const r = await pedir('PUT', DATA, {
      data: DATA,
      choveu: true,
      marcacoes: [
        { jogadorId: idsG.jogadorAtivo, situacao: 'expulso' },
        { jogadorId: idsG.jogadorHistorico, situacao: 'ausente' },
      ],
    });
    expect(r.status).toBe(200);
    const corpo = partidaResposta.parse(await r.json());
    expect(corpo.choveu).toBe(true);
    expect(corpo.jogadores.find((j) => j.id === idsG.jogadorAtivo)?.situacao).toBe('expulso');
    expect(await choveu()).toBe(true);
    expect(await presencas()).toEqual([{ jogador_id: idsG.jogadorAtivo, situacao: 'expulso' }]);
  });

  it('PAR-47: PUT com data diferente do caminho responde 422 "A data da partida não pode ser alterada." sem gravar', async () => {
    const r = await pedir('PUT', DATA, { data: '2026-03-12', choveu: true, marcacoes: [] });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ mensagens: { data: MENSAGEM_DATA_ALTERADA } });
    expect(MENSAGEM_DATA_ALTERADA).toBe('A data da partida não pode ser alterada.');
    expect(await choveu()).toBe(false);
    expect(await presencas()).toHaveLength(2);
  });

  it('PAR-48: jogador ativo hoje mas não na data da partida é recusado no campo da marcação', async () => {
    const r = await pedir('PUT', DATA, { data: DATA, choveu: false, marcacoes: [{ jogadorId: caco, situacao: 'presente' }] });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ mensagens: { 'marcacoes.0.jogadorId': MENSAGEM_JOGADOR_INATIVO } });
    expect(await presencas()).toHaveLength(2);
  });

  it('PAR-46: grupo arquivado responde 409 sem gravar', async () => {
    await arquivar(aberto.db, aberto.cenario.grupoG);
    const r = await pedir('PUT', DATA, { data: DATA, choveu: true, marcacoes: [] });
    expect(r.status).toBe(409);
    expect(await choveu()).toBe(false);
  });
});

describe('DELETE …/partidas/:data', () => {
  it('PAR-50: responde 204, apaga a partida e as presenças, e a auditoria guarda partida_excluida', async () => {
    const r = await pedir('DELETE', DATA);
    expect(r.status).toBe(204);
    expect(await choveu()).toBeNull();
    expect(await presencas()).toEqual([]);
    const auditoria = await aberto.db.query<{ acao: string; resumo: unknown; autor_conta_id: string }>(
      `SELECT acao, resumo, autor_conta_id FROM auditoria WHERE grupo_id = $1 AND entidade_id = $2`,
      [aberto.cenario.grupoG, partida],
    );
    expect(auditoria.rows).toEqual([{ acao: 'partida_excluida', resumo: { data: DATA }, autor_conta_id: aberto.cenario.contaC }]);
  });

  it('PAR-50: grupo arquivado responde 409 e a partida fica', async () => {
    await arquivar(aberto.db, aberto.cenario.grupoG);
    const r = await pedir('DELETE', DATA);
    expect(r.status).toBe(409);
    expect(await choveu()).toBe(false);
  });
});

describe('PAR-45: data que não é real, ou sem partida', () => {
  const corpoValido = (data: string) => ({ data, choveu: false, marcacoes: [] });

  it.each([
    ['2026-02-30', 'não é data real'],
    ['2026-13-01', 'mês 13'],
    ['05-03-2026', 'fora do formato'],
    ['2026-03-06', 'sem partida'],
  ])('PAR-45: /partidas/%s (%s) responde 404 em GET, PUT e DELETE', async (data) => {
    expect((await pedir('GET', data)).status).toBe(404);
    expect((await pedir('PUT', data, corpoValido(data))).status).toBe(404);
    expect((await pedir('DELETE', data)).status).toBe(404);
    expect(await choveu()).toBe(false);
  });

  it('PAR-45: a partida de G não aparece para a conta sem vínculo (404 nos três)', async () => {
    const outra = aberto.cenario.contaB;
    expect((await pedir('GET', DATA, undefined, outra)).status).toBe(404);
    expect((await pedir('PUT', DATA, corpoValido(DATA), outra)).status).toBe(404);
    expect((await pedir('DELETE', DATA, undefined, outra)).status).toBe(404);
    expect(await presencas()).toHaveLength(2);
  });
});
