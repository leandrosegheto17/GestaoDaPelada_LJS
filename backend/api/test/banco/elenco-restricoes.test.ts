import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { abrirCenarioGrupos, comoConta, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * Regras do elenco que o banco já garante (T5; GEL-35, GEL-37, GEL-50, GEL-84, GEL-85, GEL-91, GEL-93, GEL-112).
 * Como `pelada_app` com a criadora C, cada caso numa transação desfeita ao fim. Fontes: grants em
 * `1792843260000_roles.sql:22-33`; restrições em `1792843200000_linha-de-base.sql:120` (`jogadores_apelido_grupo`),
 * `:128-131` (cascade e `periodos_um_aberto`), `:141` (`habilidades_nome_grupo`), `:149-150` (FKs de `notas`) e o
 * CHECK das 7 posições (`:324-326`).
 *
 * Evidência da rede (registrar na T5): `GRANT DELETE ON periodos_ativos TO pelada_app` deixa vermelho o teste do
 * DELETE em `periodos_ativos`.
 */

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

/** Roda `fn` como `pelada_app` com a conta C, numa transação desfeita ao fim. */
function comoC<T>(fn: (d: pg.Client) => Promise<T>): Promise<T> {
  return comoConta(aberto.db, aberto.cenario.contaC, fn);
}

/** Executa o comando num savepoint e devolve o erro (ou null), para seguir na mesma transação. */
async function erroDe(d: pg.Client, sql: string, valores: unknown[] = []): Promise<{ code?: string; constraint?: string } | null> {
  await d.query('SAVEPOINT passo');
  try {
    await d.query(sql, valores);
    await d.query('RELEASE SAVEPOINT passo');
    return null;
  } catch (e) {
    const x = e as pg.DatabaseError;
    await d.query('ROLLBACK TO SAVEPOINT passo');
    return { code: x.code, constraint: x.constraint };
  }
}

async function contar(d: pg.Client, sql: string, valores: unknown[] = []): Promise<number> {
  const r = await d.query<{ n: number }>(`SELECT count(*)::int AS n FROM (${sql}) q`, valores);
  return r.rows[0]?.n ?? -1;
}

async function novoJogador(d: pg.Client, apelido: string): Promise<string> {
  const { cenario } = aberto;
  const r = await d.query<{ id: string }>(
    `INSERT INTO jogadores (grupo_id, apelido, criado_por, criado_em, alterado_por, alterado_em)
     VALUES ($1, $2, $3, now(), $3, now()) RETURNING id`,
    [cenario.grupoG, apelido, cenario.contaC],
  );
  const id = r.rows[0]?.id;
  if (!id) throw new Error('jogador sem id');
  await d.query(`INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio) VALUES ($1, $2, '2026-02-01')`, [
    id,
    cenario.grupoG,
  ]);
  return id;
}

describe('GEL-84, GEL-85: exclusão de jogador', () => {
  it('GEL-84: jogador sem histórico é apagado junto com os períodos', async () => {
    const { cenario } = aberto;
    await comoC(async (d) => {
      const id = await novoJogador(d, 'Sem Histórico');
      const r = await d.query('DELETE FROM jogadores WHERE id = $1', [id]);
      expect(r.rowCount).toBe(1);
      await d.query('RESET ROLE');
      expect(await contar(d, 'SELECT 1 FROM periodos_ativos WHERE jogador_id = $1', [id])).toBe(0);
      expect(await contar(d, 'SELECT 1 FROM jogadores WHERE grupo_id = $1 AND id = $2', [cenario.grupoG, id])).toBe(0);
    });
  });

  type Historico = (d: pg.Client, jogador: string) => Promise<unknown>;
  const HISTORICOS: ReadonlyArray<readonly [string, Historico]> = [
    [
      'presença',
      (d, j) =>
        d.query(`INSERT INTO presencas (partida_id, jogador_id, grupo_id, situacao) VALUES ($1, $2, $3, 'presente')`, [
          aberto.cenario.idsG.partida,
          j,
          aberto.cenario.grupoG,
        ]),
    ],
    [
      'nota',
      (d, j) =>
        d.query(`INSERT INTO notas (jogador_id, habilidade_id, grupo_id, valor) VALUES ($1, $2, $3, 6)`, [
          j,
          aberto.cenario.idsG.habilidade,
          aberto.cenario.grupoG,
        ]),
    ],
    [
      'pagamento',
      (d, j) =>
        d.query(
          `INSERT INTO pagamentos_mes (grupo_id, jogador_id, mes, marcado_por, marcado_em) VALUES ($1, $2, '2026-02', $3, now())`,
          [aberto.cenario.grupoG, j, aberto.cenario.contaC],
        ),
    ],
  ];

  it.each(HISTORICOS)('GEL-85: jogador com %s não é apagado (23503) e nada some', async (_tipo, historico) => {
    await comoC(async (d) => {
      const id = await novoJogador(d, 'Com Histórico');
      await historico(d, id);
      expect(await erroDe(d, 'DELETE FROM jogadores WHERE id = $1', [id])).toMatchObject({ code: '23503' });
      expect(await contar(d, 'SELECT 1 FROM jogadores WHERE id = $1', [id])).toBe(1);
      expect(await contar(d, 'SELECT 1 FROM periodos_ativos WHERE jogador_id = $1', [id])).toBe(1);
    });
  });
});

describe('GEL-35, GEL-91: unicidade sem caixa, com acento contando', () => {
  it('GEL-35: "Toninho" e "toninho" colidem em jogadores_apelido_grupo', async () => {
    await comoC(async (d) => {
      // "Toninho" já existe em G (cenário).
      expect(
        await erroDe(
          d,
          `INSERT INTO jogadores (grupo_id, apelido, criado_por, criado_em, alterado_por, alterado_em)
           VALUES ($1, 'toninho', $2, now(), $2, now())`,
          [aberto.cenario.grupoG, aberto.cenario.contaC],
        ),
      ).toEqual({ code: '23505', constraint: 'jogadores_apelido_grupo' });
    });
  });

  it('GEL-35: "José" e "Jose" não colidem', async () => {
    await comoC(async (d) => {
      await novoJogador(d, 'José');
      await expect(novoJogador(d, 'Jose')).resolves.toEqual(expect.any(String));
    });
  });

  it('GEL-91: "Passe" e "passe" colidem em habilidades_nome_grupo', async () => {
    await comoC(async (d) => {
      expect(await erroDe(d, `INSERT INTO habilidades (grupo_id, nome) VALUES ($1, 'passe')`, [aberto.cenario.grupoG])).toEqual({
        code: '23505',
        constraint: 'habilidades_nome_grupo',
      });
    });
  });

  it('GEL-91: "Visao de Jogo" não colide com "Visão de Jogo"', async () => {
    await comoC(async (d) => {
      expect(await erroDe(d, `INSERT INTO habilidades (grupo_id, nome) VALUES ($1, 'Visao de Jogo')`, [aberto.cenario.grupoG])).toBeNull();
    });
  });
});

describe('GEL-93: apagar a habilidade apaga as notas dela', () => {
  it('GEL-93: as notas da habilidade somem e as de outra ficam', async () => {
    const { cenario } = aberto;
    await comoC(async (d) => {
      const outra = await d.query<{ id: string }>(
        `SELECT id FROM habilidades WHERE grupo_id = $1 AND id <> $2 ORDER BY ordem LIMIT 1`,
        [cenario.grupoG, cenario.idsG.habilidade],
      );
      const outraId = outra.rows[0]?.id;
      await d.query(`INSERT INTO notas (jogador_id, habilidade_id, grupo_id, valor) VALUES ($1, $2, $3, 4)`, [
        cenario.idsG.jogadorHistorico,
        outraId,
        cenario.grupoG,
      ]);
      const r = await d.query('DELETE FROM habilidades WHERE id = $1', [cenario.idsG.habilidade]);
      expect(r.rowCount).toBe(1);
      expect(await contar(d, 'SELECT 1 FROM notas WHERE habilidade_id = $1', [cenario.idsG.habilidade])).toBe(0);
      expect(await contar(d, 'SELECT 1 FROM notas WHERE habilidade_id = $1', [outraId])).toBe(1);
    });
  });
});

describe('GEL-37, GEL-50, GEL-112: posição, período aberto e DELETE de período', () => {
  it('GEL-37: posição "defensor" é recusada pelo CHECK', async () => {
    const { cenario } = aberto;
    await comoC(async (d) => {
      expect(
        await erroDe(d, `UPDATE jogadores SET posicao = 'defensor' WHERE id = $1`, [cenario.idsG.jogadorAtivo]),
      ).toEqual({ code: '23514', constraint: 'jogadores_posicao_check' });
    });
  });

  it.each(['goleiro', 'zagueiro', 'lateral', 'volante', 'meia', 'atacante', 'centroavante'])(
    'GEL-37: controle, a posição %s é aceita',
    async (posicao) => {
      const { cenario } = aberto;
      await comoC(async (d) => {
        expect(await erroDe(d, 'UPDATE jogadores SET posicao = $2 WHERE id = $1', [cenario.idsG.jogadorAtivo, posicao])).toBeNull();
      });
    },
  );

  it('GEL-50: um segundo período aberto do mesmo jogador é recusado', async () => {
    const { cenario } = aberto;
    await comoC(async (d) => {
      expect(
        await erroDe(d, `INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio) VALUES ($1, $2, '2026-03-01')`, [
          cenario.idsG.jogadorAtivo,
          cenario.grupoG,
        ]),
      ).toEqual({ code: '23505', constraint: 'periodos_um_aberto' });
    });
  });

  it('GEL-50: período com fim antes do início é recusado', async () => {
    const { cenario } = aberto;
    await comoC(async (d) => {
      expect(
        await erroDe(
          d,
          `INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio, fim) VALUES ($1, $2, '2024-05-10', '2024-05-09')`,
          [cenario.idsG.jogadorInativo, cenario.grupoG],
        ),
      ).toEqual({ code: '23514', constraint: 'periodo_fim_depois_inicio' });
    });
  });

  it('GEL-112: DELETE FROM periodos_ativos como pelada_app é recusado (sem grant)', async () => {
    const { cenario } = aberto;
    await comoC(async (d) => {
      expect(await erroDe(d, 'DELETE FROM periodos_ativos WHERE jogador_id = $1', [cenario.idsG.jogadorInativo])).toMatchObject({
        code: '42501',
      });
    });
  });
});
