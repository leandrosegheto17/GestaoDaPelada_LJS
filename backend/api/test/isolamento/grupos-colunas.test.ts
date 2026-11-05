import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  abrirCenarioGrupos,
  comoConta,
  comoSuperusuario,
  type CenarioGruposAberto,
} from './cenario-grupos.ts';

/**
 * Grants por coluna em `grupos` e trigger da criadora (T4; GEL-16, GEL-24, SEC-009). Caracteriza, como `pelada_app`:
 * `UPDATE` só em `nome`, `dia_semana`, `frequencia`, `horario` e `arquivado_em`
 * (`1792844400000_grupos-grants-coluna.sql:6-7`); `DELETE` recusado; `arquivado_em` mudado por admin que não criou
 * dá 42501 (`1792844520000_grupos-arquivar-so-criadora.sql:8-24`); o slug também é imutável pela trigger da linha de
 * base (`1792843200000_linha-de-base.sql:82-93`), mesmo para o owner.
 *
 * Evidência da rede (registrar na T4): `GRANT UPDATE ON grupos TO pelada_app` deixa vermelhos os testes de coluna
 * recusada; `DROP TRIGGER grupos_arquivado_so_criadora ON grupos` deixa vermelho o teste da outra admin.
 */

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

interface Resultado {
  linhas: number | null;
  erro: { code?: string | undefined; message: string } | null;
}

/** Roda o comando como `pelada_app` com a conta, numa transação desfeita, devolvendo linhas ou erro. */
async function comando(conta: string, sql: string, valores: unknown[] = []): Promise<Resultado> {
  return comoConta(aberto.db, conta, async (d) => executar(d, sql, valores));
}

async function executar(d: pg.Client, sql: string, valores: unknown[] = []): Promise<Resultado> {
  await d.query('SAVEPOINT comando');
  try {
    const r = await d.query(sql, valores);
    await d.query('RELEASE SAVEPOINT comando');
    return { linhas: r.rowCount ?? 0, erro: null };
  } catch (e) {
    const x = e as pg.DatabaseError;
    await d.query('ROLLBACK TO SAVEPOINT comando');
    return { linhas: null, erro: { code: x.code, message: x.message } };
  }
}

function recusado(r: Resultado, motivo: RegExp): void {
  expect(r.erro?.code, r.erro?.message ?? `afetou ${r.linhas} linha(s)`).toBe('42501');
  expect(r.erro?.message).toMatch(motivo);
}

describe('GEL-16: o slug é imutável', () => {
  it('GEL-16: UPDATE grupos SET slug como pelada_app falha pelo grant', async () => {
    const { cenario } = aberto;
    recusado(
      await comando(cenario.contaC, `UPDATE grupos SET slug = 'outro-slug' WHERE id = $1`, [
        cenario.grupoG,
      ]),
      /permission denied/,
    );
  });

  it('GEL-16: UPDATE grupos SET slug como owner falha pela trigger', async () => {
    const { cenario } = aberto;
    const r = await comoSuperusuario(aberto.db, (d) =>
      executar(d, `UPDATE grupos SET slug = 'outro-slug' WHERE id = $1`, [cenario.grupoG]),
    );
    expect(r.erro?.code, r.erro?.message).toBe('P0001');
    expect(r.erro?.message).toBe('O slug do grupo não pode ser alterado');
  });
});

