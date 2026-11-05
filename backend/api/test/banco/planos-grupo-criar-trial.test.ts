import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comoApp } from '../isolamento/apoio.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * `grupo_criar` nasce em trial (planos-e-cobranca T13; PLA-10, PLA-12, PLA-14; AD-087). Cada caso roda como
 * `pelada_app` com a conta C numa transação desfeita; a leitura do resultado é feita na mesma transação, depois de
 * `RESET ROLE`.
 *
 * Casos limite: `p_hoje` nulo (recusa antes de gravar); colisão de slug (o sufixo continua e o trial também); falha no
 * meio (habilidade inválida) desfaz as duas auditorias; `p_hoje` no futuro grava assim mesmo (PLA-70 é do domínio).
 *
 * Evidência da rede (registrar na T13 do tasks.md, pelo /executar): a migração sem o INSERT da auditoria deixa vermelho
 * o PLA-14; o INSERT sem `trial_inicio = p_hoje` (com `now()`) deixa vermelho o PLA-10 com a data fixa 2026-11-01.
 */

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

async function comoC<T>(fn: (d: pg.Client) => Promise<T>): Promise<T> {
  return comoApp(aberto.db, { conta: aberto.cenario.contaC }, fn);
}

async function criar(
  d: pg.Client,
  base: string,
  hoje: string | null,
  habilidades: string[] = ['Passe'],
) {
  const r = await d.query<{ id: string; slug: string }>(
    `SELECT id, slug FROM grupo_criar('Racha do Trial', 'sabado', 'semanal', '09:00', $1, $2::text[], $3::date)`,
    [base, habilidades, hoje],
  );
  const linha = r.rows[0];
  if (!linha) throw new Error('grupo_criar sem linha');
  return linha;
}

