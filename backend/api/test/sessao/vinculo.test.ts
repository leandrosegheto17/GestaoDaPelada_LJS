import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApp } from '../../src/entrada/app.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { contextoFalso, envCom, fabricaComoApp } from '../db/requisicao.ts';
import { abrirCenarioConta, type CenarioContaAberto } from '../isolamento/cenario-conta.ts';

/**
 * Vínculo com o grupo (T21; ACE-41). Roda no Node, contra um banco `teste_*` migrado com o
 * cenário de conta (conta A no grupo A, conta B no grupo B), com o app como `pelada_app`.
 * Uma rota de teste em `/api/grupos/:grupoId/teste` mostra se a cadeia deixou passar.
 */

let aberto: CenarioContaAberto;
/** Grupo arquivado criado pela conta A, com a conta B também admin (não criadora). */
let grupoArquivado: string;

beforeAll(async () => {
  aberto = await abrirCenarioConta();
  const { db, cenario } = aberto;
  const r = await db.query<{ id: string }>(
    `INSERT INTO grupos (nome, slug, dia_semana, frequencia, horario, criado_por, criado_em, arquivado_em)
     VALUES ('Grupo Arquivado', 'grupo-arquivado', 'sabado', 'semanal', '09:00', $1, now(), now()) RETURNING id`,
    [cenario.contaA],
  );
  grupoArquivado = r.rows[0]!.id;
  await db.query(
    `INSERT INTO vinculos_admin (conta_id, grupo_id, criado_por, criado_em)
     VALUES ($1, $3, $1, now()), ($2, $3, $1, now())`,
    [cenario.contaA, cenario.contaB, grupoArquivado],
  );
});

afterAll(async () => {
  await aberto?.fechar();
});

async function sessao(db: pg.Client, conta: string): Promise<string> {
  const { token, hash } = await gerarToken();
  await db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  return token;
}

let chamadas = 0;

function montar() {
  const app = criarApp({
    fabricaBanco: fabricaComoApp().fabrica,
    registrarExtras: (api) => {
      api.on(['GET', 'POST', 'DELETE'], '/grupos/:grupoId/teste', (c) => {
        chamadas += 1;
        return c.json({ grupo: c.req.param('grupoId') });
      });
    },
  });
  return app;
}

async function pedir(grupo: string, token: string | null, metodo = 'GET'): Promise<Response> {
  const headers = new Headers({ 'x-pelada': '1' });
  if (token !== null) headers.set('cookie', `${NOME_COOKIE_SESSAO}=${token}`);
  const ctx = contextoFalso();
  const r = await montar().request(
    `/api/grupos/${grupo}/teste`,
    { method: metodo, headers },
    envCom(aberto.url),
    ctx,
  );
  await ctx.esperar();
  return r;
}

describe('exigirVinculo', () => {
  it('ACE-41: a conta A acessa a rota do próprio grupo', async () => {
    const { db, cenario } = aberto;
    const r = await pedir(cenario.grupoA, await sessao(db, cenario.contaA));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ grupo: cenario.grupoA });
  });

  it.each(['GET', 'POST', 'DELETE'])(
    'ACE-41: conta B em rota do grupo de A recebe 404 (%s), sem chamar o handler',
    async (metodo) => {
      const { db, cenario } = aberto;
      const antes = chamadas;
      const r = await pedir(cenario.grupoA, await sessao(db, cenario.contaB), metodo);
      expect(r.status).toBe(404);
      expect(await r.json()).toMatchObject({ codigo: 'nao_encontrado' });
      expect(chamadas).toBe(antes);
    },
  );

  it('ACE-41: grupo inexistente responde o mesmo 404 que o grupo de outra conta', async () => {
    const { db, cenario } = aberto;
    const token = await sessao(db, cenario.contaB);
    const inexistente = await pedir(randomUUID(), token);
    const deOutro = await pedir(cenario.grupoA, token);
    expect(inexistente.status).toBe(404);
    expect(await inexistente.json()).toEqual(await deOutro.json());
  });

  it.each(['nao-e-uuid', '123', "1' OR '1'='1"])(
    'ACE-41: grupoId que não é uuid (%s) responde 404, não 500',
    async (grupo) => {
      const { db, cenario } = aberto;
      const r = await pedir(encodeURIComponent(grupo), await sessao(db, cenario.contaA));
      expect(r.status).toBe(404);
    },
  );

  it('ACE-41: grupo arquivado de que a conta não é criadora responde 404', async () => {
    const { db, cenario } = aberto;
    const r = await pedir(grupoArquivado, await sessao(db, cenario.contaB));
    expect(r.status).toBe(404);
  });

  it('ACE-41: o grupo arquivado continua acessível à criadora', async () => {
    const { db, cenario } = aberto;
    const r = await pedir(grupoArquivado, await sessao(db, cenario.contaA));
    expect(r.status).toBe(200);
  });

  it('ACE-41: conta sem vínculo com grupo nenhum recebe 404', async () => {
    const { db, cenario } = aberto;
    const r = await pedir(cenario.grupoA, await sessao(db, cenario.contaSemVinculo));
    expect(r.status).toBe(404);
  });

  it('ACE-41: sem sessão, a rota de grupo responde 401 sessao_expirada antes do vínculo', async () => {
    const { cenario } = aberto;
    const r = await pedir(cenario.grupoA, null);
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ codigo: 'sessao_expirada' });
  });
});