describe('GEL-24: colunas fora do grant', () => {
  it.each([
    ['criado_por', 'criado_por = $2', true],
    ['situacao_comercial', `situacao_comercial = 'ativo'`, false],
    ['trial_inicio', `trial_inicio = '2026-01-01'`, false],
  ] as const)('GEL-24: UPDATE de %s como pelada_app é recusado', async (_coluna, set, comConta) => {
    const { cenario } = aberto;
    const valores = comConta ? [cenario.grupoG, cenario.contaO] : [cenario.grupoG];
    recusado(
      await comando(cenario.contaC, `UPDATE grupos SET ${set} WHERE id = $1`, valores),
      /permission denied/,
    );
  });

  it('GEL-24: DELETE em grupos como pelada_app é recusado (sem grant)', async () => {
    const { cenario } = aberto;
    recusado(
      await comando(cenario.contaC, 'DELETE FROM grupos WHERE id = $1', [cenario.grupoG]),
      /permission denied/,
    );
  });

  it.each([
    ['nome', `nome = 'Pelada Renomeada'`],
    ['dia_semana', `dia_semana = 'sexta'`],
    ['frequencia', `frequencia = 'quinzenal'`],
    ['horario', `horario = '21:30'`],
  ] as const)('GEL-24: controle, UPDATE de %s pela criadora altera G', async (_coluna, set) => {
    const { cenario } = aberto;
    expect(
      await comando(cenario.contaC, `UPDATE grupos SET ${set} WHERE id = $1`, [cenario.grupoG]),
    ).toEqual({
      linhas: 1,
      erro: null,
    });
  });

  it('GEL-24: UPDATE sem WHERE da criadora alcança só os grupos dela, nunca H', async () => {
    const { db, cenario } = aberto;
    const r = await comoConta(db, cenario.contaC, async (d) => {
      const res = await executar(d, `UPDATE grupos SET nome = 'Sem Where'`);
      await d.query('RESET ROLE');
      const h = await d.query<{ nome: string }>('SELECT nome FROM grupos WHERE id = $1', [
        cenario.grupoH,
      ]);
      return { ...res, nomeH: h.rows[0]?.nome };
    });
    expect(r.erro).toBeNull();
    expect(r.linhas).toBe(2); // G e o grupo A do cenário de conta
    expect(r.nomeH).toBe('Grupo B');
  });
});

describe('SEC-009: só a criadora muda arquivado_em', () => {
  it('SEC-009: a outra admin O muda arquivado_em de G ativo e recebe 42501', async () => {
    const { cenario } = aberto;
    recusado(
      await comando(cenario.contaO, 'UPDATE grupos SET arquivado_em = now() WHERE id = $1', [
        cenario.grupoG,
      ]),
      /Só quem criou o grupo pode arquivar ou reativar\./,
    );
  });

  it('SEC-009: UPDATE de nome pela outra admin O passa', async () => {
    const { cenario } = aberto;
    expect(
      await comando(cenario.contaO, `UPDATE grupos SET nome = 'Renomeado por O' WHERE id = $1`, [
        cenario.grupoG,
      ]),
    ).toEqual({
      linhas: 1,
      erro: null,
    });
  });

  it('SEC-009: a criadora C arquiva e reativa G', async () => {
    const { db, cenario } = aberto;
    const r = await comoConta(db, cenario.contaC, async (d) => ({
      arquivar: await executar(d, 'UPDATE grupos SET arquivado_em = now() WHERE id = $1', [
        cenario.grupoG,
      ]),
      reativar: await executar(d, 'UPDATE grupos SET arquivado_em = NULL WHERE id = $1', [
        cenario.grupoG,
      ]),
    }));
    expect(r).toEqual({ arquivar: { linhas: 1, erro: null }, reativar: { linhas: 1, erro: null } });
  });

  it('SEC-009: o owner (superusuário) muda arquivado_em sem a trigger barrar', async () => {
    const { cenario } = aberto;
    const r = await comoSuperusuario(aberto.db, (d) =>
      executar(d, 'UPDATE grupos SET arquivado_em = now() WHERE id = $1', [cenario.grupoG]),
    );
    expect(r).toEqual({ linhas: 1, erro: null });
  });

  it('SEC-009: a outra admin O com o mesmo valor de arquivado_em (sem mudança) não dispara a trigger', async () => {
    const { cenario } = aberto;
    expect(
      await comando(cenario.contaO, 'UPDATE grupos SET arquivado_em = arquivado_em WHERE id = $1', [
        cenario.grupoG,
      ]),
    ).toEqual({ linhas: 1, erro: null });
  });
});
