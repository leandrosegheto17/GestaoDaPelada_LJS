import { Buffer } from 'node:buffer';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { escalacaoResposta, MENSAGEM_APTOS_INATIVOS, MENSAGEM_REPETIDO_NA_COMPOSICAO } from '@pelada/contrato';
import { criarApp } from '../../src/entrada/app.ts';
import { relogioFixo } from '../../src/infraestrutura/relogio.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import { abrirCenarioGrupos, arquivar, reativar, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * `POST /api/grupos/:grupoId/escalacoes` (T37 da simulador; SIM-67, SIM-71, SIM-72, SIM-93), com o app real como
 * `pelada_app` e o relógio fixo em 2026-03-03T15:00:00Z. A escalação é da quinta 2026-03-05. Em G, além de Toninho e
 * Bira (ativos desde 2026-01-01), o `beforeAll` cria 6 ativos; Zé Inativo saiu em 2025. Um jogador de H mostra o
 * isolamento. O `afterEach` apaga as escalações e os eventos da data.
 */

let aberto: CenarioGruposAberto;
let ativos: string[] = [];
let deH = '';

const DATA = '2026-03-05';
const AGORA = '2026-03-03T15:00:00.000Z';
const app = criarApp({ fabricaBanco: fabricaComoApp().fabrica, relogio: relogioFixo(AGORA) });

async function sessao(conta: string): Promise<string> {
  const { token, hash } = await gerarToken();
  await aberto.db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  return token;
}

async function confirmar(corpo: unknown, conta = aberto.cenario.contaC): Promise<Response> {
  const headers = new Headers({
    'x-pelada': '1',
    'content-type': 'application/json',
    cookie: `${NOME_COOKIE_SESSAO}=${await sessao(conta)}`,
  });
  const ctx = contextoFalso();
  const r = await app.request(
    `/api/grupos/${aberto.cenario.grupoG}/escalacoes`,
    { method: 'POST', headers, body: JSON.stringify(corpo) },
    envAcesso(aberto.url),
    ctx,
  );
  await ctx.esperar();
  return r;
}

async function novoJogador(grupo: string, apelido: string): Promise<string> {
  const { db, cenario } = aberto;
  const conta = grupo === cenario.grupoG ? cenario.contaC : cenario.contaB;
  const r = await db.query<{ id: string }>(
    `INSERT INTO jogadores (grupo_id, apelido, ano_nascimento, posicao, pontuacao_inicial, criado_por, criado_em,
                            alterado_por, alterado_em)
     VALUES ($1, $2, 1990, 'meia', 0, $3, now(), $3, now()) RETURNING id`,
    [grupo, apelido, conta],
  );
  const id = r.rows[0]!.id;
  await db.query(`INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio) VALUES ($1, $2, '2026-01-01')`, [id, grupo]);
  return id;
}

/** 2 times de 2, um reserva por time e um "não entra", com os 8 ativos de G. */
function doisTimes(ids = ativos) {
  const [a1, a2, b1, b2, r1, r2, fora1, fora2] = ids;
  return {
    formato: 'dois_times',
    data: DATA,
    n: 2,
    k: 1,
    composicao: {
      times: [
        { titulares: [{ id: a1, so1oTempo: false }, { id: a2, so1oTempo: true }], entramNo2oTempo: [{ id: r1, so1oTempo: false }] },
        { titulares: [{ id: b1, so1oTempo: false }, { id: b2, so1oTempo: false }], entramNo2oTempo: [{ id: r2, so1oTempo: false }] },
      ],
      naoEntra: [fora1, fora2],
    },
  };
}

async function linhas(): Promise<Array<{ formato: string; n: number; k: number | null; confirmada_por: string }>> {
  const r = await aberto.db.query(
    'SELECT formato, n, k, confirmada_por FROM escalacoes WHERE grupo_id = $1 AND data = $2',
    [aberto.cenario.grupoG, DATA],
  );
  return r.rows;
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const { cenario } = aberto;
  const novos = [];
  for (const apelido of ['Ana', 'Caio', 'Duda', 'Edu', 'Fábio', 'Gil']) novos.push(await novoJogador(cenario.grupoG, apelido));
  ativos = [cenario.idsG.jogadorAtivo, cenario.idsG.jogadorHistorico, ...novos];
  deH = await novoJogador(cenario.grupoH, 'Do Outro Grupo');
});

afterAll(async () => {
  await aberto?.fechar();
});

beforeEach(async () => {
  await reativar(aberto.db, aberto.cenario.grupoG);
});

afterEach(async () => {
  const { db, cenario } = aberto;
  await db.query('DELETE FROM escalacoes WHERE grupo_id = $1 AND data = $2', [cenario.grupoG, DATA]);
  await db.query(`DELETE FROM eventos_uso WHERE grupo_id = $1 AND tipo = 'escalacao_confirmada' AND data_partida = $2`, [
    cenario.grupoG,
    DATA,
  ]);
});

