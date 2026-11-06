import { Buffer } from 'node:buffer';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { MENSAGEM_NOME_HABILIDADE } from '@pelada/contrato';
import { criarApp } from '../../src/entrada/app.ts';
import { MENSAGEM_HABILIDADE_REPETIDA } from '../../src/entrada/corpo.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import {
  abrirCenarioGrupos,
  HABILIDADES_INICIAIS,
  type CenarioGruposAberto,
} from '../isolamento/cenario-grupos.ts';

/**
 * Rotas de habilidades (T47; GEL-88 a GEL-93, GEL-96), com o app real como `pelada_app` contra o cenário de grupos
 * (G com as 6 habilidades iniciais). O `afterEach` apaga as habilidades criadas e devolve "Drible" ao nome original.
 */

let aberto: CenarioGruposAberto;
const app = criarApp({ fabricaBanco: fabricaComoApp().fabrica });

interface Corpo {
  id?: string;
  nome?: string;
  habilidades?: Array<{ id: string; nome: string }>;
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
  metodo = 'GET',
  corpo?: unknown,
  conta = aberto.cenario.contaC,
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

const deG = (resto = '') => `/grupos/${aberto.cenario.grupoG}/habilidades${resto}`;

async function idDe(nome: string, grupo = aberto.cenario.grupoG): Promise<string> {
  const r = await aberto.db.query<{ id: string }>(
    'SELECT id FROM habilidades WHERE grupo_id = $1 AND nome = $2',
    [grupo, nome],
  );
  return r.rows[0]!.id;
}

async function nomesDeG(): Promise<string[]> {
  const r = await aberto.db.query<{ nome: string }>(
    'SELECT nome FROM habilidades WHERE grupo_id = $1 ORDER BY ordem',
    [aberto.cenario.grupoG],
  );
  return r.rows.map((l) => l.nome);
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  const { db, cenario } = aberto;
  // Primeiro devolve o nome de "Drible"; senão o DELETE de 'Rota %' apagaria a própria habilidade renomeada.
  await db.query(
    `UPDATE habilidades SET nome = 'Drible' WHERE grupo_id = $1 AND nome = 'Rota Finta'`,
    [cenario.grupoG],
  );
  await db.query(
    `DELETE FROM habilidades WHERE grupo_id = ANY($1::uuid[]) AND nome LIKE 'Rota %'`,
    [[cenario.grupoG, cenario.grupoH]],
  );
});

describe('GET /api/grupos/:grupoId/habilidades', () => {
  it('GEL-88: 200 com as habilidades na ordem de cadastro', async () => {
    const r = await pedir(deG());
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as Corpo;
    expect(corpo.habilidades?.slice(0, 6).map((h) => h.nome)).toEqual([...HABILIDADES_INICIAIS]);
  });
});

describe('POST /api/grupos/:grupoId/habilidades', () => {
  it('GEL-89: 201 com a habilidade, no fim da ordem', async () => {
    const r = await pedir(deG(), 'POST', { nome: '  Rota Cabeceio  ' });
    expect(r.status).toBe(201);
    const corpo = (await r.json()) as Corpo;
    expect(corpo.nome).toBe('Rota Cabeceio');
    expect(typeof corpo.id).toBe('string');
    expect((await nomesDeG()).at(-1)).toBe('Rota Cabeceio');
  });

  it.each([
    ['1 caractere', 'X'],
    ['31 caracteres', 'R'.repeat(31)],
    ['só espaços', '    '],
  ])('GEL-90: nome com %s dá 422 no campo nome com a mensagem', async (_caso, nome) => {
    const antes = await nomesDeG();
    const r = await pedir(deG(), 'POST', { nome });
    expect(r.status).toBe(422);
    const corpo = (await r.json()) as Corpo;
    expect(corpo.campos).toEqual(['nome']);
    expect(corpo.mensagens?.['nome']).toBe(MENSAGEM_NOME_HABILIDADE);
    expect(await nomesDeG()).toEqual(antes);
  });

  it('GEL-91: nome repetido sem caixa dá 422 com "Já existe uma habilidade com esse nome."', async () => {
    const r = await pedir(deG(), 'POST', { nome: 'PASSE' });
    expect(r.status).toBe(422);
    const corpo = (await r.json()) as Corpo;
    expect(corpo.campos).toEqual(['nome']);
    expect(corpo.mensagens?.['nome']).toBe(MENSAGEM_HABILIDADE_REPETIDA);
    expect(MENSAGEM_HABILIDADE_REPETIDA).toBe('Já existe uma habilidade com esse nome.');
  });
});

