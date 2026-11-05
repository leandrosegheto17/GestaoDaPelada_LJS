import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { abrirCenario, comoApp, type CenarioAberto } from '../isolamento/apoio.ts';
import { outraConexao } from './apoio-conta.ts';

/**
 * Funções dos avisos de cobrança e da limpeza (notificacoes T11; NOT-38, NOT-39, NOT-56, NOT-57; AD-070, AD-105), como
 * `pelada_app` numa sessão sem conta e sem slug, e `notificacoes_limpar_em` como superusuário (só o owner executa).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - 180 dias menos 1 s e mais 1 s; assinatura nunca enviada (conta de `criada_em`); 90 dias menos 1 s e mais 1 s;
 * - criadora excluída: nenhuma linha; outro admin com assinatura de push: não aparece; criadora sem assinatura: vazio;
 * - dois registros simultâneos da mesma chave: um grava, o outro espera e recebe `false`; se o primeiro desfaz, o outro
 *   grava; o mesmo id com outro tipo é outra chave;
 * - com conta ou com slug no contexto, cada função recusa (42501).
 */

let aberto: CenarioAberto;

beforeAll(async () => {
  aberto = await abrirCenario();
});

afterAll(async () => {
  await aberto?.fechar();
});

const semContexto = <T>(fn: (d: pg.Client) => Promise<T>) => comoApp(aberto.db, {}, fn);

interface Destino {
  conta_id: string;
  email: string;
  nome: string;
  grupo_nome: string;
  assinaturas: Array<{ id: number; endpoint: string; p256dh: string; auth: string }>;
}

const destino = async (d: pg.Client, grupo: string): Promise<Destino[]> =>
  (await d.query<Destino>('SELECT * FROM aviso_cobranca_destino($1)', [grupo])).rows;

const registrar = (d: pg.Client, id: string, tipo: string, grupo: string) =>
  d.query<{ r: boolean }>('SELECT aviso_cobranca_registrar($1, $2, $3) AS r', [id, tipo, grupo]);

describe('aviso_cobranca_destino', () => {
  it('NOT-38: o destino é a criadora do grupo, com e-mail, nome, nome do grupo e as assinaturas dela', async () => {
    const { cenario } = aberto;
    await semContexto(async (d) => {
      await d.query('RESET ROLE');
      await d.query(
        `INSERT INTO push_conta (conta_id, endpoint, p256dh, auth) VALUES ($1, 'https://fcm.googleapis.com/fcm/send/t11-a', 'pa', 'aa')`,
        [cenario.contaA],
      );
      await d.query('SET LOCAL ROLE pelada_app');
      const linhas = await destino(d, cenario.grupoA);
      expect(linhas).toHaveLength(1);
      expect(linhas[0]).toMatchObject({
        conta_id: cenario.contaA,
        email: 'conta-a@exemplo.test',
        nome: 'Conta A',
        grupo_nome: 'Grupo A',
      });
      expect(linhas[0]?.assinaturas).toEqual([
        expect.objectContaining({ endpoint: 'https://fcm.googleapis.com/fcm/send/t11-a', p256dh: 'pa', auth: 'aa' }),
      ]);
    });
  });

  it('NOT-46: criadora sem assinatura de push devolve a linha com assinaturas vazias (só o e-mail)', async () => {
    const { cenario } = aberto;
    const linhas = await semContexto((d) => destino(d, cenario.grupoA));
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.assinaturas).toEqual([]);
  });

  it('NOT-38: outro admin do grupo com assinatura não aparece; só as da criadora', async () => {
    const { cenario } = aberto;
    await semContexto(async (d) => {
      await d.query('RESET ROLE');
      await d.query(
        `INSERT INTO vinculos_admin (conta_id, grupo_id, criado_por, criado_em) VALUES ($1, $2, $3, now())`,
        [cenario.contaSemVinculo, cenario.grupoA, cenario.contaA],
      );
      await d.query(
        `INSERT INTO push_conta (conta_id, endpoint, p256dh, auth)
         VALUES ($1, 'https://fcm.googleapis.com/fcm/send/t11-outro-admin', 'po', 'ao')`,
        [cenario.contaSemVinculo],
      );
      await d.query('SET LOCAL ROLE pelada_app');
      const linhas = await destino(d, cenario.grupoA);
      expect(linhas).toHaveLength(1);
      expect(linhas[0]?.conta_id).toBe(cenario.contaA);
      expect(linhas[0]?.assinaturas).toEqual([]);
    });
  });

  it('NOT-38: criadora excluída ou grupo inexistente devolve nenhuma linha', async () => {
    const { cenario } = aberto;
    await semContexto(async (d) => {
      expect(await destino(d, '00000000-0000-4000-8000-000000000000')).toEqual([]);
      await d.query('RESET ROLE');
      await d.query(`UPDATE contas SET excluida_em = now() WHERE id = $1`, [cenario.contaA]);
      await d.query('SET LOCAL ROLE pelada_app');
      expect(await destino(d, cenario.grupoA)).toEqual([]);
    });
  });
});

