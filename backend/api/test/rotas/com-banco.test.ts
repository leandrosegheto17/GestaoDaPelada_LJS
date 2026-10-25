import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import type { Hono } from 'hono';
import { sql } from 'kysely';
import { describe, expect, it, vi } from 'vitest';
import { criarApp, type AppEnv } from '../../src/entrada/app.ts';
import type { Db } from '../../src/infraestrutura/db/index.ts';
import { chamar, SEM_LIMITE } from '../apoio/cliente.ts';
import { GRUPO_A, GRUPO_B } from '../apoio/cenario-dois-grupos.ts';

// O Worker de teste conecta pelo Hyperdrive do miniflare direto como pelada_app (vitest.config e setup-worker.ts).

const linhas = async <T>(db: Db, consulta: ReturnType<typeof sql<T>>): Promise<T[]> =>
  (await consulta.execute(db)).rows;

/**
 * Rotas de teste. O contexto de RLS vem dos cabeçalhos `X-Teste-Conta` e `X-Teste-Slug`, gravados em `contaId` e
 * `slugPublico` por um middleware que roda depois do `comBanco`: o contexto só é lido na primeira consulta.
 */
function rotas(app: Hono<AppEnv>): void {
  app.use('/api/teste/*', async (c, proximo) => {
    const conta = c.req.header('X-Teste-Conta');
    const slug = c.req.header('X-Teste-Slug');
    if (conta) c.set('contaId', conta);
    if (slug) c.set('slugPublico', slug);
    await proximo();
  });

  const estado = async (db: Db) => {
    const [linha] = await linhas(
      db,
      sql<{
        usuario: string;
        sessao: string;
        bypass: boolean;
        somente_leitura: string;
        conta: string;
        slug: string;
        em_transacao: boolean;
      }>`SELECT current_user AS usuario, session_user AS sessao,
                (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass,
                current_setting('transaction_read_only') AS somente_leitura,
                current_setting('app.conta_id', true) AS conta,
                current_setting('app.slug_publico', true) AS slug,
                now() = statement_timestamp() AS em_transacao`,
    );
    return linha;
  };

  app.get('/api/teste/estado', async (c) => c.json(await estado(c.var.db)));
  app.post('/api/teste/estado', async (c) => c.json(await estado(c.var.db)));

  app.get('/api/teste/grupos', async (c) => {
    const grupos = await linhas(c.var.db, sql<{ slug: string }>`SELECT slug FROM grupos ORDER BY slug`);
    return c.json(grupos.map((g) => g.slug));
  });

  // Duas consultas separadas por um tempo: na mesma transação, o now() é o mesmo.
  app.get('/api/teste/mesma-transacao', async (c) => {
    const [a] = await linhas(
      c.var.db,
      sql<{ t: string; pid: number }>`SELECT now()::text AS t, pg_backend_pid() AS pid`,
    );
    await linhas(c.var.db, sql`SELECT pg_sleep(0.05)`);
    const [b] = await linhas(
      c.var.db,
      sql<{ t: string; pid: number }>`SELECT now()::text AS t, pg_backend_pid() AS pid`,
    );
    return c.json({ a, b });
  });

  // Grava uma habilidade no grupo A e responde com o status pedido (ou lança).
  app.post('/api/teste/gravar/:nome', async (c) => {
    await sql`INSERT INTO habilidades (grupo_id, nome) VALUES (${GRUPO_A.grupo}, ${c.req.param('nome')})`.execute(
      c.var.db,
    );
    const pedido = c.req.query('status');
    if (pedido === 'lancar') throw new Error('falha depois de gravar');
    const status = Number(pedido ?? 201) as 201;
    // 204 não pode ter corpo.
    return status === (204 as number) ? c.body(null, 204) : c.json({ ok: true }, status);
  });

  app.get('/api/teste/existe/:nome', async (c) => {
    const achadas = await linhas(
      c.var.db,
      sql<{ n: number }>`SELECT count(*)::int AS n FROM habilidades WHERE nome = ${c.req.param('nome')}`,
    );
    return c.json({ existe: achadas[0]?.n === 1 });
  });

  app.get('/api/teste/pid', async (c) => {
    const [linha] = await linhas(c.var.db, sql<{ pid: number }>`SELECT pg_backend_pid() AS pid`);
    return c.json(linha);
  });

  app.get('/api/teste/sessao-ativa/:pid', async (c) => {
    const [linha] = await linhas(
      c.var.db,
      sql<{ n: number }>`SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid = ${Number(c.req.param('pid'))}`,
    );
    return c.json({ ativa: linha?.n === 1 });
  });

  app.get('/api/teste/sem-consulta', (c) => c.json({ ok: true }));

  // Cada tentativa de controlar a transação por dentro: devolve o nome do erro (ou "passou").
  const tentativas: Record<string, (db: Db) => Promise<unknown>> = {
    transaction: (db) => db.transaction().execute(async () => undefined),
    startTransaction: (db) => db.startTransaction().execute(),
    begin: (db) => sql`BEGIN`.execute(db),
    startTransactionSql: (db) => sql`START TRANSACTION`.execute(db),
    commit: (db) => sql`COMMIT`.execute(db),
    end: (db) => sql`END`.execute(db),
    rollback: (db) => sql`ROLLBACK`.execute(db),
    abort: (db) => sql`ABORT`.execute(db),
    savepoint: (db) => sql`SAVEPOINT x`.execute(db),
    release: (db) => sql`RELEASE SAVEPOINT x`.execute(db),
    comentario: (db) => sql.raw('/* oi */ -- linha\n  commit').execute(db),
    multiplos: (db) => sql.raw('SELECT 1; COMMIT').execute(db),
  };
  app.post('/api/teste/aninhar/:tipo', async (c) => {
    await sql`INSERT INTO habilidades (grupo_id, nome) VALUES (${GRUPO_A.grupo}, ${c.req.query('nome') ?? ''})`.execute(
      c.var.db,
    );
    const tentativa = tentativas[c.req.param('tipo')];
    if (!tentativa) return c.json({ resultado: 'tipo desconhecido' }, 400);
    try {
      await tentativa(c.var.db);
      return c.json({ resultado: 'passou' });
    } catch (erro) {
      return c.json({ resultado: (erro as Error).name }, 500);
    }
  });
}

