import { Buffer } from 'node:buffer';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarApp, type OpcoesApp } from '../../src/entrada/app.ts';
import {
  MENSAGEM_PLANO_PRO,
  recursoLiberadoPeloPlano,
  type RecursoLiberado,
} from '../../src/entrada/middlewares/recurso.ts';
import { relogioDoSistema } from '../../src/infraestrutura/relogio.ts';
import { comDb } from '../repositorios/apoio.ts';
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
 * `recursoLiberado` e `exigirRecurso('simulador')` (T32 da simulador; SIM-68, AD-049, AD-062, AD-077, AD-091), contra o
 * cenário de grupos (C criadora de G, B só do grupo H), com o app real como `pelada_app`.
 *
 * Rotas de teste em `…/simulador/teste` (GET e POST), `…/escalacoes` (POST) e `…/teste` (fora da trava) mostram se a
 * cadeia deixou passar. O meta-teste do fim pede ao app real todas as rotas do simulador e de escalação (T33 a T37):
 * fica vermelho até elas existirem.
 *
 * Casos limite: padrão libera; negado em GET e em POST; rota fora do simulador não é travada; ordem 404 → 409 → 403;
 * a trava recebe o grupo da URL e o recurso; nada da rota roda quando negado.
 */

let aberto: CenarioGruposAberto;
let chamadas = 0;
const pedidosDaTrava: Array<{ grupoId: string; recurso: string }> = [];

const negar: RecursoLiberado = async (_db, grupoId, recurso) => {
  pedidosDaTrava.push({ grupoId, recurso });
  return false;
};