describe('aviso_cobranca_registrar', () => {
  it('NOT-39, NOT-57: a primeira vez grava e devolve true; a segunda da mesma chave devolve false', async () => {
    const { cenario } = aberto;
    await semContexto(async (d) => {
      expect((await registrar(d, 'pay_t11', 'pagamento_confirmado', cenario.grupoA)).rows[0]?.r).toBe(true);
      expect((await registrar(d, 'pay_t11', 'pagamento_confirmado', cenario.grupoA)).rows[0]?.r).toBe(false);
      await d.query('RESET ROLE');
      const r = await d.query(`SELECT * FROM avisos_cobranca WHERE id_externo = 'pay_t11'`);
      expect(r.rows).toHaveLength(1);
      expect(Object.keys(r.rows[0] ?? {}).sort()).toEqual(['enviado_em', 'grupo_id', 'id_externo', 'tipo']);
    });
  });

  it('NOT-39: o mesmo id de cobrança com outro tipo é outra chave (confirmado e recebido são dois avisos)', async () => {
    const { cenario } = aberto;
    await semContexto(async (d) => {
      expect((await registrar(d, 'pay_t11b', 'pagamento_confirmado', cenario.grupoA)).rows[0]?.r).toBe(true);
      expect((await registrar(d, 'pay_t11b', 'pagamento_atrasado', cenario.grupoA)).rows[0]?.r).toBe(true);
    });
  });

  it('NOT-39: tipo fora dos 3 falha (23514)', async () => {
    const { cenario } = aberto;
    await expect(semContexto((d) => registrar(d, 'pay_t11c', 'outro', cenario.grupoA))).rejects.toMatchObject({
      code: '23514',
    });
  });

  describe('duas conexões', () => {
    const limpar = () => aberto.db.query(`DELETE FROM avisos_cobranca WHERE id_externo LIKE 'pay_corrida_%'`);

    const abrir = async (c: pg.Client) => {
      await c.query('BEGIN');
      await c.query('SET LOCAL ROLE pelada_app');
      await c.query(`SELECT set_config('app.conta_id', '', true), set_config('app.slug_publico', '', true)`);
    };

    it('NOT-39: a segunda espera a primeira confirmar e recebe false', async () => {
      const { cenario, url } = aberto;
      const outra = await outraConexao(url);
      try {
        await abrir(aberto.db);
        await abrir(outra);
        const primeira = await registrar(aberto.db, 'pay_corrida_1', 'cobranca_gerada', cenario.grupoA);
        const segunda = registrar(outra, 'pay_corrida_1', 'cobranca_gerada', cenario.grupoA);
        const estado = await Promise.race([
          segunda.then(() => 'terminou'),
          new Promise((ok) => setTimeout(() => ok('esperando'), 300)),
        ]);
        expect(estado).toBe('esperando');
        await aberto.db.query('COMMIT');
        const resposta = await segunda;
        await outra.query('COMMIT');
        expect([primeira.rows[0]?.r, resposta.rows[0]?.r]).toEqual([true, false]);
      } finally {
        await outra.query('ROLLBACK').catch(() => undefined);
        await outra.end();
        await limpar();
      }
    });

    it('NOT-39: se a primeira desfaz, a segunda grava e recebe true', async () => {
      const { cenario, url } = aberto;
      const outra = await outraConexao(url);
      try {
        await abrir(aberto.db);
        await abrir(outra);
        await registrar(aberto.db, 'pay_corrida_2', 'cobranca_gerada', cenario.grupoA);
        const segunda = registrar(outra, 'pay_corrida_2', 'cobranca_gerada', cenario.grupoA);
        await aberto.db.query('ROLLBACK');
        const resposta = await segunda;
        await outra.query('COMMIT');
        expect(resposta.rows[0]?.r).toBe(true);
      } finally {
        await outra.query('ROLLBACK').catch(() => undefined);
        await outra.end();
        await limpar();
      }
    });
  });
});