describe('PATCH /api/grupos/:grupoId/habilidades/:id', () => {
  it('GEL-92: 200 com o nome novo, na mesma posição', async () => {
    const drible = await idDe('Drible');
    const posicao = (await nomesDeG()).indexOf('Drible');
    const r = await pedir(deG(`/${drible}`), 'PATCH', { nome: 'Rota Finta' });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ id: drible, nome: 'Rota Finta' });
    expect((await nomesDeG()).indexOf('Rota Finta')).toBe(posicao);
  });

  it('GEL-90: nome curto dá 422 no campo nome', async () => {
    const r = await pedir(deG(`/${await idDe('Drible')}`), 'PATCH', { nome: 'X' });
    expect(r.status).toBe(422);
    expect(((await r.json()) as Corpo).campos).toEqual(['nome']);
  });

  it('GEL-91: nome de outra habilidade dá 422 no campo nome', async () => {
    const r = await pedir(deG(`/${await idDe('Drible')}`), 'PATCH', { nome: 'chute' });
    expect(r.status).toBe(422);
    expect(((await r.json()) as Corpo).mensagens?.['nome']).toBe(MENSAGEM_HABILIDADE_REPETIDA);
    expect(await nomesDeG()).toContain('Drible');
  });
});

describe('DELETE /api/grupos/:grupoId/habilidades/:id', () => {
  it('GEL-93: 204 e a habilidade some', async () => {
    const criada = (await (
      await pedir(deG(), 'POST', { nome: 'Rota Para Excluir' })
    ).json()) as Corpo;
    const r = await pedir(deG(`/${criada.id}`), 'DELETE');
    expect(r.status).toBe(204);
    expect(await nomesDeG()).not.toContain('Rota Para Excluir');
  });
});

describe('GEL-96: habilidade de outro grupo', () => {
  async function habilidadeDeH(): Promise<string> {
    const { db, cenario } = aberto;
    const r = await db.query<{ id: string }>(
      `INSERT INTO habilidades (grupo_id, nome) VALUES ($1, 'Rota Só de H') RETURNING id`,
      [cenario.grupoH],
    );
    return r.rows[0]!.id;
  }

  it.each(['PATCH', 'DELETE'])(
    'GEL-96: %s com o id de uma habilidade de H, pelo grupo G, dá 404 e nada muda',
    async (metodo) => {
      const id = await habilidadeDeH();
      const r = await pedir(
        deG(`/${id}`),
        metodo,
        metodo === 'PATCH' ? { nome: 'Rota Invadida' } : undefined,
      );
      expect(r.status).toBe(404);
      const linha = await aberto.db.query<{ nome: string }>(
        'SELECT nome FROM habilidades WHERE id = $1',
        [id],
      );
      expect(linha.rows[0]?.nome).toBe('Rota Só de H');
    },
  );

  it.each(['PATCH', 'DELETE'])('GEL-96: %s com id que não é uuid dá 404', async (metodo) => {
    const r = await pedir(
      deG('/nao-e-uuid'),
      metodo,
      metodo === 'PATCH' ? { nome: 'Rota Qualquer' } : undefined,
    );
    expect(r.status).toBe(404);
  });
});
