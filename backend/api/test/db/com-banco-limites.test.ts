import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { criarApp } from '../../src/entrada/app.ts';
import {
  comBanco,
  IDLE_IN_TRANSACTION_MS,
  STATEMENT_TIMEOUT_MS,
} from '../../src/entrada/middlewares/com-banco.ts';
import { bancoDeTeste } from '../apoio/banco.ts';
import { comNomeDeAplicacao, contextoFalso, envCom, fabricaEspiada } from './requisicao.ts';

/**
 * Tetos de tempo da transação da requisição (SV-01): o `comBanco` põe `idle_in_transaction_session_timeout` e
 * `statement_timeout` locais à transação, para uma rota parada não segurar conexão nem trava do grupo. Os tetos
 * valem também na rota de escrita e nas prévias (`READ ONLY`).
 */

function montar() {
  const espiada = fabricaEspiada();
  const app = criarApp({
    registrarExtras: (api) => {
      api.use('/teste/limites/*', comBanco(undefined, { fabrica: espiada.fabrica }));
      const ler = async (c: { var: { db: never } }) => {
        const r = await sql<{ ocioso: string; comando: string }>`
          SELECT current_setting('idle_in_transaction_session_timeout') AS ocioso,
                 current_setting('statement_timeout') AS comando`.execute(c.var.db);
        return r.rows[0];
      };
      api.get('/teste/limites/leitura', async (c) => c.json(await ler(c as never)));
      api.post('/teste/limites/escrita', async (c) => c.json(await ler(c as never)));
    },
  });
  return app;
}

describe('comBanco: tetos de tempo (SV-01)', () => {
  for (const [metodo, caminho] of [
    ['GET', '/api/teste/limites/leitura'],
    ['POST', '/api/teste/limites/escrita'],
  ] as const) {
    it(`${metodo}: a transação nasce com os dois tetos`, async () => {
      await bancoDeTeste(async (url) => {
        const ctx = contextoFalso();
        const r = await montar().request(
          caminho,
          { method: metodo, headers: { 'x-pelada': '1' } },
          envCom(comNomeDeAplicacao(url, 'limites')),
          ctx,
        );
        await ctx.esperar();
        expect(r.status).toBe(200);
        expect(await r.json()).toEqual({
          ocioso: `${IDLE_IN_TRANSACTION_MS / 1000}s`,
          comando: `${STATEMENT_TIMEOUT_MS / 1000}s`,
        });
      });
    });
  }

  it('os tetos são finitos e a conexão ociosa cai antes do comando', () => {
    expect(IDLE_IN_TRANSACTION_MS).toBeGreaterThan(0);
    expect(IDLE_IN_TRANSACTION_MS).toBeLessThanOrEqual(STATEMENT_TIMEOUT_MS);
  });
});
