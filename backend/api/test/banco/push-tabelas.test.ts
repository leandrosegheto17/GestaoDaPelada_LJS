import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { abrirCenario, type CenarioAberto } from '../isolamento/apoio.ts';

/**
 * Tabelas das notificações (notificacoes T7; NOT-12, NOT-49, NOT-50, NOT-57; AD-101), pelo superusuário do cluster
 * local, numa transação desfeita ao fim de cada caso: o que as constraints garantem antes de qualquer função.
 * A matriz política × comando das três tabelas é da T12 (`test/isolamento/push.test.ts`).
 */

const PASTA_MIGRACOES = join(import.meta.dirname, '../../src/infraestrutura/db/migracoes');
const ULTIMA_ANTERIOR = 1792844520000;

let aberto: CenarioAberto;

beforeAll(async () => {
  aberto = await abrirCenario();
});

afterAll(async () => {
  await aberto?.fechar();
});

async function desfeito<T>(fn: (d: pg.Client) => Promise<T>): Promise<T> {
  const { db } = aberto;
  await db.query('BEGIN');
  try {
    return await fn(db);
  } finally {
    await db.query('ROLLBACK').catch(() => undefined);
  }
}

async function colunas(tabela: string): Promise<string[]> {
  const r = await aberto.db.query<{ coluna: string }>(
    `SELECT column_name AS coluna FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
    [tabela],
  );
  return r.rows.map((l) => l.coluna);
}

const assinar = (d: pg.Client, grupo: string, endpoint: string) =>
  d.query(`INSERT INTO push_ranking (grupo_id, endpoint, p256dh, auth) VALUES ($1, $2, 'chave', 'segredo')`, [
    grupo,
    endpoint,
  ]);

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/t7';

describe('push_ranking', () => {
  it('NOT-12: tem exatamente id, grupo, endpoint, p256dh, auth, criada_em e ultimo_envio_em', async () => {
    expect(await colunas('push_ranking')).toEqual([
      'id',
      'grupo_id',
      'endpoint',
      'p256dh',
      'auth',
      'criada_em',
      'ultimo_envio_em',
    ]);
  });

  it('NOT-12: nenhuma coluna de IP, user agent, conta, jogador ou nome', async () => {
    for (const coluna of await colunas('push_ranking')) {
      expect(coluna).not.toMatch(/ip|agente|agent|conta|jogador|nome|email/i);
    }
  });

  it('NOT-50: o mesmo endpoint duas vezes no mesmo grupo dá 23505', async () => {
    const { cenario } = aberto;
    await expect(
      desfeito(async (d) => {
        await assinar(d, cenario.grupoA, ENDPOINT);
        await assinar(d, cenario.grupoA, ENDPOINT);
      }),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('NOT-70: o mesmo endpoint em outro grupo é outra linha', async () => {
    const { cenario } = aberto;
    const total = await desfeito(async (d) => {
      await assinar(d, cenario.grupoA, ENDPOINT);
      await assinar(d, cenario.grupoB, ENDPOINT);
      const r = await d.query<{ n: number }>(`SELECT count(*)::int AS n FROM push_ranking WHERE endpoint = $1`, [
        ENDPOINT,
      ]);
      return r.rows[0]?.n;
    });
    expect(total).toBe(2);
  });

  it('NOT-50: endpoint vazio ou acima de 1024 caracteres é recusado (23514)', async () => {
    const { cenario } = aberto;
    for (const endpoint of ['', 'https://fcm.googleapis.com/' + 'a'.repeat(1024)]) {
      await expect(desfeito((d) => assinar(d, cenario.grupoA, endpoint))).rejects.toMatchObject({ code: '23514' });
    }
  });

  it('NOT-50: grupo inexistente é recusado pela chave estrangeira (23503)', async () => {
    await expect(
      desfeito((d) => assinar(d, '00000000-0000-4000-8000-000000000000', ENDPOINT)),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('NOT-50: a chave estrangeira do grupo é ON DELETE CASCADE', async () => {
    const fk = await aberto.db.query<{ regra: string }>(
      `SELECT confdeltype::text AS regra FROM pg_constraint
        WHERE conrelid = 'push_ranking'::regclass AND contype = 'f'`,
    );
    expect(fk.rows.map((l) => l.regra)).toEqual(['c']);
  });
});

describe('push_conta', () => {
  it('NOT-45: o mesmo endpoint duas vezes na mesma conta dá 23505; em outra conta, não', async () => {
    const { cenario } = aberto;
    const inserir = (d: pg.Client, conta: string) =>
      d.query(`INSERT INTO push_conta (conta_id, endpoint, p256dh, auth) VALUES ($1, $2, 'chave', 'segredo')`, [
        conta,
        ENDPOINT,
      ]);
    await expect(
      desfeito(async (d) => {
        await inserir(d, cenario.contaA);
        await inserir(d, cenario.contaA);
      }),
    ).rejects.toMatchObject({ code: '23505' });
    const total = await desfeito(async (d) => {
      await inserir(d, cenario.contaA);
      await inserir(d, cenario.contaB);
      const r = await d.query<{ n: number }>(`SELECT count(*)::int AS n FROM push_conta WHERE endpoint = $1`, [
        ENDPOINT,
      ]);
      return r.rows[0]?.n;
    });
    expect(total).toBe(2);
  });

  it('NOT-12: sem coluna de IP, user agent, grupo ou nome', async () => {
    expect(await colunas('push_conta')).toEqual([
      'id',
      'conta_id',
      'endpoint',
      'p256dh',
      'auth',
      'criada_em',
      'ultimo_envio_em',
    ]);
  });
});

describe('avisos_cobranca', () => {
  it('NOT-57: tem só id externo, tipo, grupo e momento', async () => {
    expect(await colunas('avisos_cobranca')).toEqual(['id_externo', 'tipo', 'grupo_id', 'enviado_em']);
  });

  it('NOT-57: tipo fora dos 3 é recusado (23514)', async () => {
    const { cenario } = aberto;
    await expect(
      desfeito((d) =>
        d.query(`INSERT INTO avisos_cobranca (id_externo, tipo, grupo_id) VALUES ('pay_t7', 'outro', $1)`, [
          cenario.grupoA,
        ]),
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('NOT-39: a chave (id externo, tipo) não repete (23505); outro tipo da mesma cobrança entra', async () => {
    const { cenario } = aberto;
    const gravar = (d: pg.Client, tipo: string) =>
      d.query(`INSERT INTO avisos_cobranca (id_externo, tipo, grupo_id) VALUES ('pay_t7', $1, $2)`, [
        tipo,
        cenario.grupoA,
      ]);
    await expect(
      desfeito(async (d) => {
        await gravar(d, 'pagamento_confirmado');
        await gravar(d, 'pagamento_confirmado');
      }),
    ).rejects.toMatchObject({ code: '23505' });
    const linhas = await desfeito(async (d) => {
      await gravar(d, 'pagamento_confirmado');
      const r = await gravar(d, 'pagamento_atrasado');
      return r.rowCount;
    });
    expect(linhas).toBe(1);
  });
});

describe('RLS e grants das três tabelas', () => {
  const TABELAS = ['push_ranking', 'push_conta', 'avisos_cobranca'];

  it('NOT-50: ENABLE e FORCE ROW LEVEL SECURITY nas três', async () => {
    const r = await aberto.db.query<{ tabela: string; habilitada: boolean; forcada: boolean }>(
      `SELECT relname::text AS tabela, relrowsecurity AS habilitada, relforcerowsecurity AS forcada
         FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname = ANY ($1::text[]) ORDER BY relname`,
      [TABELAS],
    );
    expect(r.rows).toHaveLength(3);
    for (const l of r.rows) {
      expect(l.habilitada, `${l.tabela} sem ENABLE`).toBe(true);
      expect(l.forcada, `${l.tabela} sem FORCE`).toBe(true);
    }
  });

  it('AD-101: pelada_app não tem privilégio nenhum nas três, nem em coluna', async () => {
    for (const tabela of TABELAS) {
      const r = await aberto.db.query<{ n: number }>(
        `SELECT (SELECT count(*) FROM information_schema.role_table_grants WHERE grantee = 'pelada_app' AND table_name = $1)
              + (SELECT count(*) FROM information_schema.role_column_grants WHERE grantee = 'pelada_app' AND table_name = $1)
              AS n`,
        [tabela],
      );
      expect(Number(r.rows[0]?.n), tabela).toBe(0);
    }
  });

  it('AD-101: nenhuma policy das três vale para pelada_app', async () => {
    const r = await aberto.db.query<{ tabela: string; roles: string[] }>(
      `SELECT tablename::text AS tabela, roles::text[] AS roles FROM pg_policies
        WHERE schemaname = 'public' AND tablename = ANY ($1::text[])`,
      [TABELAS],
    );
    expect(r.rows.map((l) => l.tabela).sort()).toEqual([...TABELAS].sort());
    for (const l of r.rows) expect(l.roles, l.tabela).toEqual(['pelada_backup_ro']);
  });
});

describe('migração aditiva', () => {
  it('NOT-49: os arquivos das notificações têm timestamp maior que o da última migração de antes da feature', () => {
    const nomes = readdirSync(PASTA_MIGRACOES).filter((n) => /notificacoes-tabelas|push-ranking-funcoes|push-conta-funcoes/.test(n));
    expect(nomes).toHaveLength(3);
    for (const nome of nomes) expect(Number(nome.split('_')[0])).toBeGreaterThan(ULTIMA_ANTERIOR);
  });

  it('NOT-49: a migração das tabelas só cria objetos novos (nenhum DROP, nem ALTER de tabela que já existia)', () => {
    const arquivo = readdirSync(PASTA_MIGRACOES).find((n) => n.endsWith('_notificacoes-tabelas.sql'));
    expect(arquivo).toBeDefined();
    const sql = readFileSync(join(PASTA_MIGRACOES, arquivo ?? ''), 'utf8')
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n');
    expect(sql).not.toMatch(/\bDROP\b/i);
    const alteradas = [...sql.matchAll(/ALTER TABLE\s+(\w+)/gi)].map((m) => m[1]);
    for (const tabela of alteradas) expect(['push_ranking', 'push_conta', 'avisos_cobranca']).toContain(tabela);
  });
});
