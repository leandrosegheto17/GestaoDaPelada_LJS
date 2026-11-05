import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comoApp, type Contexto } from './apoio.ts';
import { abrirCenarioGrupos, type CenarioGrupos, type CenarioGruposAberto } from './cenario-grupos.ts';

/**
 * Matriz política × comando das tabelas do plano (planos-e-cobranca T11; PLA-13, PLA-35), como `pelada_app` e como
 * `pelada_backup_ro`. Atores (grupos G e H do cenário de grupos):
 * - A = criadora de G (C do cenário);
 * - C = admin convidada de G (O do cenário);
 * - B = conta só de H;
 * - S = só o slug público de G;
 * - N = sem contexto nenhum.
 * G tem uma assinatura (`sub_g`, do cenário) e o banco tem um evento do Asaas (`evt_t11`, gravado no `beforeAll`).
 * Cada escrita recusada confere também que nada mudou (contagem como superusuário antes e depois).
 *
 * Evidência da rede (registrar na T11 do tasks.md, pelo /executar, uma sabotagem por vez numa cópia):
 * - `assinaturas_ler` trocada por `USING (true)` deixa vermelhas as células B, S e N de SELECT em `assinaturas`;
 * - `GRANT INSERT, UPDATE, DELETE ON assinaturas TO pelada_app` com policy `FOR ALL USING (true) WITH CHECK (true)`
 *   deixa vermelhas as células de escrita;
 * - `GRANT SELECT ON eventos_asaas TO pelada_app` com policy `USING (true)` deixa vermelho o SELECT de `eventos_asaas`;
 * - `DROP POLICY assinaturas_backup` deixa vermelho "pelada_backup_ro lê tudo".
 */

type Ator = 'A' | 'C' | 'B' | 'S' | 'N';
const ATORES: readonly Ator[] = ['A', 'C', 'B', 'S', 'N'];

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  await aberto.db.query(
    `INSERT INTO eventos_asaas (id, evento, data_criacao, cobranca_id, assinatura_id, status, valor_centavos, recebido_em)
     VALUES ('evt_t11', 'PAYMENT_CONFIRMED', now(), 'pay_g', 'sub_g', 'CONFIRMED', 990, now())`,
  );
});

afterAll(async () => {
  await aberto?.fechar();
});

function contexto(ator: Ator, c: CenarioGrupos): Contexto {
  switch (ator) {
    case 'A':
      return { conta: c.contaC };
    case 'C':
      return { conta: c.contaO };
    case 'B':
      return { conta: c.contaB };
    case 'S':
      return { slug: c.slugG };
    case 'N':
      return {};
  }
}

async function contar(d: pg.Client, sql: string, valores: unknown[] = []): Promise<number> {
  const r = await d.query<{ n: number }>(`SELECT count(*)::int AS n FROM (${sql}) q`, valores);
  return r.rows[0]?.n ?? -1;
}

/** Contagem das duas tabelas como superusuário, para provar que a escrita recusada não mudou nada. */
async function foto(): Promise<[number, number, string]> {
  const { db } = aberto;
  const assinaturas = await contar(db, 'SELECT 1 FROM assinaturas');
  const eventos = await contar(db, 'SELECT 1 FROM eventos_asaas');
  const r = await db.query<{ s: string }>(
    `SELECT string_agg(asaas_assinatura_id || ':' || situacao || ':' || coalesce(pago_ate::text, '-'), ',' ORDER BY id) AS s
       FROM assinaturas`,
  );
  return [assinaturas, eventos, r.rows[0]?.s ?? ''];
}

async function recusada(ator: Ator, sql: string, valores: unknown[] = []): Promise<void> {
  const { db, cenario } = aberto;
  const antes = await foto();
  await expect(comoApp(db, contexto(ator, cenario), (d) => d.query(sql, valores))).rejects.toMatchObject({
    code: '42501',
  });
  expect(await foto()).toEqual(antes);
}

/** Roda `fn` como a role de backup, numa transação desfeita. */
async function comoBackup<T>(fn: (d: pg.Client) => Promise<T>): Promise<T> {
  const { db } = aberto;
  await db.query('BEGIN');
  try {
    await db.query('SET LOCAL ROLE pelada_backup_ro');
    return await fn(db);
  } finally {
    await db.query('ROLLBACK').catch(() => undefined);
  }
}

