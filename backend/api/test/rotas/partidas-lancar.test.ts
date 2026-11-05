import { Buffer } from 'node:buffer';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MENSAGEM_DATA_FUTURA,
  MENSAGEM_DATA_INVALIDA,
  MENSAGEM_JOGADOR_INATIVO,
  MENSAGEM_JOGADOR_REPETIDO,
  MENSAGEM_SITUACAO,
  partidaResposta,
} from '@pelada/contrato';
import { criarApp } from '../../src/entrada/app.ts';
import { relogioFixo } from '../../src/infraestrutura/relogio.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import {
  abrirCenarioGrupos,
  arquivar,
  reativar,
  type CenarioGruposAberto,
} from '../isolamento/cenario-grupos.ts';

/**
 * `POST /api/grupos/:grupoId/partidas` (partidas-e-ranking T40; PAR-19 a PAR-26), com o app real como `pelada_app` e o
 * relógio fixo em 14/03/2026 (12h de São Paulo). O `beforeAll` acrescenta a G dois ativos (Caco, Duda) para a partida
 * de 3 presentes e 1 expulso, e um jogador ativo no grupo H (de outro grupo). O `afterEach` apaga as partidas novas
 * de G (as presenças saem em cascata); a de 2026-01-08 do cenário fica.
 */

let aberto: CenarioGruposAberto;
let caco: string;
let duda: string;
let deOutroGrupo: string;

const DATA = '2026-03-12';
const app = criarApp({
  fabricaBanco: fabricaComoApp().fabrica,
  relogio: relogioFixo('2026-03-14T15:00:00Z'),
});

async function sessao(conta: string): Promise<string> {
  const { token, hash } = await gerarToken();
  await aberto.db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  return token;
}

async function lancar(corpo: unknown, conta = aberto.cenario.contaC): Promise<Response> {
  const headers = new Headers({
    'x-pelada': '1',
    'content-type': 'application/json',
    cookie: `${NOME_COOKIE_SESSAO}=${await sessao(conta)}`,
  });
  const ctx = contextoFalso();
  const r = await app.request(
    `/api/grupos/${aberto.cenario.grupoG}/partidas`,
    { method: 'POST', headers, body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) },
    envAcesso(aberto.url),
    ctx,
  );
  await ctx.esperar();
  return r;
}

async function ativo(grupo: string, apelido: string, conta: string): Promise<string> {
  const { db } = aberto;
  const r = await db.query<{ id: string }>(
    `INSERT INTO jogadores (grupo_id, apelido, posicao, criado_por, criado_em, alterado_por, alterado_em)
     VALUES ($1, $2, 'meia', $3, now(), $3, now()) RETURNING id`,
    [grupo, apelido, conta],
  );
  const id = r.rows[0]!.id;
  await db.query(
    `INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio, fim) VALUES ($1, $2, '2026-01-01', NULL)`,
    [id, grupo],
  );
  return id;
}

async function partidasNaData(data = DATA): Promise<number> {
  const r = await aberto.db.query('SELECT 1 FROM partidas WHERE grupo_id = $1 AND data = $2', [
    aberto.cenario.grupoG,
    data,
  ]);
  return r.rowCount ?? 0;
}

async function presencasNaData(
  data = DATA,
): Promise<Array<{ jogador_id: string; situacao: string }>> {
  const r = await aberto.db.query<{ jogador_id: string; situacao: string }>(
    `SELECT pr.jogador_id, pr.situacao FROM presencas pr JOIN partidas p ON p.id = pr.partida_id
      WHERE p.grupo_id = $1 AND p.data = $2 ORDER BY pr.jogador_id`,
    [aberto.cenario.grupoG, data],
  );
  return r.rows;
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const { cenario } = aberto;
  caco = await ativo(cenario.grupoG, 'Caco', cenario.contaC);
  duda = await ativo(cenario.grupoG, 'Duda', cenario.contaC);
  deOutroGrupo = await ativo(cenario.grupoH, 'Forasteiro', cenario.contaB);
});

afterAll(async () => {
  await aberto?.fechar();
});

