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
 * `POST /api/grupos/:grupoId/jogadores/:id/inativar` e `…/reativar` (T42; GEL-51 a GEL-56), com o app real como
 * `pelada_app` e o relógio fixo em 05/11/2026 (12h de São Paulo). Os jogadores de cada caso nascem como superusuário
 * (desde 2026-09-01, ativos ou inativos) e saem no `afterEach`.
 */

let aberto: CenarioGruposAberto;
const criados: string[] = [];

const HOJE = '2026-11-05';
const app = criarApp({
  fabricaBanco: fabricaComoApp().fabrica,
  relogio: relogioFixo('2026-11-05T15:00:00Z'),
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

async function pedir(
  caminho: string,
  conta: string,
  metodo = 'GET',
  corpo?: unknown,
): Promise<Response> {
  const headers = new Headers({
    'x-pelada': '1',
    cookie: `${NOME_COOKIE_SESSAO}=${await sessao(conta)}`,
  });
  if (corpo !== undefined) headers.set('content-type', 'application/json');
  const ctx = contextoFalso();
  const r = await app.request(
    `/api${caminho}`,
    { method: metodo, headers, ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}) },
    envAcesso(aberto.url),
    ctx,
  );
  await ctx.esperar();
  return r;
}

async function novoJogador(
  apelido: string,
  fim: string | null = null,
  grupo = aberto.cenario.grupoG,
): Promise<string> {
  const { db, cenario } = aberto;
  const r = await db.query<{ id: string }>(
    `INSERT INTO jogadores (grupo_id, apelido, ano_nascimento, posicao, pontuacao_inicial, inicio_pontuacao, criado_por,
                            criado_em, alterado_por, alterado_em)
     VALUES ($1, $2, 1990, 'meia', 0, '2026-09-01', $3, now(), $3, now()) RETURNING id`,
    [grupo, apelido, grupo === cenario.grupoH ? cenario.contaB : cenario.contaC],
  );
  const id = r.rows[0]!.id;
  await db.query(
    `INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio, fim) VALUES ($1, $2, '2026-09-01', $3)`,
    [id, grupo, fim],
  );
  criados.push(id);
  return id;
}

function acao(
  nome: 'inativar' | 'reativar',
  id: string,
  corpo: unknown = {},
  conta = aberto.cenario.contaC,
) {
  return pedir(`/grupos/${aberto.cenario.grupoG}/jogadores/${id}/${nome}`, conta, 'POST', corpo);
}

async function situacaoNaLista(id: string): Promise<string | undefined> {
  const r = await pedir(`/grupos/${aberto.cenario.grupoG}/jogadores`, aberto.cenario.contaC);
  const lista = (await r.json()) as { jogadores: Array<{ id: string; situacao: string }> };
  return lista.jogadores.find((j) => j.id === id)?.situacao;
}