function montar(opcoes: Pick<OpcoesApp, 'recursoLiberado'> = {}, comExtras = true) {
  return criarApp({
    fabricaBanco: fabricaComoApp().fabrica,
    ...opcoes,
    ...(comExtras
      ? {
          registrarExtras: (api) => {
            const responder = (c: { json: (v: unknown, s: 200) => Response }) => {
              chamadas += 1;
              return c.json({ ok: true }, 200);
            };
            api.on(['GET', 'POST'], '/grupos/:grupoId/simulador/teste', (c) => responder(c));
            api.post('/grupos/:grupoId/escalacoes', (c) => responder(c));
            api.on(['GET', 'POST'], '/grupos/:grupoId/teste', (c) => responder(c));
          },
        }
      : {}),
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
  app: ReturnType<typeof criarApp>,
  caminho: string,
  token: string,
  metodo: string,
  corpo?: unknown,
): Promise<Response> {
  const headers = new Headers({ 'x-pelada': '1', cookie: `${NOME_COOKIE_SESSAO}=${token}` });
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

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

beforeEach(async () => {
  pedidosDaTrava.length = 0;
  await reativar(aberto.db, aberto.cenario.grupoG);
});

const ROTAS_TRAVADAS = [
  ['GET', '/simulador/teste'],
  ['POST', '/simulador/teste'],
  ['POST', '/escalacoes'],
] as const;

describe('recursoLiberado padrão', () => {
  // Trocado pela T21 da planos-e-cobranca (autorizado em `## Autorizações` do STATE.md): o padrão deixou de liberar
  // todo grupo e passou a ler o plano. Mesma força: G e H, cada um pela própria criadora, em plano Pro (trial recém
  // criado pelo cenário), continuam com o simulador; e o mesmo G caído para `inadimplente` perde.
  it('SIM-68: com o plano em Pro (trial do cenário), G e H têm o simulador', async () => {
    const { cenario } = aberto;
    const pontoUnico = recursoLiberadoPeloPlano(relogioDoSistema());
    expect(
      await comDb(aberto.url, cenario.contaC, (db) => pontoUnico(db, cenario.grupoG, 'simulador')),
    ).toBe(true);
    expect(
      await comDb(aberto.url, cenario.contaB, (db) => pontoUnico(db, cenario.grupoH, 'simulador')),
    ).toBe(true);
  });

  it('SIM-68: com G em inadimplente, o padrão nega o simulador de G', async () => {
    const { db, cenario } = aberto;
    const antes = await db.query<{ s: string; t: string | null }>(
      'SELECT situacao_comercial AS s, trial_inicio::text AS t FROM grupos WHERE id = $1',
      [cenario.grupoG],
    );
    await db.query(
      `UPDATE grupos SET situacao_comercial = 'inadimplente', trial_inicio = NULL WHERE id = $1`,
      [cenario.grupoG],
    );
    try {
      const pontoUnico = recursoLiberadoPeloPlano(relogioDoSistema());
      expect(
        await comDb(aberto.url, cenario.contaC, (d) => pontoUnico(d, cenario.grupoG, 'simulador')),
      ).toBe(false);
    } finally {
      await db.query(
        'UPDATE grupos SET situacao_comercial = $2, trial_inicio = $3::date WHERE id = $1',
        [cenario.grupoG, antes.rows[0]?.s, antes.rows[0]?.t ?? null],
      );
    }
  });

  it.each(ROTAS_TRAVADAS)('SIM-68: com o padrão, %s %s passa', async (metodo, caminho) => {
    const { cenario } = aberto;
    const antes = chamadas;
    const r = await pedir(
      montar(),
      `/grupos/${cenario.grupoG}${caminho}`,
      await sessao(cenario.contaC),
      metodo,
      {},
    );
    expect(r.status).toBe(200);
    expect(chamadas).toBe(antes + 1);
  });
});

describe('exigirRecurso com o recurso negado', () => {
  it.each(ROTAS_TRAVADAS)(
    'SIM-68: %s %s dá 403 plano_pro sem chamar a rota',
    async (metodo, caminho) => {
      const { cenario } = aberto;
      const antes = chamadas;
      const r = await pedir(
        montar({ recursoLiberado: negar }),
        `/grupos/${cenario.grupoG}${caminho}`,
        await sessao(cenario.contaC),
        metodo,
        {},
      );
      expect(r.status).toBe(403);
      expect(await r.json()).toEqual({
        erro: 'plano_pro',
        recurso: 'simulador',
        mensagem: MENSAGEM_PLANO_PRO,
      });
      expect(chamadas).toBe(antes);
    },
  );

  it('SIM-68: a trava recebe o grupo da URL e o recurso simulador', async () => {
    const { cenario } = aberto;
    await pedir(
      montar({ recursoLiberado: negar }),
      `/grupos/${cenario.grupoG}/simulador/teste`,
      await sessao(cenario.contaC),
      'POST',
      {},
    );
    expect(pedidosDaTrava).toEqual([{ grupoId: cenario.grupoG, recurso: 'simulador' }]);
  });

  it.each(['GET', 'POST'])(
    'SIM-68: %s numa rota do grupo fora do simulador não passa pela trava',
    async (metodo) => {
      const { cenario } = aberto;
      const r = await pedir(
        montar({ recursoLiberado: negar }),
        `/grupos/${cenario.grupoG}/teste`,
        await sessao(cenario.contaC),
        metodo,
        {},
      );
      expect(r.status).toBe(200);
      expect(pedidosDaTrava).toEqual([]);
    },
  );

  it('SIM-68, AD-077: sem vínculo dá 404 antes da trava', async () => {
    const { cenario } = aberto;
    const r = await pedir(
      montar({ recursoLiberado: negar }),
      `/grupos/${cenario.grupoG}/simulador/teste`,
      await sessao(cenario.contaB),
      'POST',
      {},
    );
    expect(r.status).toBe(404);
    expect(pedidosDaTrava).toEqual([]);
  });

  it('SIM-68, AD-077: escrita em grupo arquivado dá 409 antes da trava', async () => {
    const { cenario } = aberto;
    await arquivar(aberto.db, cenario.grupoG);
    const r = await pedir(
      montar({ recursoLiberado: negar }),
      `/grupos/${cenario.grupoG}/escalacoes`,
      await sessao(cenario.contaC),
      'POST',
      {},
    );
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ codigo: 'grupo_arquivado' });
    expect(pedidosDaTrava).toEqual([]);
  });

  it('SIM-68: sem sessão dá 401 antes da trava', async () => {
    const { cenario } = aberto;
    const ctx = contextoFalso();
    const r = await montar({ recursoLiberado: negar }).request(
      `/api/grupos/${cenario.grupoG}/simulador/teste`,
      { method: 'GET', headers: { 'x-pelada': '1' } },
      envAcesso(aberto.url),
      ctx,
    );
    await ctx.esperar();
    expect(r.status).toBe(401);
    expect(pedidosDaTrava).toEqual([]);
  });
});

/** As rotas do simulador e de escalação que as T33 a T37 registram. */
const ROTAS_DO_SIMULADOR = [
  'GET /api/grupos/:grupoId/simulador/contexto',
  'POST /api/grupos/:grupoId/simulador/previa',
  'POST /api/grupos/:grupoId/simulador/sugerir',
  'POST /api/grupos/:grupoId/simulador/avaliar',
  'POST /api/grupos/:grupoId/escalacoes',
];

describe('meta-teste da trava (SIM-68)', () => {
  /** As rotas do app real (sem extras) sob `/simulador` ou `/escalacoes`, sem os middlewares (`ALL`). */
  function rotasRegistradas(): string[] {
    const app = montar({}, false);
    return [
      ...new Set(
        app.routes
          .filter(
            (r) =>
              r.method !== 'ALL' && /\/grupos\/:grupoId\/(simulador\/|escalacoes)/.test(r.path),
          )
          .map((r) => `${r.method} ${r.path}`),
      ),
    ].sort();
  }

  it('SIM-68: o app registra as 5 rotas do simulador e de escalação', () => {
    expect(rotasRegistradas()).toEqual(expect.arrayContaining(ROTAS_DO_SIMULADOR));
  });

  it('SIM-68: toda rota de /simulador e /escalacoes responde 403 plano_pro com o recurso negado', async () => {
    const { cenario } = aberto;
    const rotas = rotasRegistradas();
    expect(rotas.length).toBeGreaterThan(0);
    const token = await sessao(cenario.contaC);
    const app = montar({ recursoLiberado: negar }, false);
    const semTrava: string[] = [];
    for (const rota of rotas) {
      const [metodo, caminho] = rota.split(' ') as [string, string];
      const url = caminho
        .replace('/api', '')
        .replace(':grupoId', cenario.grupoG)
        .replace(/:[a-zA-Z]+/g, '2026-01-08');
      const r = await pedir(app, url, token, metodo, metodo === 'GET' ? undefined : {});
      if (r.status !== 403) semTrava.push(`${rota}: ${r.status}`);
    }
    expect(semTrava).toEqual([]);
  });
});