beforeEach(async () => {
  await reativar(aberto.db, aberto.cenario.grupoG);
});

afterEach(async () => {
  await aberto.db.query('DELETE FROM partidas WHERE grupo_id = $1 AND id <> $2', [
    aberto.cenario.grupoG,
    aberto.cenario.idsG.partida,
  ]);
});

describe('POST …/partidas: lançamento', () => {
  it('PAR-22: 3 presentes e 1 expulso gravam 4 presenças e respondem 201 com alteradaPor', async () => {
    const { idsG, contaC } = aberto.cenario;
    const r = await lancar({
      data: DATA,
      choveu: true,
      marcacoes: [
        { jogadorId: idsG.jogadorAtivo, situacao: 'presente' },
        { jogadorId: idsG.jogadorHistorico, situacao: 'presente' },
        { jogadorId: caco, situacao: 'presente' },
        { jogadorId: duda, situacao: 'expulso' },
      ],
    });
    expect(r.status).toBe(201);
    const corpo = partidaResposta.parse(await r.json());
    const nome = (
      await aberto.db.query<{ nome: string }>('SELECT nome FROM contas WHERE id = $1', [contaC])
    ).rows[0]!.nome;
    expect(corpo).toMatchObject({
      data: DATA,
      hoje: '2026-03-14',
      choveu: true,
      alteradaPor: nome,
    });
    expect(corpo.alteradaPor.length).toBeGreaterThan(0);
    expect(corpo.jogadores.find((j) => j.id === duda)?.situacao).toBe('expulso');
    expect(corpo.jogadores.find((j) => j.id === caco)?.situacao).toBe('presente');

    const gravadas = await presencasNaData();
    expect(gravadas).toHaveLength(4);
    expect(gravadas.filter((p) => p.situacao === 'presente')).toHaveLength(3);
    expect(gravadas.filter((p) => p.situacao === 'expulso')).toEqual([
      { jogador_id: duda, situacao: 'expulso' },
    ]);
  });

  it('PAR-23: marcação ausente e ativo sem marcação não gravam presença', async () => {
    const { idsG } = aberto.cenario;
    const r = await lancar({
      data: DATA,
      choveu: false,
      marcacoes: [
        { jogadorId: idsG.jogadorAtivo, situacao: 'ausente' },
        { jogadorId: caco, situacao: 'lesionado' },
      ],
    });
    expect(r.status).toBe(201);
    expect(await presencasNaData()).toEqual([{ jogador_id: caco, situacao: 'lesionado' }]);
  });

  it('PAR-20: hoje é aceito como data', async () => {
    const r = await lancar({ data: '2026-03-14', choveu: false, marcacoes: [] });
    expect(r.status).toBe(201);
  });
});

