import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comoApp } from '../isolamento/apoio.ts';
import { abrirCenarioConta, type CenarioContaAberto } from '../isolamento/cenario-conta.ts';
import { comoAppAqui, comoSuper, contar, numaTransacao, umaLinha } from './apoio-conta.ts';

/**
 * Funções da assinatura do organizador e limpeza na exclusão da conta (notificacoes T9; NOT-45, NOT-53, NOT-55; AD-102,
 * AD-107), como `pelada_app` com conta no contexto.
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - conta excluída chamando: recusa (42501), como a conta sem contexto e a chamada só com slug;
 * - 10 e 11 assinaturas: com 9 outras a 10ª entra; com 10 outras a nova é `limite`; reassinar com 10 segue valendo;
 * - contas A e B com o mesmo `endpoint`: linhas separadas; a B não consulta nem cancela a de A;
 * - `conta_excluir` com `ROLLBACK`: as assinaturas ficam; confirmada, só as da conta excluída somem;
 * - `excluida_em` preenchida de novo (já preenchida) não apaga nada que tenha nascido depois (a trigger só vale na
 *   passagem de nulo a preenchido).
 */

let aberto: CenarioContaAberto;

beforeAll(async () => {
  aberto = await abrirCenarioConta();
});

afterAll(async () => {
  await aberto?.fechar();
});

const EP = (n: number | string) => `https://updates.push.services.mozilla.com/wpush/v2/t9-${n}`;

const assinar = (d: pg.Client, endpoint: string, p256dh = 'chave', auth = 'segredo') =>
  d.query<{ r: string }>('SELECT push_conta_assinar($1, $2, $3) AS r', [endpoint, p256dh, auth]);

const cancelar = (d: pg.Client, endpoint: string, auth: string) =>
  d.query('SELECT push_conta_cancelar($1, $2)', [endpoint, auth]);

const estado = (d: pg.Client, endpoint: string, auth: string) =>
  d.query<{ r: string }>('SELECT push_conta_estado($1, $2) AS r', [endpoint, auth]);

const totalDe = (d: pg.Client, conta: string) =>
  contar(d, 'SELECT 1 FROM push_conta WHERE conta_id = $1', [conta]);

/** Insere, como superusuário, `n` assinaturas da conta com endpoints `t9-fixo-<i>`. */
async function encher(db: pg.Client, conta: string, n: number): Promise<void> {
  await db.query(
    `INSERT INTO push_conta (conta_id, endpoint, p256dh, auth)
     SELECT $1, 'https://updates.push.services.mozilla.com/wpush/v2/t9-fixo-' || g, 'chave', 'segredo'
       FROM generate_series(1, $2) g`,
    [conta, n],
  );
}

