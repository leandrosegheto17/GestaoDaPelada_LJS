import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { abrirCenario, comoApp, type CenarioAberto } from '../isolamento/apoio.ts';

/**
 * Funções do envio do ranking (notificacoes T10; NOT-29, NOT-30, NOT-69; AD-101), como `pelada_app` numa sessão sem conta
 * e sem slug (o consumidor da fila).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - limite de 40 com 41 linhas: o lote devolve 40 por `id` crescente e o seguinte (`p_apos_id` = último id) devolve o resto;
 * - `p_desde` posterior a um envio aceito: a linha volta a ser devolvida; anterior: não volta;
 * - id revogado ou aceito que é de outro grupo: ignorado, a linha do outro grupo não muda;
 * - listas nulas ou vazias: nada muda, sem erro;
 * - com conta ou com slug no contexto, cada função recusa (42501).
 */

let aberto: CenarioAberto;

beforeAll(async () => {
  aberto = await abrirCenario();
});

afterAll(async () => {
  await aberto?.fechar();
});

const FUNCOES = [
  (g: string) => ({ sql: 'SELECT * FROM push_envio_grupo($1)', valores: [g] }),
  (g: string) => ({ sql: `SELECT * FROM push_ranking_lote($1, 0, 40, now() - interval '1 hour')`, valores: [g] }),
  (g: string) => ({ sql: `SELECT push_ranking_resultado($1, '{}'::bigint[], '{}'::bigint[])`, valores: [g] }),
];

/** Roda `fn` como `pelada_app` sem contexto, numa transação desfeita; `super` volta ao superusuário dentro dela. */
async function semContexto<T>(fn: (d: pg.Client) => Promise<T>): Promise<T> {
  return comoApp(aberto.db, {}, fn);
}

async function ids(d: pg.Client, grupo: string): Promise<string[]> {
  const r = await d.query<{ id: string }>('SELECT id::text FROM push_ranking WHERE grupo_id = $1 ORDER BY id', [grupo]);
  return r.rows.map((l) => l.id);
}

/** Insere, como superusuário, `n` assinaturas do grupo e devolve os ids em ordem. */
async function encher(d: pg.Client, grupo: string, n: number): Promise<string[]> {
  await d.query('RESET ROLE');
  await d.query(
    `INSERT INTO push_ranking (grupo_id, endpoint, p256dh, auth)
     SELECT $1, 'https://fcm.googleapis.com/fcm/send/t10-' || g, 'chave', 'segredo' FROM generate_series(1, $2) g`,
    [grupo, n],
  );
  const lista = await ids(d, grupo);
  await d.query('SET LOCAL ROLE pelada_app');
  return lista;
}

const lote = (d: pg.Client, grupo: string, apos: string | number, limite: number, desde: string) =>
  d.query<{ id: string; endpoint: string }>(
    'SELECT id::text, endpoint FROM push_ranking_lote($1, $2::bigint, $3, $4::timestamptz)',
    [grupo, apos, limite, desde],
  );

describe('push_envio_grupo', () => {
  it('NOT-24: devolve nome, slug e arquivado do grupo; grupo inexistente, nenhuma linha', async () => {
    const { cenario } = aberto;
    const [achado, vazio] = await semContexto(async (d) => [
      await d.query('SELECT * FROM push_envio_grupo($1)', [cenario.grupoA]),
      await d.query('SELECT * FROM push_envio_grupo($1)', ['00000000-0000-4000-8000-000000000000']),
    ]);
    expect(achado?.rows).toEqual([{ nome: 'Grupo A', slug: cenario.slugA, arquivado: false }]);
    expect(vazio?.rows).toEqual([]);
  });

  it('NOT-24: grupo arquivado volta com arquivado = true', async () => {
    const { cenario } = aberto;
    const r = await semContexto(async (d) => {
      await d.query('RESET ROLE');
      await d.query('UPDATE grupos SET arquivado_em = now() WHERE id = $1', [cenario.grupoA]);
      await d.query('SET LOCAL ROLE pelada_app');
      return d.query<{ arquivado: boolean }>('SELECT arquivado FROM push_envio_grupo($1)', [cenario.grupoA]);
    });
    expect(r.rows).toEqual([{ arquivado: true }]);
  });
});

