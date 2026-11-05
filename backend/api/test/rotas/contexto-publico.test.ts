import { Buffer } from 'node:buffer';
import { sql } from 'kysely';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Env, LimiteDeTaxa } from '../../src/entrada/ambiente.ts';
import { criarApp } from '../../src/entrada/app.ts';
import { SLUG_PUBLICO } from '../../src/entrada/middlewares/contexto-publico.ts';
import { MENSAGEM_LIMITE } from '../../src/entrada/middlewares/limite-taxa.ts';
import type { ConexaoPg } from '../../src/infraestrutura/db/cliente.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso } from '../db/requisicao.ts';
import { abrirCenario, type CenarioAberto } from '../isolamento/apoio.ts';

/**
 * `contextoPublico` e `LIMITE_PUBLICO` em `/api/publico/:slug/*` (partidas-e-ranking T37; PAR-77, PAR-78, PAR-90,
 * AD-034, AD-045), com o app real como `pelada_app` e as conexões contadas. Uma rota de teste,
 * `GET /api/publico/:slug/teste-contexto`, devolve o que a transação vê: a conta e o slug da RLS, a conta do contexto
 * da requisição e os grupos visíveis.
 *
 * Casos limite: admin logado do grupo A no slug de B; slug com maiúscula, sublinhado, espaço, acento, 65 caracteres;
 * slug de 64 caracteres (válido); binding que nega, com e sem sessão; IP fora do log.
 */

let aberto: CenarioAberto;
let conexoes = 0;

function fabricaContada(connectionString: string): ConexaoPg {
  const c = new pg.Client({ connectionString });
  return {
    connect: async () => {
      conexoes += 1;
      await c.connect();
      await c.query('SET ROLE pelada_app');
    },
    end: () => c.end(),
    query: (texto, valores) => c.query(texto, valores),
  };
}

let chamadas = 0;

const app = criarApp({
  fabricaBanco: fabricaContada,
  registrarExtras: (api) => {
    api.get('/publico/:slug/teste-contexto', async (c) => {
      chamadas += 1;
      const ctx = await sql<{ conta: string; slug: string }>`
        SELECT current_setting('app.conta_id', true) AS conta, current_setting('app.slug_publico', true) AS slug`.execute(
        c.var.db,
      );
      const grupos = await sql<{ id: string }>`SELECT id::text AS id FROM grupos ORDER BY id`.execute(c.var.db);
      return c.json(
        {
          contaDaRequisicao: c.var.contaId ?? null,
          contaNoBanco: ctx.rows[0]?.conta ?? null,
          slugNoBanco: ctx.rows[0]?.slug ?? null,
          grupos: grupos.rows.map((g) => g.id),
        },
        200,
      );
    });
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

interface Pedido {
  token?: string;
  ip?: string;
  env?: Partial<Env>;
}

async function pedir(slug: string, pedido: Pedido = {}): Promise<Response> {
  const headers = new Headers();
  if (pedido.token) headers.set('cookie', `${NOME_COOKIE_SESSAO}=${pedido.token}`);
  if (pedido.ip) headers.set('cf-connecting-ip', pedido.ip);
  const ctx = contextoFalso();
  const r = await app.request(
    `/api/publico/${slug}/teste-contexto`,
    { method: 'GET', headers },
    envAcesso(aberto.url, pedido.env ?? {}),
    ctx,
  );
  await ctx.esperar();
  return r;
}

/** Binding que registra as chaves e devolve `sucesso`. */
function binding(sucesso: boolean): LimiteDeTaxa & { chaves: string[] } {
  const chaves: string[] = [];
  return {
    chaves,
    limit: async ({ key }) => {
      chaves.push(key);
      return { success: sucesso };
    },
  };
}

/** Captura todas as linhas de log do console durante `fn` (molde `rotas/acesso-cabecalhos.test.ts:111`). */
async function capturarLogs(fn: () => Promise<void>): Promise<string[]> {
  const linhas: string[] = [];
  const guardar = (...args: unknown[]) => {
    linhas.push(args.map((a) => (typeof a === 'string' ? a : (JSON.stringify(a) ?? String(a)))).join(' '));
  };
  for (const metodo of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, metodo).mockImplementation(guardar);
  }
  await fn();
  return linhas;
}

beforeAll(async () => {
  aberto = await abrirCenario();
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('contextoPublico com slug válido', () => {
  it('PAR-77: admin logado do grupo A abre o slug do grupo B e recebe os dados de B (a conta foi apagada)', async () => {
    const { cenario } = aberto;
    const r = await pedir(cenario.slugB, { token: await sessao(cenario.contaA) });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      contaDaRequisicao: null,
      contaNoBanco: '',
      slugNoBanco: cenario.slugB,
      grupos: [cenario.grupoB],
    });
  });

  it('PAR-77: o mesmo admin no slug do próprio grupo A vê só A, pelo slug e não pela conta', async () => {
    const { cenario } = aberto;
    const r = await pedir(cenario.slugA, { token: await sessao(cenario.contaA) });
    expect(await r.json()).toMatchObject({ contaNoBanco: '', slugNoBanco: cenario.slugA, grupos: [cenario.grupoA] });
  });

  it('PAR-77: visitante sem sessão vê o grupo do slug', async () => {
    const { cenario } = aberto;
    const r = await pedir(cenario.slugB);
    expect(await r.json()).toMatchObject({ contaDaRequisicao: null, grupos: [cenario.grupoB] });
  });

  it('PAR-90: slug de 64 caracteres no formato passa ao banco', async () => {
    const antes = conexoes;
    const r = await pedir('a'.repeat(64));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ grupos: [] });
    expect(conexoes).toBe(antes + 1);
  });
});

