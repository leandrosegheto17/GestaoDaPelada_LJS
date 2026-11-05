import { Buffer } from 'node:buffer';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { MENSAGEM_NOTA } from '@pelada/contrato';
import { criarApp } from '../../src/entrada/app.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * `PUT /api/grupos/:grupoId/jogadores/:id/notas/:habilidadeId` (T48; GEL-97 a GEL-100, GEL-105), com o app real como
 * `pelada_app` contra o cenário de grupos. Os jogadores de cada caso nascem como superusuário, sem notas, e saem no
 * `afterEach` (as notas vão junto); as notas dadas ao jogador inativo do cenário também saem.
 */

let aberto: CenarioGruposAberto;
const criados: string[] = [];
const app = criarApp({ fabricaBanco: fabricaComoApp().fabrica });

async function sessao(conta: string): Promise<string> {
  const { token, hash } = await gerarToken();
  await aberto.db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  return token;
}

async function pedir(caminho: string, corpo: unknown, conta = aberto.cenario.contaC): Promise<Response> {
  const headers = new Headers({
    'x-pelada': '1',
    cookie: `${NOME_COOKIE_SESSAO}=${await sessao(conta)}`,
    'content-type': 'application/json',
  });
  const ctx = contextoFalso();
  const r = await app.request(
    `/api${caminho}`,
    { method: 'PUT', headers, body: JSON.stringify(corpo) },
    envAcesso(aberto.url),
    ctx,
  );
  await ctx.esperar();
  return r;
}

async function novoJogador(apelido: string, grupo = aberto.cenario.grupoG): Promise<string> {
  const { db, cenario } = aberto;
  const conta = grupo === cenario.grupoH ? cenario.contaB : cenario.contaC;
  const r = await db.query<{ id: string }>(
    `INSERT INTO jogadores (grupo_id, apelido, ano_nascimento, posicao, pontuacao_inicial, criado_por, criado_em,
                            alterado_por, alterado_em)
     VALUES ($1, $2, 1990, 'meia', 0, $3, now(), $3, now()) RETURNING id`,
    [grupo, apelido, conta],
  );
  const id = r.rows[0]!.id;
  await db.query(`INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio) VALUES ($1, $2, '2026-01-01')`, [id, grupo]);
  criados.push(id);
  return id;
}

async function habilidade(nome: string, grupo = aberto.cenario.grupoG): Promise<string> {
  const r = await aberto.db.query<{ id: string }>('SELECT id FROM habilidades WHERE grupo_id = $1 AND nome = $2', [grupo, nome]);
  const id = r.rows[0]?.id;
  if (id) return id;
  const novo = await aberto.db.query<{ id: string }>('INSERT INTO habilidades (grupo_id, nome) VALUES ($1, $2) RETURNING id', [
    grupo,
    nome,
  ]);
  return novo.rows[0]!.id;
}

function nota(jogador: string, hab: string, corpo: unknown, conta?: string) {
  return pedir(`/grupos/${aberto.cenario.grupoG}/jogadores/${jogador}/notas/${hab}`, corpo, conta);
}

async function valorDe(jogador: string, hab: string): Promise<number | undefined> {
  const r = await aberto.db.query<{ valor: number }>('SELECT valor FROM notas WHERE jogador_id = $1 AND habilidade_id = $2', [
    jogador,
    hab,
  ]);
  return r.rows[0]?.valor;
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  const { db, cenario } = aberto;
  await db.query('DELETE FROM notas WHERE jogador_id = ANY($1::uuid[])', [[...criados, cenario.idsG.jogadorInativo]]);
  await db.query('DELETE FROM jogadores WHERE id = ANY($1::uuid[])', [criados]);
  await db.query(`DELETE FROM habilidades WHERE grupo_id = $1 AND nome = 'Nota Só de H'`, [cenario.grupoH]);
  criados.length = 0;
});

describe('PUT …/jogadores/:id/notas/:habilidadeId', () => {
  it('GEL-97: criar a nota devolve 200 com o nível recalculado', async () => {
    const j = await novoJogador('Nota Nova');
    const passe = await habilidade('Passe');
    const r = await nota(j, passe, { nota: 7 });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ nivel: 700, semNota: false });
    expect(await valorDe(j, passe)).toBe(7);
  });

  it('GEL-97: substituir a nota devolve o nível com a nova, e a média conta as outras', async () => {
    const j = await novoJogador('Nota Trocada');
    const passe = await habilidade('Passe');
    const chute = await habilidade('Chute');
    await nota(j, passe, { nota: 7 });
    await nota(j, chute, { nota: 8 });
    const r = await nota(j, passe, { nota: 9 });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ nivel: 850, semNota: false });
    expect(await valorDe(j, passe)).toBe(9);
  });

  it('GEL-98: null apaga a nota e o nível volta a semNota', async () => {
    const j = await novoJogador('Nota Apagada');
    const passe = await habilidade('Passe');
    await nota(j, passe, { nota: 6 });
    const r = await nota(j, passe, { nota: null });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ nivel: 550, semNota: true });
    expect(await valorDe(j, passe)).toBeUndefined();
  });

  it('GEL-98: null sem nota existente dá 200', async () => {
    const j = await novoJogador('Nota Nenhuma');
    const r = await nota(j, await habilidade('Drible'), { nota: null });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ nivel: 550, semNota: true });
  });

  it.each([
    ['0', { nota: 0 }],
    ['11', { nota: 11 }],
    ['7,5', { nota: 7.5 }],
    ['texto', { nota: '7' }],
    ['ausente', {}],
  ])('GEL-99: nota %s dá 422 no campo nota e nada é gravado', async (_caso, corpo) => {
    const j = await novoJogador(`Nota Ruim ${_caso}`);
    const passe = await habilidade('Passe');
    const r = await nota(j, passe, corpo);
    expect(r.status).toBe(422);
    const c = (await r.json()) as { campos: string[]; mensagens: Record<string, string> };
    expect(c.campos).toEqual(['nota']);
    expect(c.mensagens['nota']).toBe(MENSAGEM_NOTA);
    expect(await valorDe(j, passe)).toBeUndefined();
  });

  it('GEL-100: jogador de outro grupo dá 404 e nada é gravado', async () => {
    const deH = await novoJogador('Nota de H', aberto.cenario.grupoH);
    const passe = await habilidade('Passe');
    const r = await nota(deH, passe, { nota: 5 });
    expect(r.status).toBe(404);
    const n = await aberto.db.query('SELECT 1 FROM notas WHERE jogador_id = $1', [deH]);
    expect(n.rowCount).toBe(0);
  });

  it('GEL-100: habilidade de outro grupo dá 404 e nada é gravado', async () => {
    const j = await novoJogador('Nota Hab de H');
    const deH = await habilidade('Nota Só de H', aberto.cenario.grupoH);
    const r = await nota(j, deH, { nota: 5 });
    expect(r.status).toBe(404);
    expect(await valorDe(j, deH)).toBeUndefined();
  });

  it('GEL-100: ids que não são uuid dão 404', async () => {
    const j = await novoJogador('Nota Id Ruim');
    expect((await nota(j, 'nao-e-uuid', { nota: 5 })).status).toBe(404);
    expect((await nota('nao-e-uuid', await habilidade('Passe'), { nota: 5 })).status).toBe(404);
  });

  it('GEL-105: jogador inativo recebe nota', async () => {
    const inativo = aberto.cenario.idsG.jogadorInativo;
    const passe = await habilidade('Passe');
    const r = await nota(inativo, passe, { nota: 8 });
    expect(r.status).toBe(200);
    expect(await valorDe(inativo, passe)).toBe(8);
  });
});