describe('POST …/escalacoes', () => {
  it('SIM-67: 201 com data e confirmadaEm do relógio fixo; grava com a conta da sessão', async () => {
    const r = await confirmar(doisTimes());
    expect(r.status).toBe(201);
    expect(escalacaoResposta.parse(await r.json())).toEqual({ data: DATA, confirmadaEm: AGORA });
    expect(await linhas()).toEqual([{ formato: 'dois_times', n: 2, k: 1, confirmada_por: aberto.cenario.contaC }]);
  });

  it('SIM-67: 3 ou mais times grava com k nulo', async () => {
    const r = await confirmar({
      formato: 'varios_times',
      data: DATA,
      n: 3,
      composicao: { times: [{ jogadores: ativos.slice(0, 3) }, { jogadores: ativos.slice(3, 6) }, { jogadores: ativos.slice(6) }] },
    });
    expect(r.status).toBe(201);
    expect(await linhas()).toMatchObject([{ formato: 'varios_times', n: 3, k: null }]);
  });

  it('SIM-71: jogador repetido na composição dá 422 no campo composicao, sem gravar', async () => {
    const repetido = [...ativos];
    repetido[7] = repetido[0]!;
    const r = await confirmar(doisTimes(repetido));
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ mensagens: { composicao: MENSAGEM_REPETIDO_NA_COMPOSICAO } });
    expect(await linhas()).toEqual([]);
  });

  it('SIM-71: jogador inativo na data dá 422 no campo composicao, sem gravar', async () => {
    const comInativo = [...ativos];
    comInativo[7] = aberto.cenario.idsG.jogadorInativo;
    const r = await confirmar(doisTimes(comInativo));
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ mensagens: { composicao: MENSAGEM_APTOS_INATIVOS } });
    expect(await linhas()).toEqual([]);
  });

  it('SIM-71, SIM-80: jogador de outro grupo dá a mesma mensagem, sem revelar o jogador', async () => {
    const comDeH = [...ativos];
    comDeH[7] = deH;
    const r = await confirmar(doisTimes(comDeH));
    expect(r.status).toBe(422);
    const texto = await r.text();
    expect(JSON.parse(texto)).toMatchObject({ mensagens: { composicao: MENSAGEM_APTOS_INATIVOS } });
    expect(texto).not.toContain(deH);
    expect(texto).not.toContain('Do Outro Grupo');
    expect(await linhas()).toEqual([]);
  });

  it('SIM-71: id que não existe dá a mesma mensagem de inativo', async () => {
    const comFalso = [...ativos];
    comFalso[7] = crypto.randomUUID();
    const r = await confirmar(doisTimes(comFalso));
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ mensagens: { composicao: MENSAGEM_APTOS_INATIVOS } });
  });

  it('SIM-71: o jogador que só é ativo depois da data é recusado', async () => {
    const tarde = await novoJogador(aberto.cenario.grupoG, 'Entra Depois');
    await aberto.db.query(`UPDATE periodos_ativos SET inicio = '2026-04-01' WHERE jogador_id = $1`, [tarde]);
    const comTarde = [...ativos];
    comTarde[7] = tarde;
    const r = await confirmar(doisTimes(comTarde));
    expect(r.status).toBe(422);
    await aberto.db.query('DELETE FROM jogadores WHERE id = $1', [tarde]);
  });

  it('SIM-72: composição ajustada com time sem N titulares é aceita', async () => {
    const [a1, b1, b2, r1, fora1, fora2, fora3, fora4] = ativos;
    const r = await confirmar({
      formato: 'dois_times',
      data: DATA,
      n: 2,
      k: 'ilimitado',
      composicao: {
        times: [
          { titulares: [{ id: a1, so1oTempo: false }], entramNo2oTempo: [] },
          { titulares: [{ id: b1, so1oTempo: false }, { id: b2, so1oTempo: false }], entramNo2oTempo: [{ id: r1, so1oTempo: true }] },
        ],
        naoEntra: [fora1, fora2, fora3, fora4],
      },
    });
    expect(r.status).toBe(201);
    expect(await linhas()).toMatchObject([{ formato: 'dois_times', k: null }]);
  });

  it('SIM-93: grupo arquivado depois da sugestão: 409 grupo_arquivado e nada gravado', async () => {
    await arquivar(aberto.db, aberto.cenario.grupoG);
    const r = await confirmar(doisTimes());
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ codigo: 'grupo_arquivado' });
    expect(await linhas()).toEqual([]);
  });

  it('SIM-55: N ausente dá 422 no campo n', async () => {
    const { n: _sem, ...semN } = doisTimes();
    const r = await confirmar(semN);
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ campos: expect.arrayContaining(['n']) });
  });

  it('a conta B recebe 404 e nada é gravado em G', async () => {
    const r = await confirmar(doisTimes(), aberto.cenario.contaB);
    expect(r.status).toBe(404);
    expect(await linhas()).toEqual([]);
  });
});
