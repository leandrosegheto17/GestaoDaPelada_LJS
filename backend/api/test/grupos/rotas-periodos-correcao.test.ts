import { Buffer } from 'node:buffer';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { criarApp } from '../../src/entrada/app.ts';
import { relogioFixo } from '../../src/infraestrutura/relogio.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * `PATCH …/jogadores/:id/periodos/:periodoId` e `PUT …/jogadores/:id/inicio` (T43; GEL-71 a GEL-75, GEL-77 a GEL-80,
 * GEL-82), com o app real como `pelada_app` e o relógio fixo em 05/11/2026 (12h de São Paulo). Cada jogador nasce como
 * superusuário com `inicio_pontuacao` 2026-02-05, um período de 2026-02-05 a 2026-10-05 e outro aberto desde
 * 2026-10-20, e sai no `afterEach`.
 */

let aberto: CenarioGruposAberto;
const criados: string[] = [];

const app = criarApp({
  fabricaBanco: fabricaComoApp().fabrica,
  relogio: relogioFixo('2026-11-05T15:00:00Z'),
});

interface Resposta {
  alterado?: boolean;
  mensagem?: string;
  periodos?: Array<{ id: string; inicio: string; fim: string | null }>;
  codigo?: string;
  campos?: string[];
  mensagens?: Record<string, string>;
}

async function sessao(conta: string): Promise<string> {
  const { token, hash } = await gerarToken();
  await aberto.db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  return token;
}

async function pedir(
  caminho: string,
  metodo: string,
  corpo: unknown,
  conta = aberto.cenario.contaC,
): Promise<Response> {
  const headers = new Headers({
    'x-pelada': '1',
    cookie: `${NOME_COOKIE_SESSAO}=${await sessao(conta)}`,
    'content-type': 'application/json',
  });
  const ctx = contextoFalso();
  const r = await app.request(
    `/api${caminho}`,
    { method: metodo, headers, body: JSON.stringify(corpo) },
    envAcesso(aberto.url),
    ctx,
  );
  await ctx.esperar();
  return r;
}

async function novoJogador(apelido: string): Promise<{ id: string; periodos: string[] }> {
  const { db, cenario } = aberto;
  const r = await db.query<{ id: string }>(
    `INSERT INTO jogadores (grupo_id, apelido, ano_nascimento, posicao, pontuacao_inicial, inicio_pontuacao, criado_por,
                            criado_em, alterado_por, alterado_em)
     VALUES ($1, $2, 1990, 'meia', 0, '2026-02-05', $3, now(), $3, now()) RETURNING id`,
    [cenario.grupoG, apelido, cenario.contaC],
  );
  const id = r.rows[0]!.id;
  criados.push(id);
  const ids: string[] = [];
  for (const [inicio, fim] of [
    ['2026-02-05', '2026-10-05'],
    ['2026-10-20', null],
  ] as const) {
    const p = await db.query<{ id: string }>(
      'INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio, fim) VALUES ($1, $2, $3, $4) RETURNING id',
      [id, cenario.grupoG, inicio, fim],
    );
    ids.push(p.rows[0]!.id);
  }
  return { id, periodos: ids };
}

function corrigir(id: string, periodoId: string, corpo: unknown) {
  return pedir(
    `/grupos/${aberto.cenario.grupoG}/jogadores/${id}/periodos/${periodoId}`,
    'PATCH',
    corpo,
  );
}

function alterarInicio(id: string, corpo: unknown) {
  return pedir(`/grupos/${aberto.cenario.grupoG}/jogadores/${id}/inicio`, 'PUT', corpo);
}

async function inicioPontuacao(id: string) {
  const r = await aberto.db.query<{ inicio: string }>(
    'SELECT inicio_pontuacao::text AS inicio FROM jogadores WHERE id = $1',
    [id],
  );
  return r.rows[0]?.inicio;
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  await aberto.db.query('DELETE FROM jogadores WHERE id = ANY($1::uuid[])', [criados]);
  criados.length = 0;
});

