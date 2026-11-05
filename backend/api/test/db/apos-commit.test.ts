import { sql } from 'kysely';
import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { criarApp } from '../../src/entrada/app.ts';
import { comBanco } from '../../src/entrada/middlewares/com-banco.ts';
import { bancoDeTeste, comCliente } from '../apoio/banco.ts';
import { contextoFalso, envCom, fabricaEspiada, type ContextoFalso, type FabricaEspiada } from './requisicao.ts';

/**
 * Tarefas depois do commit no `comBanco` (notificacoes T15; NOT-20, NOT-21, NOT-22; AD-068, AD-098): a rota registra
 * `c.var.aposCommit(fn)`; `fn` roda depois do `COMMIT` bem-sucedido, por `executionCtx.waitUntil`, e é descartada no
 * `ROLLBACK`. Roda no Node contra um banco `teste_*` do Postgres local, com a tabela `marcas` para observar o `COMMIT`.
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - 201: a tarefa roda e, nesse instante, a linha já é visível para outra conexão (o `COMMIT` terminou);
 * - 409 e 422: a rota grava e responde com erro: ROLLBACK, nenhuma tarefa; exceção no handler (500): idem;
 * - falha no `COMMIT`: a resposta vira 500 e nenhuma tarefa roda;
 * - tarefa que lança (sincrona ou rejeitada): resposta intacta, erro reportado só com um motivo fixo, as outras seguem;
 * - duas tarefas registradas: rodam em ordem;
 * - tarefa lenta: a resposta chega antes de ela terminar;
 * - rota que não abre conexão e responde 200: nada a confirmar, a tarefa roda; com 400, não.
 */

interface Montagem {
  app: ReturnType<typeof criarApp>;
  espiada: FabricaEspiada;
  /** O que as tarefas registraram, na ordem. */
  eventos: string[];
  /** Quantas vezes o relato de falha foi chamado e com quais argumentos. */
  relatos: unknown[][];
  /** Resultado de `fn` que olha a tabela `marcas` por outra conexão. */
  visto: { linhas: string[] | null };
  /** Libera a tarefa lenta. */
  liberar: () => void;
  terminouLenta: () => boolean;
}

function montar(admin: pg.Client): Montagem {
  const espiada = fabricaEspiada();
  const eventos: string[] = [];
  const relatos: unknown[][] = [];
  const visto: { linhas: string[] | null } = { linhas: null };
  let liberar: () => void = () => undefined;
  const portao = new Promise<void>((ok) => {
    liberar = ok;
  });
  let terminou = false;

  const app = criarApp({
    registrarExtras: (api) => {
      api.use(
        '/teste/apos/*',
        comBanco(undefined, {
          fabrica: espiada.fabrica,
          reportarFalhaAposCommit: (...args: unknown[]) => {
            relatos.push(args);
          },
        }),
      );
      api.post('/teste/apos/grava', async (c) => {
        await sql`INSERT INTO marcas (v) VALUES ('gravou')`.execute(c.var.db);
        const fim = Number(c.req.query('fim') ?? '201');
        c.var.aposCommit(async () => {
          const r = await admin.query<{ v: string }>('SELECT v FROM marcas ORDER BY v');
          visto.linhas = r.rows.map((l) => l.v);
          eventos.push('primeira');
        });
        c.var.aposCommit(() => {
          eventos.push('segunda');
        });
        if (c.req.query('erro') === '1') throw new Error('falha depois de registrar');
        return c.json({ ok: true }, fim as 201);
      });
      api.post('/teste/apos/lenta', async (c) => {
        await sql`INSERT INTO marcas (v) VALUES ('lenta')`.execute(c.var.db);
        c.var.aposCommit(async () => {
          await portao;
          terminou = true;
          eventos.push('lenta');
        });
        return c.json({ ok: true }, 201);
      });
      api.post('/teste/apos/lanca', async (c) => {
        await sql`INSERT INTO marcas (v) VALUES ('lanca')`.execute(c.var.db);
        c.var.aposCommit(() => {
          throw new Error('segredo-do-endpoint https://fcm.googleapis.com/fcm/send/x');
        });
        c.var.aposCommit(async () => {
          await Promise.resolve();
          throw new Error('rejeitada com segredo');
        });
        c.var.aposCommit(() => {
          eventos.push('depois-das-que-lancam');
        });
        return c.json({ ok: true, corpo: 'intacto' }, 201);
      });
      api.post('/teste/apos/sem-banco', (c) => {
        c.var.aposCommit(() => {
          eventos.push('sem-banco');
        });
        return c.json({ ok: true }, Number(c.req.query('fim') ?? '200') as 200);
      });
      api.get('/teste/apos/leitura', async (c) => {
        await sql`SELECT 1`.execute(c.var.db);
        c.var.aposCommit(() => {
          eventos.push('leitura');
        });
        return c.json({ ok: true });
      });
    },
  });
  return { app, espiada, eventos, relatos, visto, liberar, terminouLenta: () => terminou };
}

async function comMarcas(fn: (urlApp: string, admin: pg.Client) => Promise<void>): Promise<void> {
  await bancoDeTeste(async (url) => {
    await comCliente(url, async (admin) => {
      await admin.query('CREATE TABLE marcas (v text NOT NULL)');
      await fn(url, admin);
    });
  });
}