describe('push_conta_resultado', () => {
  it('NOT-29, NOT-30: aceitos ganham ultimo_envio_em, revogados somem, e só da conta do aviso', async () => {
    const { cenario } = aberto;
    await semContexto(async (d) => {
      await d.query('RESET ROLE');
      const r = await d.query<{ id: string; conta_id: string }>(
        `INSERT INTO push_conta (conta_id, endpoint, p256dh, auth)
         VALUES ($1, 'https://fcm.googleapis.com/fcm/send/t11-1', 'p', 'a'),
                ($1, 'https://fcm.googleapis.com/fcm/send/t11-2', 'p', 'a'),
                ($2, 'https://fcm.googleapis.com/fcm/send/t11-3', 'p', 'a')
         RETURNING id::text, conta_id`,
        [cenario.contaA, cenario.contaB],
      );
      const [a1, a2, b1] = r.rows.map((l) => l.id);
      await d.query('SET LOCAL ROLE pelada_app');
      await d.query('SELECT push_conta_resultado($1, $2::bigint[], $3::bigint[])', [cenario.contaA, [a1, b1], [a2, b1]]);
      await d.query('RESET ROLE');
      const depois = await d.query<{ id: string; aceita: boolean }>(
        `SELECT id::text, ultimo_envio_em IS NOT NULL AS aceita FROM push_conta WHERE id = ANY ($1::bigint[]) ORDER BY id`,
        [[a1, a2, b1]],
      );
      expect(depois.rows).toEqual([
        { id: a1, aceita: true },
        { id: b1, aceita: false },
      ]);
    });
  });
});

describe('notificacoes_limpar_em', () => {
  const MOMENTO = '2026-11-05T12:00:00Z';
  const antes = (dias: number, segundos: number) =>
    new Date(Date.parse(MOMENTO) - dias * 86_400_000 + segundos * 1000).toISOString();

  /** Semeia, como superusuário, 6 assinaturas do grupo A (endpoints `t11-<nome>`) com o último envio dado. */
  async function semear(d: pg.Client, linhas: Array<[string, string | null, string]>): Promise<void> {
    for (const [nome, envio, criada] of linhas) {
      await d.query(
        `INSERT INTO push_ranking (grupo_id, endpoint, p256dh, auth, criada_em, ultimo_envio_em)
         VALUES ($1, $2, 'p', 'a', $3, $4)`,
        [aberto.cenario.grupoA, `https://fcm.googleapis.com/fcm/send/t11-${nome}`, criada, envio],
      );
    }
  }

  async function restantes(d: pg.Client): Promise<string[]> {
    const r = await d.query<{ e: string }>(
      `SELECT replace(endpoint, 'https://fcm.googleapis.com/fcm/send/', '') AS e FROM push_ranking
        WHERE endpoint LIKE '%t11-%' ORDER BY endpoint`,
    );
    return r.rows.map((l) => l.e);
  }

  async function numaTransacao<T>(fn: (d: pg.Client) => Promise<T>): Promise<T> {
    const { db } = aberto;
    await db.query('BEGIN');
    try {
      return await fn(db);
    } finally {
      await db.query('ROLLBACK');
    }
  }

  it('NOT-56: apaga com mais de 180 dias sem envio aceito e mantém com menos', async () => {
    await numaTransacao(async (d) => {
      await semear(d, [
        ['velha-1s', antes(180, -1), antes(400, 0)],
        ['nova-1s', antes(180, 1), antes(400, 0)],
        ['dias-181', antes(181, 0), antes(400, 0)],
        ['dias-179', antes(179, 0), antes(400, 0)],
      ]);
      const r = await d.query<{ ranking: number }>('SELECT * FROM notificacoes_limpar_em($1)', [MOMENTO]);
      expect(r.rows[0]?.ranking).toBe(2);
      expect(await restantes(d)).toEqual(['t11-dias-179', 't11-nova-1s']);
    });
  });

  it('NOT-56: nunca enviada conta de criada_em', async () => {
    await numaTransacao(async (d) => {
      await semear(d, [
        ['nunca-velha', null, antes(181, 0)],
        ['nunca-nova', null, antes(179, 0)],
      ]);
      await d.query('SELECT * FROM notificacoes_limpar_em($1)', [MOMENTO]);
      expect(await restantes(d)).toEqual(['t11-nunca-nova']);
    });
  });

  it('NOT-57: avisos com mais de 90 dias somem; com menos, ficam', async () => {
    const { cenario } = aberto;
    await numaTransacao(async (d) => {
      for (const [id, momento] of [
        ['pay_limpa_91', antes(91, 0)],
        ['pay_limpa_89', antes(89, 0)],
        ['pay_limpa_90_menos_1s', antes(90, 1)],
        ['pay_limpa_90_mais_1s', antes(90, -1)],
      ] as const) {
        await d.query(
          `INSERT INTO avisos_cobranca (id_externo, tipo, grupo_id, enviado_em) VALUES ($1, 'cobranca_gerada', $2, $3)`,
          [id, cenario.grupoA, momento],
        );
      }
      const r = await d.query<{ avisos: number }>('SELECT * FROM notificacoes_limpar_em($1)', [MOMENTO]);
      expect(r.rows[0]?.avisos).toBeGreaterThanOrEqual(2);
      const ficam = await d.query<{ id_externo: string }>(
        `SELECT id_externo FROM avisos_cobranca WHERE id_externo LIKE 'pay_limpa_%' ORDER BY 1`,
      );
      expect(ficam.rows.map((l) => l.id_externo)).toEqual(['pay_limpa_89', 'pay_limpa_90_menos_1s']);
    });
  });

  it('NOT-56: pelada_app não executa notificacoes_limpar_em, mas notificacoes_limpar roda sem contexto', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoApp(db, {}, (d) => d.query('SELECT * FROM notificacoes_limpar_em(now())')),
    ).rejects.toMatchObject({ code: '42501' });
    const r = await comoApp(db, {}, (d) => d.query<{ ranking: number; avisos: number }>('SELECT * FROM notificacoes_limpar()'));
    expect(r.rows).toEqual([{ ranking: 0, avisos: 0 }]);
    await expect(
      comoApp(db, { conta: cenario.contaA }, (d) => d.query('SELECT * FROM notificacoes_limpar()')),
    ).rejects.toMatchObject({ code: '42501' });
  });
});

