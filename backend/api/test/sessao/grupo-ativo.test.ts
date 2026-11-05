import { Buffer } from 'node:buffer';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarApp } from '../../src/entrada/app.ts';
import { passaComGrupoArquivado } from '../../src/entrada/middlewares/grupo-ativo.ts';
import type { ConexaoPg } from '../../src/infraestrutura/db/cliente.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { conviteDeTeste, envAcesso } from '../acesso/apoio.ts';
import { contextoFalso } from '../db/requisicao.ts';
import {
  abrirCenarioGrupos,
  arquivar,
  reativar,
  type CenarioGruposAberto,
} from '../isolamento/cenario-grupos.ts';

/**
 * `exigirGrupoAtivo` (T22; GEL-26, SEC-004, SEC-007), contra o cenário de grupos (C criadora de G, O outra admin), com
 * o app real como `pelada_app`. Rotas de teste em `/api/grupos/:grupoId` (PATCH), `…/teste` e `…/reativar` e
 * `…/arquivar` mostram se a cadeia deixou passar; as rotas de admins são as da conta e acesso.
 *
 * Casos limite: GET em arquivado; PATCH em arquivado; reativar; arquivar de novo; cancelar convite; remover admin em
 * arquivado; escrita em grupo ativo.
 */

let aberto: CenarioGruposAberto;
const consultas: string[] = [];
let chamadas = 0;

/** Como `fabricaComoApp`, registrando o SQL de cada consulta. */
function fabricaComoAppEspiada(connectionString: string): ConexaoPg {
  const c = new pg.Client({ connectionString });
  return {
    connect: async () => {
      await c.connect();
      await c.query('SET ROLE pelada_app');
    },
    end: () => c.end(),
    query: (sql, valores) => {
      consultas.push(sql);
      return c.query(sql, valores);
    },
  };
}

function montar() {
  return criarApp({
    fabricaBanco: fabricaComoAppEspiada,
    registrarExtras: (api) => {
      const responder = (c: { json: (v: unknown, s: 200) => Response }) => {
        chamadas += 1;
        return c.json({ ok: true }, 200);
      };
      api.patch('/grupos/:grupoId', (c) => responder(c));
      api.on(['GET', 'POST', 'PUT', 'DELETE'], '/grupos/:grupoId/teste', (c) => responder(c));
      api.post('/grupos/:grupoId/reativar', (c) => responder(c));
      api.post('/grupos/:grupoId/arquivar', (c) => responder(c));
    },
  });
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
  token: string,
  metodo: string,
  corpo?: unknown,
): Promise<Response> {
  const headers = new Headers({ 'x-pelada': '1', cookie: `${NOME_COOKIE_SESSAO}=${token}` });
  if (corpo !== undefined) headers.set('content-type', 'application/json');
  const ctx = contextoFalso();
  const r = await montar().request(
    `/api${caminho}`,
    { method: metodo, headers, ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}) },
    envAcesso(aberto.url),
    ctx,
  );
  await ctx.esperar();
  return r;
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

beforeEach(async () => {
  consultas.length = 0;
  await reativar(aberto.db, aberto.cenario.grupoG);
});

