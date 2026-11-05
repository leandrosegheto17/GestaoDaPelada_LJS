import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comoApp, type Contexto } from '../isolamento/apoio.ts';
import {
  abrirCenarioGrupos,
  criarGrupoComoConta,
  type CenarioGruposAberto,
} from '../isolamento/cenario-grupos.ts';

/**
 * Funções de leitura do plano (planos-e-cobranca T12; PLA-07, PLA-17, PLA-25; AD-088), como `pelada_app`.
 * Atores: A = criadora de G1 (o G do cenário) e de G2 (criado no `beforeAll`); C = admin convidada só de G1 (O do
 * cenário); B = conta só de H; slug de G1; sem contexto.
 *
 * Evidência da rede (registrar na T12 do tasks.md, pelo /executar): tirar `p_grupo_id IN (SELECT grupos_visiveis())`
 * de `plano_do_grupo` deixa vermelho "B recebe zero linhas"; tirar `app_conta_id() IS NOT NULL` de
 * `plano_grupos_da_criadora` deixa vermelho "o slug recebe zero linhas".
 */

let aberto: CenarioGruposAberto;
let g2: string;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  g2 = (
    await criarGrupoComoConta(
      aberto.db,
      aberto.cenario.contaC,
      'Pelada de Sábado',
      'pelada-de-sabado',
    )
  ).id;
});

afterAll(async () => {
  await aberto?.fechar();
});

interface LinhaPlano {
  situacao_comercial: string;
  trial_inicio: string | null;
  pago_ate: string | null;
  criado_por: string;
  jogadores_ativos: number;
}

async function planoDo(contexto: Contexto, grupo: string): Promise<LinhaPlano[]> {
  return comoApp(aberto.db, contexto, async (d: pg.Client) => {
    const r = await d.query<LinhaPlano>(
      `SELECT situacao_comercial, trial_inicio::text, pago_ate::text, criado_por, jogadores_ativos
         FROM plano_do_grupo($1)`,
      [grupo],
    );
    return r.rows;
  });
}

async function gruposDaCriadora(contexto: Contexto, grupo: string): Promise<string[]> {
  return comoApp(aberto.db, contexto, async (d: pg.Client) => {
    const r = await d.query<{ id: string }>('SELECT id FROM plano_grupos_da_criadora($1)', [grupo]);
    return r.rows.map((l) => l.id);
  });
}

describe('plano_do_grupo', () => {
  it('PLA-07: a criadora recebe uma linha com a situação, o pago_ate e os jogadores ativos de G1', async () => {
    const { cenario } = aberto;
    const linhas = await planoDo({ conta: cenario.contaC }, cenario.grupoG);
    // G1 tem 2 períodos abertos (jogador ativo e com histórico) e a assinatura cancelada `sub_g` com pago_ate 2026-01-05.
    expect(linhas).toEqual([
      expect.objectContaining({
        criado_por: cenario.contaC,
        pago_ate: '2026-01-05',
        jogadores_ativos: 2,
      }),
    ]);
  });

  it('PLA-07: a assinatura não cancelada vence a cancelada mais nova no pago_ate', async () => {
    const { db, cenario } = aberto;
    await db.query('BEGIN');
    try {
      await db.query(
        `INSERT INTO assinaturas (grupo_id, asaas_cliente_id, asaas_assinatura_id, valor_centavos, situacao, pago_ate,
           criada_por, criada_em)
         VALUES ($1, 'cus_t12', 'sub_t12_ativa', 990, 'ativa', '2026-03-05', $2, now() - interval '1 day'),
                ($1, 'cus_t12', 'sub_t12_canc', 990, 'cancelada', '2026-04-05', $2, now())`,
        [cenario.grupoG, cenario.contaC],
      );
      await db.query('SET LOCAL ROLE pelada_app');
      await db.query(`SELECT set_config('app.conta_id', $1, true)`, [cenario.contaC]);
      const r = await db.query<{ pago_ate: string }>(
        'SELECT pago_ate::text FROM plano_do_grupo($1)',
        [cenario.grupoG],
      );
      expect(r.rows).toEqual([{ pago_ate: '2026-03-05' }]);
    } finally {
      await db.query('ROLLBACK');
    }
  });

  it('PLA-25: no contexto do slug de G1, plano_do_grupo(G1) responde', async () => {
    const { cenario } = aberto;
    expect(await planoDo({ slug: cenario.slugG }, cenario.grupoG)).toHaveLength(1);
  });

  it('PLA-25: com o slug de G1, plano_do_grupo(G2) não responde', async () => {
    const { cenario } = aberto;
    expect(await planoDo({ slug: cenario.slugG }, g2)).toEqual([]);
  });

  it('PLA-07: a conta B recebe zero linhas de G1', async () => {
    const { cenario } = aberto;
    expect(await planoDo({ conta: cenario.contaB }, cenario.grupoG)).toEqual([]);
  });

  it('PLA-07: sem contexto, zero linhas', async () => {
    expect(await planoDo({}, aberto.cenario.grupoG)).toEqual([]);
  });

  it('PLA-07: grupo arquivado some para a convidada e segue para a criadora', async () => {
    const { db, cenario } = aberto;
    await db.query('UPDATE grupos SET arquivado_em = now() WHERE id = $1', [cenario.grupoG]);
    try {
      expect(await planoDo({ conta: cenario.contaO }, cenario.grupoG)).toEqual([]);
      expect(await planoDo({ conta: cenario.contaC }, cenario.grupoG)).toHaveLength(1);
    } finally {
      await db.query('UPDATE grupos SET arquivado_em = NULL WHERE id = $1', [cenario.grupoG]);
    }
  });
});