describe('push_conta_assinar', () => {
  it('NOT-45: criada, depois atualizada com as chaves novas e uma linha só', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await comoAppAqui(db, cenario.contaA);
      expect((await assinar(db, EP('um'), 'p-velha', 'a-velha')).rows[0]?.r).toBe('criada');
      expect((await assinar(db, EP('um'), 'p-nova', 'a-nova')).rows[0]?.r).toBe('atualizada');
      await comoSuper(db);
      const r = await db.query<{ p256dh: string; auth: string }>(
        'SELECT p256dh, auth FROM push_conta WHERE conta_id = $1',
        [cenario.contaA],
      );
      expect(r.rows).toEqual([{ p256dh: 'p-nova', auth: 'a-nova' }]);
    });
  });

  it('NOT-53: as contas A e B com o mesmo endpoint têm linhas separadas', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await comoAppAqui(db, cenario.contaA);
      expect((await assinar(db, EP('mesmo'), 'pa', 'aa')).rows[0]?.r).toBe('criada');
      await comoSuper(db);
      await comoAppAqui(db, cenario.contaB);
      expect((await assinar(db, EP('mesmo'), 'pb', 'ab')).rows[0]?.r).toBe('criada');
      await comoSuper(db);
      expect(await totalDe(db, cenario.contaA)).toBe(1);
      expect(await totalDe(db, cenario.contaB)).toBe(1);
    });
  });

  it('NOT-45: sem conta no contexto (nem com slug), recusa com 42501', async () => {
    const { db, cenario } = aberto;
    await expect(comoApp(db, {}, (d) => assinar(d, EP('sem')))).rejects.toMatchObject({
      code: '42501',
    });
    await expect(
      comoApp(db, { slug: cenario.slugA }, (d) => assinar(d, EP('slug'))),
    ).rejects.toMatchObject({
      code: '42501',
    });
    expect(await contar(db, 'SELECT 1 FROM push_conta')).toBe(0);
  });

  it('AD-107: com 9 outras assinaturas a 10ª entra; com 10 outras a nova é limite e nada é gravado', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await encher(db, cenario.contaA, 9);
      await comoAppAqui(db, cenario.contaA);
      expect((await assinar(db, EP('dez'))).rows[0]?.r).toBe('criada');
      expect((await assinar(db, EP('onze'))).rows[0]?.r).toBe('limite');
      await comoSuper(db);
      expect(await totalDe(db, cenario.contaA)).toBe(10);
    });
  });

  it('AD-107: com 10 assinaturas, reassinar um endpoint existente segue valendo', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await encher(db, cenario.contaA, 10);
      await comoAppAqui(db, cenario.contaA);
      expect((await assinar(db, EP('fixo-3'), 'p-nova', 'a-nova')).rows[0]?.r).toBe('atualizada');
      await comoSuper(db);
      expect(await totalDe(db, cenario.contaA)).toBe(10);
    });
  });

  it('NOT-55: conta excluída chamando as três funções é recusada (42501)', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await db.query(`UPDATE contas SET excluida_em = now() WHERE id = $1`, [
        cenario.contaSemVinculo,
      ]);
      await comoAppAqui(db, cenario.contaSemVinculo);
      for (const sql of [
        `SELECT push_conta_assinar('${EP('x')}', 'c', 's')`,
        `SELECT push_conta_cancelar('${EP('x')}', 's')`,
        `SELECT push_conta_estado('${EP('x')}', 's')`,
      ]) {
        await db.query('SAVEPOINT chamada');
        await expect(db.query(sql), sql).rejects.toMatchObject({ code: '42501' });
        await db.query('ROLLBACK TO SAVEPOINT chamada');
      }
    });
  });
});

describe('push_conta_cancelar e push_conta_estado', () => {
  it('NOT-45: cancelar com endpoint e auth iguais apaga; sem nada para apagar, não falha', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await comoAppAqui(db, cenario.contaA);
      await assinar(db, EP('c'), 'chave', 'segredo');
      expect((await estado(db, EP('c'), 'segredo')).rows[0]?.r).toBe('ativa');
      await cancelar(db, EP('c'), 'segredo');
      expect((await estado(db, EP('c'), 'segredo')).rows[0]?.r).toBe('ausente');
      await expect(cancelar(db, EP('c'), 'segredo')).resolves.toBeDefined();
    });
  });

  it('NOT-45: auth errado não apaga', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await comoAppAqui(db, cenario.contaA);
      await assinar(db, EP('c'), 'chave', 'segredo');
      await cancelar(db, EP('c'), 'errado');
      expect((await estado(db, EP('c'), 'errado')).rows[0]?.r).toBe('ausente');
      expect((await estado(db, EP('c'), 'segredo')).rows[0]?.r).toBe('ativa');
    });
  });

  it('NOT-53: a conta B não consulta nem cancela a assinatura de A com o mesmo endpoint e o mesmo auth', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await comoAppAqui(db, cenario.contaA);
      await assinar(db, EP('c'), 'chave', 'segredo');
      await comoSuper(db);
      await comoAppAqui(db, cenario.contaB);
      expect((await estado(db, EP('c'), 'segredo')).rows[0]?.r).toBe('ausente');
      await cancelar(db, EP('c'), 'segredo');
      await comoSuper(db);
      expect(await totalDe(db, cenario.contaA)).toBe(1);
    });
  });

  it('NOT-45: sem conta no contexto, cancelar e estado recusam (42501)', async () => {
    const { db, cenario } = aberto;
    for (const chamar of [
      (d: pg.Client) => cancelar(d, EP('c'), 'segredo'),
      (d: pg.Client) => estado(d, EP('c'), 'segredo'),
    ]) {
      await expect(comoApp(db, { slug: cenario.slugA }, chamar)).rejects.toMatchObject({
        code: '42501',
      });
    }
  });
});

