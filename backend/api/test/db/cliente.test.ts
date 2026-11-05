import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { criarApp } from '../../src/entrada/app.ts';
import {
  criarCliente,
  fecharNoFim,
  type OpcoesCliente,
} from '../../src/infraestrutura/db/cliente.ts';
import { bancoDeTeste, comCliente } from '../apoio/banco.ts';
import {
  comNomeDeAplicacao,
  contextoFalso,
  envCom,
  fabricaEspiada,
  sessoesCom,
} from './requisicao.ts';

/**
 * Cliente `pg` por requisição (FUN-16). O app roda no Node, contra um banco `teste_*` do
 * Postgres local; cada teste marca a conexão com um `application_name` próprio para achá-la
 * em `pg_stat_activity`.
 */

const nomeUnico = () => `pelada_teste_${randomBytes(4).toString('hex')}`;

/** App com uma rota de teste que cria o cliente e o fecha no fim, como o `comBanco` fará. */
function appCom(
  rota: (consultar: (sql: string) => Promise<unknown>) => Promise<void>,
  opcoes: OpcoesCliente = {},
) {
  return criarApp({
    registrarExtras: (api) =>
      api.get('/teste/cliente', async (c) => {
        const cliente = criarCliente(c.env.HYPERDRIVE.connectionString, opcoes);
        try {
          await rota((sql) => cliente.consultar(sql));
          return c.json({ ok: true });
        } finally {
          await fecharNoFim(c, cliente);
        }
      }),
  });
}

describe('cliente pg por requisição', () => {
  it('FUN-16: requisição que não consulta o banco não abre conexão', async () => {
    await bancoDeTeste(async (url) => {
      const nome = nomeUnico();
      const espiada = fabricaEspiada();
      await comCliente(url, async (admin) => {
        let durante = -1;
        const app = appCom(
          async () => {
            durante = await sessoesCom(admin, nome);
          },
          { fabrica: espiada.fabrica },
        );
        const ctx = contextoFalso();
        const r = await app.request(
          '/api/teste/cliente',
          {},
          envCom(comNomeDeAplicacao(url, nome)),
          ctx,
        );
        await ctx.esperar();
        expect(r.status).toBe(200);
        expect(espiada.criadas()).toBe(0);
        expect(durante).toBe(0);
        expect(await sessoesCom(admin, nome)).toBe(0);
      });
    });
  });

  it('FUN-16: a conexão abre na primeira consulta e fecha depois da resposta, pelo waitUntil', async () => {
    await bancoDeTeste(async (url) => {
      const nome = nomeUnico();
      const espiada = fabricaEspiada();
      await comCliente(url, async (admin) => {
        let durante = -1;
        const app = appCom(
          async (consultar) => {
            await consultar('SELECT 1');
            await consultar('SELECT 2');
            durante = await sessoesCom(admin, nome);
          },
          { fabrica: espiada.fabrica },
        );
        const ctx = contextoFalso();
        const r = await app.request(
          '/api/teste/cliente',
          {},
          envCom(comNomeDeAplicacao(url, nome)),
          ctx,
        );
        expect(r.status).toBe(200);
        // Uma conexão só, aberta durante a rota; o fechamento foi agendado, não feito antes.
        expect(espiada.criadas()).toBe(1);
        expect(durante).toBe(1);
        expect(ctx.agendadas()).toBe(1);
        await ctx.esperar();
        expect(await sessoesCom(admin, nome)).toBe(0);
      });
    });
  });

  it('FUN-16: a conexão fecha também quando a rota lança erro', async () => {
    await bancoDeTeste(async (url) => {
      const nome = nomeUnico();
      await comCliente(url, async (admin) => {
        const app = appCom(async (consultar) => {
          await consultar('SELECT 1');
          throw new Error('falha da rota');
        });
        const ctx = contextoFalso();
        const r = await app.request(
          '/api/teste/cliente',
          {},
          envCom(comNomeDeAplicacao(url, nome)),
          ctx,
        );
        await ctx.esperar();
        expect(r.status).toBe(500);
        expect(await sessoesCom(admin, nome)).toBe(0);
      });
    });
  });

  it('FUN-16: erro de conexão vira 503 sem vazar a URL', async () => {
    // Porta onde nada escuta; usuário e senha marcados para conferir que não vazam.
    const url = 'postgres://usuario_secreto:senha-que-nao-vaza@127.0.0.1:1/banco_secreto';
    const app = appCom(async (consultar) => {
      await consultar('SELECT 1');
    });
    const ctx = contextoFalso();
    const r = await app.request('/api/teste/cliente', {}, envCom(url), ctx);
    await ctx.esperar();
    expect(r.status).toBe(503);
    const corpo = await r.text();
    for (const trecho of [
      'senha-que-nao-vaza',
      'usuario_secreto',
      'banco_secreto',
      '127.0.0.1',
      'postgres://',
      'ECONNREFUSED',
    ]) {
      expect(corpo).not.toContain(trecho);
    }
    expect(JSON.parse(corpo)).toHaveProperty('erro');
    expect(r.headers.get('cache-control')).toBe('no-store');
  });

  it('FUN-16: fechar() sem ter aberto não cria conexão e pode ser chamado de novo', async () => {
    const espiada = fabricaEspiada();
    const cliente = criarCliente('postgres://x@127.0.0.1:1/x', { fabrica: espiada.fabrica });
    await cliente.fechar();
    await cliente.fechar();
    expect(espiada.criadas()).toBe(0);
    expect(cliente.aberto()).toBe(false);
  });
});