/** Faz a requisição e devolve a resposta e o contexto falso, SEM esperar o que foi agendado no `waitUntil`. */
async function pedir(
  m: Montagem,
  urlApp: string,
  caminho: string,
  metodo = 'POST',
): Promise<{ r: Response; ctx: ContextoFalso }> {
  const ctx = contextoFalso();
  const r = await m.app.request(caminho, { method: metodo, headers: { 'x-pelada': '1' } }, envCom(urlApp), ctx);
  return { r, ctx };
}

describe('aposCommit', () => {
  it('NOT-20: com 201, as tarefas rodam em ordem depois do COMMIT, e a linha já é visível em outra conexão', async () => {
    await comMarcas(async (urlApp, admin) => {
      const m = montar(admin);
      const { r, ctx } = await pedir(m, urlApp, '/api/teste/apos/grava');
      await ctx.esperar();
      expect(r.status).toBe(201);
      expect(m.visto.linhas).toEqual(['gravou']);
      expect(m.eventos).toEqual(['primeira', 'segunda']);
      expect(m.espiada.consultas.at(-1)).toBe('COMMIT');
    });
  });

  it.each([409, 422])('NOT-21: com %s, a gravação é desfeita e nenhuma tarefa roda', async (status) => {
    await comMarcas(async (urlApp, admin) => {
      const m = montar(admin);
      const { r, ctx } = await pedir(m, urlApp, `/api/teste/apos/grava?fim=${status}`);
      await ctx.esperar();
      expect(r.status).toBe(status);
      expect(m.eventos).toEqual([]);
      expect(m.visto.linhas).toBeNull();
      expect(m.espiada.consultas).toContain('ROLLBACK');
    });
  });

  it('NOT-21: exceção no handler (500): nenhuma tarefa roda', async () => {
    await comMarcas(async (urlApp, admin) => {
      const m = montar(admin);
      const { r, ctx } = await pedir(m, urlApp, '/api/teste/apos/grava?erro=1');
      await ctx.esperar();
      expect(r.status).toBe(500);
      expect(m.eventos).toEqual([]);
    });
  });

  it('NOT-21: falha no COMMIT: a resposta vira 500 e nenhuma tarefa roda', async () => {
    await comMarcas(async (urlApp, admin) => {
      const m = montar(admin);
      m.espiada.falharEm((s) => s === 'COMMIT', new Error('commit recusado'));
      const { r, ctx } = await pedir(m, urlApp, '/api/teste/apos/grava');
      await ctx.esperar();
      expect(r.status).toBe(500);
      expect(m.eventos).toEqual([]);
      expect(m.visto.linhas).toBeNull();
    });
  });

  it('NOT-22: a resposta chega antes de a tarefa lenta terminar', async () => {
    await comMarcas(async (urlApp, admin) => {
      const m = montar(admin);
      const { r, ctx } = await pedir(m, urlApp, '/api/teste/apos/lenta');
      expect(r.status).toBe(201);
      expect(m.terminouLenta()).toBe(false);
      expect(ctx.agendadas()).toBeGreaterThanOrEqual(1);
      m.liberar();
      await ctx.esperar();
      expect(m.terminouLenta()).toBe(true);
      expect(m.eventos).toEqual(['lenta']);
    });
  });

  it('NOT-22: tarefa que lança não muda status nem corpo, é reportada sem conteúdo e as outras seguem', async () => {
    await comMarcas(async (urlApp, admin) => {
      const m = montar(admin);
      const { r, ctx } = await pedir(m, urlApp, '/api/teste/apos/lanca');
      await ctx.esperar();
      expect(r.status).toBe(201);
      expect(await r.json()).toEqual({ ok: true, corpo: 'intacto' });
      expect(m.relatos).toEqual([[], []]);
      expect(JSON.stringify(m.relatos)).not.toContain('segredo');
      expect(m.eventos).toEqual(['depois-das-que-lancam']);
    });
  });

  it('NOT-20: rota que não abre conexão e responde 200: a tarefa roda; com 400, não', async () => {
    await comMarcas(async (urlApp, admin) => {
      const m = montar(admin);
      const ok = await pedir(m, urlApp, '/api/teste/apos/sem-banco?fim=200');
      await ok.ctx.esperar();
      expect(m.eventos).toEqual(['sem-banco']);
      const recusada = await pedir(m, urlApp, '/api/teste/apos/sem-banco?fim=400');
      await recusada.ctx.esperar();
      expect(recusada.r.status).toBe(400);
      expect(m.eventos).toEqual(['sem-banco']);
      expect(m.espiada.criadas()).toBe(0);
    });
  });

  it('NOT-20: em GET (transação READ ONLY) as tarefas também rodam depois do COMMIT', async () => {
    await comMarcas(async (urlApp, admin) => {
      const m = montar(admin);
      const { r, ctx } = await pedir(m, urlApp, '/api/teste/apos/leitura', 'GET');
      await ctx.esperar();
      expect(r.status).toBe(200);
      expect(m.eventos).toEqual(['leitura']);
      expect(m.espiada.consultas.at(-1)).toBe('COMMIT');
    });
  });
});