describe('POST …/partidas: recusas', () => {
  it('PAR-24: jogador de outro grupo responde 422 no marcacoes.<i>.jogadorId, nada gravado', async () => {
    const { idsG } = aberto.cenario;
    const r = await lancar({
      data: DATA,
      choveu: false,
      marcacoes: [
        { jogadorId: idsG.jogadorAtivo, situacao: 'presente' },
        { jogadorId: deOutroGrupo, situacao: 'presente' },
      ],
    });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({
      codigo: 'dados_invalidos',
      mensagens: { 'marcacoes.1.jogadorId': MENSAGEM_JOGADOR_INATIVO },
    });
    expect(await partidasNaData()).toBe(0);
  });

  it('PAR-24: jogador inativo na data recebe a mesma mensagem no mesmo campo', async () => {
    const r = await lancar({
      data: DATA,
      choveu: false,
      marcacoes: [{ jogadorId: aberto.cenario.idsG.jogadorInativo, situacao: 'presente' }],
    });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({
      mensagens: { 'marcacoes.0.jogadorId': MENSAGEM_JOGADOR_INATIVO },
    });
    expect(await partidasNaData()).toBe(0);
  });

  it.each([
    ['inexistente (uuid)', '00000000-0000-4000-8000-000000000000'],
    ['inexistente (não é uuid)', 'nao-e-uuid'],
  ])('PAR-24: jogador %s recebe a mesma mensagem no mesmo campo', async (_nome, jogadorId) => {
    const r = await lancar({
      data: DATA,
      choveu: false,
      marcacoes: [{ jogadorId, situacao: 'presente' }],
    });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({
      mensagens: { 'marcacoes.0.jogadorId': MENSAGEM_JOGADOR_INATIVO },
    });
    expect(await partidasNaData()).toBe(0);
  });

  it('PAR-25: jogador repetido responde 422 no campo marcacoes, nada gravado', async () => {
    const { idsG } = aberto.cenario;
    const r = await lancar({
      data: DATA,
      choveu: false,
      marcacoes: [
        { jogadorId: idsG.jogadorAtivo, situacao: 'presente' },
        { jogadorId: idsG.jogadorAtivo, situacao: 'expulso' },
      ],
    });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ mensagens: { marcacoes: MENSAGEM_JOGADOR_REPETIDO } });
    expect(await partidasNaData()).toBe(0);
  });

  it('PAR-26: situação fora das 4 responde 422 no campo da marcação', async () => {
    const r = await lancar({
      data: DATA,
      choveu: false,
      marcacoes: [{ jogadorId: aberto.cenario.idsG.jogadorAtivo, situacao: 'machucado' }],
    });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({
      mensagens: { 'marcacoes.0.situacao': MENSAGEM_SITUACAO },
    });
    expect(await partidasNaData()).toBe(0);
  });

  it.each(['2026-02-30', '12/03/2026'])(
    'PAR-19: data %j responde 422 no campo data',
    async (data) => {
      const r = await lancar({ data, choveu: false, marcacoes: [] });
      expect(r.status).toBe(422);
      expect(await r.json()).toMatchObject({ mensagens: { data: MENSAGEM_DATA_INVALIDA } });
    },
  );

  it('PAR-20: data de amanhã responde 422 "A data não pode ser no futuro." sem gravar', async () => {
    const r = await lancar({ data: '2026-03-15', choveu: false, marcacoes: [] });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ mensagens: { data: MENSAGEM_DATA_FUTURA } });
    expect(await partidasNaData('2026-03-15')).toBe(0);
  });

  it('PAR-21: lançar de novo a mesma data responde 409 partida_ja_existe com dataExistente', async () => {
    const corpo = {
      data: DATA,
      choveu: false,
      marcacoes: [{ jogadorId: caco, situacao: 'presente' }],
    };
    expect((await lancar(corpo)).status).toBe(201);
    const r = await lancar({ ...corpo, choveu: true });
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({
      erro: 'Já existe uma partida em 12/03/2026.',
      codigo: 'partida_ja_existe',
      dataExistente: DATA,
    });
    expect(await partidasNaData()).toBe(1);
    expect(await presencasNaData()).toEqual([{ jogador_id: caco, situacao: 'presente' }]);
  });

  it('PAR-22: JSON inválido responde 422 no campo corpo', async () => {
    const r = await lancar('{"data":');
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ mensagens: { corpo: 'Envie um JSON válido.' } });
  });

  it('PAR-22: campo a mais no corpo é recusado', async () => {
    const r = await lancar({
      data: DATA,
      choveu: false,
      marcacoes: [],
      grupoId: aberto.cenario.grupoH,
    });
    expect(r.status).toBe(422);
    expect(await partidasNaData()).toBe(0);
  });

  it('PAR-22: sem vínculo, 404, nada gravado', async () => {
    const r = await lancar({ data: DATA, choveu: false, marcacoes: [] }, aberto.cenario.contaB);
    expect(r.status).toBe(404);
    expect(await partidasNaData()).toBe(0);
  });

  it('PAR-22: grupo arquivado responde 409 grupo_arquivado, nada gravado', async () => {
    await arquivar(aberto.db, aberto.cenario.grupoG);
    const r = await lancar({ data: DATA, choveu: false, marcacoes: [] });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ codigo: 'grupo_arquivado' });
    expect(await partidasNaData()).toBe(0);
  });
});