describe('contextoPublico com slug malformado', () => {
  it.each([
    ['maiúscula', 'Grupo-A'],
    ['sublinhado', 'grupo_a'],
    ['espaço', 'grupo%20a'],
    ['acento', 'pelada-s%C3%A3o'],
    ['ponto', 'grupo.a'],
    ['65 caracteres', 'a'.repeat(65)],
  ])('PAR-90: slug com %s responde 404 nao_encontrado sem abrir conexão nem chamar a rota', async (_nome, slug) => {
    const antesConexoes = conexoes;
    const antesChamadas = chamadas;
    const r = await pedir(slug);
    expect(r.status).toBe(404);
    expect(await r.json()).toMatchObject({ codigo: 'nao_encontrado' });
    expect(conexoes).toBe(antesConexoes);
    expect(chamadas).toBe(antesChamadas);
  });

  it.each([
    ['grupo-a', true],
    ['a', true],
    ['0-9', true],
    ['', false],
    ['Grupo', false],
    ['grupo_a', false],
    ['a'.repeat(64), true],
    ['a'.repeat(65), false],
  ] as const)('PAR-90: SLUG_PUBLICO aceita %j = %s', (slug, esperado) => {
    expect(SLUG_PUBLICO.test(slug)).toBe(esperado);
  });
});

describe('LIMITE_PUBLICO nas rotas públicas', () => {
  it('PAR-78: binding que nega gera 429 com a mensagem, sem abrir conexão nem chamar a rota', async () => {
    const nega = binding(false);
    const antesConexoes = conexoes;
    const antesChamadas = chamadas;
    const r = await pedir(aberto.cenario.slugA, { ip: '203.0.113.77', env: { LIMITE_PUBLICO: nega } });
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ erro: MENSAGEM_LIMITE });
    expect(MENSAGEM_LIMITE).toBe('Muitas requisições. Tente de novo em instantes.');
    expect(r.headers.get('retry-after')).toBe('60');
    expect(nega.chaves).toEqual(['203.0.113.77']);
    expect(conexoes).toBe(antesConexoes);
    expect(chamadas).toBe(antesChamadas);
  });

  it('PAR-78: o limite vale também para o slug malformado (a cota é por IP, antes do slug)', async () => {
    const nega = binding(false);
    const r = await pedir('Grupo-A', { ip: '203.0.113.78', env: { LIMITE_PUBLICO: nega } });
    expect(r.status).toBe(429);
    expect(nega.chaves).toEqual(['203.0.113.78']);
  });

  it('PAR-78: binding que permite deixa passar e gasta a cota do IP uma vez', async () => {
    const permite = binding(true);
    const r = await pedir(aberto.cenario.slugA, { ip: '203.0.113.79', env: { LIMITE_PUBLICO: permite } });
    expect(r.status).toBe(200);
    expect(permite.chaves).toEqual(['203.0.113.79']);
  });

  it('PAR-78: o IP não aparece em nenhuma linha de log, no 429 nem no 200', async () => {
    const ip = '198.51.100.201';
    const linhas = await capturarLogs(async () => {
      await pedir(aberto.cenario.slugA, { ip, env: { LIMITE_PUBLICO: binding(false) } });
      await pedir(aberto.cenario.slugA, { ip, env: { LIMITE_PUBLICO: binding(true) } });
    });
    for (const linha of linhas) expect(linha).not.toContain(ip);
  });

  it('PAR-78: as rotas de grupo não gastam a cota pública', async () => {
    const conta = binding(true);
    const ctx = contextoFalso();
    await app.request(
      `/api/grupos/${aberto.cenario.grupoA}`,
      { method: 'GET', headers: { 'cf-connecting-ip': '203.0.113.80' } },
      envAcesso(aberto.url, { LIMITE_PUBLICO: conta }),
      ctx,
    );
    await ctx.esperar();
    expect(conta.chaves).toEqual([]);
  });
});
