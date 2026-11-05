import { readFileSync } from 'node:fs';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * Migração da cortesia (planos-e-cobranca T17; PLA-11; AD-113). O banco de teste nasce com a migração já aplicada
 * sobre `grupos` vazio (o caso AD-113, que a própria suíte prova ao migrar). Aqui o corpo da migração roda de novo,
 * como superusuário e numa transação desfeita, sobre o cenário, com a constante `SLUG_GRUPO_TESTE` trocada pelo slug
 * de cada caso. Grupos do cenário: A e B (inseridos direto, `uso_proprio`), G (pela `grupo_criar`, `trial`).
 *
 * Casos limite: slug presente; slug ausente com outros grupos; banco sem grupos; grupo do slug já `trial`; grupo
 * `uso_proprio` arquivado; grupo `ativo`.
 *
 * Evidência da rede (registrar na T17 do tasks.md, pelo /executar): tirar `AND slug <> SLUG_GRUPO_TESTE` deixa
 * vermelho "só o do slug segue uso_proprio"; tirar o IF do banco vazio deixa vermelho o AD-113.
 */

const ARQUIVO = new URL(
  '../../src/infraestrutura/db/migracoes/1792845780000_planos-cortesia.sql',
  import.meta.url,
);

/** O corpo da migração com a constante trocada pelo slug do caso. */
function migracaoCom(slug: string): string {
  const texto = readFileSync(ARQUIVO, 'utf8');
  const corpo = texto.split('-- Down Migration')[0]?.replace('-- Up Migration', '') ?? '';
  const trocado = corpo.replace(/SLUG_GRUPO_TESTE constant text := '[^']*';/, `SLUG_GRUPO_TESTE constant text := '${slug}';`);
  if (trocado === corpo) throw new Error('constante SLUG_GRUPO_TESTE não encontrada na migração');
  return trocado;
}

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
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

async function situacoes(d: pg.Client): Promise<Record<string, { s: string; t: string | null }>> {
  const r = await d.query<{ id: string; s: string; t: string | null }>(
    'SELECT id, situacao_comercial AS s, trial_inicio::text AS t FROM grupos',
  );
  return Object.fromEntries(r.rows.map((l) => [l.id, { s: l.s, t: l.t }]));
}

/** Foto das outras colunas de `grupos` e da contagem de linhas de toda tabela do schema. */
async function foto(d: pg.Client): Promise<string> {
  const g = await d.query(
    'SELECT id, nome, slug, dia_semana, frequencia, horario, arquivado_em, criado_por, criado_em FROM grupos ORDER BY id',
  );
  const tabelas = await d.query<{ tabela: string }>(
    `SELECT c.relname AS tabela FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname`,
  );
  const contagens: Record<string, number> = {};
  for (const { tabela } of tabelas.rows) {
    const r = await d.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${JSON.stringify(tabela)}`);
    contagens[tabela] = r.rows[0]?.n ?? -1;
  }
  return JSON.stringify({ grupos: g.rows, contagens });
}

async function hojeEmSp(d: pg.Client): Promise<string> {
  const r = await d.query<{ hoje: string }>(`SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date::text AS hoje`);
  return r.rows[0]?.hoje ?? '';
}

describe('migração da cortesia', () => {
  it('PLA-11: só o grupo do slug segue uso_proprio; os outros uso_proprio ficam trial com a data de SP', async () => {
    const { cenario } = aberto;
    const r = await desfeito(async (d) => {
      const antes = await situacoes(d);
      await d.query(migracaoCom(cenario.slugA));
      return { antes, depois: await situacoes(d), hoje: await hojeEmSp(d) };
    });
    expect(r.antes[cenario.grupoA]).toEqual({ s: 'uso_proprio', t: null });
    expect(r.antes[cenario.grupoB]).toEqual({ s: 'uso_proprio', t: null });
    expect(r.depois[cenario.grupoA]).toEqual({ s: 'uso_proprio', t: null });
    expect(r.depois[cenario.grupoB]).toEqual({ s: 'trial', t: r.hoje });
    // G já estava em trial (nasceu pela grupo_criar da T13): não muda, nem a data.
    expect(r.depois[cenario.grupoG]).toEqual(r.antes[cenario.grupoG]);
  });

  it('PLA-11: nenhuma outra coluna muda e a contagem de linhas de toda tabela fica igual', async () => {
    const { cenario } = aberto;
    const r = await desfeito(async (d) => {
      const antes = await foto(d);
      await d.query(migracaoCom(cenario.slugA));
      return { antes, depois: await foto(d) };
    });
    expect(r.depois).toBe(r.antes);
  });

  it('PLA-11: sem o slug e com grupos, a migração aborta e nada muda', async () => {
    const r = await desfeito(async (d) => {
      const antes = await situacoes(d);
      await d.query('SAVEPOINT antes');
      await expect(d.query(migracaoCom('slug-que-nao-existe'))).rejects.toMatchObject({ code: 'P0001' });
      await d.query('ROLLBACK TO SAVEPOINT antes');
      return { antes, depois: await situacoes(d) };
    });
    expect(r.depois).toEqual(r.antes);
  });

  it('PLA-11: a mensagem do aborto diz que nada foi alterado', async () => {
    await expect(desfeito((d) => d.query(migracaoCom('slug-que-nao-existe')))).rejects.toThrow(/nada foi alterado/);
  });

  it('PLA-11: com grupos vazio, termina sem erro e sem escrita (AD-113)', async () => {
    const r = await desfeito(async (d) => {
      // Esvazia grupos (e o que depende dele) só nesta transação.
      await d.query('TRUNCATE grupos CASCADE');
      await d.query(migracaoCom('qualquer-slug'));
      const n = await d.query<{ n: number }>('SELECT count(*)::int AS n FROM grupos');
      return n.rows[0]?.n;
    });
    expect(r).toBe(0);
  });

  it('PLA-11: grupo do slug já em trial não muda', async () => {
    const { cenario } = aberto;
    const r = await desfeito(async (d) => {
      const antes = await situacoes(d);
      await d.query(migracaoCom(cenario.slugG));
      return { antes, depois: await situacoes(d) };
    });
    expect(r.depois[cenario.grupoG]).toEqual(r.antes[cenario.grupoG]);
    expect(r.depois[cenario.grupoA]?.s).toBe('trial');
  });

  it('PLA-11: grupo ativo não muda; grupo uso_proprio arquivado passa a trial', async () => {
    const { cenario } = aberto;
    const r = await desfeito(async (d) => {
      await d.query(`UPDATE grupos SET situacao_comercial = 'ativo' WHERE id = $1`, [cenario.grupoB]);
      await d.query('UPDATE grupos SET arquivado_em = now() WHERE id = $1', [cenario.grupoA]);
      await d.query(migracaoCom(cenario.slugG));
      return situacoes(d);
    });
    expect(r[cenario.grupoB]).toEqual({ s: 'ativo', t: null });
    expect(r[cenario.grupoA]?.s).toBe('trial');
  });

  it('PLA-11: a migração no repositório tem a constante SLUG_GRUPO_TESTE com um slug válido ou o marcador', () => {
    const texto = readFileSync(ARQUIVO, 'utf8');
    const valor = /SLUG_GRUPO_TESTE constant text := '([^']*)';/.exec(texto)?.[1];
    expect(valor).toBeDefined();
    expect(valor === '__SLUG_GRUPO_TESTE__' || /^[a-z0-9-]{1,64}$/.test(valor ?? '')).toBe(true);
  });
});
