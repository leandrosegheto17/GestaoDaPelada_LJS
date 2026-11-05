import { randomBytes } from 'node:crypto';
import { sql } from 'kysely';
import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { criarApp } from '../../src/entrada/app.ts';
import { comBanco } from '../../src/entrada/middlewares/com-banco.ts';
import { bancoDeTeste, comCliente } from '../apoio/banco.ts';
import {
  comNomeDeAplicacao,
  contextoFalso,
  envCom,
  fabricaEspiada,
  sessoesCom,
  type FabricaEspiada,
} from './requisicao.ts';

/**
 * `comBanco` (FUN-16): transação por requisição, contexto da RLS antes da primeira consulta,
 * READ ONLY em GET e HEAD, COMMIT abaixo de 400 e ROLLBACK no resto. Roda no Node, contra um
 * banco `teste_*` do Postgres local, com uma tabela `marcas` para observar as escritas.
 */

interface Visto {
  conta: string;
  slug: string;
}

function montar(espiada: FabricaEspiada = fabricaEspiada()) {
  const app = criarApp({
    registrarExtras: (api) => {
      api.use(
        '/teste/banco/*',
        comBanco((c) => ({ conta: c.req.header('x-conta') ?? null, slug: c.req.header('x-slug') ?? null }), {
          fabrica: espiada.fabrica,
        }),
      );
      api.get('/teste/banco/nada', (c) => c.json({ ok: true }));
      api.get('/teste/banco/contexto', async (c) => {
        const espera = Number(c.req.query('espera') ?? '0');
        // pg_sleep na mesma consulta: as duas requisições do teste concorrente se sobrepõem.
        const r = await sql<Visto>`
          SELECT s.conta, s.slug FROM (
            SELECT current_setting('app.conta_id', true) AS conta,
                   current_setting('app.slug_publico', true) AS slug,
                   pg_sleep(${espera}) AS dormiu
          ) AS s`.execute(c.var.db);
        const linha = r.rows[0];
        return c.json({ conta: linha?.conta, slug: linha?.slug });
      });
      // Escrita numa rota GET: só passa se a transação não for READ ONLY.
      api.get('/teste/banco/escreve', async (c) => {
        await sql`INSERT INTO marcas (v) VALUES ('via-get')`.execute(c.var.db);
        return c.json({ ok: true });
      });
      api.post('/teste/banco/escreve', async (c) => {
        await sql`INSERT INTO marcas (v) VALUES ('via-post')`.execute(c.var.db);
        const fim = c.req.query('fim') ?? '200';
        if (fim === 'erro') throw new Error('falha depois de escrever');
        return c.json({ ok: true }, Number(fim) as 200);
      });
    },
  });
  return { app, espiada };
}

const nomeUnico = () => `pelada_teste_${randomBytes(4).toString('hex')}`;

/** Banco de teste com a tabela `marcas`, a URL marcada com um application_name e um cliente admin. */
async function comMarcas(fn: (urlApp: string, admin: pg.Client, nome: string) => Promise<void>): Promise<void> {
  await bancoDeTeste(async (url) => {
    await comCliente(url, async (admin) => {
      await admin.query('CREATE TABLE marcas (v text NOT NULL)');
      const nome = nomeUnico();
      await fn(comNomeDeAplicacao(url, nome), admin, nome);
    });
  });
}

async function marcas(admin: pg.Client): Promise<string[]> {
  const r = await admin.query<{ v: string }>('SELECT v FROM marcas ORDER BY v');
  return r.rows.map((l) => l.v);
}

async function pedir(
  app: ReturnType<typeof montar>['app'],
  urlApp: string,
  caminho: string,
  init: RequestInit = {},
): Promise<Response> {
  const ctx = contextoFalso();
  const r = await app.request(caminho, init, envCom(urlApp), ctx);
  await ctx.esperar();
  return r;
}