const comoA = { 'X-Teste-Conta': GRUPO_A.conta };
const escrita = (cabecalhos: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'X-Pelada': '1', ...comoA, ...cabecalhos },
});
const opcoes = { preparar: rotas };
// `habilidades.nome` aceita de 2 a 30 caracteres.
const nomeUnico = () => `h-${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`;

async function existe(nome: string): Promise<boolean> {
  const r = await chamar(`/api/teste/existe/${nome}`, { headers: comoA }, opcoes);
  return (r.corpo as { existe: boolean }).existe;
}

describe('comBanco: transação por requisição com contexto de RLS (FUN-16)', () => {
  describe('conexão', () => {
    it('conecta direto como pelada_app, sem bypass de RLS (nunca como owner)', async () => {
      const r = await chamar('/api/teste/estado', { headers: comoA }, opcoes);
      expect(r.status).toBe(200);
      expect(r.corpo).toMatchObject({ usuario: 'pelada_app', sessao: 'pelada_app', bypass: false });
    });

    it('requisição que não consulta não abre conexão: o HYPERDRIVE nem é lido', async () => {
      let acessos = 0;
      const espiao = new Proxy(env, {
        get(alvo, prop, receptor) {
          if (prop === 'HYPERDRIVE') acessos++;
          return Reflect.get(alvo, prop, receptor);
        },
      });
      const r = await chamar('/api/teste/sem-consulta', {}, { ...opcoes, env: espiao });
      expect(r.status).toBe(200);
      expect(acessos).toBe(0);
    });

    it('fecha a conexão no waitUntil, depois da resposta', async () => {
      const r1 = await chamar('/api/teste/pid', { headers: comoA }, opcoes);
      const { pid } = r1.corpo as { pid: number };
      let ativa = true;
      for (let i = 0; i < 20 && ativa; i++) {
        const r2 = await chamar(`/api/teste/sessao-ativa/${pid}`, { headers: comoA }, opcoes);
        ativa = (r2.corpo as { ativa: boolean }).ativa;
        if (ativa) await new Promise((ok) => setTimeout(ok, 100));
      }
      expect(ativa).toBe(false);
    });
  });

  describe('BEGIN e contexto antes de qualquer consulta', () => {
    it('GET abre a transação READ ONLY', async () => {
      const r = await chamar('/api/teste/estado', { headers: comoA }, opcoes);
      expect(r.corpo).toMatchObject({ somente_leitura: 'on', em_transacao: false });
    });

    it('HEAD também é READ ONLY', async () => {
      const app = criarApp({ limitadores: { entrar: SEM_LIMITE, publico: SEM_LIMITE } });
      rotas(app);
      let somenteLeitura = '';
      // O Hono atende HEAD pela rota GET (e descarta o corpo).
      app.get('/api/teste/head', async (c) => {
        const [linha] = await linhas(
          c.var.db,
          sql<{ s: string }>`SELECT current_setting('transaction_read_only') AS s`,
        );
        somenteLeitura = linha?.s ?? '';
        return c.body(null, 200);
      });
      const ctx = createExecutionContext();
      const r = await app.fetch(new Request('http://app.invalid/api/teste/head', { method: 'HEAD' }), env, ctx);
      await waitOnExecutionContext(ctx);
      expect(r.status).toBe(200);
      expect(somenteLeitura).toBe('on');
    });

    it('POST abre a transação de leitura e escrita', async () => {
      const r = await chamar('/api/teste/estado', escrita(), opcoes);
      expect(r.corpo).toMatchObject({ somente_leitura: 'off' });
    });

    it('todas as consultas da requisição caem na mesma transação e na mesma conexão', async () => {
      const r = await chamar('/api/teste/mesma-transacao', { headers: comoA }, opcoes);
      const { a, b } = r.corpo as { a: { t: string; pid: number }; b: { t: string; pid: number } };
      expect(a.t).toBe(b.t);
      expect(a.pid).toBe(b.pid);
    });

    it('a primeira consulta já enxerga app.conta_id: a conta A vê só o grupo A', async () => {
      const r = await chamar('/api/teste/estado', { headers: comoA }, opcoes);
      expect(r.corpo).toMatchObject({ conta: GRUPO_A.conta, slug: '' });
      const grupos = await chamar('/api/teste/grupos', { headers: comoA }, opcoes);
      expect(grupos.corpo).toEqual([GRUPO_A.slug]);
      const b = await chamar('/api/teste/grupos', { headers: { 'X-Teste-Conta': GRUPO_B.conta } }, opcoes);
      expect(b.corpo).toEqual([GRUPO_B.slug]);
    });

    it('com app.slug_publico, só o grupo do slug', async () => {
      const r = await chamar('/api/teste/grupos', { headers: { 'X-Teste-Slug': GRUPO_B.slug } }, opcoes);
      expect(r.corpo).toEqual([GRUPO_B.slug]);
    });

    it('sem contexto, zero linhas', async () => {
      const r = await chamar('/api/teste/grupos', {}, opcoes);
      expect(r.status).toBe(200);
      expect(r.corpo).toEqual([]);
    });

    it('o contexto de uma requisição não vaza para outra (concorrentes, contas diferentes)', async () => {
      const pedidos = Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? GRUPO_A : GRUPO_B));
      const respostas = await Promise.all(
        pedidos.map((g) => chamar('/api/teste/grupos', { headers: { 'X-Teste-Conta': g.conta } }, opcoes)),
      );
      respostas.forEach((r, i) => expect(r.corpo).toEqual([pedidos[i]?.slug]));
    });

    it('o contexto é definido com parâmetro: valor com aspas não injeta SQL', async () => {
      const malicioso = "x', true); SELECT set_config('app.conta_id', 'y";
      const r = await chamar('/api/teste/estado', { headers: { 'X-Teste-Slug': malicioso } }, opcoes);
      expect(r.status).toBe(200);
      expect(r.corpo).toMatchObject({ slug: malicioso, conta: '' });
    });
  });

  describe('COMMIT abaixo de 400, ROLLBACK a partir de 400', () => {
    it.each([200, 201, 204, 302, 399])('status %i: grava', async (status) => {
      const nome = nomeUnico();
      const r = await chamar(`/api/teste/gravar/${nome}?status=${status}`, escrita(), opcoes);
      expect(r.status).toBe(status);
      expect(await existe(nome)).toBe(true);
    });

    it.each([400, 404, 422, 500])('status %i: desfaz', async (status) => {
      const nome = nomeUnico();
      const r = await chamar(`/api/teste/gravar/${nome}?status=${status}`, escrita(), opcoes);
      expect(r.status).toBe(status);
      expect(await existe(nome)).toBe(false);
    });

    it('erro lançado pela rota: 500 e desfaz', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const nome = nomeUnico();
      const r = await chamar(`/api/teste/gravar/${nome}?status=lancar`, escrita(), opcoes);
      vi.restoreAllMocks();
      expect(r.status).toBe(500);
      expect(await existe(nome)).toBe(false);
    });

    it('escrita recusada pela RLS (conta B no grupo A) não grava nada', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const nome = nomeUnico();
      const r = await chamar(`/api/teste/gravar/${nome}`, escrita({ 'X-Teste-Conta': GRUPO_B.conta }), opcoes);
      vi.restoreAllMocks();
      expect(r.status).toBe(500);
      expect(await existe(nome)).toBe(false);
    });
  });

  describe('abrir outra transação dentro da requisição é proibido', () => {
    it.each([
      'transaction',
      'startTransaction',
      'begin',
      'startTransactionSql',
      'commit',
      'end',
      'rollback',
      'abort',
      'savepoint',
      'release',
      'comentario',
      'multiplos',
    ])('%s é recusado e a escrita anterior é desfeita', async (tipo) => {
      const nome = nomeUnico();
      const r = await chamar(`/api/teste/aninhar/${tipo}?nome=${nome}`, escrita(), opcoes);
      expect(r.corpo).not.toEqual({ resultado: 'passou' });
      expect(r.status).toBe(500);
      expect(await existe(nome)).toBe(false);
    });

    it('a recusa vem do próprio app, com erro TransacaoAninhada', async () => {
      const r = await chamar(`/api/teste/aninhar/commit?nome=${nomeUnico()}`, escrita(), opcoes);
      expect(r.corpo).toEqual({ resultado: 'TransacaoAninhada' });
    });
  });
});
