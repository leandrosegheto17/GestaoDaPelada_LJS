/**
 * Casos limite e estados do `comBanco` (T38, FUN-16), listados antes do código:
 *  1. GET e HEAD abrem `READ ONLY`: escrever falha com 25006.
 *  2. POST (e demais métodos) abre leitura e escrita e faz COMMIT com status < 400 (inclui 3xx).
 *  3. Status 4xx e 5xx fazem ROLLBACK, e uma exceção da rota também.
 *  4. O contexto (`app.conta_id`, `app.slug_publico`) é definido antes da primeira consulta da rota.
 *  5. Duas requisições simultâneas de contas diferentes nunca enxergam o contexto uma da outra.
 *  6. Sem contexto, as duas variáveis ficam vazias (e a RLS devolve zero linhas, FUN-15).
 *  7. Rota que não consulta o banco não abre conexão nem faz BEGIN.
 *  8. A rota não controla a transação: BEGIN, COMMIT, ROLLBACK e SAVEPOINT são recusados.
 *  9. `c.var.db` usado depois do fim da requisição é recusado.
 */
import { env } from 'cloudflare:workers';
import type { Context } from 'hono';
import { sql, type Kysely } from 'kysely';
import type pg from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarApp, type AppEnv } from '../../src/entrada/app.ts';
import { comBanco, type VariaveisDoBanco } from '../../src/entrada/middlewares/com-banco.ts';
import type { Banco } from '../../src/infraestrutura/db/banco.ts';
import { criarClienteLazy } from '../../src/infraestrutura/db/cliente.ts';

type Db = Kysely<Banco>;
type Ctx = Context<AppEnv & { Variables: VariaveisDoBanco }>;

let vazado: Db | undefined;
const appName = 'teste-com-banco';

const inserir = (c: Ctx) =>
  sql`insert into teste_escrita (valor) values (${c.req.header('x-valor')})`.execute(c.var.db);

const app = criarApp((a) => {
  a.use(
    '/api/t/*',
    comBanco((c) => ({ contaId: c.req.header('x-conta'), slugPublico: c.req.header('x-slug') }), {
      applicationName: appName,
    }),
  );
  const rota = a as unknown as {
    get: (caminho: string, h: (c: Ctx) => Response | Promise<Response>) => void;
    post: (caminho: string, h: (c: Ctx) => Response | Promise<Response>) => void;
  };
  rota.get('/api/t/contexto', async (c) => {
    const { rows } = await sql<{ conta: string; slug: string }>`
      select current_setting('app.conta_id') as conta, current_setting('app.slug_publico') as slug,
             pg_sleep(random() * 0.02)`.execute(c.var.db);
    return c.json(rows[0]);
  });
  rota.get('/api/t/escreve', async (c) => {
    try {
      await sql`insert into teste_escrita (valor) values ('na-leitura')`.execute(c.var.db);
      return c.json({ codigo: null });
    } catch (e) {
      return c.json({ codigo: (e as { code?: string }).code });
    }
  });
  rota.post('/api/t/ok', async (c) => {
    await inserir(c);
    return c.json({ ok: true }, 201);
  });
  rota.post('/api/t/redireciona', async (c) => {
    await inserir(c);
    return c.redirect('/api/t/ok', 302);
  });
  rota.post('/api/t/recusa', async (c) => {
    await inserir(c);
    return c.json({ erro: 'recusado' }, 422);
  });
  rota.post('/api/t/falha', async (c) => {
    await inserir(c);
    return c.json({ erro: 'falha' }, 500);
  });
  rota.post('/api/t/excecao', async (c) => {
    await inserir(c);
    throw new Error('quebrou depois de escrever');
  });
  rota.get('/api/t/sem-consulta', (c) => c.json({ ok: true }));
  rota.post('/api/t/controla', async (c) => {
    await inserir(c);
    await sql.raw(c.req.header('x-comando')!).execute(c.var.db);
    return c.json({ ok: true });
  });
  rota.post('/api/t/transacao-kysely', async (c) => {
    await c.var.db.transaction().execute(async (trx) => {
      await sql`insert into teste_escrita (valor) values (${c.req.header('x-valor')})`.execute(trx);
    });
    return c.json({ ok: true });
  });
  rota.get('/api/t/vaza', (c) => {
    vazado = c.var.db;
    return c.json({ ok: true });
  });
});

/** Chama o app e espera tudo o que a rota agendou no `waitUntil`, como o runtime faria. */
async function chamar(caminho: string, init: RequestInit = {}) {
  const pendentes: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (p: Promise<unknown>) => void pendentes.push(p),
    passThroughOnException: () => undefined,
  } as unknown as ExecutionContext;
  // a rota que lança é registrada pelo console.error do Hono; o teste confere o efeito, não o log
  const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const r = await app.request(caminho, init, env, ctx);
  erro.mockRestore();
  const corpo = await r.text();
  await Promise.all(pendentes);
  return { r, corpo };
}

async function comObservador<T>(corpo: (c: pg.Client) => Promise<T>): Promise<T> {
  const lazy = criarClienteLazy(() => env.HYPERDRIVE.connectionString);
  try {
    return await corpo(await lazy.conectar());
  } finally {
    await lazy.fechar();
  }
}
const gravados = (valor: string) =>
  comObservador(async (c) => {
    const { rows } = await c.query<{ n: string }>(
      'select count(*) as n from teste_escrita where valor = $1',
      [valor],
    );
    return Number(rows[0]!.n);
  });
const sessoes = () =>
  comObservador(async (c) => {
    const { rows } = await c.query<{ n: string }>(
      'select count(*) as n from pg_stat_activity where application_name = $1',
      [appName],
    );
    return Number(rows[0]!.n);
  });