describe('exigirGrupoAtivo com o grupo arquivado', () => {
  it('GEL-26: PATCH do grupo pela criadora dá 409 grupo_arquivado, sem chamar a rota', async () => {
    const { cenario } = aberto;
    await arquivar(aberto.db, cenario.grupoG);
    const antes = chamadas;
    const r = await pedir(`/grupos/${cenario.grupoG}`, await sessao(cenario.contaC), 'PATCH', {});
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ codigo: 'grupo_arquivado' });
    expect(chamadas).toBe(antes);
  });

  it.each(['POST', 'PUT', 'DELETE'])(
    'GEL-26: %s numa rota do grupo arquivado dá 409',
    async (metodo) => {
      const { cenario } = aberto;
      await arquivar(aberto.db, cenario.grupoG);
      const r = await pedir(
        `/grupos/${cenario.grupoG}/teste`,
        await sessao(cenario.contaC),
        metodo,
      );
      expect(r.status).toBe(409);
      expect(await r.json()).toMatchObject({ codigo: 'grupo_arquivado' });
    },
  );

  it('GEL-26: convidar admin no grupo arquivado dá 409 grupo_arquivado', async () => {
    const { cenario } = aberto;
    await arquivar(aberto.db, cenario.grupoG);
    const r = await pedir(
      `/grupos/${cenario.grupoG}/admins/convites`,
      await sessao(cenario.contaC),
      'POST',
      {
        email: 'nova-admin@exemplo.test',
      },
    );
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ codigo: 'grupo_arquivado' });
    const convites = await aberto.db.query(
      `SELECT 1 FROM convites_admin WHERE email = 'nova-admin@exemplo.test'`,
    );
    expect(convites.rowCount).toBe(0);
  });

  it('GEL-26: remover admin no grupo arquivado dá 409 e a outra admin continua', async () => {
    const { cenario } = aberto;
    await arquivar(aberto.db, cenario.grupoG);
    const r = await pedir(
      `/grupos/${cenario.grupoG}/admins/${cenario.contaO}`,
      await sessao(cenario.contaC),
      'DELETE',
    );
    expect(r.status).toBe(409);
    const vinculo = await aberto.db.query(
      'SELECT 1 FROM vinculos_admin WHERE grupo_id = $1 AND conta_id = $2',
      [cenario.grupoG, cenario.contaO],
    );
    expect(vinculo.rowCount).toBe(1);
  });

  it('GEL-26: GET no grupo arquivado passa para a criadora', async () => {
    const { cenario } = aberto;
    await arquivar(aberto.db, cenario.grupoG);
    const r = await pedir(`/grupos/${cenario.grupoG}/teste`, await sessao(cenario.contaC), 'GET');
    expect(r.status).toBe(200);
  });

  it('GEL-26: reativar e arquivar passam no grupo arquivado', async () => {
    const { cenario } = aberto;
    await arquivar(aberto.db, cenario.grupoG);
    const token = await sessao(cenario.contaC);
    expect((await pedir(`/grupos/${cenario.grupoG}/reativar`, token, 'POST')).status).toBe(200);
    expect((await pedir(`/grupos/${cenario.grupoG}/arquivar`, token, 'POST')).status).toBe(200);
  });

  it('SEC-004: a criadora cancela convite pendente do grupo arquivado (204)', async () => {
    const { cenario } = aberto;
    await conviteDeTeste(aberto.db, cenario.grupoG, 'pendente@exemplo.test', cenario.contaC);
    const convite = await aberto.db.query<{ id: string }>(
      `SELECT id FROM convites_admin WHERE grupo_id = $1 AND email = 'pendente@exemplo.test'`,
      [cenario.grupoG],
    );
    await arquivar(aberto.db, cenario.grupoG);
    const r = await pedir(
      `/grupos/${cenario.grupoG}/admins/convites/${convite.rows[0]!.id}`,
      await sessao(cenario.contaC),
      'DELETE',
    );
    expect(r.status).toBe(204);
    const cancelado = await aberto.db.query(
      'SELECT cancelado_em FROM convites_admin WHERE id = $1',
      [convite.rows[0]!.id],
    );
    expect(cancelado.rows[0]?.cancelado_em).not.toBeNull();
  });
});

describe('exigirGrupoAtivo com o grupo ativo', () => {
  it('GEL-26: PATCH do grupo ativo passa', async () => {
    const { cenario } = aberto;
    const r = await pedir(`/grupos/${cenario.grupoG}`, await sessao(cenario.contaC), 'PATCH', {});
    expect(r.status).toBe(200);
  });

  it('GEL-26: a outra admin escreve no grupo ativo', async () => {
    const { cenario } = aberto;
    const r = await pedir(`/grupos/${cenario.grupoG}/teste`, await sessao(cenario.contaO), 'POST');
    expect(r.status).toBe(200);
  });

  it('SEC-007: a leitura da escrita usa FOR KEY SHARE na transação da requisição', async () => {
    const { cenario } = aberto;
    await pedir(`/grupos/${cenario.grupoG}/teste`, await sessao(cenario.contaC), 'POST');
    const leitura = consultas.find((s) => /arquivado_em/.test(s) && /FROM grupos/.test(s));
    expect(leitura).toMatch(/FOR KEY SHARE/);
    expect(leitura).not.toMatch(/FOR SHARE\b(?! )/);
    const inicio = consultas.indexOf('BEGIN');
    expect(inicio).toBeGreaterThanOrEqual(0);
    expect(consultas.indexOf(leitura!)).toBeGreaterThan(inicio);
  });

  it('SEC-007: GET não lê arquivado_em nem trava a linha', async () => {
    const { cenario } = aberto;
    await pedir(`/grupos/${cenario.grupoG}/teste`, await sessao(cenario.contaC), 'GET');
    expect(consultas.some((s) => /FOR KEY SHARE/.test(s))).toBe(false);
  });

  it('a cadeia roda uma vez por requisição no caminho do próprio grupo', async () => {
    const { cenario } = aberto;
    const r = await pedir(`/grupos/${cenario.grupoG}`, await sessao(cenario.contaC), 'PATCH', {});
    expect(r.status).toBe(200);
    // O `tocar` da sessão tem a própria transação curta; a cadeia do grupo lê o grupo ativo uma vez só.
    expect(consultas.filter((s) => /FOR KEY SHARE/.test(s))).toHaveLength(1);
  });
});

describe('passaComGrupoArquivado', () => {
  it.each([
    ['POST', '/api/grupos/g/reativar', true],
    ['post', '/api/grupos/g/arquivar', true],
    ['DELETE', '/api/grupos/g/admins/convites/c', true],
    ['PATCH', '/api/grupos/g', false],
    ['POST', '/api/grupos/g/admins/convites', false],
    ['DELETE', '/api/grupos/g/admins/c', false],
    ['GET', '/api/grupos/g/reativar', false],
    ['POST', '/api/grupos/g/reativar/x', false],
    ['POST', '/api/grupos/g/jogadores/j/reativar', false],
  ] as const)('SEC-004: %s %s passa = %s', (metodo, caminho, esperado) => {
    expect(passaComGrupoArquivado(metodo, caminho)).toBe(esperado);
  });
});
