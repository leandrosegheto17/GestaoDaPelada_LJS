import { Buffer } from 'node:buffer';
import type { Context } from 'hono';
import pg from 'pg';
import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Ambiente } from '../../src/entrada/ambiente.ts';
import { criarApp } from '../../src/entrada/app.ts';
import { ehPrevia, transacaoSomenteLeitura } from '../../src/entrada/middlewares/com-banco.ts';
import type { ConexaoPg } from '../../src/infraestrutura/db/cliente.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso } from '../db/requisicao.ts';
import { abrirCenarioGrupos, arquivar, reativar, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * Prévias em transação somente leitura (partidas-e-ranking T36; PAR-109, PAR-110, PAR-111, PAR-112, AD-035), com o
 * app real como `pelada_app` e as consultas registradas (molde `sessao/grupo-ativo.test.ts:27`).
 *
 * Duas rotas de teste fazem o mesmo INSERT de prova numa habilidade de G: `…/teste-ro/previa` (com o sufixo) e
 * `…/teste-ro/gravar` (sem). A rota devolve o código do erro do banco quando o INSERT falha, para o teste ver o
 * motivo (25006, `read_only_sql_transaction`) em vez de um 500 genérico.
 *
 * Casos limite: prévia em grupo ativo (INSERT recusado, leitura sem `FOR KEY SHARE`); prévia em grupo arquivado
 * (409 sem chamar a rota); rota sem o sufixo (BEGIN de escrita, INSERT gravado, `FOR KEY SHARE` mantido); sufixo
 * parecido (`/previas`, `/previa/`, `/previa/x`) não vale.
 */

let aberto: CenarioGruposAberto;
const consultas: string[] = [];
let chamadas = 0;

function fabricaEspiada(connectionString: string): ConexaoPg {
  const c = new pg.Client({ connectionString });
  return {
    connect: async () => {
      await c.connect();
      await c.query('SET ROLE pelada_app');
    },
    end: () => c.end(),
    query: (texto, valores) => {
      consultas.push(texto);
      return c.query(texto, valores);
    },
  };
}

const NOME_PROVA = 'Prova RO';

const app = criarApp({
  fabricaBanco: fabricaEspiada,
  registrarExtras: (api) => {
    const inserir = async (c: Context<Ambiente>) => {
      chamadas += 1;
      const grupoId = c.req.param('grupoId') ?? '';
      try {
        await sql`INSERT INTO habilidades (grupo_id, nome) VALUES (${grupoId}, ${NOME_PROVA})`.execute(c.var.db);
        return c.json({ gravou: true, codigo: null }, 200);
      } catch (erro) {
        return c.json({ gravou: false, codigo: (erro as { code?: string }).code ?? null }, 200);
      }
    };
    api.post('/grupos/:grupoId/teste-ro/previa', inserir);
    api.post('/grupos/:grupoId/teste-ro/gravar', inserir);
  },
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

async function pedir(caminho: string): Promise<Response> {
  const headers = new Headers({
    'x-pelada': '1',
    'content-type': 'application/json',
    cookie: `${NOME_COOKIE_SESSAO}=${await sessao(aberto.cenario.contaC)}`,
  });
  consultas.length = 0;
  const ctx = contextoFalso();
  const r = await app.request(
    `/api/grupos/${aberto.cenario.grupoG}${caminho}`,
    { method: 'POST', headers, body: '{}' },
    envAcesso(aberto.url),
    ctx,
  );
  await ctx.esperar();
  return r;
}

async function habilidadesDeProva(): Promise<number> {
  const r = await aberto.db.query('SELECT 1 FROM habilidades WHERE grupo_id = $1 AND nome = $2', [
    aberto.cenario.grupoG,
    NOME_PROVA,
  ]);
  return r.rowCount ?? 0;
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

beforeEach(async () => {
  await reativar(aberto.db, aberto.cenario.grupoG);
  await aberto.db.query('DELETE FROM habilidades WHERE grupo_id = $1 AND nome = $2', [aberto.cenario.grupoG, NOME_PROVA]);
});

describe('prévia em transação somente leitura', () => {
  it('PAR-109: um INSERT de prova dentro de uma rota /previa falha com read_only_sql_transaction', async () => {
    const r = await pedir('/teste-ro/previa');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ gravou: false, codigo: '25006' });
    expect(await habilidadesDeProva()).toBe(0);
    expect(consultas).toContain('BEGIN TRANSACTION READ ONLY');
    expect(consultas).not.toContain('BEGIN');
  });

  it('PAR-112: prévia em grupo ativo lê arquivado_em sem FOR KEY SHARE (o Postgres o recusaria)', async () => {
    await pedir('/teste-ro/previa');
    const leitura = consultas.find((s) => /arquivado_em/.test(s) && /FROM grupos/.test(s));
    expect(leitura).toBeDefined();
    expect(leitura).not.toMatch(/FOR (KEY )?SHARE|FOR UPDATE/);
  });

  it('PAR-112: prévia em grupo arquivado responde 409 grupo_arquivado, sem chamar a rota', async () => {
    await arquivar(aberto.db, aberto.cenario.grupoG);
    const antes = chamadas;
    const r = await pedir('/teste-ro/previa');
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ codigo: 'grupo_arquivado' });
    expect(chamadas).toBe(antes);
  });
});

