import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { abrirCenario, comoApp, type CenarioAberto } from '../isolamento/apoio.ts';
import { arquivar, reativar } from '../isolamento/cenario-grupos.ts';
import { outraConexao } from './apoio-conta.ts';

/**
 * Funções de assinatura do push do ranking pelo slug (notificacoes T8; NOT-05, NOT-07, NOT-08, NOT-10, NOT-17, NOT-18,
 * NOT-51, NOT-65, NOT-70), como `pelada_app` com o contexto do slug e sem conta.
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - 199 e 200 assinaturas: com 199 outras, a 200ª entra; com 200 outras, a nova é `limite` e nada é gravado;
 * - o mesmo `endpoint` com o grupo no limite (200 linhas contando a dele): reassinar segue valendo (`atualizada`);
 * - slug de outro grupo no contexto, slug de grupo arquivado, slug que não é o do contexto: `nao_encontrado`;
 * - com conta no contexto: recusa (42501), em todas as três funções;
 * - `auth` errado ao cancelar: não apaga; grupo arquivado: apaga;
 * - duas conexões assinando o mesmo `endpoint`: uma linha, uma `criada` e uma `atualizada`;
 * - duas conexões assinando endpoints diferentes com 199 linhas: o grupo termina com 200, a outra recebe `limite`.
 */

let aberto: CenarioAberto;

beforeAll(async () => {
  aberto = await abrirCenario();
});

afterAll(async () => {
  await aberto?.fechar();
});

const EP = (n: number | string) => `https://fcm.googleapis.com/fcm/send/t8-${n}`;

const assinar = (
  d: pg.Client,
  slug: string,
  endpoint: string,
  p256dh = 'chave',
  auth = 'segredo',
) =>
  d.query<{ r: string }>('SELECT push_ranking_assinar($1, $2, $3, $4) AS r', [
    slug,
    endpoint,
    p256dh,
    auth,
  ]);

const cancelar = (d: pg.Client, slug: string, endpoint: string, auth: string) =>
  d.query('SELECT push_ranking_cancelar($1, $2, $3)', [slug, endpoint, auth]);

const estado = (d: pg.Client, slug: string, endpoint: string, auth: string) =>
  d.query<{ r: string }>('SELECT push_ranking_estado($1, $2, $3) AS r', [slug, endpoint, auth]);

async function total(grupo: string, db: pg.Client = aberto.db): Promise<number> {
  const r = await db.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM push_ranking WHERE grupo_id = $1',
    [grupo],
  );
  return r.rows[0]?.n ?? -1;
}

/** Enche o grupo com `n` assinaturas de endpoints `t8-fixo-<i>`, como superusuário (a transação do caso as desfaz). */
async function encher(db: pg.Client, grupo: string, n: number): Promise<void> {
  await db.query(
    `INSERT INTO push_ranking (grupo_id, endpoint, p256dh, auth)
     SELECT $1, 'https://fcm.googleapis.com/fcm/send/t8-fixo-' || g, 'chave', 'segredo' FROM generate_series(1, $2) g`,
    [grupo, n],
  );
}

/** Roda `fn` como o contexto público do slug, numa transação desfeita (o cenário não muda entre os casos). */
const publico = <T>(slug: string, fn: (d: pg.Client) => Promise<T>) =>
  comoApp(aberto.db, { slug }, fn);