describe('push_ranking_lote', () => {
  it('NOT-34: limite de 40 com 41 linhas: 40 por id crescente, e o seguinte devolve o resto', async () => {
    const { cenario } = aberto;
    await semContexto(async (d) => {
      const todas = await encher(d, cenario.grupoA, 41);
      const primeiro = await lote(d, cenario.grupoA, 0, 40, '2000-01-01T00:00:00Z');
      expect(primeiro.rows.map((l) => l.id)).toEqual(todas.slice(0, 40));
      const ultimo = primeiro.rows.at(-1)?.id ?? '0';
      const resto = await lote(d, cenario.grupoA, ultimo, 40, '2000-01-01T00:00:00Z');
      expect(resto.rows.map((l) => l.id)).toEqual(todas.slice(40));
    });
  });

  it('NOT-69: depois do resultado, a mesma chamada com o mesmo p_desde não devolve as já aceitas', async () => {
    const { cenario } = aberto;
    await semContexto(async (d) => {
      const todas = await encher(d, cenario.grupoA, 3);
      const desde = new Date(Date.now() - 60_000).toISOString();
      const antes = await lote(d, cenario.grupoA, 0, 40, desde);
      expect(antes.rows.map((l) => l.id)).toEqual(todas);
      await d.query('SELECT push_ranking_resultado($1, $2::bigint[], $3::bigint[])', [
        cenario.grupoA,
        [todas[0], todas[1]],
        [],
      ]);
      const depois = await lote(d, cenario.grupoA, 0, 40, desde);
      expect(depois.rows.map((l) => l.id)).toEqual([todas[2]]);
    });
  });

  it('NOT-69: p_desde posterior ao envio aceito devolve a linha de novo (um novo aviso)', async () => {
    const { cenario } = aberto;
    await semContexto(async (d) => {
      const todas = await encher(d, cenario.grupoA, 1);
      await d.query('RESET ROLE');
      await d.query(`UPDATE push_ranking SET ultimo_envio_em = now() - interval '1 hour' WHERE id = $1`, [todas[0]]);
      await d.query('SET LOCAL ROLE pelada_app');
      const depoisDoEnvio = await lote(d, cenario.grupoA, 0, 40, new Date(Date.now() - 30 * 60_000).toISOString());
      expect(depoisDoEnvio.rows.map((l) => l.id)).toContain(todas[0]);
      const antesDoEnvio = await lote(d, cenario.grupoA, 0, 40, new Date(Date.now() - 2 * 3_600_000).toISOString());
      expect(antesDoEnvio.rows.map((l) => l.id)).not.toContain(todas[0]);
    });
  });

  it('só devolve as assinaturas do grupo pedido', async () => {
    const { cenario } = aberto;
    await semContexto(async (d) => {
      await encher(d, cenario.grupoA, 2);
      const doB = await lote(d, cenario.grupoB, 0, 40, '2000-01-01T00:00:00Z');
      expect(doB.rows).toHaveLength(1);
      expect(doB.rows[0]?.endpoint).toContain('semente-b');
    });
  });
});

describe('push_ranking_resultado', () => {
  it('NOT-29, NOT-30: aceitos ganham ultimo_envio_em, revogados somem, e só do grupo do lote', async () => {
    const { cenario } = aberto;
    await semContexto(async (d) => {
      const [a1, a2, a3] = await encher(d, cenario.grupoA, 3);
      const doB = (await ids(await comSuper(d), cenario.grupoB))[0];
      await d.query('SET LOCAL ROLE pelada_app');
      // Aceita a1, revoga a2 e tenta, pelo grupo A, aceitar e revogar a linha do grupo B.
      await d.query('SELECT push_ranking_resultado($1, $2::bigint[], $3::bigint[])', [
        cenario.grupoA,
        [a1, doB],
        [a2, doB],
      ]);
      await d.query('RESET ROLE');
      const r = await d.query<{ id: string; aceita: boolean }>(
        `SELECT id::text, ultimo_envio_em IS NOT NULL AS aceita FROM push_ranking
          WHERE id = ANY ($1::bigint[]) ORDER BY id`,
        [[a1, a2, a3, doB]],
      );
      expect(r.rows).toEqual(
        [
          { id: a1, aceita: true },
          { id: a3, aceita: false },
          { id: doB, aceita: false },
        ].sort((x, y) => Number(x.id) - Number(y.id)),
      );
    });
  });

  it('listas nulas ou vazias não mudam nada e não falham', async () => {
    const { cenario } = aberto;
    await semContexto(async (d) => {
      await expect(d.query('SELECT push_ranking_resultado($1, NULL, NULL)', [cenario.grupoA])).resolves.toBeDefined();
      await expect(
        d.query(`SELECT push_ranking_resultado($1, '{}'::bigint[], '{}'::bigint[])`, [cenario.grupoA]),
      ).resolves.toBeDefined();
      await d.query('RESET ROLE');
      expect((await ids(d, cenario.grupoA)).length).toBe(1);
    });
  });
});

async function comSuper(d: pg.Client): Promise<pg.Client> {
  await d.query('RESET ROLE');
  return d;
}

describe('contexto e permissões', () => {
  it('AD-101: com conta ou com slug no contexto, cada função recusa (42501)', async () => {
    const { db, cenario } = aberto;
    for (const contexto of [
      { conta: cenario.contaA },
      { slug: cenario.slugA },
      { conta: cenario.contaA, slug: cenario.slugA },
    ]) {
      for (const montar of FUNCOES) {
        const { sql, valores } = montar(cenario.grupoA);
        await expect(
          comoApp(db, contexto, (d) => d.query(sql, valores)),
          `${sql} com ${JSON.stringify(contexto)}`,
        ).rejects.toMatchObject({ code: '42501' });
      }
    }
  });

  it('AD-101: EXECUTE só para pelada_app, nunca para PUBLIC', async () => {
    const r = await aberto.db.query<{ funcao: string; app: boolean; publico: boolean }>(
      `SELECT p.proname::text AS funcao,
              has_function_privilege('pelada_app', p.oid, 'EXECUTE') AS app,
              has_function_privilege('public', p.oid, 'EXECUTE') AS publico
         FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
          AND p.proname IN ('push_envio_grupo', 'push_ranking_lote', 'push_ranking_resultado') ORDER BY 1`,
    );
    expect(r.rows).toHaveLength(3);
    for (const l of r.rows) {
      expect(l.app, l.funcao).toBe(true);
      expect(l.publico, l.funcao).toBe(false);
    }
  });
});