describe('assinaturas × SELECT', () => {
  it('PLA-13: A, a criadora, vê só as assinaturas de G', async () => {
    const { db, cenario } = aberto;
    const ids = await comoApp(db, contexto('A', cenario), async (d) => {
      const r = await d.query<{ grupo_id: string }>('SELECT grupo_id FROM assinaturas');
      return [...new Set(r.rows.map((l) => l.grupo_id))];
    });
    // C (= conta A do cenário de conta) também vê o grupo A dela; nunca H.
    expect(ids).toContain(cenario.grupoG);
    expect(ids).not.toContain(cenario.grupoH);
  });

  it('PLA-13: C, a convidada, vê a assinatura de G', async () => {
    const { db, cenario } = aberto;
    const n = await comoApp(db, contexto('C', cenario), (d) =>
      contar(d, 'SELECT 1 FROM assinaturas WHERE grupo_id = $1', [cenario.grupoG]),
    );
    expect(n).toBe(1);
  });

  it('PLA-13: C, a convidada, não vê assinatura de outro grupo', async () => {
    const { db, cenario } = aberto;
    const n = await comoApp(db, contexto('C', cenario), (d) =>
      contar(d, 'SELECT 1 FROM assinaturas WHERE grupo_id <> $1', [cenario.grupoG]),
    );
    expect(n).toBe(0);
  });

  it.each(['B', 'S', 'N'] as const)('PLA-13: %s vê zero assinaturas de G', async (ator) => {
    const { db, cenario } = aberto;
    const n = await comoApp(db, contexto(ator, cenario), (d) =>
      contar(d, 'SELECT 1 FROM assinaturas WHERE grupo_id = $1', [cenario.grupoG]),
    );
    expect(n).toBe(0);
  });

  it.each(['S', 'N'] as const)('PLA-13: %s, sem conta, vê zero assinaturas de qualquer grupo', async (ator) => {
    const { db, cenario } = aberto;
    expect(await comoApp(db, contexto(ator, cenario), (d) => contar(d, 'SELECT 1 FROM assinaturas'))).toBe(0);
  });
});

describe('assinaturas × INSERT, UPDATE, DELETE', () => {
  it.each(ATORES)('PLA-13: INSERT de %s é recusado', async (ator) => {
    const { cenario } = aberto;
    await recusada(
      ator,
      `INSERT INTO assinaturas (grupo_id, asaas_cliente_id, asaas_assinatura_id, valor_centavos, situacao, criada_por, criada_em)
       VALUES ($1, 'cus_x', 'sub_x', 990, 'aguardando_pagamento', $2, now())`,
      [cenario.grupoG, cenario.contaC],
    );
  });

  it.each(ATORES)('PLA-13: UPDATE com WHERE de %s é recusado', async (ator) => {
    await recusada(ator, `UPDATE assinaturas SET situacao = 'ativa', pago_ate = '2099-12-31' WHERE asaas_assinatura_id = 'sub_g'`);
  });

  it.each(ATORES)('PLA-13: UPDATE sem WHERE de %s é recusado', async (ator) => {
    await recusada(ator, `UPDATE assinaturas SET pago_ate = '2099-12-31'`);
  });

  it.each(ATORES)('PLA-13: DELETE com WHERE de %s é recusado', async (ator) => {
    await recusada(ator, `DELETE FROM assinaturas WHERE asaas_assinatura_id = 'sub_g'`);
  });

  it.each(ATORES)('PLA-13: DELETE sem WHERE de %s é recusado', async (ator) => {
    await recusada(ator, 'DELETE FROM assinaturas');
  });

  it('PLA-13: TRUNCATE de assinaturas como pelada_app é recusado', async () => {
    await recusada('A', 'TRUNCATE assinaturas');
  });
});

describe('eventos_asaas × comando', () => {
  it.each(ATORES)('PLA-13: SELECT de %s é recusado (sem grant)', async (ator) => {
    await recusada(ator, 'SELECT id FROM eventos_asaas');
  });

  it.each(ATORES)('PLA-13: INSERT de %s é recusado', async (ator) => {
    await recusada(
      ator,
      `INSERT INTO eventos_asaas (id, evento, recebido_em) VALUES ('evt_forjado', 'PAYMENT_CONFIRMED', now())`,
    );
  });

  it.each(ATORES)('PLA-13: UPDATE sem WHERE de %s é recusado', async (ator) => {
    await recusada(ator, `UPDATE eventos_asaas SET efeito = 'ativar'`);
  });

  it.each(ATORES)('PLA-13: DELETE sem WHERE de %s é recusado', async (ator) => {
    await recusada(ator, 'DELETE FROM eventos_asaas');
  });

  it('PLA-13: TRUNCATE de eventos_asaas como pelada_app é recusado', async () => {
    await recusada('N', 'TRUNCATE eventos_asaas');
  });
});