describe('push_ranking_assinar', () => {
  it('NOT-05, NOT-07: a primeira chamada devolve criada e a segunda, atualizada', async () => {
    const { cenario } = aberto;
    const [a, b] = await publico(cenario.slugA, async (d) => {
      const primeira = await assinar(d, cenario.slugA, EP('um'), 'p-velha', 'a-velha');
      const segunda = await assinar(d, cenario.slugA, EP('um'), 'p-nova', 'a-nova');
      return [primeira.rows[0]?.r, segunda.rows[0]?.r];
    });
    expect([a, b]).toEqual(['criada', 'atualizada']);
  });

  it('NOT-07: reassinar troca p256dh e auth e mantém uma linha', async () => {
    const { cenario } = aberto;
    await aberto.db.query('BEGIN');
    try {
      await aberto.db.query('SET LOCAL ROLE pelada_app');
      await aberto.db.query(
        `SELECT set_config('app.conta_id', '', true), set_config('app.slug_publico', $1, true)`,
        [cenario.slugA],
      );
      await assinar(aberto.db, cenario.slugA, EP('troca'), 'p-velha', 'a-velha');
      await assinar(aberto.db, cenario.slugA, EP('troca'), 'p-nova', 'a-nova');
      await aberto.db.query('RESET ROLE');
      const r = await aberto.db.query<{ p256dh: string; auth: string }>(
        `SELECT p256dh, auth FROM push_ranking WHERE grupo_id = $1 AND endpoint = $2`,
        [cenario.grupoA, EP('troca')],
      );
      expect(r.rows).toEqual([{ p256dh: 'p-nova', auth: 'a-nova' }]);
    } finally {
      await aberto.db.query('ROLLBACK');
    }
  });

  it('NOT-70: o mesmo endpoint no grupo B é outra linha', async () => {
    const { cenario } = aberto;
    await aberto.db.query('BEGIN');
    try {
      await aberto.db.query('SET LOCAL ROLE pelada_app');
      await aberto.db.query(
        `SELECT set_config('app.conta_id', '', true), set_config('app.slug_publico', $1, true)`,
        [cenario.slugA],
      );
      expect((await assinar(aberto.db, cenario.slugA, EP('dois'))).rows[0]?.r).toBe('criada');
      await aberto.db.query(`SELECT set_config('app.slug_publico', $1, true)`, [cenario.slugB]);
      expect((await assinar(aberto.db, cenario.slugB, EP('dois'))).rows[0]?.r).toBe('criada');
      await aberto.db.query('RESET ROLE');
      expect(await total(cenario.grupoA)).toBe(2);
      expect(await total(cenario.grupoB)).toBe(2);
    } finally {
      await aberto.db.query('ROLLBACK');
    }
  });

  it('NOT-08, NOT-51: slug que não é o do contexto devolve nao_encontrado e nada é gravado', async () => {
    const { cenario } = aberto;
    const r = await publico(cenario.slugA, (d) => assinar(d, cenario.slugB, EP('outro')));
    expect(r.rows[0]?.r).toBe('nao_encontrado');
    expect(await total(cenario.grupoB)).toBe(1);
  });

  it('NOT-08: slug inexistente ou nulo devolve nao_encontrado', async () => {
    const { cenario } = aberto;
    expect((await publico('nao-existe', (d) => assinar(d, 'nao-existe', EP('x')))).rows[0]?.r).toBe(
      'nao_encontrado',
    );
    expect(
      (
        await publico(cenario.slugA, (d) =>
          d.query(`SELECT push_ranking_assinar(NULL, $1, 'c', 's') AS r`, [EP('y')]),
        )
      ).rows[0],
    ).toEqual({
      r: 'nao_encontrado',
    });
  });

  it('NOT-08: grupo arquivado devolve nao_encontrado (o ranking público some)', async () => {
    const { db, cenario } = aberto;
    await arquivar(db, cenario.grupoA);
    try {
      const r = await publico(cenario.slugA, (d) => assinar(d, cenario.slugA, EP('arq')));
      expect(r.rows[0]?.r).toBe('nao_encontrado');
      expect(await total(cenario.grupoA)).toBe(1);
    } finally {
      await reativar(db, cenario.grupoA);
    }
  });

  it('NOT-51: com conta no contexto, recusa com 42501 e nada é gravado', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoApp(db, { conta: cenario.contaA, slug: cenario.slugA }, (d) =>
        assinar(d, cenario.slugA, EP('conta')),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    expect(await total(cenario.grupoA)).toBe(1);
  });

  it('NOT-10: com 200 outras assinaturas, a nova é limite e nada é gravado; com 199, entra', async () => {
    const { db, cenario } = aberto;
    await db.query('BEGIN');
    try {
      await encher(db, cenario.grupoA, 199);
      await db.query('SET LOCAL ROLE pelada_app');
      await db.query(
        `SELECT set_config('app.conta_id', '', true), set_config('app.slug_publico', $1, true)`,
        [cenario.slugA],
      );
      // A semente já tem 1 linha: 199 + 1 = 200 no grupo; a nova teria 200 outras.
      expect((await assinar(db, cenario.slugA, EP('nova'))).rows[0]?.r).toBe('limite');
      await db.query('RESET ROLE');
      expect(await total(cenario.grupoA)).toBe(200);
    } finally {
      await db.query('ROLLBACK');
    }
    await db.query('BEGIN');
    try {
      await encher(db, cenario.grupoA, 198);
      await db.query('SET LOCAL ROLE pelada_app');
      await db.query(
        `SELECT set_config('app.conta_id', '', true), set_config('app.slug_publico', $1, true)`,
        [cenario.slugA],
      );
      // 198 + 1 da semente = 199 outras: a nova é a 200ª.
      expect((await assinar(db, cenario.slugA, EP('nova'))).rows[0]?.r).toBe('criada');
      await db.query('RESET ROLE');
      expect(await total(cenario.grupoA)).toBe(200);
    } finally {
      await db.query('ROLLBACK');
    }
  });

  it('NOT-10: com o grupo em 200, reassinar um endpoint existente segue valendo', async () => {
    const { db, cenario } = aberto;
    await db.query('BEGIN');
    try {
      await encher(db, cenario.grupoA, 199);
      await db.query('SET LOCAL ROLE pelada_app');
      await db.query(
        `SELECT set_config('app.conta_id', '', true), set_config('app.slug_publico', $1, true)`,
        [cenario.slugA],
      );
      expect((await assinar(db, cenario.slugA, EP('fixo-7'), 'p-nova', 'a-nova')).rows[0]?.r).toBe(
        'atualizada',
      );
      await db.query('RESET ROLE');
      expect(await total(cenario.grupoA)).toBe(200);
    } finally {
      await db.query('ROLLBACK');
    }
  });
});