describe('limpeza na exclusão da conta (trigger em contas.excluida_em, AD-102)', () => {
  /** A conta A passa a não ser a única admin do grupo A (a exclusão com `unico_admin` não anonimiza). */
  async function segundaAdminNoGrupoA(db: pg.Client): Promise<void> {
    const { cenario } = aberto;
    await db.query(
      `INSERT INTO vinculos_admin (conta_id, grupo_id, criado_por, criado_em) VALUES ($1, $2, $3, now())`,
      [cenario.contaSemVinculo, cenario.grupoA, cenario.contaA],
    );
  }

  async function semear(db: pg.Client): Promise<void> {
    const { cenario } = aberto;
    await encher(db, cenario.contaA, 2);
    await encher(db, cenario.contaB, 1);
  }

  async function excluirA(db: pg.Client): Promise<string> {
    const { cenario } = aberto;
    await comoAppAqui(db, cenario.contaA);
    const r = await umaLinha<{ resultado: string }>(db, 'SELECT * FROM conta_excluir($1)', [
      cenario.senhaA,
    ]);
    await comoSuper(db);
    return r.resultado;
  }

  it('NOT-55: conta_excluir apaga as assinaturas da conta na mesma transação e deixa as de outra conta', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await segundaAdminNoGrupoA(db);
      await semear(db);
      expect(await excluirA(db)).toBe('ok');
      expect(await totalDe(db, cenario.contaA)).toBe(0);
      expect(await totalDe(db, cenario.contaB)).toBe(1);
    });
  });

  it('NOT-55: com ROLLBACK da exclusão, as assinaturas ficam', async () => {
    const { db, cenario } = aberto;
    await db.query('BEGIN');
    try {
      await segundaAdminNoGrupoA(db);
      await semear(db);
      await db.query('SAVEPOINT antes');
      expect(await excluirA(db)).toBe('ok');
      expect(await totalDe(db, cenario.contaA)).toBe(0);
      await db.query('ROLLBACK TO SAVEPOINT antes');
      expect(await totalDe(db, cenario.contaA)).toBe(2);
    } finally {
      await db.query('ROLLBACK');
    }
  });

  it('NOT-55: exclusão recusada (senha errada ou única admin) não apaga as assinaturas', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await semear(db);
      // A é a única admin do grupo A: a exclusão devolve unico_admin e nada muda.
      expect(await excluirA(db)).toBe('unico_admin');
      expect(await totalDe(db, cenario.contaA)).toBe(2);
    });
  });

  it('NOT-55: o UPDATE de excluida_em direto também apaga só as da conta, e só na passagem de nulo a preenchido', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await semear(db);
      await db.query(`UPDATE contas SET excluida_em = now() WHERE id = $1`, [cenario.contaA]);
      expect(await totalDe(db, cenario.contaA)).toBe(0);
      expect(await totalDe(db, cenario.contaB)).toBe(1);
      // Uma linha que nasce depois não some com um novo UPDATE de excluida_em já preenchida.
      await encher(db, cenario.contaA, 1);
      await db.query(`UPDATE contas SET excluida_em = now() + interval '1 second' WHERE id = $1`, [
        cenario.contaA,
      ]);
      expect(await totalDe(db, cenario.contaA)).toBe(1);
    });
  });

  it('NOT-55: um UPDATE de outra coluna de contas não apaga nada', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await semear(db);
      await db.query(`UPDATE contas SET nome = 'Outro nome' WHERE id = $1`, [cenario.contaA]);
      expect(await totalDe(db, cenario.contaA)).toBe(2);
    });
  });
});

describe('permissões das funções', () => {
  it('NOT-45: EXECUTE só para pelada_app, nunca para PUBLIC, e a trigger não é chamável', async () => {
    const r = await aberto.db.query<{ funcao: string; app: boolean; publico: boolean }>(
      `SELECT p.proname::text AS funcao,
              has_function_privilege('pelada_app', p.oid, 'EXECUTE') AS app,
              has_function_privilege('public', p.oid, 'EXECUTE') AS publico
         FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
          AND p.proname IN ('push_conta_assinar', 'push_conta_cancelar', 'push_conta_estado', 'push_conta_apagar_na_exclusao')
        ORDER BY 1`,
    );
    expect(r.rows.map((l) => l.funcao)).toEqual([
      'push_conta_apagar_na_exclusao',
      'push_conta_assinar',
      'push_conta_cancelar',
      'push_conta_estado',
    ]);
    for (const l of r.rows) {
      expect(l.publico, l.funcao).toBe(false);
      expect(l.app, l.funcao).toBe(l.funcao !== 'push_conta_apagar_na_exclusao');
    }
  });
});