describe('PATCH …/jogadores/:id/periodos/:periodoId', () => {
  it('GEL-71: 200 com alterado e os períodos com as datas novas', async () => {
    const j = await novoJogador('Rota Corrige');
    const r = await corrigir(j.id, j.periodos[0]!, { saida: '2026-10-03' });
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as Resposta;
    expect(corpo.alterado).toBe(true);
    expect(corpo.mensagem).toBeUndefined();
    expect(corpo.periodos).toEqual([
      { id: j.periodos[0], inicio: '2026-02-05', fim: '2026-10-03' },
      { id: j.periodos[1], inicio: '2026-10-20', fim: null },
    ]);
  });

  it('GEL-74: datas iguais dão 200 com alterado: false e "Nada a alterar."', async () => {
    const j = await novoJogador('Rota Igual');
    const r = await corrigir(j.id, j.periodos[0]!, { saida: '2026-10-05' });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ alterado: false, mensagem: 'Nada a alterar.' });
  });

  it('GEL-72: saída de período aberto dá 422 no campo saida com a mensagem', async () => {
    const j = await novoJogador('Rota Aberto');
    const r = await corrigir(j.id, j.periodos[1]!, { saida: '2026-11-01' });
    expect(r.status).toBe(422);
    const corpo = (await r.json()) as Resposta;
    expect(corpo.campos).toEqual(['saida']);
    expect(corpo.mensagens?.['saida']).toBe('Este período não tem data de saída.');
  });

  it('GEL-73: retorno do primeiro período dá 422 no campo retorno com a mensagem', async () => {
    const j = await novoJogador('Rota Primeiro');
    const r = await corrigir(j.id, j.periodos[0]!, { retorno: '2026-02-01' });
    expect(r.status).toBe(422);
    const corpo = (await r.json()) as Resposta;
    expect(corpo.campos).toEqual(['retorno']);
    expect(corpo.mensagens?.['retorno']).toBe(
      'O início do primeiro período é a data de início da pontuação; use Alterar data de início.',
    );
  });

  it('GEL-75: período de outro jogador do grupo dá 404 e nada muda', async () => {
    const a = await novoJogador('Rota Dono');
    const b = await novoJogador('Rota Outro');
    const r = await corrigir(b.id, a.periodos[0]!, { saida: '2026-10-03' });
    expect(r.status).toBe(404);
    const linha = await aberto.db.query<{ fim: string }>(
      'SELECT fim::text AS fim FROM periodos_ativos WHERE id = $1',
      [a.periodos[0]],
    );
    expect(linha.rows[0]?.fim).toBe('2026-10-05');
  });

  it('GEL-75: periodoId que não é uuid dá 404', async () => {
    const j = await novoJogador('Rota Id Ruim');
    const r = await corrigir(j.id, 'nao-e-uuid', { saida: '2026-10-03' });
    expect(r.status).toBe(404);
  });

  it('GEL-71: corpo sem saída nem retorno dá 422', async () => {
    const j = await novoJogador('Rota Vazio');
    const r = await corrigir(j.id, j.periodos[0]!, {});
    expect(r.status).toBe(422);
  });
});

describe('PUT …/jogadores/:id/inicio', () => {
  it('GEL-77: 200, grava a data e o recuo move o primeiro período', async () => {
    const j = await novoJogador('Rota Início');
    const r = await alterarInicio(j.id, { data: '2026-02-01' });
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as Resposta;
    expect(corpo.alterado).toBe(true);
    expect(corpo.periodos?.[0]).toEqual({
      id: j.periodos[0],
      inicio: '2026-02-01',
      fim: '2026-10-05',
    });
    expect(await inicioPontuacao(j.id)).toBe('2026-02-01');
  });

  it('GEL-82: data igual dá 200 sem gravar', async () => {
    const j = await novoJogador('Rota Início Igual');
    const r = await alterarInicio(j.id, { data: '2026-02-05' });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ alterado: false, mensagem: 'Nada a alterar.' });
    expect(await inicioPontuacao(j.id)).toBe('2026-02-05');
  });

  it.each([
    ['GEL-78', '1999-12-31', 'A data de início não pode ser anterior a 01/01/2000.'],
    ['GEL-79', '2026-11-06', 'A data não pode ser no futuro.'],
    [
      'GEL-80',
      '2026-10-06',
      'A data de início não pode ficar depois da saída do primeiro período (05/10/2026). Corrija antes a data de saída do primeiro período.',
    ],
  ])('%s: %s dá 422 no campo data com a mensagem e nada é gravado', async (_id, data, mensagem) => {
    const j = await novoJogador(`Rota Início ${data}`);
    const r = await alterarInicio(j.id, { data });
    expect(r.status).toBe(422);
    const corpo = (await r.json()) as Resposta;
    expect(corpo.campos).toEqual(['data']);
    expect(corpo.mensagens?.['data']).toBe(mensagem);
    expect(await inicioPontuacao(j.id)).toBe('2026-02-05');
  });

  it('GEL-77: corpo sem data dá 422 no campo data', async () => {
    const j = await novoJogador('Rota Sem Data');
    const r = await alterarInicio(j.id, {});
    expect(r.status).toBe(422);
    expect(((await r.json()) as Resposta).campos).toEqual(['data']);
  });

  it('GEL-44: jogador que não é uuid dá 404', async () => {
    const r = await alterarInicio('nao-e-uuid', { data: '2026-02-01' });
    expect(r.status).toBe(404);
  });
});