describe('pelada_backup_ro nas tabelas do plano', () => {
  it('PLA-13: pelada_backup_ro lê todas as linhas das duas tabelas', async () => {
    const { db } = aberto;
    const total = [await contar(db, 'SELECT 1 FROM assinaturas'), await contar(db, 'SELECT 1 FROM eventos_asaas')];
    const visto = await comoBackup(async (d) => [
      await contar(d, 'SELECT 1 FROM assinaturas'),
      await contar(d, 'SELECT 1 FROM eventos_asaas'),
    ]);
    expect(total.every((n) => n > 0)).toBe(true);
    expect(visto).toEqual(total);
  });

  it.each([
    ['INSERT em assinaturas', `INSERT INTO assinaturas (grupo_id, asaas_cliente_id, asaas_assinatura_id, valor_centavos, situacao, criada_por, criada_em)
       SELECT grupo_id, 'cus_y', 'sub_y', 990, 'cancelada', criada_por, now() FROM assinaturas LIMIT 1`],
    ['UPDATE em assinaturas', `UPDATE assinaturas SET pago_ate = '2099-12-31'`],
    ['DELETE em assinaturas', 'DELETE FROM assinaturas'],
    ['INSERT em eventos_asaas', `INSERT INTO eventos_asaas (id, evento, recebido_em) VALUES ('evt_y', 'X', now())`],
    ['UPDATE em eventos_asaas', `UPDATE eventos_asaas SET efeito = 'x'`],
    ['DELETE em eventos_asaas', 'DELETE FROM eventos_asaas'],
  ])('PLA-13: pelada_backup_ro recusado no %s', async (_nome, sql) => {
    await expect(comoBackup((d) => d.query(sql))).rejects.toMatchObject({ code: '42501' });
  });
});

describe('PLA-35: nenhuma das tabelas do plano guarda CPF', () => {
  it('PLA-35: nenhuma coluna de assinaturas ou eventos_asaas tem nome de documento de pessoa', async () => {
    const r = await aberto.db.query<{ coluna: string }>(
      `SELECT table_name || '.' || column_name AS coluna FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name IN ('assinaturas', 'eventos_asaas')`,
    );
    expect(r.rows.length).toBeGreaterThan(0);
    expect(r.rows.map((l) => l.coluna).filter((c) => /cpf|cnpj|documento|cpfcnpj/i.test(c))).toEqual([]);
  });
});

// As funções novas (T12 a T16) entram neste bloco, cada uma na tarefa que a cria: `PUBLIC` sem `EXECUTE` e `EXECUTE`
// só para `pelada_app`.
const FUNCOES_DO_PLANO: readonly string[] = [
  // T12
  'plano_do_grupo(uuid)',
  'plano_grupos_da_criadora(uuid)',
  // T14
  'assinatura_registrar(uuid, text, text, integer, text)',
  'assinatura_cancelar(uuid)',
  // T15
  'asaas_evento_registrar(text, text, text, text, text, text, integer)',
];

// Funções auxiliares sem EXECUTE para ninguém além do owner (só chamadas de dentro das SECURITY DEFINER).
const FUNCOES_SO_DO_OWNER: readonly string[] = [
  // T15
  'asaas_data(text)',
];

describe('PLA-13: funções auxiliares do plano só do owner', () => {
  it.each(FUNCOES_SO_DO_OWNER)('PLA-13: %s sem EXECUTE para PUBLIC nem para pelada_app', async (assinatura) => {
    const r = await aberto.db.query<{ executores: string[] }>(
      `SELECT coalesce(array(SELECT coalesce(r.rolname, 'PUBLIC')::text
                               FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                               LEFT JOIN pg_roles r ON r.oid = a.grantee
                              WHERE a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner), '{}') AS executores
         FROM pg_proc p WHERE p.oid = $1::regprocedure`,
      [assinatura],
    );
    expect(r.rows[0]?.executores).toEqual([]);
  });
});

describe('PLA-13: funções do plano sem EXECUTE para PUBLIC', () => {
  it.each(FUNCOES_DO_PLANO)('PLA-13: %s', async (assinatura) => {
    const r = await aberto.db.query<{ publico: boolean; executores: string[] }>(
      `SELECT EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                       WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS publico,
              coalesce(array(SELECT r.rolname::text FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                               JOIN pg_roles r ON r.oid = a.grantee
                              WHERE a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner ORDER BY r.rolname), '{}')
                AS executores
         FROM pg_proc p WHERE p.oid = $1::regprocedure`,
      [assinatura],
    );
    expect(r.rows[0]).toEqual({ publico: false, executores: ['pelada_app'] });
  });
});
