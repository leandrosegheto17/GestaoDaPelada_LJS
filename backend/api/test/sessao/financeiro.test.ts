import { Buffer } from 'node:buffer';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarApp } from '../../src/entrada/app.ts';
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
 * `exigirFinanceiro` (T23; FIN-33, FIN-37; AD-077), contra o cenário de grupos (C criadora de G com acesso, O admin de
 * G sem acesso, B só do grupo H), com o app real como `pelada_app`. Rotas de teste em `…/financeiro/teste` (GET, POST,
 * PUT, PATCH, DELETE), `…/admins/:contaId/financeiro` (PATCH) e `…/teste` (fora da trava) mostram se a cadeia deixou
 * passar e se a rota viu `acessaFinanceiro`.
 *
 * Casos limite: com acesso passa; sem acesso 403 em todo método; sem vínculo 404 antes; arquivado 409 antes na escrita,
 * também para quem não tem acesso; leitura de arquivado pela criadora passa; rota fora do financeiro não é travada.
 */

const MENSAGEM = 'Você não tem acesso ao financeiro deste grupo.';
const METODOS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

let aberto: CenarioGruposAberto;
let chamadas = 0;
let visto: boolean | undefined;

function montar() {
  return criarApp({
    fabricaBanco: fabricaComoApp().fabrica,
    registrarExtras: (api) => {
      const responder = (c: {
        var: { acessaFinanceiro?: boolean };
        json: (v: unknown, s: 200) => Response;
      }) => {
        chamadas += 1;
        visto = c.var.acessaFinanceiro;
        return c.json({ ok: true }, 200);
      };
      api.on([...METODOS], '/grupos/:grupoId/financeiro/teste', (c) => responder(c));
      api.patch('/grupos/:grupoId/admins/:contaId/financeiro', (c) => responder(c));
      api.on(['GET', 'POST'], '/grupos/:grupoId/teste', (c) => responder(c));
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

async function pedir(caminho: string, conta: string, metodo: string): Promise<Response> {
  const headers = new Headers({
    'x-pelada': '1',
    cookie: `${NOME_COOKIE_SESSAO}=${await sessao(conta)}`,
  });
  const comCorpo = metodo !== 'GET' && metodo !== 'HEAD';
  if (comCorpo) headers.set('content-type', 'application/json');
  const ctx = contextoFalso();
  const r = await montar().request(
    `/api${caminho}`,
    { method: metodo, headers, ...(comCorpo ? { body: '{}' } : {}) },
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
  visto = undefined;
  await reativar(aberto.db, aberto.cenario.grupoG);
});

describe('exigirFinanceiro', () => {
  it.each(METODOS)('FIN-33: %s com acesso passa e a rota vê acessaFinanceiro', async (metodo) => {
    const { cenario } = aberto;
    const antes = chamadas;
    const r = await pedir(`/grupos/${cenario.grupoG}/financeiro/teste`, cenario.contaC, metodo);
    expect(r.status).toBe(200);
    expect(chamadas).toBe(antes + 1);
    expect(visto).toBe(true);
  });

  it.each(METODOS)(
    'FIN-33: %s de admin sem acesso dá 403 sem_permissao_financeiro sem chamar a rota',
    async (metodo) => {
      const { cenario } = aberto;
      const antes = chamadas;
      const r = await pedir(`/grupos/${cenario.grupoG}/financeiro/teste`, cenario.contaO, metodo);
      expect(r.status).toBe(403);
      expect(await r.json()).toEqual({ erro: MENSAGEM, codigo: 'sem_permissao_financeiro' });
      expect(chamadas).toBe(antes);
    },
  );

  it('FIN-33: PATCH de admins/:contaId/financeiro também é travado', async () => {
    const { cenario } = aberto;
    const r = await pedir(
      `/grupos/${cenario.grupoG}/admins/${cenario.contaC}/financeiro`,
      cenario.contaO,
      'PATCH',
    );
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ codigo: 'sem_permissao_financeiro' });
    const ok = await pedir(
      `/grupos/${cenario.grupoG}/admins/${cenario.contaO}/financeiro`,
      cenario.contaC,
      'PATCH',
    );
    expect(ok.status).toBe(200);
  });

  it.each(['GET', 'POST'])(
    'FIN-33: sem vínculo, o 404 do exigirVinculo vem antes (%s)',
    async (metodo) => {
      const { cenario } = aberto;
      const antes = chamadas;
      const r = await pedir(`/grupos/${cenario.grupoG}/financeiro/teste`, cenario.contaB, metodo);
      expect(r.status).toBe(404);
      expect(chamadas).toBe(antes);
    },
  );

  it('FIN-37, AD-077: escrita em arquivado dá 409 antes, também para quem não tem acesso', async () => {
    const { cenario } = aberto;
    await arquivar(aberto.db, cenario.grupoG);
    const daCriadora = await pedir(
      `/grupos/${cenario.grupoG}/financeiro/teste`,
      cenario.contaC,
      'POST',
    );
    expect(daCriadora.status).toBe(409);
    expect(await daCriadora.json()).toMatchObject({ codigo: 'grupo_arquivado' });
    // Para a não criadora, o arquivado some pela RLS: 404 antes de tudo.
    const daOutra = await pedir(
      `/grupos/${cenario.grupoG}/financeiro/teste`,
      cenario.contaO,
      'POST',
    );
    expect(daOutra.status).toBe(404);
  });

  it('FIN-37: leitura de arquivado pela criadora com acesso passa', async () => {
    const { cenario } = aberto;
    await arquivar(aberto.db, cenario.grupoG);
    const r = await pedir(`/grupos/${cenario.grupoG}/financeiro/teste`, cenario.contaC, 'GET');
    expect(r.status).toBe(200);
  });

  it.each(['GET', 'POST'])(
    'FIN-33: %s numa rota do grupo fora do financeiro não é travado para quem não tem acesso',
    async (metodo) => {
      const { cenario } = aberto;
      const r = await pedir(`/grupos/${cenario.grupoG}/teste`, cenario.contaO, metodo);
      expect(r.status).toBe(200);
    },
  );
});