describe('rota sem o sufixo /previa', () => {
  it('PAR-109: continua com transação de escrita: BEGIN, INSERT gravado e FOR KEY SHARE na leitura do grupo', async () => {
    try {
      const r = await pedir('/teste-ro/gravar');
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ gravou: true, codigo: null });
      expect(await habilidadesDeProva()).toBe(1);
      expect(consultas).toContain('BEGIN');
      expect(consultas).not.toContain('BEGIN TRANSACTION READ ONLY');
      const leitura = consultas.find((s) => /arquivado_em/.test(s) && /FROM grupos/.test(s));
      expect(leitura).toMatch(/FOR KEY SHARE/);
    } finally {
      await aberto.db.query('DELETE FROM habilidades WHERE grupo_id = $1 AND nome = $2', [
        aberto.cenario.grupoG,
        NOME_PROVA,
      ]);
    }
  });

  it('PAR-112: escrita sem o sufixo em grupo arquivado continua dando 409', async () => {
    await arquivar(aberto.db, aberto.cenario.grupoG);
    const r = await pedir('/teste-ro/gravar');
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ codigo: 'grupo_arquivado' });
  });
});

describe('transacaoSomenteLeitura', () => {
  it.each([
    ['GET', '/api/grupos/g/partidas', true],
    ['get', '/api/grupos/g', true],
    ['HEAD', '/api/grupos/g', true],
    ['POST', '/api/grupos/g/jogadores/j/reativar/previa', true],
    ['post', '/api/grupos/g/jogadores/j/periodos/p/previa', true],
    ['PUT', '/api/grupos/g/inicio/previa', true],
    ['POST', '/api/grupos/g/jogadores/j/reativar', false],
    ['POST', '/api/grupos/g/teste/previas', false],
    ['POST', '/api/grupos/g/teste/previa/', false],
    ['POST', '/api/grupos/g/teste/previa/x', false],
    ['PATCH', '/api/grupos/g', false],
    ['DELETE', '/api/grupos/g/partidas/2026-03-05', false],
  ] as const)('PAR-109: %s %s é somente leitura = %s', (metodo, caminho, esperado) => {
    expect(transacaoSomenteLeitura(metodo, caminho)).toBe(esperado);
  });

  it('PAR-109: ehPrevia só aceita o sufixo exato', () => {
    expect(ehPrevia('/api/x/previa')).toBe(true);
    expect(ehPrevia('/api/x/previa/')).toBe(false);
    expect(ehPrevia('/api/xprevia')).toBe(false);
  });
});
