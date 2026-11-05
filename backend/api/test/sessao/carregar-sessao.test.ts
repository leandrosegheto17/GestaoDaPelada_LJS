import { Buffer } from 'node:buffer';
import type { Context } from 'hono';
import { sql } from 'kysely';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Ambiente } from '../../src/entrada/ambiente.ts';
import { criarApp } from '../../src/entrada/app.ts';
import { comBanco } from '../../src/entrada/middlewares/com-banco.ts';
import { exigirSessao } from '../../src/entrada/middlewares/sessao.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { contextoFalso, envCom, fabricaComoApp } from '../db/requisicao.ts';
import { comoApp } from '../isolamento/apoio.ts';
import { abrirCenarioConta, type CenarioContaAberto } from '../isolamento/cenario-conta.ts';

/**
 * Leitura da sessão antes do `comBanco` (T20; ACE-15, ACE-16, ACE-47, ACE-69). Roda no Node,
 * contra um banco `teste_*` migrado com o cenário de conta; o app conecta como `pelada_app`
 * (`fabricaComoApp`), como em produção. O cookie leva o token em texto e o banco guarda o
 * SHA-256 desse texto (ACE-10), por isso a sessão é gravada com o `gerarToken` da API.
 */

let aberto: CenarioContaAberto;

beforeAll(async () => {
  aberto = await abrirCenarioConta();
});

afterAll(async () => {
  await aberto?.fechar();
});

interface OpcoesSessaoTeste {
  escopo?: 'completo' | 'troca_de_senha';
  criadaEm?: string;
  ultimoUsoEm?: string;
  expiraEm?: string;
}