let seq = 0;
const valorUnico = () => `v-${Date.now()}-${seq++}`;

beforeEach(() => {
  vazado = undefined;
});

describe('comBanco: transação por requisição (FUN-16)', () => {
  it('FUN-16: o contexto está definido antes da primeira consulta da rota', async () => {
    const { r, corpo } = await chamar('/api/t/contexto', {
      headers: { 'x-conta': 'conta-a', 'x-slug': 'slug-a' },
    });
    expect(r.status).toBe(200);
    expect(JSON.parse(corpo)).toMatchObject({ conta: 'conta-a', slug: 'slug-a' });
  });

  it('FUN-16: sem contexto, as duas variáveis ficam vazias', async () => {
    const { corpo } = await chamar('/api/t/contexto');
    expect(JSON.parse(corpo)).toMatchObject({ conta: '', slug: '' });
  });

  it('FUN-16: o contexto não passa da transação (SET LOCAL): a próxima requisição não herda', async () => {
    await chamar('/api/t/contexto', { headers: { 'x-conta': 'conta-a' } });
    const { corpo } = await chamar('/api/t/contexto');
    expect(JSON.parse(corpo)).toMatchObject({ conta: '' });
  });

  it('FUN-16: duas requisições concorrentes (conta A e conta B) nunca enxergam o contexto uma da outra, em 100 repetições', async () => {
    for (let i = 0; i < 100; i++) {
      const [a, b] = await Promise.all([
        chamar('/api/t/contexto', { headers: { 'x-conta': `A-${i}`, 'x-slug': `sa-${i}` } }),
        chamar('/api/t/contexto', { headers: { 'x-conta': `B-${i}`, 'x-slug': `sb-${i}` } }),
      ]);
      expect(JSON.parse(a.corpo)).toMatchObject({ conta: `A-${i}`, slug: `sa-${i}` });
      expect(JSON.parse(b.corpo)).toMatchObject({ conta: `B-${i}`, slug: `sb-${i}` });
    }
  });

  it('FUN-16: escrita numa rota GET falha por transação somente leitura', async () => {
    const { corpo } = await chamar('/api/t/escreve');
    expect(JSON.parse(corpo)).toEqual({ codigo: '25006' });
  });

  it('FUN-16: HEAD também é somente leitura', async () => {
    const { r } = await chamar('/api/t/escreve', { method: 'HEAD' });
    expect(r.status).toBe(200);
    expect(await gravados('na-leitura')).toBe(0);
  });

  it('FUN-16: POST com status < 400 confirma a escrita', async () => {
    const valor = valorUnico();
    const { r } = await chamar('/api/t/ok', { method: 'POST', headers: { 'x-valor': valor } });
    expect(r.status).toBe(201);
    expect(await gravados(valor)).toBe(1);
  });

  it('FUN-16: redirecionamento (3xx) também confirma', async () => {
    const valor = valorUnico();
    const { r } = await chamar('/api/t/redireciona', {
      method: 'POST',
      headers: { 'x-valor': valor },
    });
    expect(r.status).toBe(302);
    expect(await gravados(valor)).toBe(1);
  });

  it.each([
    ['422 (4xx)', '/api/t/recusa', 422],
    ['500 devolvido pela rota', '/api/t/falha', 500],
    ['exceção da rota', '/api/t/excecao', 500],
  ] as const)('FUN-16: %s desfaz a escrita', async (_nome, caminho, status) => {
    const valor = valorUnico();
    const { r } = await chamar(caminho, { method: 'POST', headers: { 'x-valor': valor } });
    expect(r.status).toBe(status);
    expect(await gravados(valor)).toBe(0);
  });

  it('FUN-16: erro 500 desfaz a escrita e não vaza a mensagem da exceção', async () => {
    const valor = valorUnico();
    const { corpo } = await chamar('/api/t/excecao', {
      method: 'POST',
      headers: { 'x-valor': valor },
    });
    expect(corpo).not.toContain('quebrou depois de escrever');
    expect(await gravados(valor)).toBe(0);
  });

  it('FUN-16: rota que não consulta o banco não abre conexão', async () => {
    const antes = await sessoes();
    const { r } = await chamar('/api/t/sem-consulta');
    expect(r.status).toBe(200);
    expect(await sessoes()).toBe(antes);
  });

  it('FUN-16: depois da resposta a conexão está fechada', async () => {
    await chamar('/api/t/contexto', { headers: { 'x-conta': 'conta-a' } });
    expect(await sessoes()).toBe(0);
  });

  it.each(['commit', 'rollback', 'begin', 'savepoint x', '  /* c */ COMMIT'])(
    'FUN-16: a rota não controla a transação (%s é recusado e nada é gravado)',
    async (comando) => {
      const valor = valorUnico();
      const { r } = await chamar('/api/t/controla', {
        method: 'POST',
        headers: { 'x-valor': valor, 'x-comando': comando },
      });
      expect(r.status).toBe(500);
      expect(await gravados(valor)).toBe(0);
    },
  );

  it('FUN-16: db.transaction() do Kysely é recusado dentro da requisição', async () => {
    const valor = valorUnico();
    const { r } = await chamar('/api/t/transacao-kysely', {
      method: 'POST',
      headers: { 'x-valor': valor },
    });
    expect(r.status).toBe(500);
    expect(await gravados(valor)).toBe(0);
  });

  it('FUN-16: o db usado depois do fim da requisição é recusado', async () => {
    await chamar('/api/t/vaza');
    await expect(sql`select 1`.execute(vazado!)).rejects.toThrow();
  });
});