describe('grupo_criar em trial', () => {
  it('PLA-10: grupo criado com p_hoje = 2026-11-01 tem trial e trial_inicio = 2026-11-01', async () => {
    const linha = await comoC(async (d) => {
      const g = await criar(d, 'racha-trial', '2026-11-01');
      await d.query('RESET ROLE');
      const r = await d.query(
        'SELECT situacao_comercial, trial_inicio::text FROM grupos WHERE id = $1',
        [g.id],
      );
      return r.rows[0];
    });
    expect(linha).toEqual({ situacao_comercial: 'trial', trial_inicio: '2026-11-01' });
  });

  it('PLA-14: uma linha plano_trial_iniciado com o grupo, a conta e antes/depois', async () => {
    const { cenario } = aberto;
    const linhas = await comoC(async (d) => {
      const g = await criar(d, 'racha-trial-auditado', '2026-11-01');
      await d.query('RESET ROLE');
      const r = await d.query(
        `SELECT autor_tipo, autor_conta_id, entidade, entidade_id, grupo_id, resumo
           FROM auditoria WHERE acao = 'plano_trial_iniciado' AND grupo_id = $1`,
        [g.id],
      );
      return { g, linhas: r.rows };
    });
    expect(linhas.linhas).toEqual([
      {
        autor_tipo: 'conta',
        autor_conta_id: cenario.contaC,
        entidade: 'grupo',
        entidade_id: linhas.g.id,
        grupo_id: linhas.g.id,
        resumo: { antes: null, depois: 'trial' },
      },
    ]);
  });

  it('PLA-14: grupo_criado vem antes de plano_trial_iniciado', async () => {
    const acoes = await comoC(async (d) => {
      const g = await criar(d, 'racha-trial-ordem', '2026-11-01');
      await d.query('RESET ROLE');
      const r = await d.query<{ acao: string }>(
        'SELECT acao FROM auditoria WHERE grupo_id = $1 ORDER BY id',
        [g.id],
      );
      return r.rows.map((l) => l.acao);
    });
    expect(acoes).toEqual(['grupo_criado', 'plano_trial_iniciado']);
  });

  it('PLA-10: com o slug ocupado, o grupo com sufixo também nasce em trial', async () => {
    const linhas = await comoC(async (d) => {
      const a = await criar(d, 'racha-colide', '2026-11-02');
      const b = await criar(d, 'racha-colide', '2026-11-02');
      await d.query('RESET ROLE');
      const r = await d.query(
        'SELECT slug, situacao_comercial, trial_inicio::text FROM grupos WHERE id IN ($1, $2) ORDER BY slug',
        [a.id, b.id],
      );
      return r.rows;
    });
    expect(linhas).toEqual([
      { slug: 'racha-colide', situacao_comercial: 'trial', trial_inicio: '2026-11-02' },
      { slug: 'racha-colide-2', situacao_comercial: 'trial', trial_inicio: '2026-11-02' },
    ]);
  });

  it('PLA-10: p_hoje nulo é recusado e nada é gravado', async () => {
    const { db } = aberto;
    const antes = await db.query<{ g: number; a: number }>(
      'SELECT (SELECT count(*)::int FROM grupos) AS g, (SELECT count(*)::int FROM auditoria) AS a',
    );
    await expect(comoC((d) => criar(d, 'racha-sem-data', null))).rejects.toMatchObject({
      code: '22023',
    });
    const depois = await db.query(
      'SELECT (SELECT count(*)::int FROM grupos) AS g, (SELECT count(*)::int FROM auditoria) AS a',
    );
    expect(depois.rows).toEqual(antes.rows);
  });

  it('PLA-14: falha no meio (habilidade inválida) desfaz grupo e as duas auditorias', async () => {
    const { db } = aberto;
    const contar = async (d: pg.Client) => {
      const r = await d.query<{ g: number; a: number }>(
        `SELECT (SELECT count(*)::int FROM grupos WHERE slug LIKE 'racha-falho-trial%') AS g,
                (SELECT count(*)::int FROM auditoria WHERE acao IN ('grupo_criado', 'plano_trial_iniciado')) AS a`,
      );
      return r.rows[0];
    };
    const antes = await contar(db);
    await comoC(async (d) => {
      await d.query('SAVEPOINT antes');
      await expect(
        criar(d, 'racha-falho-trial', '2026-11-01', ['Passe', 'X']),
      ).rejects.toMatchObject({ code: '23514' });
      await d.query('ROLLBACK TO SAVEPOINT antes');
      await d.query('RESET ROLE');
      expect(await contar(d)).toEqual(antes);
    });
  });

  it('PLA-70: p_hoje no futuro grava trial com a data recebida', async () => {
    const linha = await comoC(async (d) => {
      const g = await criar(d, 'racha-futuro', '2027-01-15');
      await d.query('RESET ROLE');
      const r = await d.query(
        'SELECT situacao_comercial, trial_inicio::text FROM grupos WHERE id = $1',
        [g.id],
      );
      return r.rows[0];
    });
    expect(linha).toEqual({ situacao_comercial: 'trial', trial_inicio: '2027-01-15' });
  });
});

describe('default da coluna', () => {
  it('PLA-12: o default de situacao_comercial segue uso_proprio depois da T13', async () => {
    const r = await aberto.db.query<{ padrao: string | null }>(
      `SELECT column_default AS padrao FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'grupos' AND column_name = 'situacao_comercial'`,
    );
    expect(r.rows[0]?.padrao ?? '').toMatch(/^'uso_proprio'/);
  });

  it('PLA-12: a grupo_criar não lê o relógio para a data do trial (sem now() perto de trial_inicio)', async () => {
    const r = await aberto.db.query<{ corpo: string }>(
      `SELECT prosrc AS corpo FROM pg_proc WHERE oid = 'grupo_criar(text, text, text, time, text, text[], date)'::regprocedure`,
    );
    const corpo = r.rows[0]?.corpo ?? '';
    expect(corpo).toMatch(/'trial',\s*p_hoje/);
    expect(corpo).not.toMatch(/AT TIME ZONE/i);
  });
});