describe('push_ranking_assinar: concorrência', () => {
  /** Grava o rastro num banco comum (COMMIT) e o remove no `finally`, porque a corrida precisa de duas conexões. */
  async function comRastro(grupo: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } finally {
      await aberto.db.query('DELETE FROM push_ranking WHERE grupo_id = $1 AND endpoint LIKE $2', [
        grupo,
        '%t8-corrida-%',
      ]);
      await aberto.db.query('DELETE FROM push_ranking WHERE grupo_id = $1 AND endpoint LIKE $2', [
        grupo,
        '%t8-fixo-%',
      ]);
    }
  }

  const sessao = async (c: pg.Client, slug: string) => {
    await c.query('BEGIN');
    await c.query('SET LOCAL ROLE pelada_app');
    await c.query(
      `SELECT set_config('app.conta_id', '', true), set_config('app.slug_publico', $1, true)`,
      [slug],
    );
  };

  it('NOT-65: duas conexões com o mesmo endpoint gravam uma linha, uma criada e uma atualizada', async () => {
    const { cenario, url } = aberto;
    const outra = await outraConexao(url);
    try {
      await comRastro(cenario.grupoA, async () => {
        await sessao(aberto.db, cenario.slugA);
        await sessao(outra, cenario.slugA);
        const primeira = await assinar(aberto.db, cenario.slugA, EP('corrida-1'), 'p1', 'a1');
        // A segunda espera a trava do grupo até a primeira confirmar.
        const segunda = assinar(outra, cenario.slugA, EP('corrida-1'), 'p2', 'a2');
        const pendente = await Promise.race([
          segunda.then(() => 'terminou'),
          new Promise((ok) => setTimeout(() => ok('esperando'), 300)),
        ]);
        expect(pendente).toBe('esperando');
        await aberto.db.query('COMMIT');
        const resposta = await segunda;
        await outra.query('COMMIT');
        expect([primeira.rows[0]?.r, resposta.rows[0]?.r]).toEqual(['criada', 'atualizada']);
        const linhas = await aberto.db.query<{ n: number }>(
          'SELECT count(*)::int AS n FROM push_ranking WHERE grupo_id = $1 AND endpoint = $2',
          [cenario.grupoA, EP('corrida-1')],
        );
        expect(linhas.rows[0]?.n).toBe(1);
      });
    } finally {
      await outra.query('ROLLBACK').catch(() => undefined);
      await outra.end();
    }
  });

  it('NOT-65: com 199 no grupo, duas novas simultâneas deixam 200 e a outra recebe limite', async () => {
    const { cenario, url } = aberto;
    const outra = await outraConexao(url);
    try {
      await comRastro(cenario.grupoA, async () => {
        // A semente já tem 1 linha: 198 de enchimento = 199 no grupo.
        await encher(aberto.db, cenario.grupoA, 198);
        await sessao(aberto.db, cenario.slugA);
        await sessao(outra, cenario.slugA);
        const primeira = await assinar(aberto.db, cenario.slugA, EP('corrida-a'));
        const segunda = assinar(outra, cenario.slugA, EP('corrida-b'));
        await aberto.db.query('COMMIT');
        const resposta = await segunda;
        await outra.query('COMMIT');
        expect([primeira.rows[0]?.r, resposta.rows[0]?.r]).toEqual(['criada', 'limite']);
        expect(await total(cenario.grupoA)).toBe(200);
      });
    } finally {
      await outra.query('ROLLBACK').catch(() => undefined);
      await outra.end();
    }
  });
});