/** Grava, como superusuário, uma sessão com o hash do token em texto e devolve o token. */
async function sessao(
  db: pg.Client,
  conta: string,
  opcoes: OpcoesSessaoTeste = {},
): Promise<string> {
  const { token, hash } = await gerarToken();
  await db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, $3, ${opcoes.criadaEm ?? 'now()'}, ${opcoes.ultimoUsoEm ?? 'now()'},
             ${opcoes.expiraEm ?? "now() + interval '12 hours'"})`,
    [Buffer.from(hash), conta, opcoes.escopo ?? 'completo'],
  );
  return token;
}

async function existeSessao(db: pg.Client, token: string): Promise<boolean> {
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256').update(token, 'utf8').digest();
  const r = await db.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM sessoes WHERE token_hash = $1',
    [hash],
  );
  return (r.rows[0]?.n ?? 0) > 0;
}

interface Visto {
  conta: string;
  somente_leitura: string;
  papel: string;
}

function montar() {
  const comoAppFab = fabricaComoApp();
  const app = criarApp({
    fabricaBanco: comoAppFab.fabrica,
    registrarExtras: (api) => {
      api.use(
        '/teste/sessao/*',
        exigirSessao,
        comBanco(undefined, { fabrica: comoAppFab.fabrica }),
      );
      api.use('/teste/livre/*', comBanco(undefined, { fabrica: comoAppFab.fabrica }));
      const ver = async (c: Context<Ambiente>) => {
        const espera = Number(c.req.query('espera') ?? '0');
        const r = await sql<Visto>`
          SELECT s.conta, s.somente_leitura, s.papel FROM (
            SELECT current_setting('app.conta_id', true) AS conta,
                   current_setting('transaction_read_only') AS somente_leitura,
                   current_user::text AS papel,
                   pg_sleep(${espera}) AS dormiu
          ) AS s`.execute(c.var.db);
        return c.json(r.rows[0] ?? null);
      };
      api.get('/teste/sessao/contexto', ver);
      api.post('/teste/sessao/contexto', ver);
      api.get('/teste/livre/contexto', ver);
    },
  });
  return { app, conexoes: comoAppFab.criadas };
}

async function pedir(
  app: ReturnType<typeof montar>['app'],
  caminho: string,
  token: string | null,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('x-pelada', '1');
  if (token !== null) headers.set('cookie', `${NOME_COOKIE_SESSAO}=${token}`);
  const ctx = contextoFalso();
  const r = await app.request(`/api${caminho}`, { ...init, headers }, envCom(aberto.url), ctx);
  await ctx.esperar();
  return r;
}

/** O Set-Cookie vencido do `__Host-sessao`, se houver. */
function cookieVencido(r: Response): boolean {
  const valor = r.headers.get('set-cookie') ?? '';
  return valor.startsWith(`${NOME_COOKIE_SESSAO}=`) && /max-age=0/i.test(valor);
}

describe('carregarSessao e exigirSessao', () => {
  it('ACE-47: o app.conta_id da transação da rota é a conta da sessão já na primeira consulta, e GET continua READ ONLY', async () => {
    const { db, cenario } = aberto;
    const token = await sessao(db, cenario.contaA);
    const { app } = montar();
    const r = await pedir(app, '/teste/sessao/contexto', token);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      conta: cenario.contaA,
      somente_leitura: 'on',
      papel: 'pelada_app',
    });
  });

  it('ACE-47: POST abre a transação da rota de leitura e escrita, com a mesma conta', async () => {
    const { db, cenario } = aberto;
    const token = await sessao(db, cenario.contaB);
    const { app } = montar();
    const r = await pedir(app, '/teste/sessao/contexto', token, { method: 'POST' });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ conta: cenario.contaB, somente_leitura: 'off' });
  });

  it('ACE-15: a leitura da sessão renova o último uso', async () => {
    const { db, cenario } = aberto;
    const token = await sessao(db, cenario.contaA, {
      ultimoUsoEm: "now() - interval '10 minutes'",
    });
    const { app } = montar();
    const r = await pedir(app, '/teste/sessao/contexto', token);
    expect(r.status).toBe(200);
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256').update(token, 'utf8').digest();
    const uso = await db.query<{ recente: boolean }>(
      `SELECT ultimo_uso_em > now() - interval '1 minute' AS recente FROM sessoes WHERE token_hash = $1`,
      [hash],
    );
    expect(uso.rows[0]?.recente).toBe(true);
  });

  it('ACE-15: sessão com 14 min sem uso ainda vale', async () => {
    const { db, cenario } = aberto;
    const token = await sessao(db, cenario.contaA, {
      ultimoUsoEm: "now() - interval '14 minutes'",
    });
    const { app } = montar();
    const r = await pedir(app, '/teste/sessao/contexto', token);
    expect(r.status).toBe(200);
  });

  it('ACE-15: sessão com 15 min sem uso responde 401 sessao_expirada, vence o cookie e some do banco', async () => {
    const { db, cenario } = aberto;
    const token = await sessao(db, cenario.contaA, {
      ultimoUsoEm: "now() - interval '15 minutes 1 second'",
    });
    const { app } = montar();
    const r = await pedir(app, '/teste/sessao/contexto', token);
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ codigo: 'sessao_expirada' });
    expect(cookieVencido(r)).toBe(true);
    expect(await existeSessao(db, token)).toBe(false);
  });

  it('ACE-16: sessão criada há 12 h responde 401 sessao_expirada e vence o cookie, mesmo usada agora', async () => {
    const { db, cenario } = aberto;
    const token = await sessao(db, cenario.contaA, {
      criadaEm: "now() - interval '12 hours'",
      ultimoUsoEm: 'now()',
      expiraEm: 'now()',
    });
    const { app } = montar();
    const r = await pedir(app, '/teste/sessao/contexto', token);
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ codigo: 'sessao_expirada' });
    expect(cookieVencido(r)).toBe(true);
  });

  it('ACE-69: conta excluída com sessão aberta em outro aparelho: a próxima requisição recebe 401 sessao_expirada', async () => {
    const { db, cenario } = aberto;
    // A conta não confirmada não é admin de grupo: a exclusão passa.
    const outroAparelho = await sessao(db, cenario.contaNaoConfirmada);
    const { app } = montar();
    expect((await pedir(app, '/teste/sessao/contexto', outroAparelho)).status).toBe(200);

    const resultado = await comoApp(
      db,
      { conta: cenario.contaNaoConfirmada },
      async (c) =>
        (
          await c.query<{ resultado: string }>('SELECT resultado FROM conta_excluir($1)', [
            cenario.senhaNaoConfirmada,
          ])
        ).rows[0]?.resultado,
      { confirmar: true },
    );
    expect(resultado).toBe('ok');

    const r = await pedir(app, '/teste/sessao/contexto', outroAparelho);
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ codigo: 'sessao_expirada' });
    expect(cookieVencido(r)).toBe(true);
  });

  it('ACE-15: token desconhecido responde 401 sessao_expirada e vence o cookie', async () => {
    const { app } = montar();
    const r = await pedir(app, '/teste/sessao/contexto', 'token-que-nao-existe');
    expect(r.status).toBe(401);
    expect(cookieVencido(r)).toBe(true);
  });

  it('ACE-47: sessão de escopo troca_de_senha não vale numa rota comum', async () => {
    const { db, cenario } = aberto;
    const token = await sessao(db, cenario.contaA, { escopo: 'troca_de_senha' });
    const { app } = montar();
    const r = await pedir(app, '/teste/sessao/contexto', token);
    expect(r.status).toBe(401);
  });

  it('ACE-47: sem cookie, a rota com sessão responde 401 sem abrir conexão; a rota livre roda sem conta', async () => {
    const { app, conexoes } = montar();
    const r = await pedir(app, '/teste/sessao/contexto', null);
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ codigo: 'sessao_expirada' });
    expect(r.headers.get('set-cookie')).toBeNull();
    expect(conexoes()).toBe(0);

    const livre = await pedir(app, '/teste/livre/contexto', null);
    expect(livre.status).toBe(200);
    expect(await livre.json()).toMatchObject({ conta: '' });
  });

  it('ACE-47: 100 pares de requisições concorrentes de A e B nunca trocam o contexto', async () => {
    const { db, cenario } = aberto;
    const tokenA = await sessao(db, cenario.contaA);
    const tokenB = await sessao(db, cenario.contaB);
    const { app } = montar();
    for (let i = 0; i < 100; i += 1) {
      const [a, b] = await Promise.all([
        pedir(app, '/teste/sessao/contexto?espera=0.002', tokenA),
        pedir(app, '/teste/sessao/contexto?espera=0.002', tokenB),
      ]);
      expect(await a.json()).toMatchObject({ conta: cenario.contaA });
      expect(await b.json()).toMatchObject({ conta: cenario.contaB });
    }
  });

  it('ACE-47: banco fora na leitura da sessão responde 503 com a mensagem fixa', async () => {
    const { app } = montar();
    const ctx = contextoFalso();
    const r = await app.request(
      '/api/teste/sessao/contexto',
      { headers: { cookie: `${NOME_COOKIE_SESSAO}=qualquer` } },
      envCom('postgres://ninguem:nada@127.0.0.1:1/nada'),
      ctx,
    );
    await ctx.esperar();
    expect(r.status).toBe(503);
    expect(JSON.stringify(await r.json())).not.toContain('127.0.0.1');
  });
});