describe('contexto e permissões', () => {
  it('AD-101: com conta ou com slug no contexto, cada função recusa (42501)', async () => {
    const { db, cenario } = aberto;
    const chamadas = [
      { sql: 'SELECT * FROM aviso_cobranca_destino($1)', valores: [cenario.grupoA] },
      { sql: `SELECT aviso_cobranca_registrar('pay_x', 'cobranca_gerada', $1)`, valores: [cenario.grupoA] },
      { sql: `SELECT push_conta_resultado($1, '{}'::bigint[], '{}'::bigint[])`, valores: [cenario.contaA] },
      { sql: 'SELECT * FROM notificacoes_limpar()', valores: [] },
    ];
    for (const contexto of [{ conta: cenario.contaA }, { slug: cenario.slugA }]) {
      for (const { sql, valores } of chamadas) {
        await expect(
          comoApp(db, contexto, (d) => d.query(sql, valores)),
          `${sql} com ${JSON.stringify(contexto)}`,
        ).rejects.toMatchObject({ code: '42501' });
      }
    }
  });

  it('AD-101: EXECUTE só para pelada_app (e nunca para PUBLIC); a notificacoes_limpar_em, nem para pelada_app', async () => {
    const r = await aberto.db.query<{ funcao: string; app: boolean; publico: boolean }>(
      `SELECT p.proname::text AS funcao,
              has_function_privilege('pelada_app', p.oid, 'EXECUTE') AS app,
              has_function_privilege('public', p.oid, 'EXECUTE') AS publico
         FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
          AND p.proname IN ('aviso_cobranca_destino', 'aviso_cobranca_registrar', 'push_conta_resultado',
                            'notificacoes_limpar', 'notificacoes_limpar_em') ORDER BY 1`,
    );
    expect(r.rows).toHaveLength(5);
    for (const l of r.rows) {
      expect(l.publico, l.funcao).toBe(false);
      expect(l.app, l.funcao).toBe(l.funcao !== 'notificacoes_limpar_em');
    }
  });
});