describe('push_ranking_cancelar e push_ranking_estado', () => {
  async function comUma(fn: (d: pg.Client) => Promise<void>, slug: string): Promise<void> {
    const { db } = aberto;
    await db.query('BEGIN');
    try {
      await db.query('SET LOCAL ROLE pelada_app');
      await db.query(
        `SELECT set_config('app.conta_id', '', true), set_config('app.slug_publico', $1, true)`,
        [slug],
      );
      await assinar(db, slug, EP('c'), 'chave', 'segredo');
      await fn(db);
    } finally {
      await db.query('ROLLBACK');
    }
  }

  it('NOT-17: cancelar com endpoint e auth iguais apaga a linha; sem nada para apagar, não falha', async () => {
    const { cenario } = aberto;
    await comUma(async (d) => {
      expect((await estado(d, cenario.slugA, EP('c'), 'segredo')).rows[0]?.r).toBe('ativa');
      await cancelar(d, cenario.slugA, EP('c'), 'segredo');
      expect((await estado(d, cenario.slugA, EP('c'), 'segredo')).rows[0]?.r).toBe('ausente');
      await expect(cancelar(d, cenario.slugA, EP('c'), 'segredo')).resolves.toBeDefined();
    }, cenario.slugA);
  });

  it('NOT-17: auth errado não apaga (e o estado com auth errado é ausente, sem enumerar)', async () => {
    const { cenario } = aberto;
    await comUma(async (d) => {
      await cancelar(d, cenario.slugA, EP('c'), 'errado');
      expect((await estado(d, cenario.slugA, EP('c'), 'errado')).rows[0]?.r).toBe('ausente');
      expect((await estado(d, cenario.slugA, EP('c'), 'segredo')).rows[0]?.r).toBe('ativa');
    }, cenario.slugA);
  });

  it('NOT-17: o slug do contexto é de A; cancelar com o slug de B não apaga a linha de A', async () => {
    const { cenario } = aberto;
    await comUma(async (d) => {
      await cancelar(d, cenario.slugB, EP('c'), 'segredo');
      expect((await estado(d, cenario.slugA, EP('c'), 'segredo')).rows[0]?.r).toBe('ativa');
      expect((await estado(d, cenario.slugB, EP('c'), 'segredo')).rows[0]?.r).toBe(
        'nao_encontrado',
      );
    }, cenario.slugA);
  });

  it('NOT-18: grupo arquivado: cancelar apaga, e o estado e a assinatura dizem nao_encontrado', async () => {
    const { db, cenario } = aberto;
    await db.query('BEGIN');
    try {
      await db.query(
        `INSERT INTO push_ranking (grupo_id, endpoint, p256dh, auth) VALUES ($1, $2, 'chave', 'segredo')`,
        [cenario.grupoA, EP('arq')],
      );
      await db.query(`UPDATE grupos SET arquivado_em = now() WHERE id = $1`, [cenario.grupoA]);
      await db.query('SET LOCAL ROLE pelada_app');
      await db.query(
        `SELECT set_config('app.conta_id', '', true), set_config('app.slug_publico', $1, true)`,
        [cenario.slugA],
      );
      expect((await estado(db, cenario.slugA, EP('arq'), 'segredo')).rows[0]?.r).toBe(
        'nao_encontrado',
      );
      await cancelar(db, cenario.slugA, EP('arq'), 'segredo');
      await db.query('RESET ROLE');
      const r = await db.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM push_ranking WHERE endpoint = $1',
        [EP('arq')],
      );
      expect(r.rows[0]?.n).toBe(0);
    } finally {
      await db.query('ROLLBACK');
    }
  });

  it('NOT-51: cancelar e estado com conta no contexto recusam (42501)', async () => {
    const { db, cenario } = aberto;
    for (const chamar of [
      (d: pg.Client) => cancelar(d, cenario.slugA, EP('c'), 'segredo'),
      (d: pg.Client) => estado(d, cenario.slugA, EP('c'), 'segredo'),
    ]) {
      await expect(
        comoApp(db, { conta: cenario.contaA, slug: cenario.slugA }, chamar),
      ).rejects.toMatchObject({
        code: '42501',
      });
    }
  });
});

describe('permissões das funções', () => {
  it('NOT-51: EXECUTE só para pelada_app, nunca para PUBLIC', async () => {
    const r = await aberto.db.query<{ funcao: string; app: boolean; publico: boolean }>(
      `SELECT p.proname::text AS funcao,
              has_function_privilege('pelada_app', p.oid, 'EXECUTE') AS app,
              has_function_privilege('public', p.oid, 'EXECUTE') AS publico
         FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
          AND p.proname IN ('push_ranking_assinar', 'push_ranking_cancelar', 'push_ranking_estado') ORDER BY 1`,
    );
    expect(r.rows.map((l) => l.funcao)).toEqual([
      'push_ranking_assinar',
      'push_ranking_cancelar',
      'push_ranking_estado',
    ]);
    for (const l of r.rows) {
      expect(l.app, l.funcao).toBe(true);
      expect(l.publico, l.funcao).toBe(false);
    }
  });
});