describe('plano_grupos_da_criadora', () => {
  it('PLA-17: a convidada C recebe os grupos não arquivados da criadora, inclusive G2, que a RLS esconde dela', async () => {
    const { db, cenario } = aberto;
    const daCriadora = await db.query<{ id: string }>(
      'SELECT id FROM grupos WHERE criado_por = $1 AND arquivado_em IS NULL ORDER BY criado_em, id',
      [cenario.contaC],
    );
    const recebidos = await gruposDaCriadora({ conta: cenario.contaO }, cenario.grupoG);
    expect(recebidos).toEqual(daCriadora.rows.map((l) => l.id));
    expect(recebidos).toContain(g2);

    const visiveis = await comoApp(db, { conta: cenario.contaO }, async (d) => {
      const r = await d.query<{ id: string }>('SELECT id FROM grupos WHERE id = $1', [g2]);
      return r.rows;
    });
    expect(visiveis).toEqual([]);
  });

  it('PLA-17: grupo arquivado da criadora fica fora da lista', async () => {
    const { db, cenario } = aberto;
    await db.query('UPDATE grupos SET arquivado_em = now() WHERE id = $1', [g2]);
    try {
      expect(await gruposDaCriadora({ conta: cenario.contaC }, cenario.grupoG)).not.toContain(g2);
    } finally {
      await db.query('UPDATE grupos SET arquivado_em = NULL WHERE id = $1', [g2]);
    }
  });

  it('PLA-17: a conta B recebe zero linhas', async () => {
    const { cenario } = aberto;
    expect(await gruposDaCriadora({ conta: cenario.contaB }, cenario.grupoG)).toEqual([]);
  });

  it('PLA-17: o slug de G1 recebe zero linhas', async () => {
    const { cenario } = aberto;
    expect(await gruposDaCriadora({ slug: cenario.slugG }, cenario.grupoG)).toEqual([]);
  });

  it('PLA-17: sem contexto, zero linhas', async () => {
    expect(await gruposDaCriadora({}, aberto.cenario.grupoG)).toEqual([]);
  });

  it('PLA-17: a função não devolve nome nem e-mail', async () => {
    const r = await aberto.db.query<{ colunas: string[] }>(
      `SELECT p.proargnames AS colunas FROM pg_proc p WHERE p.oid = 'plano_grupos_da_criadora(uuid)'::regprocedure`,
    );
    expect((r.rows[0]?.colunas ?? []).filter((c) => /nome|email/i.test(c))).toEqual([]);
  });
});