async function periodos(id: string) {
  const r = await aberto.db.query<{ inicio: string; fim: string | null }>(
    'SELECT inicio::text AS inicio, fim::text AS fim FROM periodos_ativos WHERE jogador_id = $1 ORDER BY inicio',
    [id],
  );
  return r.rows;
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

describe('POST …/jogadores/:id/inativar', () => {
  it('GEL-51: 200 e a lista passa a mostrar o jogador como inativo', async () => {
    const id = await novoJogador('Rota Inativa');
    const r = await acao('inativar', id, { data: '2026-10-20' }, aberto.cenario.contaO);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ alterado: true });
    expect(await situacaoNaLista(id)).toBe('inativo');
    expect(await periodos(id)).toEqual([{ inicio: '2026-09-01', fim: '2026-10-20' }]);
  });

  it('GEL-52: corpo vazio usa o hoje do relógio', async () => {
    const id = await novoJogador('Rota Sai Hoje');
    const r = await acao('inativar', id, {});
    expect(r.status).toBe(200);
    expect(await periodos(id)).toEqual([{ inicio: '2026-09-01', fim: HOJE }]);
  });

  it('GEL-53: já inativo dá 409 ja_inativo com "O jogador já está inativo."', async () => {
    const id = await novoJogador('Rota Já Saiu', '2026-10-01');
    const r = await acao('inativar', id, { data: '2026-10-20' });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({
      codigo: 'ja_inativo',
      erro: 'O jogador já está inativo.',
    });
    expect(await periodos(id)).toEqual([{ inicio: '2026-09-01', fim: '2026-10-01' }]);
  });

  it('GEL-58: regra de período dá 422 no campo data com a mensagem', async () => {
    const id = await novoJogador('Rota Antes do Início');
    const r = await acao('inativar', id, { data: '2026-08-31' });
    expect(r.status).toBe(422);
    const corpo = (await r.json()) as { campos: string[]; mensagens: Record<string, string> };
    expect(corpo.campos).toEqual(['data']);
    expect(corpo.mensagens['data']).toBe(
      'A saída não pode ser antes do início deste período (01/09/2026).',
    );
    expect(await periodos(id)).toEqual([{ inicio: '2026-09-01', fim: null }]);
  });

  it('GEL-58: data fora do formato dá 422 no campo data', async () => {
    const id = await novoJogador('Rota Data Ruim');
    const r = await acao('inativar', id, { data: '20/10/2026' });
    expect(r.status).toBe(422);
    expect(((await r.json()) as { campos: string[] }).campos).toEqual(['data']);
  });
});

describe('POST …/jogadores/:id/reativar', () => {
  it('GEL-54: 200 e a lista passa a mostrar o jogador como ativo', async () => {
    const id = await novoJogador('Rota Volta', '2026-10-01');
    const r = await acao('reativar', id, { data: '2026-10-20' }, aberto.cenario.contaO);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ alterado: true });
    expect(await situacaoNaLista(id)).toBe('ativo');
    expect(await periodos(id)).toEqual([
      { inicio: '2026-09-01', fim: '2026-10-01' },
      { inicio: '2026-10-20', fim: null },
    ]);
  });

  it('GEL-55: corpo vazio usa o hoje do relógio', async () => {
    const id = await novoJogador('Rota Volta Hoje', '2026-10-01');
    const r = await acao('reativar', id, {});
    expect(r.status).toBe(200);
    expect((await periodos(id))[1]).toEqual({ inicio: HOJE, fim: null });
  });

  it('GEL-56: já ativo dá 409 ja_ativo com "O jogador já está ativo."', async () => {
    const id = await novoJogador('Rota Já Ativo');
    const r = await acao('reativar', id, { data: '2026-10-20' });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ codigo: 'ja_ativo', erro: 'O jogador já está ativo.' });
    expect(await periodos(id)).toEqual([{ inicio: '2026-09-01', fim: null }]);
  });

  it('GEL-58: retorno antes da saída anterior dá 422 no campo data', async () => {
    const id = await novoJogador('Rota Volta Antes', '2026-10-01');
    const r = await acao('reativar', id, { data: '2026-09-30' });
    expect(r.status).toBe(422);
    const corpo = (await r.json()) as { campos: string[]; mensagens: Record<string, string> };
    expect(corpo.campos).toEqual(['data']);
    expect(corpo.mensagens['data']).toBe(
      'O retorno não pode ser antes da saída anterior (01/10/2026).',
    );
  });
});

describe('GEL-44: jogador de fora do grupo', () => {
  it.each(['inativar', 'reativar'] as const)(
    'GEL-44: %s de um jogador de H, pelo grupo G, dá 404 e nada muda',
    async (nome) => {
      const id = await novoJogador(
        'Rota de H',
        nome === 'inativar' ? null : '2026-10-01',
        aberto.cenario.grupoH,
      );
      const r = await acao(nome, id, { data: '2026-10-20' });
      expect(r.status).toBe(404);
      expect(await periodos(id)).toHaveLength(1);
    },
  );

  it.each(['inativar', 'reativar'] as const)(
    'GEL-44: %s com id que não é uuid dá 404',
    async (nome) => {
      const r = await acao(nome, 'nao-e-uuid', {});
      expect(r.status).toBe(404);
    },
  );
});