describe('comBanco', () => {
  it('FUN-16: o SET LOCAL do contexto ocorre antes da primeira consulta da rota', async () => {
    await comMarcas(async (urlApp) => {
      const { app, espiada } = montar();
      const r = await pedir(app, urlApp, '/api/teste/banco/contexto', {
        headers: { 'x-conta': 'conta-a', 'x-slug': 'grupo-a' },
      });
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ conta: 'conta-a', slug: 'grupo-a' });
      expect(espiada.consultas[0]).toBe('BEGIN TRANSACTION READ ONLY');
      expect(espiada.consultas[1]).toMatch(/set_config\('app\.conta_id', \$1, true\)/);
      expect(espiada.consultas[1]).toMatch(/set_config\('app\.slug_publico', \$2, true\)/);
      expect(espiada.consultas[2]).toMatch(/current_setting\('app\.conta_id'/);
      expect(espiada.consultas.at(-1)).toBe('COMMIT');
    });
  });

  it('FUN-16: sem contexto, conta e slug ficam vazios', async () => {
    await comMarcas(async (urlApp) => {
      const { app } = montar();
      const r = await pedir(app, urlApp, '/api/teste/banco/contexto');
      expect(await r.json()).toEqual({ conta: '', slug: '' });
    });
  });

  it('FUN-16: rota que não consulta o banco não abre conexão nem transação', async () => {
    await comMarcas(async (urlApp) => {
      const { app, espiada } = montar();
      const r = await pedir(app, urlApp, '/api/teste/banco/nada');
      expect(r.status).toBe(200);
      expect(espiada.criadas()).toBe(0);
      expect(espiada.consultas).toEqual([]);
    });
  });

  it('FUN-16: duas requisições concorrentes (conta A e conta B) nunca enxergam o contexto uma da outra, em 100 repetições', async () => {
    await comMarcas(async (urlApp) => {
      const { app } = montar();
      for (let i = 0; i < 100; i += 1) {
        const [a, b] = await Promise.all([
          pedir(app, urlApp, '/api/teste/banco/contexto?espera=0.002', {
            headers: { 'x-conta': `conta-a-${i}`, 'x-slug': `slug-a-${i}` },
          }),
          pedir(app, urlApp, '/api/teste/banco/contexto?espera=0.002', {
            headers: { 'x-conta': `conta-b-${i}`, 'x-slug': `slug-b-${i}` },
          }),
        ]);
        expect(await a.json()).toEqual({ conta: `conta-a-${i}`, slug: `slug-a-${i}` });
        expect(await b.json()).toEqual({ conta: `conta-b-${i}`, slug: `slug-b-${i}` });
      }
    });
  });

  it('FUN-16: escrita numa rota GET falha (transação somente leitura) e nada é gravado', async () => {
    await comMarcas(async (urlApp, admin) => {
      const { app, espiada } = montar();
      const r = await pedir(app, urlApp, '/api/teste/banco/escreve');
      expect(r.status).toBe(500);
      expect(await marcas(admin)).toEqual([]);
      expect(espiada.consultas[0]).toBe('BEGIN TRANSACTION READ ONLY');
      expect(espiada.consultas).toContain('ROLLBACK');
      expect(espiada.consultas).not.toContain('COMMIT');
    });
  });

  it('FUN-16: escrita numa rota pedida com HEAD também falha', async () => {
    await comMarcas(async (urlApp, admin) => {
      const { app, espiada } = montar();
      const r = await pedir(app, urlApp, '/api/teste/banco/escreve', { method: 'HEAD' });
      expect(r.status).toBe(500);
      expect(await marcas(admin)).toEqual([]);
      expect(espiada.consultas[0]).toBe('BEGIN TRANSACTION READ ONLY');
    });
  });

  it('FUN-16: POST que responde 200 confirma a escrita (COMMIT), em transação de escrita', async () => {
    await comMarcas(async (urlApp, admin) => {
      const { app, espiada } = montar();
      const r = await pedir(app, urlApp, '/api/teste/banco/escreve', { method: 'POST' });
      expect(r.status).toBe(200);
      expect(await marcas(admin)).toEqual(['via-post']);
      expect(espiada.consultas[0]).toBe('BEGIN');
      expect(espiada.consultas.at(-1)).toBe('COMMIT');
    });
  });

  it('FUN-16: erro 500 na rota desfaz a escrita', async () => {
    await comMarcas(async (urlApp, admin) => {
      const { app, espiada } = montar();
      const r = await pedir(app, urlApp, '/api/teste/banco/escreve?fim=erro', { method: 'POST' });
      expect(r.status).toBe(500);
      expect(await r.text()).not.toContain('falha depois de escrever');
      expect(await marcas(admin)).toEqual([]);
      expect(espiada.consultas.at(-1)).toBe('ROLLBACK');
    });
  });

  for (const status of [400, 422, 404, 503]) {
    it(`FUN-16: status ${status} devolvido pela rota desfaz a escrita`, async () => {
      await comMarcas(async (urlApp, admin) => {
        const { app } = montar();
        const r = await pedir(app, urlApp, `/api/teste/banco/escreve?fim=${status}`, { method: 'POST' });
        expect(r.status).toBe(status);
        expect(await marcas(admin)).toEqual([]);
      });
    });
  }

  it('FUN-16: status 399 ainda confirma (o limite é menor que 400)', async () => {
    await comMarcas(async (urlApp, admin) => {
      const { app } = montar();
      const r = await pedir(app, urlApp, '/api/teste/banco/escreve?fim=399', { method: 'POST' });
      expect(r.status).toBe(399);
      expect(await marcas(admin)).toEqual(['via-post']);
    });
  });

  it('FUN-16: COMMIT que falha transforma a resposta em 500', async () => {
    await comMarcas(async (urlApp, admin) => {
      const espiada = fabricaEspiada();
      espiada.falharEm((s) => s === 'COMMIT', new Error('commit recusado'));
      const { app } = montar(espiada);
      const r = await pedir(app, urlApp, '/api/teste/banco/escreve', { method: 'POST' });
      expect(r.status).toBe(500);
      expect(await r.text()).not.toContain('commit recusado');
      expect(await marcas(admin)).toEqual([]);
    });
  });

  it('FUN-16: a conexão da requisição fecha depois da resposta, com COMMIT ou ROLLBACK', async () => {
    await comMarcas(async (urlApp, admin, nome) => {
      const { app } = montar();
      await pedir(app, urlApp, '/api/teste/banco/escreve', { method: 'POST' });
      await pedir(app, urlApp, '/api/teste/banco/escreve?fim=erro', { method: 'POST' });
      expect(await sessoesCom(admin, nome)).toBe(0);
    });
  });

  it('FUN-16: o contexto é passado por parâmetro, sem interpolar o valor no SQL', async () => {
    await comMarcas(async (urlApp, admin) => {
      const { app, espiada } = montar();
      const malicioso = `x', true); INSERT INTO marcas (v) VALUES ('injetado'); --`;
      const r = await pedir(app, urlApp, '/api/teste/banco/contexto', { headers: { 'x-conta': malicioso } });
      expect(await r.json()).toEqual({ conta: malicioso, slug: '' });
      expect(espiada.consultas[1]).not.toContain('injetado');
      expect(await marcas(admin)).toEqual([]);
    });
  });
});
